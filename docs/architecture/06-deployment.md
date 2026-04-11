# 6. 배포 및 운영

## 6.1 로컬 개발 환경

### 사전 요구사항

| 도구 | 최소 버전 | 설치 방법 |
|------|----------|----------|
| Node.js | 20.0+ | https://nodejs.org/ 또는 nvm |
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
    "build": "next build",
    "start": "NODE_ENV=production node server.js",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "test:e2e": "playwright test"
  }
}
```

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
| chokidar 이벤트 누락 | ESM 임포트 실패 | Node.js 20+ 사용, dynamic import |
| 경로 샌드박스 403 | `PROJECT_ROOT` 오설정 | 환경변수 재확인 |
| `claude` 명령어 없음 | PATH 미등록 | `npm install -g @anthropic-ai/claude-code` |
