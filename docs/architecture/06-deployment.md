# 6. 배포 및 운영

## 6.1 로컬 개발 환경

### 사전 요구사항

| 도구 | 최소 버전 | 설치 방법 |
|------|----------|----------|
| Node.js | 20.0–24.x (LTS 22 권장) | https://nodejs.org/ 또는 nvm |
| npm | 10.0+ | Node.js에 포함 |
| Claude CLI | 최신 | `npm install -g @anthropic-ai/claude-code` |
| Python 3 | 3.8+ | node-pty 네이티브 빌드용 |
| C++ 빌드 도구 | — | OS별 상이 (아래 참조) |

**OS별 빌드 도구**:
- macOS: `xcode-select --install`
- Windows: Visual Studio Build Tools + `npm install -g windows-build-tools`
- Linux: `sudo apt install build-essential python3`

### 설치 및 실행

```bash
# 1. 저장소 클론
git clone https://github.com/<org>/ClaudeGUI.git
cd ClaudeGUI

# 2. 의존성 설치
npm install

# 3. 환경변수 설정
cp .env.example .env.local
# .env.local 편집하여 설정값 입력

# 4. 개발 서버 실행 (커스텀 server.js)
node server.js
# 또는 npm 스크립트
npm run dev
```

### 환경 변수

```bash
# .env.local

# 서버 설정
HOST=127.0.0.1
PORT=3000

# 프로젝트 루트 (파일 시스템 샌드박스 범위)
PROJECT_ROOT=/Users/dev/myproject

# Claude 인증 (둘 중 하나)
ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_AUTH_TOKEN=...

# 로깅
LOG_LEVEL=info  # debug | info | warn | error

# 개발 모드
NODE_ENV=development
```

### 개발 스크립트

```json
// package.json
{
  "scripts": {
    "dev": "node server.js",
    "run:local": "bash scripts/dev.sh",
    "run:clean": "bash scripts/dev.sh --clean --build",
    "run:debug": "bash scripts/dev.sh --verbose --trace",
    "build": "next build",
    "start": "NODE_ENV=production node server.js",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "test:e2e": "playwright test"
  }
}
```

### 로컬 구동 스크립트 — `scripts/dev.sh` (v0.3)

`node server.js`를 직접 실행하는 대신, 클린/인스톨/타입체크/린트/테스트/빌드/실행을 **단일 스크립트로 통합**한 런처이다. 기본은 **포그라운드** 실행이며, `--background`로 detach하면 PID 파일과 로그 파일이 생성되어 `--stop`/`--restart`/`--status`/`--tail` 라이프사이클 커맨드로 관리할 수 있다. 모든 서버 측 로그는 **모듈별 디버그 필터**로 색상 분리된다.

**파일 구성**:
- `scripts/dev.sh` — macOS / Linux bash 런처
- `scripts/dev.ps1` — Windows PowerShell 대응판
- `src/lib/debug.mjs` — 모듈 필터 + 색상 매핑 + 선택적 스택 트레이스 (`server.js`와 `server-handlers/*.mjs`가 `createDebug('<module>')`로 사용)

**디버그 모듈 태그** (`CLAUDEGUI_DEBUG`):
| 모듈 | 출처 | 출력 내용 |
|------|------|----------|
| `server` | `server.js` | 부팅, 셧다운, 업그레이드 에러 |
| `project` | `src/lib/project/project-context.mjs` | 런타임 루트 전환, 리스너 알림, 상태 파일 영속화 |
| `files` | `server-handlers/files-handler.mjs` | `@parcel/watcher` 구독 생성/재시작, 파일 이벤트, 클라이언트 연결 |
| `terminal` | `server-handlers/terminal-handler.mjs` | node-pty 스폰/종료, WS 수명 |
| `claude` | `server-handlers/claude-handler.mjs` | Agent SDK 쿼리 시작/결과/에러, 권한 요청 |

각 모듈은 ANSI 팔레트에서 고유 색상을 자동 할당받으며, 로그 라인은 `HH:MM:SS.mmm LEVEL [module] message` 형태로 기록된다. `--trace`를 추가하면 `.trace(...)` 호출 시 짧은 스택 스냅샷이 함께 출력되며 Node 프로세스는 `--trace-warnings --stack-trace-limit=100`으로 부팅한다.

**옵션 카테고리**:

| 카테고리 | 옵션 |
|---------|------|
| 준비 | `--clean` `--install` `--check` `--lint` `--test` `--build` `--all-checks` |
| 실행 모드 | `--dev` (기본) `--prod` (NODE_ENV=production, 빌드 필수) |
| 서버 | `--host <addr>` `--port <n>` `--project <path>` `--kill-port` |
| 디버그 | `--debug <list>` `--verbose` `--trace` `--log-level <lvl>` `--inspect` `--inspect-brk` `--log-file <path>` `--log-truncate` `--no-color` |
| 백그라운드/라이프사이클 | `--background` / `-b` `--stop` `--restart` `--status` `--tail` `--pid-file <path>` `--force-kill` |
| 편의 | `--open` `-h` / `--help` |

**상태 경로** (환경변수로 오버라이드 가능):
| 경로 | 기본값 | 환경변수 |
|------|--------|----------|
| 상태 디렉토리 | `~/.claudegui` | `CLAUDEGUI_STATE_DIR` |
| PID 파일 | `~/.claudegui/claudegui.pid` | `CLAUDEGUI_PID_FILE` |
| 기본 로그 파일 | `~/.claudegui/logs/claudegui.log` | `CLAUDEGUI_LOG_DIR` |

**실행 예시**:

```bash
# --- 포그라운드 (기본) ---
./scripts/dev.sh                                   # 빠른 dev 부팅
./scripts/dev.sh --clean --build                   # 완전 재빌드 후 실행
./scripts/dev.sh --prod --port 8080                # prod 모드 (NODE_ENV=production)
./scripts/dev.sh --all-checks --prod --verbose     # 타입체크+린트+테스트+빌드+prod+전체디버그
./scripts/dev.sh --debug files,claude,project      # 특정 모듈만 디버그 로그 출력
./scripts/dev.sh --verbose --trace                 # 전체 모듈 + 스택 트레이스
./scripts/dev.sh --inspect --debug claude          # Node inspector + Claude 모듈 필터
./scripts/dev.sh --project ~/code/myproj --open    # 초기 프로젝트 지정 + 브라우저 자동 열기
./scripts/dev.sh --log-file /tmp/gui.log           # 터미널 + 파일 동시 기록 (tee)

# --- 백그라운드 (detached) ---
./scripts/dev.sh --background --verbose            # 분리 실행 + 자동 로그 파일
./scripts/dev.sh --background --tail               # 분리 후 즉시 로그 팔로우
./scripts/dev.sh --background --log-file /tmp/gui.log --log-truncate

# --- 라이프사이클 ---
./scripts/dev.sh --status                          # pid, pidfile, uptime, listen 포트
./scripts/dev.sh --tail                            # 기존 로그 팔로우 (서버는 계속 실행)
./scripts/dev.sh --stop                            # SIGTERM → 5s 대기 → SIGKILL
./scripts/dev.sh --stop --force-kill               # 즉시 SIGKILL
./scripts/dev.sh --restart --debug '*'             # stop 후 백그라운드 재시작
./scripts/dev.sh --help                            # 전체 옵션 참조
```

**포그라운드 vs 백그라운드 동작 비교**:

| 항목 | 포그라운드 (기본) | 백그라운드 (`--background`) |
|------|------------------|----------------------------|
| `exec node server.js` | 현재 셸을 대체 (Ctrl+C로 종료) | `nohup` + `setsid`로 detach |
| PID 파일 | 생성 안 함 | `~/.claudegui/claudegui.pid` 기록 |
| 로그 파일 | `--log-file` 지정 시에만 tee | 기본 자동 생성, stdout/stderr 리다이렉트 |
| 종료 방법 | Ctrl+C (SIGINT) | `--stop` (SIGTERM → 필요 시 SIGKILL) |
| 상태 조회 | 없음 (셸이 서버 세션) | `--status` |
| 재시작 | 수동 | `--restart` (stop + bg 시작) |
| 이중 실행 방지 | 없음 (포트 충돌만) | PID 파일 기반, `already running` 차단 |

**로그 파일 포맷**: 백그라운드 시작 시 로그 파일은 append 모드(`--log-truncate`로 덮어쓰기)로 기록되며, 각 시작마다 다음과 같은 헤더가 추가되어 재시작 히스토리를 분리한다.

```
========================================================
 ClaudeGUI dev start @ 2026-04-11 13:57:50
 host=127.0.0.1 port=3471 project=(cwd) debug=files,project
========================================================
13:57:51 INFO [server]  ClaudeGUI ready on http://127.0.0.1:3471 (mode=dev)
13:57:52 LOG  [files]   client connected, total= 1
13:57:52 INFO [files]   starting watcher on /.../project-a
...
```

**Windows 대응**: `scripts/dev.ps1`이 동일한 옵션(`-Background`/`-Stop`/`-Restart`/`-Status`/`-Tail` 등 PowerShell 스위치 네이밍)을 제공한다. 상세는 `.\scripts\dev.ps1 -Help` 참조.

**CLAUDE.md 개발 워크플로와의 관계**: 이 런처는 Mandatory Workflow의 "변경 후" 단계 중 타입체크/린트/테스트/빌드를 한 커맨드로 묶어 실행할 수 있게 한다. CI가 아닌 로컬 개발 중에도 `--all-checks --build`를 전제 조건으로 실행한 뒤 서버를 기동하는 식으로 활용할 수 있다.

---

## 6.2 프로덕션 빌드

### 빌드 프로세스

```bash
# 1. 의존성 설치 (프로덕션)
npm ci

# 2. Next.js 프로덕션 빌드
npm run build

# 3. 프로덕션 서버 실행
NODE_ENV=production node server.js
```

### 빌드 결과물

```
.next/                    # Next.js 빌드 출력
├── server/               # 서버 사이드 번들
├── static/               # 정적 에셋
└── standalone/           # (standalone 모드 시)

node_modules/             # 프로덕션 의존성
server.js                 # 커스텀 서버 엔트리포인트
package.json
```

### 주의사항

- `next dev` 또는 `next start`를 **사용하지 않는다** — 반드시 `node server.js` 사용
- `node-pty`는 프로덕션 환경에서도 네이티브 빌드가 필요하다
- `output: 'standalone'` 설정 시 server.js와 통합 방식을 재검토해야 한다

---

## 6.3 Docker 배포

### Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Builder
FROM node:20-bookworm AS builder

# node-pty 빌드 의존성
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.js ./

EXPOSE 3000

CMD ["node", "server.js"]
```

### 실행

```bash
# 이미지 빌드
docker build -t claudegui:latest .

# 컨테이너 실행 (프로젝트 볼륨 마운트)
docker run -d \
  --name claudegui \
  -p 127.0.0.1:3000:3000 \
  -v /Users/dev/myproject:/workspace:rw \
  -e PROJECT_ROOT=/workspace \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  claudegui:latest
```

### Claude CLI 설치 (Docker 내부)

```dockerfile
RUN npm install -g @anthropic-ai/claude-code
```

---

## 6.4 디렉토리 구조

### 프로젝트 전체 레이아웃

```
ClaudeGUI/
├── CLAUDE.md                      # Claude Code 컨벤션
├── README.md                      # 프로젝트 소개
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── .env.example
├── server.js                      # 커스텀 서버 엔트리포인트
├── Dockerfile
│
├── docs/                          # 프로젝트 문서
│   ├── research/                  # 초기 기획 문서
│   ├── srs/                       # 요구사항 명세
│   └── architecture/              # 아키텍처 설계
│
├── public/                        # 정적 에셋
│   ├── reveal-host.html           # reveal.js iframe 호스트
│   ├── monaco/                    # Monaco 로컬 번들 (폴백)
│   └── icons/
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── files/
│   │       │   ├── route.ts       # GET, DELETE
│   │       │   ├── read/route.ts  # GET
│   │       │   ├── write/route.ts # POST
│   │       │   ├── stat/route.ts  # GET
│   │       │   ├── mkdir/route.ts # POST
│   │       │   └── rename/route.ts # POST
│   │       ├── sessions/
│   │       │   ├── route.ts       # GET, POST
│   │       │   └── [id]/route.ts  # GET, DELETE
│   │       └── git/
│   │           └── status/route.ts
│   │
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives
│   │   ├── layout/
│   │   │   ├── app-shell.tsx
│   │   │   ├── header.tsx
│   │   │   └── status-bar.tsx
│   │   ├── panels/
│   │   │   ├── file-explorer/
│   │   │   ├── editor/
│   │   │   ├── terminal/
│   │   │   └── preview/
│   │   ├── command-palette/
│   │   └── modals/
│   │       └── permission-request-modal.tsx
│   │
│   ├── hooks/
│   │   ├── use-websocket.ts
│   │   ├── use-debounce.ts
│   │   └── use-keyboard-shortcut.ts
│   │
│   ├── stores/
│   │   ├── use-layout-store.ts
│   │   ├── use-editor-store.ts
│   │   ├── use-terminal-store.ts
│   │   ├── use-claude-store.ts
│   │   └── use-preview-store.ts
│   │
│   ├── lib/
│   │   ├── websocket/
│   │   │   ├── reconnecting-ws.ts
│   │   │   ├── terminal-client.ts
│   │   │   ├── claude-client.ts
│   │   │   └── files-client.ts
│   │   ├── fs/                    # 서버 전용
│   │   │   ├── resolve-safe.ts
│   │   │   ├── file-operations.ts
│   │   │   └── watcher.ts
│   │   ├── claude/                # 서버 전용
│   │   │   ├── session-manager.ts
│   │   │   ├── query-handler.ts
│   │   │   ├── permission-interceptor.ts
│   │   │   └── stream-parser.ts
│   │   ├── pty/                   # 서버 전용
│   │   │   ├── session-manager.ts
│   │   │   └── pty-bridge.ts
│   │   └── utils/
│   │
│   ├── types/
│   │   ├── claude.ts
│   │   ├── files.ts
│   │   └── websocket.ts
│   │
│   └── styles/                    # 전역 스타일 (최소)
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 6.5 모니터링 및 로깅

### 로깅 전략

- **라이브러리**: `pino` (빠르고 구조화된 로깅)
- **로그 레벨**: `debug`, `info`, `warn`, `error`
- **출력**: stdout (컨테이너 환경 친화)

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});
```

### 로깅 규칙

| 이벤트 | 레벨 | 포함 정보 |
|--------|------|----------|
| HTTP 요청 | info | method, path, status, duration |
| 파일 작업 | info | 작업 종류, 경로 (샌드박스 내), 크기 |
| Claude 쿼리 시작 | info | requestId, sessionId (프롬프트 제외) |
| Claude 쿼리 완료 | info | requestId, cost, tokens, duration |
| 권한 요청 | info | tool, approved/denied |
| 경로 샌드박스 위반 | warn | 요청된 경로 (정리 후) |
| WebSocket 연결 | info | endpoint, origin |
| 에러 | error | 스택 트레이스 (개발 모드만) |

### 기록 금지

- ❌ 프롬프트 본문
- ❌ 파일 내용
- ❌ API 키
- ❌ 환경 변수 전체
- ❌ 사용자 개인 식별 정보

### 외부 모니터링 (선택)

프로덕션 환경에서 선택적으로 사용할 수 있는 도구:

- **Sentry**: 에러 추적 (민감 정보 필터링 필수)
- **Prometheus + Grafana**: 시스템 메트릭
- **OpenTelemetry**: 분산 트레이싱 (WebSocket 이벤트 추적)

---

## 6.6 CI/CD 파이프라인

### GitHub Actions 예시

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
```

### 파이프라인 단계

1. **Lint**: ESLint + Prettier 검사
2. **Type Check**: TypeScript strict 모드 컴파일
3. **Unit Test**: Vitest 실행, 커버리지 리포트
4. **Integration Test**: 서버 기동 후 API 테스트
5. **E2E Test**: Playwright로 주요 시나리오 검증
6. **Build**: Next.js 프로덕션 빌드
7. **Docker Build**: 멀티 아키텍처 이미지 빌드 (amd64, arm64)
8. **Release**: 태그 푸시 시 GitHub Release 생성

---

## 6.7 운영 체크리스트

### 초기 배포

- [ ] `.env.local` 설정 확인 (API 키, PROJECT_ROOT)
- [ ] `node --version`이 20 이상인지 확인
- [ ] `claude --version`으로 CLI 설치 확인
- [ ] `npm ci && npm run build` 성공 확인
- [ ] `node server.js` 기동 확인
- [ ] 브라우저에서 `http://localhost:3000` 접속 확인
- [ ] 터미널 패널에서 `ls` 명령 테스트
- [ ] 파일 탐색기에서 프로젝트 트리 렌더링 확인
- [ ] Claude에게 간단한 쿼리 전송 테스트

### 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `Error: Cannot find module 'node-pty'` | 네이티브 빌드 실패 | `npm rebuild node-pty` 또는 빌드 도구 설치 |
| WebSocket 연결 실패 | server.js 미실행 | `next dev` 대신 `node server.js` 사용 |
| Monaco 로드 실패 | CDN 차단 | 로컬 번들 폴백 활성화 |
| 파일 변경 이벤트 누락 | `@parcel/watcher` 네이티브 바이너리 로드 실패 | `npm rebuild @parcel/watcher` 후 Node.js 22 LTS 재기동 |
| 파일 탐색기에서 `files-handler`가 `EMFILE: too many open files, watch`로 에러 스팸 (legacy chokidar 5) | chokidar 4+는 네이티브 fsevents 경로를 제거해 macOS에서 `fs.watch` 폴백을 사용 → 서브디렉토리마다 FD 1개 소비 → 256 FD/프로세스 기본 한도 초과 | **해결됨 (ADR-024)**: 파일 감시를 `@parcel/watcher`로 전환하여 루트당 OS 핸들 1개만 사용하도록 변경. `server-handlers/files-handler.mjs`의 `loadWatcher`가 `mod.subscribe(root, cb, { ignore: WATCHER_IGNORE_GLOBS })`를 호출한다. |
| 경로 샌드박스 403 | `PROJECT_ROOT` 오설정 | 환경변수 재확인 |
| `claude` 명령어 없음 | PATH 미등록 | `npm install -g @anthropic-ai/claude-code` |
| 데스크톱 아이콘 더블클릭 시 즉시 닫힘 | 런처 스크립트 권한 누락 | `chmod +x ~/.claudegui/bin/claudegui-launcher.sh` |
| macOS Gatekeeper 차단 | `.command` 파일 미인증 | Finder에서 우클릭 → 열기 (1회) |
| 브라우저가 자동으로 열리지 않음 | 30s 폴링 타임아웃 / `xdg-open` 없음 | 수동으로 `http://localhost:3000` 접속, Linux는 `xdg-utils` 설치 |

---

## 6.8 데스크톱 런처 (FR-1100, ADR-022)

### 개요

원라인 인스톨러는 빌드 단계 이후 **사용자 데스크톱에 ClaudeGUI 바로가기**를 자동 생성한다. 더블클릭하면 새 콘솔 창에서 `node server.js`(prod 모드)가 부팅되고, 백그라운드 폴러가 `localhost:3000`이 응답하면 즉시 OS 기본 브라우저를 띄운다. 콘솔 창을 닫으면 서버도 종료된다 (창 종료 = 서버 종료).

이 경로는 ADR-018의 Tauri `.dmg`/`.msi` 네이티브 인스톨러를 **대체하지 않고 보완**한다. 소스 인스톨 사용자(`curl | bash`, `iwr | iex`)에게 동일한 "더블클릭으로 시작" UX를 제공하는 것이 목표이다.

### 파일 레이아웃

| 경로 | 역할 |
|------|------|
| `public/branding/claudegui.svg` | 단일 source of truth — 마스코트 SVG |
| `public/branding/claudegui-{16,32,48,64,128,180,256,512}.png` | 사전 생성된 PNG (qlmanage 래스터) |
| `public/branding/claudegui.ico` | Vista+ 호환 PNG-in-ICO (16/32/48/64/128/256 6사이즈) |
| `src/app/icon.svg` | Next.js App Router 자동 favicon |
| `src/app/apple-icon.png` | iOS 홈스크린 아이콘 (180×180) |
| `scripts/build-icons.mjs` | macOS 전용 자산 재생성 스크립트 |
| `installer/tauri/src-tauri/icons/` | Tauri 데스크톱 앱 아이콘 (32x32, 128x128, @2x, .icns, .ico) |
| `scripts/install/install.sh` | macOS / Linux 인스톨러 (`install_desktop_launcher` 함수) |
| `scripts/install/install.ps1` | Windows 인스톨러 (`Install-DesktopLauncher` 함수) |

### 사용자 시스템 위치

| 파일 | macOS / Linux | Windows |
|------|---------------|---------|
| 아이콘 디렉토리 | `~/.claudegui/icons/` | `%LOCALAPPDATA%\ClaudeGUI\icons\` |
| 런처 스크립트 | `~/.claudegui/bin/claudegui-launcher.sh` | `%LOCALAPPDATA%\ClaudeGUI\bin\claudegui-launcher.ps1` |
| 데스크톱 바로가기 | `~/Desktop/ClaudeGUI.app` (mac) / `.desktop` (linux) | `%USERPROFILE%\Desktop\ClaudeGUI.lnk` |
| 런처 로그 | `~/.claudegui/logs/launcher.log` (append) | `%USERPROFILE%\.claudegui\logs\launcher.log` (append) |

### 런처 동작 흐름

```
[ 사용자 더블클릭 ]
        │
        ▼
[ 콘솔 창 오픈 ] ──┐
        │          │
        ▼          │
[ 배너 출력 ]      │ macOS:   .app 번들 → open -a Terminal → bash
[ env 설정 ]       │ Linux:   .desktop → x-terminal-emulator → bash
        │          │ Windows: .lnk     → powershell.exe
        ▼
   ┌────────────────────────────┐
   │ 백그라운드 폴러 (60×500ms)  │ ── 200/3xx 응답 ──> [ open / xdg-open / Start-Process ]
   └────────────────────────────┘
        │
        ▼ (병렬)
[ node server.js (foreground) ]
        │
   stdout/stderr ─tee─> [ 콘솔 창 ] + [ launcher.log ]
        │
        ▼
[ 사용자가 창을 닫음 / Ctrl+C ]
        │
   SIGHUP/SIGINT 전파
        │
        ▼
[ node server.js 종료 ]
```

### 트레이드오프

- **macOS는 경량 `.app` 번들로 마스코트 아이콘을 표시한다.** `Info.plist` + 셸 스크립트 실행 파일 + `AppIcon.icns`로 구성된 최소 번들이며, 실질적 코드 서명 없이 로컬 생성으로 Gatekeeper quarantine을 우회한다. Finder와 Dock에서 favicon과 동일한 마스코트가 표시된다.
- **창 종료 = 서버 종료.** 백그라운드 데몬화나 시스템 트레이를 도입하지 않는다. 사용자가 명시적으로 시작·중지할 수 있고, 종료를 잊어서 좀비 프로세스가 남는 일이 없다. 장기 실행이 필요하면 ADR-018(Tauri 네이티브 앱) 또는 `scripts/dev.sh --background`를 사용한다.
- **30초 폴링 타임아웃.** 콜드 부트 시 `next start`가 30초 안에 응답하지 않을 가능성은 낮지만, 초과 시 사용자에게 수동 접속 안내 메시지를 출력한다.
- **Tee의 실시간성.** PowerShell `Tee-Object`와 bash `tee`는 line-buffered여서 사용자 콘솔에 실시간으로 표시된다. node의 stdout이 fully-buffered가 되지 않도록 환경 변수는 추가하지 않았다(현재 동작상 문제 없음).

### 자산 재생성

SVG 마스코트(`public/branding/claudegui.svg`)를 수정하면 macOS에서 다음 명령으로 모든 래스터/ICO/favicon을 재생성한다:

```bash
node scripts/build-icons.mjs
```

스크립트는 `qlmanage`(SVG 렌더), `sips`(정확한 정사각형 리사이즈), 자체 PNG-in-ICO 패커, `iconutil`(macOS `.icns` 생성)을 사용한다. Tauri 데스크톱 앱 아이콘(`installer/tauri/src-tauri/icons/`)도 동일한 SVG 소스에서 함께 생성되어 favicon과 데스크톱 앱이 동일한 마스코트 캐릭터를 사용한다. Windows/Linux에서는 동작하지 않으며(에러로 종료), 커밋된 산출물이 정본이다.
