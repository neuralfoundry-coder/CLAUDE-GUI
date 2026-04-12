# 5. 보안 아키텍처

## 5.1 위협 모델

ClaudeGUI는 로컬 머신에서 실행되는 개발자 도구이지만, 다음 위협에 대해 방어해야 한다.

| 위협 ID | 위협 | 영향 | 완화 전략 |
|---------|------|------|-----------|
| T-01 | 경로 순회 공격 | 프로젝트 외부 파일 노출 | `resolveSafe()` 바운드 체크 (§5.2) |
| T-02 | CLI 명령 인젝션 | 임의 명령 실행 | JSON 캡슐화, 이스케이프 (§5.5) |
| T-03 | XSS (프리뷰) | 브라우저 세션 탈취 | iframe sandbox, sanitize (§5.4) |
| T-04 | 네트워크 노출 | 원격 무단 접근 | localhost 바인딩 (§5.3) |
| T-05 | 심볼릭 링크 탈출 | 샌드박스 우회 | `fs.lstat()` 검증 (§5.2) |
| T-06 | dotfile 노출 | 비밀 유출 (`.env`, `.git`) | 차단 리스트 (§5.2) |
| T-07 | 임의 Claude 명령 | 비용 유발, 파일 손상 | 권한 요청 UI (§5.5) |
| T-08 | WebSocket 하이재킹 | 세션 탈취 | Origin 검증, CSRF 토큰 |
| T-09 | 메모리 공격 | DoS | 파일 크기 제한, 속도 제한 |
| T-10 | API 키 노출 | Claude 크레덴셜 유출 | 서버 전용 저장, 환경변수 |

---

## 5.2 파일 시스템 샌드박싱

### 5.2.1 resolveSafe 구현 패턴

```typescript
// src/lib/fs/resolve-safe.ts
import path from 'node:path';
import fs from 'node:fs/promises';

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

const DENIED_SEGMENTS = new Set([
  '.env', '.git', '.ssh', '.claude', '.aws',
  'id_rsa', 'id_ed25519', '.npmrc',
]);

export async function resolveSafe(userPath: string): Promise<string> {
  // 1. 절대 경로로 변환
  const resolved = path.resolve(PROJECT_ROOT, userPath);

  // 2. 프로젝트 루트 내부인지 확인
  const rel = path.relative(PROJECT_ROOT, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new SandboxError('Path outside project root', 4403);
  }

  // 3. dotfile 차단
  for (const segment of rel.split(path.sep)) {
    if (DENIED_SEGMENTS.has(segment)) {
      throw new SandboxError(`Access denied: ${segment}`, 4403);
    }
  }

  // 4. 심볼릭 링크 검증
  try {
    const stat = await fs.lstat(resolved);
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(resolved);
      const targetAbs = path.resolve(path.dirname(resolved), target);
      const targetRel = path.relative(PROJECT_ROOT, targetAbs);
      if (targetRel.startsWith('..') || path.isAbsolute(targetRel)) {
        throw new SandboxError('Symlink points outside project', 4403);
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // 파일이 아직 없는 경우 (쓰기 작업 등)는 허용
  }

  return resolved;
}
```

### 5.2.2 모든 파일 시스템 API에 적용

```typescript
// src/app/api/files/read/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userPath = searchParams.get('path');
  if (!userPath) return badRequest('path required');

  try {
    const safePath = await resolveSafe(userPath);
    const content = await fs.readFile(safePath, 'utf-8');
    return Response.json({ success: true, data: { content } });
  } catch (err) {
    if (err instanceof SandboxError) return forbidden(err.message);
    throw err;
  }
}
```

### 5.2.3 `@parcel/watcher` 감시 범위 제한

```typescript
import watcher from '@parcel/watcher';

const subscription = await watcher.subscribe(
  PROJECT_ROOT,
  (err, events) => {
    if (err) return; // 오류는 별도 broadcast
    for (const ev of events) {
      if (isIgnoredByWatcher(ev.path)) continue; // dotfile/.DS_Store JS 필터
      // ev.type: 'create' | 'update' | 'delete'
      // ev.path: 절대 경로
    }
  },
  {
    // 네이티브 ignore: 아래 서브트리는 스캔/구독에서 완전히 제외됨
    ignore: [
      '**/node_modules', '**/node_modules/**',
      '**/.next',        '**/.next/**',
      '**/.git',         '**/.git/**',
      '**/.claude',      '**/.claude/**',
      '**/dist',         '**/dist/**',
      '**/build',        '**/build/**',
      '**/out',          '**/out/**',
      '**/coverage',     '**/coverage/**',
      '**/test-results', '**/test-results/**',
      '**/playwright-report', '**/playwright-report/**',
      '**/.turbo',       '**/.turbo/**',
      '**/.cache',       '**/.cache/**',
      '**/.claude-worktrees', '**/.claude-worktrees/**',
    ],
  },
);
```

- `@parcel/watcher`는 OS 네이티브 API(FSEvents/inotify/RDCW)를 사용하므로 심볼릭 링크를 재귀적으로 팔로우하지 않는다 — 별도 `followSymlinks: false` 플래그가 필요 없다.
- 네이티브 ignore 글롭이 `node_modules` 등 거대한 서브트리의 스캔 자체를 차단하므로 FD 소모가 폭주하지 않는다 (chokidar v5에서 발생했던 EMFILE 크래시 제거 — ADR-024).
- `.claude-project`는 사용자 설정이 담긴 디렉토리이므로 위 ignore 글롭에 포함되지 않아 계속 감시된다. dotfile 일반 정책은 JS 측 `isIgnoredByWatcher` 필터가 담당한다.

---

## 5.3 네트워크 보안

### 5.3.1 localhost 바인딩

```javascript
// server.js
const server = http.createServer(handler);

const HOST = process.env.HOST || '127.0.0.1';  // 기본 localhost
const PORT = process.env.PORT || 3000;

server.listen(PORT, HOST, () => {
  console.log(`> Ready on http://${HOST}:${PORT}`);
});
```

외부 노출이 필요한 경우에만 명시적으로 `HOST=0.0.0.0`을 설정한다. 이 경우 다음 추가 조치를 필수로 한다:

- 토큰 기반 인증
- HTTPS/WSS 활성화 (TLS)
- CORS 엄격 설정

### 5.3.2 원격 접근 방식 (권장 순서)

1. **SSH 터널링**:
   ```bash
   ssh -L 3000:localhost:3000 user@remote
   ```
2. **Cloudflare Tunnel**:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. **Tailscale** 또는 VPN: 신뢰된 네트워크 내 접근
4. **직접 노출 (비권장)**: 반드시 인증 및 TLS 적용

### 5.3.3 WebSocket Origin 검증

```typescript
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  if (!allowed.includes(origin || '')) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
  // ... 정상 처리
});
```

### 5.3.4 CSRF 보호

- REST API: SameSite 쿠키 + CSRF 토큰 (상태 변경 작업)
- WebSocket: 연결 시 토큰 검증

---

## 5.4 iframe 프리뷰 보안

### 5.4.1 샌드박스 설정

```tsx
<iframe
  srcDoc={htmlContent}
  sandbox="allow-scripts"       // allow-same-origin 절대 금지
  referrerPolicy="no-referrer"
  loading="lazy"
/>
```

### 5.4.2 왜 `allow-same-origin`을 금지하는가?

- `allow-scripts` + `allow-same-origin` 조합은 **샌드박스를 무효화**한다.
- iframe이 부모 페이지의 localStorage, 쿠키, DOM에 접근 가능해진다.
- XSS 공격자가 사용자 세션을 탈취할 수 있다.

### 5.4.3 부모-자식 통신

```typescript
// 부모
iframe.contentWindow?.postMessage(
  { type: 'UPDATE_STYLE', css: newCss },
  '*'  // targetOrigin: srcDoc iframe은 'null' origin을 가지므로 '*' 사용
);

// 자식 (reveal-host.html 등)
window.addEventListener('message', (e) => {
  // 부모 window 검증
  if (e.source !== window.parent) return;
  // 메시지 타입 화이트리스트
  if (!['UPDATE_STYLE', 'UPDATE_SLIDE', 'NAVIGATE'].includes(e.data.type)) return;
  // 안전하게 처리
});
```

### 5.4.4 CSP 헤더

```typescript
// Next.js middleware.ts
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
    "worker-src 'self' blob:",                                    // Monaco web workers
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "connect-src 'self' ws: wss: https://cdn.jsdelivr.net",       // Monaco 소스맵
    "frame-src 'self' data: blob:",                                // iframe srcdoc + blob
  ].join('; '));
  return res;
}
```

### 5.4.5 Markdown sanitize

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeSanitize]}  // 필수
>
  {markdown}
</ReactMarkdown>
```

**금지**: `dangerouslySetInnerHTML` 직접 사용

---

## 5.5 Claude CLI 권한 관리

### 5.5.1 권한 인터셉트 전략

Agent SDK의 `canUseTool` 콜백을 사용해 Claude가 도구를 호출하기 직전에 허용 여부를 결정한다. 실제 구현은 `server-handlers/claude-handler.mjs`의 `canUseTool` 함수에 있으며 아래 순서대로 평가된다.

1. **Abort 확인** — 사용자가 쿼리를 중단했다면 즉시 `deny` + `interrupt: true`.
2. **영구 규칙 매칭** — `.claude/settings.json`을 다시 읽어 `permissions.deny`에 해당하면 `deny`, `permissions.allow`에 해당하면 `allow`. 매칭되면 `auto_decision` 이벤트를 브라우저로 전송해 UI에 기록된다.
3. **사용자 프롬프트** — 매칭되는 규칙이 없으면 `permission_request` 이벤트를 전송하고 모달 응답을 기다린다.
4. **모달 응답 처리** — `Allow Once`는 현재 호출만 허용하고 상태를 남기지 않는다. `Always Allow`는 UI가 먼저 `PUT /api/settings`로 규칙을 저장한 뒤 `permission_response: approved=true`를 보낸다 — 다음 호출부터는 (2)에서 바로 통과된다. `Deny`는 `deny`를 반환한다.

```javascript
// server-handlers/claude-handler.mjs (발췌)
import {
  loadSettings,
  normalizeRules,
  isToolAllowedBySettings,
  isToolDeniedBySettings,
} from '../src/lib/claude/settings-manager.mjs';

const canUseTool = async (toolName, input, { signal }) => {
  if (signal.aborted) {
    return { behavior: 'deny', message: 'Aborted by user', interrupt: true };
  }

  const rules = normalizeRules(await loadSettings());

  if (isToolDeniedBySettings(toolName, rules)) {
    send({ type: 'auto_decision', tool: toolName, decision: 'deny', source: 'settings' });
    return { behavior: 'deny', message: 'Denied by ClaudeGUI deny rule' };
  }
  if (isToolAllowedBySettings(toolName, input, rules)) {
    send({ type: 'auto_decision', tool: toolName, decision: 'allow', source: 'settings' });
    return { behavior: 'allow', updatedInput: input };
  }

  const approved = await requestPermission(toolName, input);
  return approved
    ? { behavior: 'allow', updatedInput: input }
    : { behavior: 'deny', message: 'Denied by user via ClaudeGUI' };
};
```

규칙 문법과 매칭 로직은 `src/lib/claude/settings-manager.mjs`(+ `.ts` 미러)의 `normalizeRules` / `matchBashPattern` / `isToolAllowedBySettings`에 정의된다. "Always Allow" 저장 규칙은 `buildAllowRuleForInput`이 합성한다: 비-Bash 툴은 툴 이름 그대로, Bash는 명령 첫 토큰을 기준으로 `Bash(<token>:*)`.

### 5.5.2 위험 명령 경고

다음 패턴의 Bash 명령은 추가 경고와 함께 표시한다:

- `rm -rf`, `rm -r`, `rmdir`
- `sudo`, `su`
- `chmod 777`, `chown`
- `dd`, `mkfs`
- `curl ... | sh`, `wget ... | sh`
- `/etc/`, `/System/`, `~/.ssh/` 접근

```typescript
const DANGER_PATTERNS = [
  /\brm\s+-[rfR]+/,
  /\bsudo\b/,
  /\bcurl\s+.*\|\s*(?:sh|bash)/,
  /\/etc\//,
];

function assessDanger(cmd: string): 'safe' | 'warning' | 'danger' {
  for (const p of DANGER_PATTERNS) {
    if (p.test(cmd)) return 'danger';
  }
  return 'safe';
}
```

### 5.5.3 CLI 인젝션 방지

사용자 입력을 Claude에 전달할 때 반드시 구조화된 JSON으로 전달한다.

```typescript
// 잘못된 방식 (문자열 결합)
const prompt = `Fix the bug in ${userInput}`;  // 위험

// 올바른 방식 (Agent SDK 파라미터)
query({
  prompt: 'Fix the bug in the file',
  systemPrompt: `Target file: ${escapeForPrompt(userInput)}`,
});
```

---

## 5.6 데이터 보호

### 5.6.1 API 키 처리

- **원칙**: API 키는 **절대** 프론트엔드에 노출하지 않는다.
- 환경 변수(`ANTHROPIC_API_KEY`)로 서버에만 주입한다.
- Next.js `.env.local` 파일은 `.gitignore`에 포함한다.
- 클라이언트 측 `process.env.NEXT_PUBLIC_*` 접두사 **사용 금지**.
- **GUI API Key 입력**: 사용자가 로그인 모달에서 API Key를 직접 입력하면 `POST /api/auth/api-key` (localhost 전용)를 통해 `~/.claudegui/server-config.json`의 `anthropicApiKey` 필드에 서버 측 저장된다. 프론트엔드에는 `hasApiKeySaved: boolean`만 전달되며 키 값 자체는 응답에 포함되지 않는다. 서버 시작 시 저장된 키는 `process.env.ANTHROPIC_API_KEY`로 주입된다 (기존 환경 변수가 설정되어 있으면 환경 변수 우선).

### 5.6.2 세션 데이터

- Claude 세션은 `~/.claude/projects/`에 저장된다 (Claude CLI 자체 관리).
- ClaudeGUI는 세션 메타데이터만 읽기 전용으로 조회한다.
- 세션 데이터 삭제는 `DELETE /api/sessions/:id` 호출 시에만 수행한다.

### 5.6.3 민감 파일 접근 제한

다음 파일/경로는 API에서 차단한다:

```typescript
const BLOCKED_FILES = [
  /\.env(\.|$)/,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /id_ed25519/,
  /credentials(\.|$)/,
  /\.aws\//,
];
```

### 5.6.4 로깅 정책

- 서버 로그에 파일 내용, API 키, 프롬프트 전문을 기록하지 않는다.
- 요청 로그는 경로, 메서드, 상태 코드만 기록한다.
- 에러 스택 트레이스는 개발 모드에서만 상세 출력한다.

---

## 5.7 보안 체크리스트

배포 전 다음 항목을 확인한다:

- [ ] 서버가 `127.0.0.1`에 바인딩되어 있는가?
- [ ] 모든 파일 시스템 API가 `resolveSafe()`를 사용하는가?
- [ ] dotfile 차단 리스트가 최신인가?
- [ ] iframe에 `allow-same-origin`이 사용되지 않았는가?
- [ ] Markdown 렌더링에 `rehype-sanitize`가 적용되었는가?
- [ ] API 키가 환경 변수로만 관리되는가?
- [ ] WebSocket Origin 검증이 활성화되어 있는가?
- [ ] CSP 헤더가 설정되어 있는가?
- [ ] 위험 Bash 명령 경고 로직이 동작하는가?
- [ ] 속도 제한(rate limiting)이 적용되어 있는가?
- [ ] 파일 크기 제한이 적용되어 있는가?
- [ ] `.env.local`이 `.gitignore`에 포함되어 있는가?
- [ ] 원격 접근 비활성화 시 `127.0.0.1`에만 바인딩되는가?
- [ ] 원격 접근 활성화 시 토큰 인증이 동작하는가?
- [ ] 서버 관리 API(`/api/server/*`)가 localhost에서만 접근 가능한가?

---

## 5.8 원격 접근 보안 (FR-1300)

### 5.8.1 토큰 인증 미들웨어

- 원격 접근 활성화 + 토큰 설정 시, 모든 HTTP/WebSocket 요청에 토큰 검증을 수행한다.
- **HTTP**: `Authorization: Bearer <token>` 헤더 검증.
- **WebSocket upgrade**: `?token=<token>` 쿼리 파라미터 검증 (브라우저에서 custom 헤더 불가).
- **localhost 면제**: `127.0.0.1`, `::1`, `::ffff:127.0.0.1` 주소의 요청은 토큰 없이 통과.
- 검증 실패 시 HTTP 401 또는 WebSocket `HTTP/1.1 401 Unauthorized` 응답.

### 5.8.2 관리 API 접근 제어

- `/api/server/status`, `/api/server/config`, `/api/server/restart`는 localhost에서만 접근 가능.
- 원격 클라이언트가 서버 설정을 변경하거나 재시작할 수 없도록 한다.
- 검증: `req.headers.host`가 `127.0.0.1`, `localhost`, `[::1]`로 시작하는지 확인.

### 5.8.3 토큰 관리

- 토큰은 `crypto.randomUUID()` (UUID v4)로 생성하며, 충분한 엔트로피(122비트)를 보장한다.
- 토큰은 `~/.claudegui/server-config.json`에 평문으로 저장된다. 파일 권한은 사용자 전용(600)을 권장.
- WebSocket URL의 `?token=` 파라미터는 프록시 로그에 노출될 수 있으므로, 프로덕션 환경에서는 SSH 터널 또는 TLS 프록시 사용을 권장한다.

### 5.8.4 CORS 정책

- 로컬 모드: 기존 `ALLOWED_ORIGINS` 검증 유지.
- 원격 모드 + 토큰: 토큰 인증이 Origin 검증을 대체. 유효한 토큰을 가진 모든 Origin 허용.
- 원격 모드 + 토큰 없음: 경고 로그 출력, 모든 Origin 허용 (개발/테스트 용도로만 권장).

## 5.9 MCP 서버 보안 (FR-1400)

### 5.9.1 권한 관리

- MCP 서버의 도구 호출은 Agent SDK 내부에서 기존 `canUseTool` 콜백(§5.5)을 통과한다.
- MCP 도구는 SDK 내장 도구(`Read`, `Write`, `Bash` 등)와 동일한 허용/거부 흐름을 따른다.
- `.claude/settings.json`의 `permissions.allow`/`permissions.deny` 규칙이 MCP 도구에도 적용된다.

### 5.9.2 자격 증명 보호

- MCP 서버 설정의 환경변수(`env` 필드)와 헤더(`headers` 필드)에 API 키, 토큰 등이 포함될 수 있다.
- 이 값들은 `.claude/settings.json`에 평문으로 저장되므로, 파일 권한 600을 권장한다.
- 관리 모달에서 환경변수 값과 헤더 값은 `type="password"` 입력으로 마스킹되어 표시된다.
- MCP 설정 API(`/api/mcp`)는 서버 측에서만 접근 가능하며, 자격 증명이 클라이언트 브라우저에 직접 노출되지 않는다.

### 5.9.3 프로세스 격리

- stdio 타입 MCP 서버는 Agent SDK가 자식 프로세스로 spawn하며, 메인 server.js 프로세스와 분리된다.
- SSE/HTTP 타입 MCP 서버는 외부 서비스에 대한 네트워크 연결로, 서버 프로세스 내부에 코드를 실행하지 않는다.
- MCP 서버 설정은 프로젝트 단위로 격리되어, 한 프로젝트의 MCP 서버가 다른 프로젝트의 파일에 접근할 수 없다.
