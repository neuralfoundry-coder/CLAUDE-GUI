# ClaudeGUI

![ClaudeGUI main screen](./images/main.png)
![ClaudeGUI main screen 2](./images/main02.png)
![ClaudeGUI main screen 3](./images/main03.png)

> 🌐 **Language / 언어**: [한국어](./README.md) · [English](./README-EN.md)

> ⚠️ **고지사항 (Disclaimer)**: 본 프로젝트는 **Claude Code** 및 **Anthropic**과 아무런 관계가 없는 비공식(unofficial) 커뮤니티 프로젝트입니다. Anthropic, Claude, Claude Code는 Anthropic, PBC의 상표이며, 본 프로젝트는 해당 회사로부터 후원, 보증, 제휴를 받지 않습니다.

Anthropic Claude CLI를 래핑하는 웹 기반 IDE. 4분할 패널(파일 탐색기, Monaco 에디터, 터미널, 멀티포맷 프리뷰) 레이아웃에서 Claude와 대화하며 코드, 문서, 프레젠테이션을 실시간으로 편집·확인할 수 있다.

> **상태**: v0.3 확장 완료 — 타입 체크·린트·단위 테스트(**102/102**)·Next 빌드·Playwright E2E(**14/14**) 모두 통과. **런타임 프로젝트 핫스왑**(헤더에서 프로젝트 전환), **Claude CLI 인증 일체화** (`~/.claude/.credentials.json` 자동 감지 + 헤더 배지), **HTML 스트리밍 라이브 프리뷰** (전체화면 모드 포함), **Green Phosphor CRT 레트로 테마** 옵션, **GitHub 원라인 설치 스크립트** (macOS/Linux + Windows), **Tauri v2 + Node 사이드카 네이티브 인스톨러** (`.dmg`/`.msi`) 스캐폴딩 완료.

---

## 주요 기능

- **4분할 패널 레이아웃** — `react-resizable-panels` 기반, 5개 패널 모두 접기/펼치기, 리사이즈, 더블클릭 크기 초기화, localStorage 자동 영속화. 1280px 미만 해상도에서 탭 기반 단일 패널 모드 자동 전환
- **Monaco 코드 에디터** — VS Code 엔진, 100+ 언어 구문 강조, 멀티탭, AI diff 수락/거절 UI, **Claude AI 인라인 자동완성**(ghost text, Tab 수락), 브래킷 색상화, 코드 폴딩, 스티키 스크롤, 에디터 설정 드롭다운(탭 크기/워드랩/미니맵 등)
- **xterm.js 터미널** — WebGL GPU 가속, ANSI 256색, 다중 세션, 배압 제어
- **Claude CLI 통합** — `@anthropic-ai/claude-agent-sdk` 기반 스트리밍 쿼리, **멀티탭 채팅**(탭별 독립 세션·메시지·스트리밍, 자동 세션 생성, 탭 자동 명명), 세션 관리(재개/포크), 비용/토큰 트래킹
- **권한 요청 GUI** — Claude 도구 사용 요청을 인터셉트하여 승인/거부 모달 표시, 위험 명령 경고, `.claude/settings.json` 화이트리스트 연동
- **멀티포맷 실시간 프리뷰**
  - HTML (sandboxed iframe srcdoc)
  - PDF (react-pdf, 페이지 네비게이션)
  - Markdown (GFM, LaTeX, 코드 하이라이팅)
  - 이미지 (줌/팬)
  - 프레젠테이션 (reveal.js)
  - **소스/렌더 토글** — HTML·Markdown·Slides 파일은 헤더 버튼으로 렌더 뷰와 구문 강조 소스 뷰를 즉시 전환. 프리뷰 불가 파일을 선택하면 패널이 완전히 비어 안내 텍스트 노이즈 없음. (FR-601, FR-614)
- **대화형 슬라이드 편집** — Claude에게 자연어로 수정 요청 → iframe 리로드 없이 `Reveal.sync()`로 즉시 반영, PPTX/PDF 내보내기
- **파일 탐색기** — `react-arborist` 가상화 트리, Git 상태 표시, OS 파일 드래그앤드롭 업로드, **네이티브 수준 상호작용**: 다중 선택, 인라인 이름 변경, Cut/Copy/Paste/Duplicate, 트리 내부 드래그 이동·Alt 복사, 키보드 단축키 (F2/Del/Cmd+C·X·V·D·A·N), 호이스팅된 안정 컨텍스트 메뉴
- **실시간 파일 동기화** — `@parcel/watcher`가 네이티브 FSEvents/inotify로 파일 변경 감지 → WebSocket으로 브라우저에 브로드캐스트 → 에디터 자동 갱신
- **멀티 브라우저 독립 프로젝트** — 각 브라우저 탭이 UUID 기반 `browserId`(`sessionStorage`)로 독립된 프로젝트 컨텍스트를 유지. 탭별로 서로 다른 프로젝트를 열 수 있으며, 터미널·Claude 세션·파일 탐색기·에디터·프리뷰가 탭 단위로 독립 동작. 동일 프로젝트를 여러 탭에서 열 경우 파일 와처는 공유
- **커맨드 팔레트** — `Cmd+K` / `Ctrl+Shift+P` (cmdk 기반), 파일 열기(`Cmd+P`), 패널 토글
- **생성 콘텐츠 갤러리** — Claude가 만든 HTML/SVG/Markdown/코드뿐 아니라 Write/Edit 도구로 저장한 이미지·PDF·Word(.docx)·Excel(.xlsx)·PowerPoint(.pptx) 파일까지 자동 수집. 세션 아티팩트 레지스트리(`/api/artifacts/*`)가 캡처된 경로를 보관하여 프로젝트를 전환해도 프리뷰와 내보내기가 유지된다. 종류별 전용 뷰어(iframe 샌드박스, react-pdf, mammoth, SheetJS, JSZip 기반 PPTX 슬라이더) 및 Original 파일 다운로드를 지원한다. 각 아티팩트는 목록에서 개별 삭제가 가능하고, 팝업 모달은 우측 하단 드래그 핸들로 크기를 조정해 `localStorage`에 영속화한다. PDF Export는 hidden iframe + `@media print` CSS 기반으로 개선되어 인쇄 대화상자가 안정적으로 렌더된다.

## 아키텍처 한눈에 보기

```
Browser (Next.js + React)
  │
  │ WebSocket + REST
  ▼
Custom Node.js Server (server.js)
  ├── /ws/terminal  → node-pty
  ├── /ws/claude    → Claude Agent SDK
  ├── /ws/files     → @parcel/watcher
  └── /api/files/*  → fs (sandboxed)
```

- **커스텀 서버 필수**: Vercel 등 서버리스 배포 불가 (WebSocket, 장기 세션, 로컬 PTY 필요)
- **로컬 전용**: 기본적으로 `127.0.0.1`에 바인딩, 원격 접근 시 SSH 터널/Cloudflare Tunnel 권장
- 상세 내용은 [docs/architecture/](./docs/architecture/) 참조

## 기술 스택

| 계층 | 기술 |
|------|------|
| Framework | Next.js 15+ (App Router) + 커스텀 `server.js` |
| Language | TypeScript (strict) |
| UI | React 19+, Tailwind CSS, shadcn/ui (Radix) |
| State | Zustand v5 |
| Editor | @monaco-editor/react |
| Terminal | @xterm/xterm v5 + node-pty |
| File Tree | react-arborist v3.4 |
| Panels | react-resizable-panels v2 |
| Preview | react-pdf, react-markdown, reveal.js |
| WebSocket | ws v8 (socket.io 아님) |
| CLI Integration | @anthropic-ai/claude-agent-sdk |
| File Watching | @parcel/watcher v2 (native FSEvents/inotify/RDCW) |
| Command Palette | cmdk |

전체 의존성 및 선택 근거는 [docs/architecture/01-system-overview.md](./docs/architecture/01-system-overview.md) 참조.

## 사전 요구사항

| 도구 | 최소 버전 | 비고 |
|------|----------|------|
| Node.js | 20.0–24.x (LTS 22 권장) | `@parcel/watcher`·node-pty 네이티브 프리빌트 |
| npm | 10.0+ | — |
| Claude CLI | 최신 | `npm install -g @anthropic-ai/claude-code` |
| Python 3 | 3.8+ | node-pty 네이티브 빌드 |
| C++ 빌드 도구 | — | macOS: `xcode-select --install` / Windows: Visual Studio Build Tools / Linux: `build-essential` |
| Chrome | 최신 2개 버전 | 기본 타겟 브라우저 |

또한 Anthropic의 Claude Pro/Max/Team/Enterprise 구독과 `ANTHROPIC_API_KEY` 또는 `ANTHROPIC_AUTH_TOKEN`이 필요하다.

## 설치 및 실행

### 원라인 설치 (권장)

**macOS / Linux**:
```bash
curl -fsSL https://raw.githubusercontent.com/neuralfoundry-coder/CLAUDE-GUI/main/scripts/install/install.sh | bash
```

**Windows (PowerShell)**:
```powershell
iwr -useb https://raw.githubusercontent.com/neuralfoundry-coder/CLAUDE-GUI/main/scripts/install/install.ps1 | iex
```

스크립트는 Node.js 22 LTS, Claude CLI, 프로젝트 체크아웃, 런처(`claudegui`)에 더해 **바탕화면 아이콘**까지 자동 설치한다. 각 파괴적 단계는 사용자 확인 프롬프트를 거친다 (`--yes`로 비대화형, `--dry-run`으로 계획만 출력, `--no-desktop-icon` / `-NoDesktopIcon`으로 바탕화면 아이콘 생성 생략).

### 바탕화면 아이콘 (FR-1100)

원라인 인스톨러는 OS별 바탕화면 바로가기를 만들어 둔다. 아이콘을 더블클릭하면:

1. 새 터미널/콘솔 창에서 `node server.js`(prod 모드)가 부팅되며 실시간 로그가 표시된다.
2. 백그라운드 폴러가 `http://localhost:3000`이 응답하면 즉시 **기본 웹브라우저**를 띄운다.
3. 창을 닫거나 `Ctrl+C`로 종료하면 서버 프로세스도 함께 종료된다.

| OS | 위치 | 형태 | 비고 |
|----|------|------|------|
| macOS | `~/Desktop/ClaudeGUI.command` | 더블클릭 시 Terminal.app에서 실행 | 최초 실행 시 Gatekeeper로 인해 우클릭 → 열기가 필요할 수 있음. 아이콘은 기본 Terminal 아이콘 |
| Linux | `~/Desktop/ClaudeGUI.desktop` | 데스크톱 환경의 런처 (xdg) | `Icon=` 필드가 SVG 마스코트 사용 |
| Windows | `%USERPROFILE%\Desktop\ClaudeGUI.lnk` | PowerShell 콘솔 창에서 실행 | `claudegui.ico` 마스코트 아이콘 적용 |

브라우저에서 `localhost:3000`을 직접 열 때도 같은 마스코트가 **favicon**으로 표시된다 (`src/app/icon.svg`).

아이콘 자산을 재생성하려면 (macOS, SVG 수정 시):

```bash
node scripts/build-icons.mjs
```

### 네이티브 앱 (`.dmg` / `.msi`)

v0.3부터 Tauri v2 기반 네이티브 인스톨러를 빌드할 수 있다 (`installer/tauri/` 참조). CI 릴리스 워크플로(`.github/workflows/release.yml`)가 태그 푸시 시 macOS(arm64/x86_64) `.dmg`와 Windows x86_64 `.msi`를 생성한다.

### 소스에서 실행

```bash
git clone https://github.com/neuralfoundry-coder/CLAUDE-GUI.git
cd CLAUDE-GUI
npm install
cp .env.example .env.local   # 선택 사항 — 프로젝트 루트 지정
node server.js
```

브라우저에서 `http://localhost:3000`에 접속한다. **Claude CLI 인증**은 내장 터미널에서 `claude login`을 실행하면 그대로 `~/.claude/.credentials.json`에 저장된다 — 별도의 `ANTHROPIC_API_KEY` 설정은 필요 없다.

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
| `Cmd/Ctrl + K` | 커맨드 팔레트 (터미널 포커스 시에는 터미널 버퍼 clear) |
| `Cmd/Ctrl + P` | 빠른 파일 열기 |
| `Cmd/Ctrl + B` | 사이드바 토글 |
| `Cmd/Ctrl + J` | 터미널 토글 |
| `Cmd/Ctrl + S` | 파일 저장 |

### 터미널 단축키 (터미널 포커스 시)

| 단축키 | 동작 |
|--------|------|
| `Cmd/Ctrl + T` | 새 터미널 탭 |
| `Cmd/Ctrl + W` | 활성 탭 닫기 |
| `Cmd/Ctrl + 1..9` | N번 탭 활성화 |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | 다음 / 이전 탭 |
| `Cmd/Ctrl + F` | 터미널 버퍼 검색 오버레이 |
| `Cmd/Ctrl + K` | 활성 터미널 clear |
| `Cmd/Ctrl + Shift + R` | 활성 세션 Restart |
| `Cmd/Ctrl + D` | 2-pane 수평 스플릿 토글 |
| `Cmd/Ctrl + [` · `]` | 스플릿 모드에서 활성 pane 전환 |
| `Cmd/Ctrl + Shift + Enter` (에디터 포커스 시) | 에디터 선택 / 현재 라인을 활성 터미널에 실행 |

## 터미널

ClaudeGUI의 내장 터미널은 실제 터미널 앱과 동일한 **로그인 + 인터랙티브** 쉘(`['-l','-i']`)을 구동해, `.zshrc`·`.zprofile`·`.bashrc` 등 사용자 dotfile이 자동으로 소스된다. 따라서 `claude`, `nvm`, `pyenv`, `brew` 같은 PATH 기반 도구와 사용자 프롬프트·alias·자동완성이 새 탭에서 바로 동작한다.

- **쉘 오버라이드**: `CLAUDEGUI_SHELL=/opt/homebrew/bin/fish` 등 환경변수로 기본 쉘을 덮어쓸 수 있다.
- **PATH 추가**: `CLAUDEGUI_EXTRA_PATH=/custom/bin`을 지정하면 해당 디렉토리가 PATH 앞에 prepend된다.
- **탭 rename**: 탭 라벨을 더블클릭하면 인라인 편집으로 전환된다. Enter 저장, Esc 취소.
- **cwd 라벨**: 쉘에서 `cd`할 때마다 탭 라벨의 `·` 뒤에 현재 디렉토리 basename이 실시간 표시된다(OSC 7 기반).
- **세션 지속성**: 서버측 세션 레지스트리가 PTY를 프로세스 메모리에 유지한다. 브라우저 새로고침·HMR 사이클·네트워크 끊김 등으로 WS가 닫혀도 **30분 동안 같은 sessionId로 재연결하면 쉘 상태와 최근 256 KB 스크롤백이 복원**된다. 탭 close 버튼을 누르거나 `exit`이 실행되면 즉시 파괴된다.
- **Restart**: 쉘이 종료되거나 연결이 끊기면 탭에 Restart 버튼이 표시된다. 누르면 세션 레지스트리를 통해 재연결하여 기존 PTY를 복원한다(grace 기간 내) 또는 새 쉘을 spawn한다(GC 이후).
- **스플릿 터미널**: `Cmd/Ctrl+D`로 본문을 2개의 수평 pane으로 나눌 수 있다. 각 pane은 자체 활성 세션을 가지며, 모든 키보드 단축키는 활성 pane을 대상으로 동작한다. pane 전환은 `Cmd/Ctrl+[`/`]` 또는 클릭.
- **검색**: `Cmd/Ctrl+F`로 플로팅 오버레이가 열리며, 대소문자·단어 단위·정규식 토글을 지원한다.
- **파일 경로 링크**: 터미널 출력에 포함된 `src/foo.ts:42:10` 같은 경로는 자동으로 클릭 가능한 링크가 되며, 클릭 시 에디터에서 해당 라인/컬럼으로 이동한다.
- **에디터 → 터미널**: 에디터에서 텍스트를 선택하고 `Cmd/Ctrl+Shift+Enter`를 누르면 선택 영역(또는 현재 라인)이 활성 터미널에 그대로 실행된다. 포커스는 에디터에 유지된다.
- **백그라운드 탭 인디케이터**: 비활성 탭이 출력을 받으면 라벨 옆에 파란 점 인디케이터가 표시된다.
- **우클릭 메뉴**: Copy / Paste / Select All / Clear / Find… 기본 메뉴를 제공한다. 대용량 붙여넣기(10 MB 초과)는 확인 프롬프트 후 4 KB 청크로 분할 전송된다.
- **테마/폰트**: 터미널 색상은 앱 테마(`dark`/`light`/`high-contrast`/`retro-green`/`system`)를 따라 자동 전환된다. `system` 테마는 OS 다크/라이트 모드를 실시간 추종한다. 폰트 패밀리·ligature·copy-on-select는 Command Palette의 "Terminal: …" 커맨드로 변경할 수 있다.
- **파일 탐색기 통합**: 파일/폴더 우클릭 → **Open terminal here**로 해당 위치에서 새 터미널을 열 수 있다. **Reveal in Finder / File Explorer**는 네이티브 파일 관리자에서 해당 항목을 선택 상태로 연다.

**PATH 트러블슈팅**: 새 탭에서 `which claude`, `which node`가 실패하면 사용자 dotfile이 해당 경로를 PATH에 추가하고 있는지 먼저 확인한다. `echo $SHELL` 출력으로 실제 spawn된 쉘을 확인할 수 있다.

## 프로젝트 구조

```
ClaudeGUI/
├── CLAUDE.md                 # Claude Code 컨벤션 및 변경 워크플로
├── CLAUDE-EN.md              # CLAUDE.md 영문 미러
├── README.md                 # 본 문서
├── README-EN.md              # README.md 영문 미러
├── server.js                 # 커스텀 Node.js 서버 (WS + Next.js)
├── docs/
│   ├── research/             # 초기 기획 문서
│   ├── srs/                  # 소프트웨어 요구사항 명세 (FR/NFR/UC)
│   ├── architecture/         # 아키텍처 설계 (ADR, 컴포넌트, 데이터흐름, API, 보안)
│   └── en/                   # 영문 미러
│       ├── srs/
│       └── architecture/
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
│   │   └── terminal/         # 터미널 매니저·소켓·테마 (서버)
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
npm run run:local    # scripts/dev.sh — 로컬 즉시 실행 (아래 참조)
npm run run:clean    # --clean --build (완전 재빌드 후 실행)
npm run run:debug    # --verbose --trace (모든 모듈 + 스택 트레이스)
```

### 로컬 구동 스크립트 — `scripts/dev.sh` (v0.3)

클린/인스톨/타입체크/린트/테스트/빌드를 선택적으로 수행한 뒤 `node server.js`를 **기본 포그라운드**로 실행한다. `--background`로 detached 실행도 가능하며, `--stop`/`--restart`/`--status`/`--tail` 라이프사이클 커맨드로 관리한다. 모든 출력은 **모듈별 디버그 필터**로 색상 분리된다.

```bash
# 포그라운드 (기본)
./scripts/dev.sh                                    # 빠른 dev 부팅
./scripts/dev.sh --clean --build                    # 완전 재빌드
./scripts/dev.sh --prod --port 8080                 # prod 모드
./scripts/dev.sh --debug files,claude,project       # 특정 모듈만 출력
./scripts/dev.sh --verbose --trace                  # 전 모듈 + 스택 트레이스
./scripts/dev.sh --log-file /tmp/gui.log            # 터미널 + 파일 tee

# 백그라운드 (detached)
./scripts/dev.sh --background --verbose             # 분리 실행 + 자동 로그 파일
./scripts/dev.sh --background --tail                # 분리 후 바로 tail
./scripts/dev.sh --background --log-file /tmp/gui.log --log-truncate

# 라이프사이클
./scripts/dev.sh --status                           # 실행 중인 인스턴스 상태
./scripts/dev.sh --tail                             # 로그만 팔로우 (서버 유지)
./scripts/dev.sh --stop                             # 정상 종료 (SIGTERM → 5s → SIGKILL)
./scripts/dev.sh --stop --force-kill                # 즉시 SIGKILL
./scripts/dev.sh --restart --debug '*'              # stop + 백그라운드 재시작
./scripts/dev.sh --help                             # 전체 옵션 목록
```

**사용 가능한 디버그 모듈** (`--debug <list>`, `*`로 전체 활성화):
| 모듈 | 출력 |
|------|------|
| `server` | server.js 부팅/셧다운 |
| `project` | `ProjectContext` 루트 변경 + 영속화 |
| `files` | `/ws/files` 워처 생성/재시작/브로드캐스트 |
| `terminal` | node-pty 스폰/종료 |
| `claude` | `/ws/claude` 쿼리/권한/이벤트 |

**옵션 카테고리**:
- 준비: `--clean` `--install` `--check` `--lint` `--test` `--build` `--all-checks`
- 실행 모드: `--dev` (기본) / `--prod`
- 서버: `--host <addr>` `--port <n>` `--project <path>` `--kill-port`
- 디버그: `--debug <list>` `--verbose` `--trace` `--log-level <lvl>` `--inspect` `--inspect-brk` `--log-file <path>` `--log-truncate` `--no-color`
- 백그라운드/라이프사이클: `--background` `--stop` `--restart` `--status` `--tail` `--pid-file <path>` `--force-kill`
- 편의: `--open` `--help`

**상태 경로** (`CLAUDEGUI_STATE_DIR` / `CLAUDEGUI_PID_FILE` / `CLAUDEGUI_LOG_DIR`로 덮어쓰기 가능):
- PID 파일: `~/.claudegui/claudegui.pid`
- 기본 로그 파일: `~/.claudegui/logs/claudegui.log` (백그라운드 모드 기본, append)

Windows에서는 `scripts/dev.ps1`이 동일 기능을 제공한다 (`.\scripts\dev.ps1 -Help`).

구현: `scripts/dev.sh`, `scripts/dev.ps1`, `src/lib/debug.mjs` (모듈 필터 + 색상 매핑 + 선택적 스택 트레이스).

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
| PDF 뷰어 worker 404 | 브라우저 콘솔 확인, `pdf-preview.tsx`의 `workerSrc` 버전 일치 여부 |
| 경로 샌드박스 403 | `PROJECT_ROOT` 환경변수 재확인 |
| `claude` 명령어 없음 | `npm install -g @anthropic-ai/claude-code` |
| Git 상태 표시 안됨 | 프로젝트 루트가 Git 저장소인지 확인 (`git init` 필요) |
| Agent SDK 이벤트 무시됨 | `server-handlers/claude-handler.mjs`의 이벤트 타입 매핑 실제 SDK 버전과 비교 |

## v0.5 신규 기능

- **패널 사용성 강화** — 5개 패널(파일 탐색기, 에디터, 터미널, Claude 채팅, 프리뷰) 모두 접기/펼치기 지원. `react-resizable-panels` imperative API로 전환. 리사이즈 핸들 더블클릭 시 기본 크기 복원. (FR-103, FR-106)
- **반응형 모바일 레이아웃** — 1280px 미만 해상도에서 하단 탭 바 기반 단일 패널 모드 자동 전환. (NFR-403, FR-107)
- **System 테마 (자동)** — 새 `system` 테마 옵션 추가. OS의 `prefers-color-scheme` 미디어 쿼리를 실시간 감지하여 다크/라이트 자동 전환. (NFR-302)
- **테마 독립성 강화** — 모든 테마에 `color-scheme` CSS 속성 설정으로 스크롤바·폼 컨트롤 등 네이티브 UI가 OS 모드와 무관하게 앱 테마를 따름. FOUC 방지 인라인 스크립트 추가.
- **새 키보드 단축키** — `⌃⌘E` (에디터 토글), `⌃⌘K` (Claude 채팅 토글), `⌃⌘P` (프리뷰 토글)

## v0.3 신규 기능

- **런타임 프로젝트 핫스왑** — 헤더의 프로젝트 버튼을 클릭해 다른 디렉토리로 전환. 파일 탐색기/터미널/Claude 쿼리의 `cwd`가 모두 자동 갱신되고, 최근 프로젝트 목록은 `~/.claudegui/state.json`에 저장된다. (FR-908, ADR-016)
- **Claude CLI 인증 배지** — 헤더에 실시간 인증 상태 표시 (`🟢 Claude` 인증됨 / `🟡 Sign in` 미인증 / `⚫ CLI missing` 미설치). 클릭 시 `claude login` 안내 모달. (FR-510)
- **HTML 스트리밍 라이브 프리뷰** — Claude가 응답 중 ` ```html ` 블록이나 `Write`/`Edit` 도구로 `.html` 파일을 만들면 Preview 패널이 즉시 부분 렌더링 → 완성 시 전체 렌더. 완성 전에는 소스 코드 뷰 폴백. 전체화면 모드 (Esc로 해제). (FR-610, FR-611, ADR-017)
- **Green Phosphor CRT 레트로 테마** — 커맨드 팔레트 "Theme: Retro — Green Phosphor" 선택 시 VT100 스타일 녹색 인광 + 스캔라인 (옵션). 기본은 현재 다크 테마 유지. (NFR-302)
- **원라인 설치 스크립트** — `curl | bash` / `iwr | iex` (위 설치 섹션 참조)
- **Tauri v2 네이티브 인스톨러** — `installer/tauri/` 스캐폴딩 + 릴리스 CI 워크플로. Node 사이드카 + 앱 로컬 Claude CLI prefix. (ADR-018)

## 알려진 한계 (v0.1)

- **권한 모드**: Agent SDK `permissionMode: 'default'`를 사용. 안전한 Bash 명령(`echo` 등)은 SDK가 자동 승인하므로 `canUseTool` 콜백이 호출되지 않는다. 의도된 동작이며, 파일 쓰기/편집/위험 명령에서만 GUI 모달이 표시된다. 모든 도구 사용 내역은 채팅 패널에 tool 메시지로 기록된다.
- **node-pty**: Node 22 LTS 및 macOS Apple Silicon에서 `node-pty@1.2.0-beta.12` 기준으로 동작 확인. 이전 `1.1.0` 릴리스는 Node 24에서 `posix_spawnp failed`를 일으키므로 빌드 시 최소 1.2.0-beta 필요.
- **세션 재개/포크**: `~/.claude/projects/` JSONL 파일을 읽기 전용으로 파싱하며, 포크 후 첫 쿼리 시 Agent SDK의 세션 생성 동작에 의존한다.
- **AI diff 뷰**: Monaco `DiffEditor`에 LCS 기반 hunk 분해가 결합되어, 개별 hunk 체크박스 선택 → "Apply N hunks"로 부분 수락이 가능하다. "Reject all"은 원본을 복원하고, "Select all"은 모든 hunk를 자동 체크한다.
- **세션 관리**: 세션 목록에서 Resume은 `~/.claude/projects/*.jsonl`의 메시지 히스토리를 파싱해 UI에 복원하고, 이후 쿼리 시 Agent SDK의 `resume` 옵션으로 대화를 이어간다. Fork는 새 SDK 세션을 시작하되 UI에 원본 세션 id를 참조로 표시한다.
- **권한 규칙 UI**: 커맨드 팔레트의 "Edit Permission Rules"로 `.claude/settings.json`의 `permissions.allow`/`deny` 규칙을 CRUD할 수 있다. 예: `Bash(npm test:*)`, `Edit`, `Read(~/**)`.
- **스트리밍 델타**: Agent SDK가 현재 버전에서 전체 어시스턴트 메시지를 한 번에 emit하므로 토큰 단위 타이핑 효과는 없다. 향후 `stream-json` 델타 이벤트 지원 시 추가.
- **Next.js dev HMR WebSocket**: 커스텀 서버에서 `didWebSocketSetup` 우회를 사용한다. Next.js 메이저 업그레이드 시 내부 API 변경 여부 확인 필요.

## 라이선스

본 프로젝트는 **[PolyForm Noncommercial License 1.0.0](./LICENSE)** 하에 배포된다.

- **비상업적 사용 허용**: 개인, 연구, 교육, 자선, 정부, 비영리 단체 내부 용도로 자유롭게 사용·수정·재배포할 수 있다.
- **상업적 사용 금지**: 제품·서비스의 판매, SaaS 호스팅, 유료 컨설팅, 광고 수익 등 **상업적 이득**을 목적으로 하는 사용은 금지된다.
- **고지 유지 의무**: 소프트웨어의 일부를 배포할 때 본 라이선스 고지와 저작권 표시를 함께 포함해야 한다.
- **상표 미포함**: 본 라이선스는 저작권만 다루며, 저작권자의 상표·특허·명예훼손·퍼블리시티권 등을 허락하지 않는다.
- **무보증**: 소프트웨어는 "있는 그대로(AS IS)" 제공되며, 저작권자는 사용으로 인한 어떠한 손해에도 책임지지 않는다.

전문은 [LICENSE](./LICENSE) 파일 또는 <https://polyformproject.org/licenses/noncommercial/1.0.0/>을 참고한다. 상업적 사용이 필요한 경우 별도의 라이선스 계약을 위해 저작권자에게 문의하기 바란다.

> **고지**: ClaudeGUI는 Anthropic 또는 Claude Code와 무관한 커뮤니티 프로젝트다. Claude CLI 및 Claude 모델의 사용에는 Anthropic의 자체 이용약관이 별도로 적용된다.

## 기여

이슈 및 PR을 환영합니다. 기여 전에 [CLAUDE.md](./CLAUDE.md)의 개발 워크플로를 반드시 읽어 주세요.
