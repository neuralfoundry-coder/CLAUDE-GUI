# 3. 기능 요구사항

## 3.1 패널 레이아웃 시스템 (FR-100)

### FR-101: 4분할 패널 구성

- 시스템은 4개의 주요 패널로 구성된 IDE 레이아웃을 제공해야 한다.
  - **좌측**: 파일 탐색기 (수직)
  - **중앙 상단**: 코드 에디터
  - **중앙 하단**: 터미널
  - **우측**: 프리뷰 패널 (수직)
- `react-resizable-panels` v4를 사용하여 구현한다.

### FR-102: 패널 리사이즈

- 사용자는 패널 경계의 드래그 핸들을 이용하여 패널 크기를 조절할 수 있어야 한다.
- 최소 크기 제한을 두어 패널이 완전히 사라지지 않도록 한다.

### FR-103: 패널 접기/펼치기

- 각 패널은 접기(collapse)/펼치기(expand)가 가능해야 한다.
- 접힌 상태에서는 아이콘만 표시하거나(`collapsedSize: 4px`) 완전히 숨김(`collapsedSize: 0`) 처리한다.

### FR-104: 레이아웃 상태 영속화

- 패널 크기 및 접힘 상태는 `localStorage`에 자동 저장되어야 한다.
- `react-resizable-panels`의 `autoSaveId` 속성을 활용한다.
- 브라우저 새로고침 시 마지막 레이아웃 상태가 복원되어야 한다.

### FR-105: 중첩 패널 그룹

- 중앙 영역은 에디터(상단)와 터미널(하단)로 수직 분할되어야 한다.
- 중첩된 `PanelGroup` 구조를 지원한다.

---

## 3.2 파일 탐색기 (FR-200)

### FR-201: 디렉토리 트리 렌더링

- 프로젝트 디렉토리를 재귀적 트리 구조로 표시해야 한다.
- `react-arborist` v3.4 기반으로 가상화 렌더링을 수행한다.
- 수천 개 파일이 있어도 60 FPS 스크롤을 유지해야 한다.

### FR-202: 파일/폴더 CRUD

- 파일 및 폴더의 생성, 이름 변경(F2), 삭제를 지원해야 한다.
- 삭제 시 확인 대화상자를 표시한다.

### FR-203: 드래그 앤 드롭

- 파일/폴더를 드래그하여 다른 디렉토리로 이동할 수 있어야 한다.

### FR-204: Git 상태 표시

- 파일명 옆에 Git 상태를 시각적으로 표시해야 한다.
  - Modified (M) — 노란색
  - Added (A) — 녹색
  - Deleted (D) — 빨간색
  - Untracked (U) — 연녹색
  - Renamed (R) — 파란색
  - Conflicted (!) — 짙은 빨간색
- 구현: `GET /api/git/status`는 `git status --porcelain` 출력을 파싱하여 경로→상태 맵을 반환한다.
- 프로젝트가 Git 저장소가 아니면 `isRepo: false`로 응답하고 인디케이터를 표시하지 않는다.

### FR-205: 파일 아이콘 매핑

- 파일 확장자에 따라 적절한 아이콘을 표시해야 한다.
- 지원 확장자: `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md`, `.html`, `.css`, `.py`, `.go`, `.rs` 등

### FR-206: 컨텍스트 메뉴

- 파일/폴더 우클릭 시 컨텍스트 메뉴를 표시해야 한다.
- 메뉴 항목: 새 파일, 새 폴더, 이름 변경, 삭제, 복사 경로, 터미널에서 열기

### FR-207: 가상화 렌더링

- 화면에 보이는 노드만 DOM에 렌더링하여 대규모 프로젝트를 지원해야 한다.
- `react-arborist`의 내장 가상화 기능을 활용한다.

---

## 3.3 코드 에디터 (FR-300)

### FR-301: Monaco Editor 통합

- `@monaco-editor/react` 패키지를 통해 Monaco Editor를 통합해야 한다.
- CDN 로더 방식으로 번들 크기를 최적화한다.

### FR-302: 멀티탭 지원

- 여러 파일을 동시에 탭으로 열 수 있어야 한다.
- 각 탭은 독립적인 Monaco 모델을 유지한다.
- 탭 닫기, 탭 순서 변경(드래그)을 지원한다.

### FR-303: 구문 강조

- Monaco의 내장 구문 강조를 활용하여 100개 이상의 언어를 지원해야 한다.
- 파일 확장자에 따라 언어 모드를 자동 감지한다.

### FR-304: 상태 보존

- 탭 간 전환 시 다음 상태를 보존해야 한다:
  - 커서 위치
  - 스크롤 위치
  - Undo/Redo 히스토리
  - 선택 영역

### FR-305: AI 변경사항 수락/거절 UI

- Claude가 파일을 수정하면 diff 뷰로 변경사항을 표시해야 한다.
- 사용자는 변경사항을 **수락(Accept)** 또는 **거절(Reject)** 할 수 있다.
- 부분 수락(특정 hunk만)을 지원한다.

### FR-306: 에디터 잠금 모드

- Claude가 파일을 편집 중일 때 해당 파일 탭을 읽기 전용으로 전환할 수 있어야 한다.
- 잠금 상태는 시각적으로 구분한다 (아이콘 또는 배지).

### FR-307: 파일 저장

- `Cmd+S` (macOS) / `Ctrl+S` (Windows/Linux) 단축키로 현재 파일을 저장해야 한다.
- REST API `/api/files/write`를 통해 서버 측 파일시스템에 기록한다.
- 저장되지 않은 변경이 있는 탭은 점(dot) 표시로 구분한다.

### FR-308: 외부 변경 실시간 반영

- chokidar가 감지한 외부 파일 변경을 에디터에 실시간 반영해야 한다.
- WebSocket `/ws/files` 채널로 변경 이벤트를 수신한다.
- 사용자 커서 위치를 보존하면서 콘텐츠를 업데이트한다.
- 에디터에 미저장 변경이 있을 경우 충돌 알림을 표시한다.

---

## 3.4 터미널 (FR-400)

### FR-401: 터미널 에뮬레이션

- `@xterm/xterm` v5 기반의 완전한 터미널 에뮬레이션을 제공해야 한다.
- WebSocket `/ws/terminal`을 통해 서버의 `node-pty` 세션과 연결한다.

### FR-402: ANSI 이스케이프 코드 렌더링

- 256색 ANSI 컬러, 볼드, 이탤릭, 밑줄, 깜빡임 등 스타일을 렌더링해야 한다.
- 커서 이동 및 화면 지우기 이스케이프 시퀀스를 처리해야 한다.

### FR-403: GPU 가속 렌더링

- xterm.js WebGL 애드온을 활용하여 GPU 가속 렌더링을 적용해야 한다.
- 대량의 터미널 출력(로그 스트리밍 등)에서도 부드러운 렌더링을 유지한다.

### FR-404: 리사이즈 동기화

- 터미널 패널 크기가 변경되면 PTY의 `cols`/`rows`를 동기화해야 한다.
- xterm.js `fit` 애드온을 사용하여 자동 리사이즈를 수행한다.
- 리사이즈 이벤트는 WebSocket을 통해 `{ type: "resize", cols, rows }` 형태로 서버에 전송한다.

### FR-405: 버퍼 검색

- `Ctrl+F`로 터미널 버퍼 내 텍스트 검색을 지원해야 한다.
- xterm.js `search` 애드온을 활용한다.

### FR-406: 클릭 가능한 URL

- 터미널 출력에서 URL을 자동 감지하여 클릭 가능한 링크로 표시해야 한다.
- xterm.js `web-links` 애드온을 활용한다.

### FR-407: 배압(Backpressure) 제어

- 터미널 출력이 과도할 때 워터마크 기반 배압 제어를 적용해야 한다.
  - High watermark: 100KB — 데이터 수신 일시 중지
  - Low watermark: 10KB — 데이터 수신 재개
- 50MB 버퍼 한도를 초과하지 않도록 관리한다.

### FR-408: 다중 터미널 세션

- 여러 개의 터미널 세션을 동시에 생성하고 전환할 수 있어야 한다.
- 각 세션은 독립적인 PTY 프로세스와 연결된다.

---

## 3.5 Claude CLI 통합 (FR-500)

### FR-501: Agent SDK 통합

- `@anthropic-ai/claude-agent-sdk`를 통해 Claude Code 프로세스를 관리해야 한다.
- `child_process.spawn()` 직접 사용 대신 SDK를 사용하여 안정성을 확보한다.
- `startup()` 메서드를 통한 사전 워밍업(~20x 빠른 첫 쿼리)을 지원한다.

### FR-502: 스트리밍 응답 표시

- Agent SDK의 `query()` async iterator로부터 `SDKMessage` 이벤트를 실시간 수신해야 한다.
- 메시지 타입별 처리:
  - `system` (subtype `init`): 세션 id, 모델, 사용 가능 도구 목록 저장
  - `assistant`: `message.content[]` 블록 배열 순회 — `text` 블록은 어시스턴트 메시지로, `tool_use` 블록은 tool 메시지로 표시
  - `user`: 도구 실행 결과 피드백 — UI에는 표시하지 않음
  - `result`: 최종 결과 (`total_cost_usd`, `usage.input_tokens`/`output_tokens`, `session_id`, `subtype`)

### FR-503: 세션 관리

- **새 세션 생성**: 프로젝트 디렉토리 기준 새 대화 시작
- **세션 재개**: 기존 세션 ID로 대화 이어가기
- **세션 포크**: 기존 세션에서 분기하여 새 대화 시작
- **세션 명명**: 사용자가 세션에 이름을 부여
- 세션 목록은 `~/.claude/projects/` 기반으로 조회

### FR-504: 비용 및 토큰 사용량 표시

- 각 쿼리의 토큰 사용량(입력/출력)을 표시해야 한다.
- 세션 누적 비용을 표시해야 한다.
- `result` 메시지의 `cost_usd`, `usage` 필드를 활용한다.
- **세션 정보 바 (Session Info Bar)**: Claude 채팅 패널 하단에 현재 활성 세션에 대한
  통계를 접이식 바 형태로 표시한다.
  - 접힘(기본) 상태: 모델명, 턴 수, 총 토큰 수, 누적 비용, 마지막 업데이트 시각을
    단일 라인(높이 24px)으로 노출한다. 편집 영역을 침범하지 않기 위해 기본값은 접힘이다.
  - 펼침 상태: 세션 ID, 모델, `num_turns`, `duration_ms`, 입력/출력/캐시 읽기 토큰,
    누적 비용(`total_cost_usd`), 마지막 업데이트 경과 시간을 표 형태로 표시한다.
  - 값의 출처는 Agent SDK가 실제로 전달한 이벤트 필드(`system.init`의 `model`,
    `result`의 `num_turns`/`duration_ms`/`usage.*`/`total_cost_usd`)로 한정한다.
    컨텍스트 윈도우 크기 등 SDK가 제공하지 않는 값은 하드코딩 추정치를 사용하지
    않으며, 데이터가 도착하기 전에는 모든 필드를 "-"로 표시한다.
  - 값은 세션 ID별로 `sessionStats: Record<string, SessionStats>`에 누적되며,
    세션 전환 시 활성 세션의 스냅샷만 표시된다. WebSocket 푸시를 통해 갱신되므로
    별도의 폴링은 수행하지 않는다.
  - 펼침/접힘 상태는 `localStorage`에 저장되어 재방문 시 복원된다.

### FR-505: 권한 요청 인터셉트

- Agent SDK의 `canUseTool` 콜백 옵션을 사용해 Claude가 도구 실행을 요청할 때 GUI 모달을 표시해야 한다.
- 모달에는 다음 정보를 포함한다:
  - 요청된 도구 이름
  - 인자 (파일 경로, 명령어 등)
  - 위험도 배지 (`safe` / `warning` / `danger`)
  - **승인(Approve)** / **거부(Deny)** 버튼
- 거절 시 SDK에 `{ behavior: 'deny', message }`를 반환하면 Claude는 해당 도구 사용을 포기하고 대안을 모색한다.
- 물리적 사용자 클릭을 요구한다 (자동 승인 방지).
- `permissionMode: 'default'`에서 Agent SDK는 안전한 작업(읽기, 단순 Bash 명령)을 자동 승인할 수 있다. 이 경우 `canUseTool`은 호출되지 않으며, 도구 사용은 채팅 패널의 tool 메시지로만 기록된다.

### FR-506: 자동 승인 규칙

- `.claude/settings.json`의 화이트리스트와 연동하여 자동 승인을 지원해야 한다.
- 자동 승인된 도구 호출에는 "Auto-approved" 배지를 표시한다.
- GUI에서 자동 승인 규칙을 편집할 수 있는 설정 화면을 제공한다.

### FR-507: 도구 사용 현황 시각화

- Claude의 현재 작업 상태를 실시간 표시해야 한다:
  - 현재 읽고 있는 파일
  - 실행 중인 검색 쿼리
  - 호출 중인 도구명
- 파일 탐색기에서 Claude가 접근 중인 파일을 하이라이트한다.

### FR-508: 실행 제한 설정

- `max-turns`: 최대 대화 턴 수 설정
- `max-budget`: 세션당 최대 비용(USD) 설정
- 한도 도달 시 사용자에게 알림 후 확인을 요청한다.

### FR-509: 컨텍스트 컴팩션

- `/compact` 명령어를 통한 컨텍스트 압축을 지원해야 한다.
- 컨텍스트 사용량 표시 및 임계치 도달 시 자동 알림을 제공한다.

### FR-510: 인증 상태 표시 (v0.3)

- 시스템은 Claude CLI 인증 상태를 헤더 배지로 실시간 표시해야 한다.
- 인증 소스는 `credentials-file` (`~/.claude/.credentials.json`), `env` (`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`), `none` 중 하나이다.
- CLI 미설치 상태도 구분하여 표시 (`cliInstalled: false`) 한다.
- 미인증 시 배지 클릭으로 `claude login` 안내 모달을 표시한다.
- 구현: `src/lib/claude/auth-status.ts`, `GET /api/auth/status`, `src/components/layout/auth-badge.tsx`.

### FR-520: 네이티브 앱 실행 모드 (v0.3)

- Tauri v2 기반 네이티브 앱(`.dmg` / `.msi`)으로 ClaudeGUI를 실행할 수 있어야 한다.
- 앱은 번들된 Node.js 사이드카로 `server.js`를 실행하고, 네이티브 웹뷰가 `127.0.0.1:<random-port>`에 연결한다.
- 첫 실행 시 Claude CLI가 PATH에 없으면 앱 로컬 `node-prefix`에 자동 설치 후 PTY `PATH`에 prepend한다.
- 구현: `installer/tauri/`, `scripts/installer-runtime/ensure-claude-cli.mjs`.

---

## 3.6 프리뷰 패널 (FR-600)

### FR-601: 파일 타입 자동 감지

- 파일 확장자를 기반으로 적절한 렌더러를 자동 선택해야 한다.
  - `.html` → HTML 프리뷰
  - `.pdf` → PDF 프리뷰
  - `.md` → Markdown 프리뷰
  - `.png`, `.jpg`, `.gif`, `.svg`, `.webp` → 이미지 프리뷰
  - `.reveal.html`, 프레젠테이션 모드 → reveal.js 프리뷰

### FR-602: HTML 프리뷰

- `iframe`의 `srcdoc` 속성을 통해 HTML을 렌더링해야 한다.
- `sandbox="allow-scripts"` 적용 (`allow-same-origin` 금지).
- CSS만 변경된 경우 `postMessage`를 통해 스타일만 업데이트 (iframe 리로드 방지).

### FR-603: PDF 프리뷰

- `react-pdf` (pdf.js 5.x 기반)를 사용하여 PDF를 렌더링해야 한다.
- 페이지별 네비게이션 (이전/다음, 페이지 번호 직접 입력)을 지원한다.
- 좌측에 `<Thumbnail>` 사이드바를 표시할 수 있다.
- PDF.js Web Worker를 활용하여 메인 스레드 블로킹을 방지한다.

### FR-604: Markdown 프리뷰

- `react-markdown` + `remark-gfm` + `rehype-highlight`를 사용하여 렌더링해야 한다.
- 지원 기능: GFM 테이블, 체크리스트, 코드 블록 구문 강조, LaTeX 수식
- `---` (수평 구분선)을 페이지 구분자로 인식할 수 있다.
- `dangerouslySetInnerHTML` 사용을 금지하고 sanitize 옵션을 적용한다.

### FR-605: 이미지 프리뷰

- 주요 이미지 포맷을 렌더링해야 한다: PNG, JPEG, GIF, SVG, WebP
- `react-zoom-pan-pinch`를 활용한 줌/팬 기능을 제공한다.
- 대용량 이미지는 스트리밍으로 점진적 로딩한다.

### FR-606: 디바운스 기반 실시간 갱신

- 에디터 변경 시 프리뷰를 즉시 갱신하지 않고 300ms 디바운스를 적용해야 한다.
- 변경된 섹션만 업데이트 (전체 리렌더링 방지).

### FR-607: 페이지 네비게이션 UI

- 다중 페이지 콘텐츠(PDF, 프레젠테이션)에 대해 페이지 네비게이션을 제공해야 한다.
- UI 요소: 이전/다음 버튼, 현재 페이지 / 전체 페이지 표시, 페이지 점프

### FR-610: HTML 스트리밍 라이브 프리뷰 (v0.3)

- Claude의 어시스턴트 응답에서 ` ```html ` 코드 펜스 또는 `Write`/`Edit` `tool_use`(`.html` 대상)를 감지하여 프리뷰 패널을 **파일 선택과 무관하게** 실시간 업데이트해야 한다.
- 부분 수신 시에도 렌더 가능한 단위(`<!doctype`, `<html`, `<body`, 또는 균형 잡힌 최상위 태그)가 감지되면 iframe `srcdoc`으로 렌더하고, 그렇지 않으면 소스 코드 뷰로 폴백해야 한다.
- iframe은 `sandbox="allow-scripts"`로 격리되어야 하며 `allow-same-origin`을 사용해서는 안 된다.
- 디바운스 150ms로 버퍼 업데이트를 처리한다.
- 쿼리 종료 이벤트(`result`) 시 finalize하여 최종 HTML을 고정한다.
- 구현: `src/lib/claude/html-stream-extractor.ts`, `src/stores/use-live-preview-store.ts`, `src/components/panels/preview/live-html-preview.tsx`.

### FR-611: 프리뷰 전체화면 모드 (v0.3)

- 프리뷰 패널은 전체화면 모드를 제공해야 한다 (`position: fixed; inset: 0; z-index: 9999`).
- `Esc` 키로 전체화면을 해제할 수 있어야 한다.
- 전체화면 상태는 `usePreviewStore.fullscreen` 필드로 관리한다.

---

## 3.7 프레젠테이션 기능 (FR-700)

### FR-701: reveal.js 슬라이드 렌더링

- reveal.js 5.x를 iframe 내에서 실행하여 슬라이드를 렌더링해야 한다.
- 데이터 모델: `[{ id, html, css, notes, transition, background }]` JSON 배열

### FR-702: 슬라이드 CRUD

- 슬라이드 추가, 삭제, 재배열을 지원해야 한다.
- 슬라이드 섬네일 리스트를 통한 네비게이션을 제공한다.

### FR-703: 대화형 슬라이드 편집

- 사용자가 자연어로 슬라이드 수정을 요청할 수 있어야 한다.
  - 예: "슬라이드 3의 제목을 더 크게 만들어줘"
  - 예: "2번 슬라이드에 아키텍처 다이어그램 추가"
- Claude가 현재 슬라이드 HTML을 수신하고 수정된 HTML을 반환한다.
- 수정 결과가 iframe에 즉시 반영된다.

### FR-704: 실시간 DOM 패치

- 슬라이드 수정 시 iframe을 리로드하지 않는다.
- 부모 페이지에서 `postMessage`로 `<section>` innerHTML을 패치한 후 `Reveal.sync()`를 호출한다.
- `Reveal.slide(h, v, f)`로 특정 슬라이드로 이동한다.

### FR-705: 테마 및 트랜지션

- reveal.js 내장 12개 테마를 선택할 수 있어야 한다.
- 슬라이드별 트랜지션 효과(slide, fade, convex 등)를 설정할 수 있다.
- Auto-Animate 기능을 지원한다.

### FR-706: 스피커 노트

- 슬라이드별 스피커 노트를 작성/편집할 수 있어야 한다.
- 프레젠테이션 모드에서 스피커 뷰를 제공한다.

### FR-707: PPTX 내보내기

- `PptxGenJS`를 사용하여 `.pptx` 파일로 내보내기를 지원해야 한다.

### FR-708: PDF 내보내기

- DeckTape(Puppeteer 기반) 또는 reveal.js `?print-pdf` 쿼리를 활용하여 PDF로 내보내기를 지원해야 한다.

### FR-709: 에디터-프리뷰 양방향 동기화

- 에디터에서 특정 슬라이드 코드를 선택하면 프리뷰에서 해당 슬라이드로 이동한다.
- 프리뷰에서 슬라이드를 클릭하면 에디터에서 해당 코드로 스크롤한다.
- `data-index` 메타데이터를 활용한다.

---

## 3.8 커맨드 팔레트 및 단축키 (FR-800)

### FR-801: 커맨드 팔레트

- `Cmd+K` (macOS) / `Ctrl+Shift+P`로 커맨드 팔레트를 열 수 있어야 한다.
- `cmdk` 라이브러리를 사용하여 구현한다.
- 퍼지 검색(fuzzy search)을 지원한다.

### FR-802: 빠른 파일 열기

- `Cmd+P` / `Ctrl+P`로 파일명 검색 및 열기를 지원해야 한다.

### FR-803: 사이드바 토글

- `Cmd+B` / `Ctrl+B`로 파일 탐색기 패널을 토글할 수 있어야 한다.

### FR-804: 터미널 토글

- `Cmd+J` / `Ctrl+J`로 터미널 패널을 토글할 수 있어야 한다.

### FR-805: 키보드 단축키 커스터마이징

- 사용자가 키보드 단축키를 재설정할 수 있는 설정 화면을 제공해야 한다.

---

## 3.9 파일 시스템 API (FR-900)

### FR-901: 디렉토리 목록 조회

- REST API `GET /api/files?path=<dir>`를 통해 디렉토리 내용을 조회해야 한다.
- 응답: 파일/폴더 목록 (이름, 타입, 크기, 수정일시)

### FR-902: 파일 읽기/쓰기

- `GET /api/files/read?path=<file>` — 파일 내용 조회
- `POST /api/files/write` — 파일 내용 저장
- 인코딩: UTF-8 기본, 바이너리 파일은 Base64

### FR-903: 파일/폴더 생성 및 삭제

- `POST /api/files/mkdir` — 디렉토리 생성
- `DELETE /api/files?path=<path>` — 파일 또는 빈 폴더 삭제

### FR-904: 파일 이름변경/이동

- `POST /api/files/rename` — `{ oldPath, newPath }` 형태로 이름변경 또는 이동

### FR-905: 파일 메타데이터 조회

- `GET /api/files/stat?path=<file>` — 파일 크기, 수정 시간, 타입(파일/디렉토리) 조회

### FR-905b: 바이너리 파일 스트리밍

- `GET /api/files/raw?path=<file>` — 이미지, PDF 등 바이너리 파일을 Content-Type과 함께 스트리밍
- 확장자 기반 MIME 자동 감지
- 50MB 초과 시 413 반환

### FR-906: 경로 순회 공격 방지

- 모든 경로 파라미터에 대해 `path.resolve()` 기반 바운드 체크를 수행해야 한다.
- 프로젝트 루트 디렉토리 외부 접근을 차단한다.
- dotfile (`.env`, `.git`, `.claude`) 접근을 기본 차단한다.
- 심볼릭 링크를 `fs.lstat()`로 검증한 후에만 따라간다.

### FR-907: 실시간 파일 변경 감지

- chokidar v5를 사용하여 프로젝트 디렉토리의 파일 변경을 감지해야 한다.
- 변경 이벤트를 WebSocket `/ws/files` 채널로 브로드캐스트한다.
- 이벤트 타입: `add`, `change`, `unlink`, `addDir`, `unlinkDir`
- `node_modules`, `.git` 등 불필요한 디렉토리는 무시한다.

### FR-908: 런타임 프로젝트 핫스왑 (v0.3)

- 시스템은 실행 중에 프로젝트 루트를 교체할 수 있어야 한다 (서버 재시작 없이).
- `GET /api/project`는 현재 루트 + 최근 목록을 반환한다.
- `POST /api/project` (`{ path }`)는 다음 검증을 통과한 경우 루트를 교체한다:
  - 절대 경로 (상대 경로는 `4400` 거부)
  - 존재하는 디렉토리 (`4404` / `4400`)
  - 읽기 권한 (`4403`)
  - 파일시스템 루트(`/`) 및 `$HOME` 전체 금지 (`4403`)
- 교체 시:
  - chokidar watcher를 기존 루트 `close()` 후 새 루트로 재시작
  - 모든 `/ws/files` 클라이언트에 `{ type: 'project-changed', root, timestamp }` 브로드캐스트
  - 새로 스폰되는 PTY 세션은 신규 루트를 `cwd`로 사용 (기존 세션은 유지)
  - Claude 쿼리도 신규 루트를 `cwd`로 사용
- 클라이언트는 `project-changed` 수신 시 에디터 탭, 프리뷰 선택을 리셋하고 파일 트리를 재로드한다.
- 상태는 `~/.claudegui/state.json`에 `{ lastRoot, recents }` 형식으로 영속화한다.
- 구현: `src/lib/project/project-context.mjs`, `src/app/api/project/route.ts`, `src/stores/use-project-store.ts`, `src/components/modals/project-picker-modal.tsx`.
