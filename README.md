# ClaudeGUI

Anthropic Claude CLI를 래핑하는 웹 기반 IDE. 4분할 패널(파일 탐색기, Monaco 에디터, 터미널, 멀티포맷 프리뷰) 레이아웃에서 Claude와 대화하며 코드, 문서, 프레젠테이션을 실시간으로 편집·확인할 수 있다.

> **상태**: 기획/설계 단계 — SRS 및 아키텍처 문서 작성 완료, 구현 미시작

---

## 주요 기능

- **4분할 패널 레이아웃** — `react-resizable-panels` 기반, 접기/펼치기, 리사이즈, localStorage 자동 영속화
- **Monaco 코드 에디터** — VS Code 엔진, 100+ 언어 구문 강조, 멀티탭, AI diff 수락/거절 UI
- **xterm.js 터미널** — WebGL GPU 가속, ANSI 256색, 다중 세션, 배압 제어
- **Claude CLI 통합** — `@anthropic-ai/claude-agent-sdk` 기반 스트리밍 쿼리, 세션 관리(재개/포크), 비용/토큰 트래킹
- **권한 요청 GUI** — Claude 도구 사용 요청을 인터셉트하여 승인/거부 모달 표시, 위험 명령 경고, `.claude/settings.json` 화이트리스트 연동
- **멀티포맷 실시간 프리뷰**
  - HTML (sandboxed iframe srcdoc)
  - PDF (react-pdf, 페이지 네비게이션)
  - Markdown (GFM, LaTeX, 코드 하이라이팅)
  - 이미지 (줌/팬)
  - 프레젠테이션 (reveal.js)
- **대화형 슬라이드 편집** — Claude에게 자연어로 수정 요청 → iframe 리로드 없이 `Reveal.sync()`로 즉시 반영, PPTX/PDF 내보내기
- **파일 탐색기** — `react-arborist` 가상화 트리, Git 상태 표시, 드래그앤드롭, 컨텍스트 메뉴
- **실시간 파일 동기화** — chokidar가 파일 변경 감지 → WebSocket으로 브라우저에 브로드캐스트 → 에디터 자동 갱신
- **커맨드 팔레트** — `Cmd+K` / `Ctrl+Shift+P` (cmdk 기반), 파일 열기(`Cmd+P`), 패널 토글

## 아키텍처 한눈에 보기

```
Browser (Next.js + React)
  │
  │ WebSocket + REST
  ▼
Custom Node.js Server (server.js)
  ├── /ws/terminal  → node-pty
  ├── /ws/claude    → Claude Agent SDK
  ├── /ws/files     → chokidar
  └── /api/files/*  → fs (sandboxed)
```

- **커스텀 서버 필수**: Vercel 등 서버리스 배포 불가 (WebSocket, 장기 세션, 로컬 PTY 필요)
- **로컬 전용**: 기본적으로 `127.0.0.1`에 바인딩, 원격 접근 시 SSH 터널/Cloudflare Tunnel 권장
- 상세 내용은 [docs/architecture/](./docs/architecture/) 참조

## 기술 스택

| 계층 | 기술 |
|------|------|
| Framework | Next.js 14+ (App Router) + 커스텀 `server.js` |
| Language | TypeScript (strict) |
| UI | React 18+, Tailwind CSS, shadcn/ui (Radix) |
| State | Zustand v5 |
| Editor | @monaco-editor/react |
| Terminal | @xterm/xterm v5 + node-pty |
| File Tree | react-arborist v3.4 |
| Panels | react-resizable-panels v4 |
| Preview | react-pdf, react-markdown, reveal.js |
| WebSocket | ws v8 (socket.io 아님) |
| CLI Integration | @anthropic-ai/claude-agent-sdk |
| File Watching | chokidar v5 (ESM) |
| Command Palette | cmdk |

전체 의존성 및 선택 근거는 [docs/architecture/01-system-overview.md](./docs/architecture/01-system-overview.md) 참조.

## 사전 요구사항

| 도구 | 최소 버전 | 비고 |
|------|----------|------|
| Node.js | 20.0+ | chokidar v5 ESM, node-pty |
| npm | 10.0+ | — |
| Claude CLI | 최신 | `npm install -g @anthropic-ai/claude-code` |
| Python 3 | 3.8+ | node-pty 네이티브 빌드 |
| C++ 빌드 도구 | — | macOS: `xcode-select --install` / Windows: Visual Studio Build Tools / Linux: `build-essential` |
| Chrome | 최신 2개 버전 | 기본 타겟 브라우저 |

또한 Anthropic의 Claude Pro/Max/Team/Enterprise 구독과 `ANTHROPIC_API_KEY` 또는 `ANTHROPIC_AUTH_TOKEN`이 필요하다.

## 설치 및 실행

```bash
# 1. 저장소 클론
git clone https://github.com/<org>/ClaudeGUI.git
cd ClaudeGUI

# 2. 의존성 설치
npm install

# 3. 환경변수 설정
cp .env.example .env.local
# .env.local 편집

# 4. 개발 서버 실행 (반드시 node server.js — next dev 아님)
node server.js
```

브라우저에서 `http://localhost:3000`에 접속한다.

### 프로덕션 빌드

```bash
npm ci
npm run build
NODE_ENV=production node server.js
```

### Docker

```bash
docker build -t claudegui:latest .

docker run -d \
  --name claudegui \
  -p 127.0.0.1:3000:3000 \
  -v /Users/dev/myproject:/workspace:rw \
  -e PROJECT_ROOT=/workspace \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  claudegui:latest
```

자세한 배포 가이드는 [docs/architecture/06-deployment.md](./docs/architecture/06-deployment.md) 참조.

## 환경 변수

```bash
# .env.local
HOST=127.0.0.1
PORT=3000
PROJECT_ROOT=/Users/dev/myproject   # 파일시스템 샌드박스 루트
ANTHROPIC_API_KEY=sk-ant-...        # 또는 ANTHROPIC_AUTH_TOKEN
LOG_LEVEL=info                      # debug | info | warn | error
NODE_ENV=development
```

## 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Cmd/Ctrl + K` | 커맨드 팔레트 |
| `Cmd/Ctrl + P` | 빠른 파일 열기 |
| `Cmd/Ctrl + B` | 사이드바 토글 |
| `Cmd/Ctrl + J` | 터미널 토글 |
| `Cmd/Ctrl + S` | 파일 저장 |
| `Ctrl + F` (터미널 내) | 터미널 버퍼 검색 |

## 프로젝트 구조

```
ClaudeGUI/
├── CLAUDE.md                 # Claude Code 컨벤션 및 변경 워크플로
├── README.md                 # 본 문서
├── server.js                 # 커스텀 Node.js 서버 (WS + Next.js)
├── docs/
│   ├── research/             # 초기 기획 문서
│   ├── srs/                  # 소프트웨어 요구사항 명세 (FR/NFR/UC)
│   └── architecture/         # 아키텍처 설계 (ADR, 컴포넌트, 데이터흐름, API, 보안)
├── src/
│   ├── app/                  # Next.js App Router (pages, api routes)
│   ├── components/
│   │   ├── ui/               # shadcn/ui primitives
│   │   ├── panels/           # file-explorer, editor, terminal, preview
│   │   └── layout/
│   ├── stores/               # Zustand 스토어 (layout/editor/terminal/claude/preview)
│   ├── lib/
│   │   ├── websocket/        # WS 클라이언트
│   │   ├── fs/               # 파일시스템 샌드박스 (서버)
│   │   ├── claude/           # Agent SDK 래퍼 (서버)
│   │   └── pty/              # PTY 브릿지 (서버)
│   └── types/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

> **Note**: ClaudeGUI v1.0은 영속 저장소를 사용하지 않는다. Claude 세션은 Claude CLI가 `~/.claude/projects/`에서 관리하고, UI 레이아웃 설정은 브라우저 `localStorage`에 저장된다.

## 문서

- **[CLAUDE.md](./CLAUDE.md)** — 코드 컨벤션, 필수 변경 워크플로, 금지 사항
- **SRS (소프트웨어 요구사항 명세)** — [docs/srs/](./docs/srs/)
  - [01. 서론](./docs/srs/01-introduction.md)
  - [02. 전체 설명](./docs/srs/02-overall-description.md)
  - [03. 기능 요구사항 (FR-100~900)](./docs/srs/03-functional-requirements.md)
  - [04. 비기능 요구사항 (NFR-100~500)](./docs/srs/04-non-functional-requirements.md)
  - [05. 유스케이스 (UC-01~08)](./docs/srs/05-use-cases.md)
  - [06. 외부 인터페이스](./docs/srs/06-external-interfaces.md)
  - [07. 제약조건 및 가정사항](./docs/srs/07-constraints-and-assumptions.md)
- **아키텍처 설계** — [docs/architecture/](./docs/architecture/)
  - [01. 시스템 개요 및 ADR](./docs/architecture/01-system-overview.md)
  - [02. 컴포넌트 설계](./docs/architecture/02-component-design.md)
  - [03. 데이터 흐름](./docs/architecture/03-data-flow.md)
  - [04. API 설계](./docs/architecture/04-api-design.md)
  - [05. 보안 아키텍처](./docs/architecture/05-security-architecture.md)
  - [06. 배포 및 운영](./docs/architecture/06-deployment.md)

## 개발 워크플로

**모든 기능 변경은 반드시 [CLAUDE.md](./CLAUDE.md)의 Mandatory Workflow를 따라야 한다.**

### 변경 전

1. `docs/srs/`에서 관련 FR/NFR 검토 및 적합성 판정
2. `docs/architecture/`에서 컴포넌트/데이터흐름/ADR 적합성 검토
3. 불일치 발견 시 작업 중단하고 팀과 정렬 확인

### 변경 후 (모두 필수)

1. `docs/srs/` 업데이트 (FR/NFR, 필요 시 유스케이스)
2. `docs/architecture/` 업데이트 (아키텍처 결정 시 ADR 추가)
3. `tests/`에 테스트 추가/수정 및 전체 통과 확인
4. `README.md` 업데이트
5. (해당 시) `migrations/` DB 마이그레이션 — v1.0은 DB 없음

## 스크립트

```bash
npm run dev          # 개발 서버 (node server.js)
npm run build        # Next.js 프로덕션 빌드
npm start            # 프로덕션 서버
npm run lint         # ESLint
npm run type-check   # TypeScript 컴파일 검사
npm test             # 단위 테스트 (Vitest)
npm run test:e2e     # E2E 테스트 (Playwright)
```

## 보안

- 서버는 기본적으로 `127.0.0.1`에만 바인딩
- 모든 파일 시스템 API는 `resolveSafe()` 경로 샌드박싱 적용
- dotfile(`.env`, `.git`, `.ssh`) 접근 차단
- iframe 프리뷰는 `sandbox="allow-scripts"` (allow-same-origin 금지)
- Markdown은 `rehype-sanitize`로 XSS 방지
- API 키는 서버 환경 변수로만 관리 (프론트엔드 노출 금지)
- Claude 도구 사용 시 GUI 권한 승인 모달 표시

전체 위협 모델 및 대응 전략은 [docs/architecture/05-security-architecture.md](./docs/architecture/05-security-architecture.md) 참조.

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| `Cannot find module 'node-pty'` | `npm rebuild node-pty` 또는 OS별 빌드 도구 설치 |
| WebSocket 연결 실패 | `next dev` 대신 `node server.js` 사용 |
| Monaco 로드 실패 | CDN 차단 확인, 로컬 번들 폴백 검토 |
| 경로 샌드박스 403 | `PROJECT_ROOT` 환경변수 재확인 |
| `claude` 명령어 없음 | `npm install -g @anthropic-ai/claude-code` |

## 라이선스

TBD

## 기여

이슈 및 PR을 환영합니다. 기여 전에 [CLAUDE.md](./CLAUDE.md)의 개발 워크플로를 반드시 읽어 주세요.
