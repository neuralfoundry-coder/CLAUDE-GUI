# 4. API 설계

## 4.1 REST API

모든 REST 엔드포인트는 `/api` 접두사를 사용한다. 응답 형식은 JSON이며, 에러 시 표준 포맷을 따른다.

### 공통 응답 포맷

```typescript
// 성공
{ "success": true, "data": ... }

// 에러
{ "success": false, "error": "메시지", "code": 숫자 }
```

### 4.1.1 파일 시스템 API

#### `GET /api/files`

디렉토리 내용을 조회한다.

**쿼리 파라미터**:
- `path` (필수): 조회할 디렉토리 경로 (프로젝트 루트 상대 경로)

**응답**:
```json
{
  "success": true,
  "data": {
    "path": "src",
    "entries": [
      {
        "name": "app",
        "type": "directory",
        "size": 0,
        "mtime": "2026-04-10T12:34:56.000Z"
      },
      {
        "name": "page.tsx",
        "type": "file",
        "size": 1024,
        "mtime": "2026-04-11T09:00:00.000Z"
      }
    ]
  }
}
```

#### `GET /api/files/read`

파일 내용을 조회한다.

**쿼리 파라미터**:
- `path` (필수): 파일 경로
- `encoding` (선택): `utf-8` (기본) 또는 `base64`

**응답**:
```json
{
  "success": true,
  "data": {
    "content": "...",
    "encoding": "utf-8",
    "size": 1024
  }
}
```

**에러**:
- `404` - 파일 없음
- `403` - 경로 샌드박스 위반
- `413` - 파일 크기 초과 (텍스트 10MB / 바이너리 50MB)

#### `POST /api/files/write`

파일을 저장한다.

**요청 본문**:
```json
{
  "path": "src/app/page.tsx",
  "content": "...",
  "encoding": "utf-8"
}
```

**응답**:
```json
{ "success": true, "data": { "size": 1024 } }
```

#### `DELETE /api/files`

파일 또는 디렉토리를 삭제한다.

**쿼리 파라미터**:
- `path` (필수)
- `recursive` (선택, `1`/`true`로 활성): 디렉토리에 자식이 있어도 재귀 삭제. 미지정 시 빈 디렉토리만 허용한다. 파일 탐색기 UI는 항상 `recursive=1`로 호출한다.

#### `POST /api/files/copy`

파일 또는 디렉토리를 프로젝트 루트 샌드박스 내부에서 복사한다. 인-앱 클립보드 paste(`Cmd/Ctrl+V`), Alt+드래그, Duplicate(`Cmd/Ctrl+D`) 액션이 사용한다 (FR-211).

**요청 본문**:
```json
{ "srcPath": "src/foo.ts", "destPath": "src/bar/foo.ts" }
```

**서버 검증**:
- `resolveSafe(srcPath)` 및 `resolveSafe(destPath)`로 양쪽 경로를 프로젝트 루트 내부로 제한한다. 거부된 세그먼트(`.env`, `.git` 등)는 차단한다.
- 디렉토리를 자기 자신 또는 자손 위치로 복사하는 요청은 `400 EINVAL`로 거부한다.
- 대상 경로가 이미 존재하면 덮어쓰지 않고 ` (1)`, ` (2)` 접미사로 고유화한다 (FR-208 업로드와 동일 규칙).
- 내부적으로 `fs.cp(src, finalDest, { recursive: true, force: false, errorOnExist: true })` 사용.

**응답**:
```json
{
  "success": true,
  "data": {
    "srcPath": "src/foo.ts",
    "destPath": "src/bar/foo.ts",
    "writtenPath": "src/bar/foo.ts"
  }
}
```

**에러 코드**:
- `400` — `srcPath`/`destPath` 누락, 동일 경로, 자기/자손 복사 시도
- `403` — 샌드박스 이탈 / 거부된 세그먼트
- `404` — 소스 없음
- `429` — 레이트 리밋

#### `POST /api/files/mkdir`

디렉토리를 생성한다.

**요청 본문**:
```json
{ "path": "src/new-folder", "recursive": true }
```

#### `POST /api/files/rename`

파일/디렉토리의 이름을 변경하거나 이동한다.

**요청 본문**:
```json
{
  "oldPath": "src/old-name.ts",
  "newPath": "src/new-name.ts"
}
```

#### `POST /api/files/upload`

로컬 OS의 파일을 프로젝트 루트 샌드박스로 복사한다. OS 파일 탐색기에서 드래그 앤 드롭 또는 클립보드 붙여넣기(FR-208)로 트리거된다.

**Content-Type**: `multipart/form-data`

**폼 필드**:
- `destDir` (선택, 기본값 `""`): 프로젝트 루트 기준 상대 경로. 빈 문자열이면 프로젝트 루트.
- `files` (반복, 필수): 업로드할 `File` 인스턴스. 여러 개를 동일 필드명으로 반복 첨부한다.

**서버 검증**:
- `resolveSafe(destDir)`로 대상 디렉토리를 프로젝트 루트 내부로 제한한다.
- 각 파일명은 `path.basename`으로 정규화한다. `.`, `..`, 또는 `/`, `\`, `\0`을 포함하는 이름은 400 오류로 거부한다.
- 단일 파일 최대 크기 50 MB(`MAX_BINARY_SIZE`), 요청 전체 총합 최대 200 MB. 초과 시 413.
- 동일 파일명이 이미 존재하면 덮어쓰지 않고 ` (n)` 접미사로 고유화한다 (예: `report.pdf` → `report (1).pdf`).
- 분당 1200회 공용 파일 API 레이트 리밋 적용.

**응답**:
```json
{
  "success": true,
  "data": {
    "uploaded": [
      { "name": "logo.png", "size": 12345, "writtenPath": "assets/logo.png" }
    ]
  }
}
```

**에러 코드**:
- `400` — `destDir`가 문자열이 아님 / 파일이 하나도 없음 / 잘못된 파일명 / 대상이 디렉토리가 아님
- `403` — 경로 샌드박스 이탈 / 거부된 세그먼트(`.env`, `.git` 등)
- `404` — 대상 디렉토리가 존재하지 않음
- `413` — 개별 파일 또는 전체 요청이 크기 한도 초과
- `429` — 레이트 리밋

#### `GET /api/files/raw`

파일을 바이너리로 응답한다 (이미지, PDF 뷰어용).

**쿼리 파라미터**:
- `path` (필수)

**응답**: 파일 내용 (Content-Type은 확장자 기반 자동 감지). 50MB 초과 시 413.

#### `GET /api/files/stat`

파일 메타데이터를 조회한다.

**쿼리 파라미터**:
- `path` (필수)

**응답**:
```json
{
  "success": true,
  "data": {
    "size": 1024,
    "mtime": "2026-04-11T09:00:00.000Z",
    "ctime": "2026-04-10T12:34:56.000Z",
    "isDirectory": false,
    "isFile": true,
    "isSymbolicLink": false
  }
}
```

### 4.1.2 Git API

#### `GET /api/git/status`

프로젝트 Git 상태를 조회한다. Git 저장소가 아니면 `isRepo: false`를 반환한다.

**응답**:
```json
{
  "success": true,
  "data": {
    "branch": "main",
    "isRepo": true,
    "files": {
      "src/auth.ts": "modified",
      "src/new.ts": "untracked",
      "src/old.ts": "deleted"
    }
  }
}
```

파일 상태 값: `modified`, `added`, `deleted`, `renamed`, `untracked`, `conflicted`

내부 구현은 `git status --porcelain` + `git rev-parse --abbrev-ref HEAD`를 `child_process.exec`로 호출한다. 구현 위치: `src/lib/fs/git-status.ts`.

### 4.1.3 세션 API

#### `GET /api/sessions`

Claude 세션 목록을 조회한다. 로컬 `~/.claude/projects/` 디렉토리를 기반으로 한다.

**응답**:
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "abc123",
        "name": "feature/auth",
        "cwd": "/Users/dev/myproject",
        "createdAt": "2026-04-01T10:00:00.000Z",
        "lastUsedAt": "2026-04-11T09:00:00.000Z",
        "totalCost": 0.25,
        "messageCount": 42
      }
    ]
  }
}
```

#### `POST /api/sessions`

새 세션을 생성한다.

**요청 본문**:
```json
{
  "name": "feature/new-login",
  "cwd": "/Users/dev/myproject"
}
```

**응답**:
```json
{ "success": true, "data": { "sessionId": "xyz789" } }
```

#### `GET /api/sessions/:id`

세션 상세 정보 및 메시지 히스토리를 조회한다.

**응답**:
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "feature/auth",
    "messages": [...],
    "totalCost": 0.25,
    "tokenUsage": { "input": 15000, "output": 8000 }
  }
}
```

#### `DELETE /api/sessions/:id`

세션을 삭제한다.

---

## 4.2 WebSocket 프로토콜

### 4.2.1 공통 규칙

- 메시지 포맷: JSON (UTF-8 텍스트 프레임) 또는 바이너리 프레임
- 제어 메시지는 `type` 필드로 구분
- 하트비트: 서버가 29초마다 ping, 클라이언트 pong 응답
- 재연결: 지수 백오프 (1s → 2s → 4s → ... → 30s)

### 4.2.2 `/ws/terminal`

터미널 PTY 세션과 연결된다. 연결당 하나의 PTY가 스폰되며, 다중 세션은 각각 별도의 `/ws/terminal` 연결을 사용한다.

#### 연결 시

```
ws://localhost:3000/ws/terminal
```

서버는 즉시 `getActiveRoot()`를 `cwd`로 사용하여 새 `node-pty` 프로세스를 스폰한다 (기본 120×30). 클라이언트는 첫 attach 직후 실제 크기를 `resize` 제어 프레임으로 전송한다.

#### 프레임 규칙

| 방향 | 프레임 타입 | 용도 |
|------|--------------|------|
| 서버 → 클라이언트 | **binary** | PTY stdout/stderr 바이트 (UTF-8) — 16 ms 단위로 배치 전송 |
| 서버 → 클라이언트 | text JSON | 제어 메시지 (`exit`, `error`) |
| 클라이언트 → 서버 | text JSON | 제어 메시지 (`input`, `resize`, `pause`, `resume`) |

클라이언트는 `typeof event.data === 'string'`인지로 제어/데이터를 구분하므로 PTY 출력이 우연히 `{`로 시작해도 오인되지 않는다.

#### 클라이언트 → 서버 (모두 텍스트 JSON)

**사용자 입력**:
```json
{ "type": "input", "data": "ls\r" }
```

**리사이즈**:
```json
{ "type": "resize", "cols": 120, "rows": 30 }
```

**배압 제어**:
```json
{ "type": "pause" }
{ "type": "resume" }
```

#### 서버 → 클라이언트

**PTY 출력** (바이너리 프레임, 16 ms 배치):
```
[binary] 쉘 stdout 바이트 (ANSI 이스케이프 시퀀스 포함)
```

**프로세스 종료** (텍스트 JSON):
```json
{ "type": "exit", "code": 0 }
```

**오류** (텍스트 JSON):
```json
{ "type": "error", "code": "BUFFER_OVERFLOW", "message": "terminal output buffer exceeded 5242880 bytes" }
```

에러 코드:

| 코드 | 의미 |
|------|------|
| `BUFFER_OVERFLOW` | 서버 측 출력 큐가 5 MB를 초과. 서버가 PTY를 kill하고 WebSocket을 1011 코드로 닫는다. |
| `PTY_UNAVAILABLE` | `node-pty` 네이티브 모듈을 로드할 수 없음. 서버가 즉시 WebSocket을 닫는다. |

#### 배압 동작

- 클라이언트는 xterm.js write backlog가 100 KB를 초과하면 `{type:"pause"}`를 전송.
- 서버는 `paused` 상태에서 PTY 데이터를 내부 큐에 버퍼링한다 (드롭하지 않음).
- 큐가 256 KB를 초과하면 `ptyProcess.pause()`로 쉘 자체의 출력을 일시 중단 (POSIX 한정).
- 클라이언트 backlog가 10 KB 미만으로 내려가면 `{type:"resume"}` 전송 → 서버는 `ptyProcess.resume()`과 즉시 플러시.
- 큐가 5 MB를 초과하면 `BUFFER_OVERFLOW`로 세션 종료.

---

### 4.2.3 `/ws/claude`

Claude Agent SDK와 연결된다.

#### 클라이언트 → 서버

**쿼리 전송**:
```json
{
  "type": "query",
  "requestId": "req-123",
  "prompt": "Fix the login bug",
  "sessionId": "abc123",
  "options": {
    "maxTurns": 10,
    "maxBudget": 1.0,
    "model": "claude-opus-4-6"
  }
}
```

**권한 응답**:
```json
{
  "type": "permission_response",
  "requestId": "perm-456",
  "approved": true
}
```

**요청 중단**:
```json
{ "type": "abort", "requestId": "req-123" }
```

#### 서버 → 클라이언트

메시지는 Agent SDK의 `SDKMessage` 유니언 타입을 그대로 래핑한다. 클라이언트는 `data.type`으로 분기 처리한다.

**시스템 init** (세션 시작):
```json
{
  "type": "message",
  "requestId": "req-123",
  "data": {
    "type": "system",
    "subtype": "init",
    "session_id": "abc-123",
    "cwd": "/path/to/project",
    "model": "claude-opus-4-6",
    "tools": ["Bash", "Edit", "Read", "..."],
    "permissionMode": "default"
  }
}
```

**어시스턴트 메시지** (content 블록 배열에 text/tool_use 혼재):
```json
{
  "type": "message",
  "requestId": "req-123",
  "data": {
    "type": "assistant",
    "message": {
      "content": [
        { "type": "text", "text": "I'll edit the file now." },
        { "type": "tool_use", "id": "toolu_01...", "name": "Edit", "input": { "file_path": "src/auth.ts", "old_string": "...", "new_string": "..." } }
      ],
      "usage": { "input_tokens": 3, "output_tokens": 17 }
    },
    "session_id": "abc-123"
  }
}
```

**사용자 메시지** (도구 실행 결과, UI에 표시하지 않음):
```json
{
  "type": "message",
  "data": {
    "type": "user",
    "message": { "content": [{ "type": "tool_result", "tool_use_id": "toolu_...", "content": "ok" }] }
  }
}
```

**권한 요청** (SDK `canUseTool` 콜백에서 발행):
```json
{
  "type": "permission_request",
  "requestId": "perm-456",
  "tool": "Bash",
  "args": { "command": "npm test" },
  "danger": "safe"
}
```
`danger`는 `safe` | `warning` | `danger` 중 하나. 서버에서 위험 패턴(`rm -rf`, `sudo`, `curl ... | sh` 등) 매칭으로 결정된다.

**최종 결과** (Agent SDK `SDKResultMessage`):
```json
{
  "type": "result",
  "requestId": "req-123",
  "data": {
    "type": "result",
    "subtype": "success",
    "result": "최종 어시스턴트 응답 텍스트",
    "total_cost_usd": 0.008,
    "duration_ms": 1985,
    "num_turns": 1,
    "session_id": "abc-123",
    "usage": {
      "input_tokens": 3,
      "output_tokens": 17,
      "cache_read_input_tokens": 15165
    },
    "permission_denials": []
  }
}
```
`subtype`: `success`, `error_during_execution`, `error_max_turns`, `error_max_budget_usd`, `error_max_structured_output_retries`.

**에러**:
```json
{
  "type": "error",
  "requestId": "req-123",
  "message": "Session not found",
  "code": 4404
}
```

---

### 4.2.4 `/ws/files`

`@parcel/watcher`가 수집한 파일 변경 이벤트를 브로드캐스트한다 (ADR-024).

#### 클라이언트 → 서버

**감시 디렉토리 설정**:
```json
{ "type": "watch", "path": "/Users/dev/myproject" }
```

#### 서버 → 클라이언트

**파일 변경 이벤트**:
```json
{
  "type": "change",
  "event": "change",
  "path": "src/lib/auth.ts",
  "timestamp": "2026-04-11T09:00:00.000Z"
}
```

**이벤트 종류**: `add`, `change`, `unlink`, `ready`, `error` (네이티브 감시기가 방출하는 `create`/`update`/`delete`를 정규화한 값 + 구독 준비 / 실패 상태)

---

## 4.3 연결 관리

### 재연결 전략

```typescript
class ReconnectingWebSocket {
  private backoff = 1000;  // 1초 시작
  private readonly maxBackoff = 30000;  // 30초 상한

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onopen = () => {
      this.backoff = 1000;  // 리셋
    };
  }

  private scheduleReconnect() {
    setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
  }
}
```

### 하트비트

서버는 29초마다 WebSocket ping을 전송한다 (브라우저 기본 idle 타임아웃이 30초인 점 고려).

```typescript
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.isAlive === false) return client.terminate();
    client.isAlive = false;
    client.ping();
  });
}, 29000);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});
```

---

## 4.4 에러 코드 정의

| 코드 | 의미 | HTTP 상태 |
|------|------|----------|
| 4400 | 잘못된 요청 (파라미터 누락/형식 오류) | 400 |
| 4401 | 인증 실패 | 401 |
| 4403 | 경로 샌드박스 위반 / 권한 없음 | 403 |
| 4404 | 리소스 없음 (파일/세션) | 404 |
| 4413 | 파일 크기 초과 | 413 |
| 4429 | 요청 속도 제한 초과 | 429 |
| 5500 | 서버 내부 에러 | 500 |
| 5501 | Claude CLI 실행 실패 | 500 |
| 5502 | PTY 프로세스 생성 실패 | 500 |
| 5503 | 파일 시스템 작업 실패 | 500 |
| 5504 | WebSocket 연결 끊김 | — |

### 에러 응답 예시

```json
{
  "success": false,
  "error": "Path outside project root",
  "code": 4403,
  "details": {
    "requestedPath": "../../../etc/passwd"
  }
}
```
