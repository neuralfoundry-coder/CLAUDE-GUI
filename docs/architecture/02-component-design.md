# 2. 컴포넌트 상세 설계

## 2.1 프론트엔드 컴포넌트 트리

```
<App>
  <RootLayout>
    <Header>
      <Logo />
      <SessionIndicator />
      <CommandPaletteTrigger />  (cmdk)
      <SettingsButton />
    </Header>

    <PanelGroup direction="horizontal">
      <Panel id="file-explorer" collapsible>
        <FileExplorerPanel>
          <FileExplorerHeader />
          <FileTree />                 (react-arborist)
        </FileExplorerPanel>
      </Panel>

      <PanelResizeHandle />

      <Panel id="center">
        <PanelGroup direction="vertical">
          <Panel id="editor">
            <EditorPanel>
              <EditorTabBar />
              <MonacoEditor />         (@monaco-editor/react)
              <DiffAcceptBar />        (when Claude edits)
            </EditorPanel>
          </Panel>

          <PanelResizeHandle />

          <Panel id="terminal" collapsible>
            <TerminalPanel>
              <TerminalTabBar />
              <XTerminal />            (xterm.js)
            </TerminalPanel>
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle />

      <Panel id="preview" collapsible>
        <PreviewPanel>
          <PreviewHeader />
          <PreviewRouter>              (by file type)
            <HTMLPreview />            (iframe srcdoc)
            <PDFPreview />             (react-pdf)
            <MarkdownPreview />        (react-markdown)
            <ImagePreview />           (react-zoom-pan-pinch)
            <SlidePreview />           (reveal.js)
          </PreviewRouter>
        </PreviewPanel>
      </Panel>
    </PanelGroup>

    <StatusBar />
    <CommandPalette />                 (cmdk modal)
    <PermissionRequestModal />         (when Claude requests permission)
  </RootLayout>
</App>
```

## 2.2 서버 컴포넌트 구조

```
server.js
├── createServer(http)
│   ├── Next.js Request Handler          ← HTTP 요청 처리
│   │   ├── SSR pages
│   │   └── /api/* (REST endpoints)
│   │       ├── /api/files/*
│   │       └── /api/sessions/*
│   │
│   └── WebSocket Upgrade Handler
│       ├── /_next/webpack-hmr          → Next.js HMR (dev only)
│       ├── /ws/terminal                → PTY Session Handler
│       ├── /ws/claude                  → Agent SDK Handler
│       └── /ws/files                   → Chokidar Broadcaster
│
└── lib/
    ├── fs/                             ← 샌드박싱된 파일 시스템
    │   ├── resolve-safe.ts
    │   ├── file-operations.ts
    │   └── watcher.ts                  (chokidar)
    ├── claude/                         ← Agent SDK 래퍼
    │   ├── session-manager.ts
    │   ├── query-handler.ts
    │   └── permission-interceptor.ts
    └── pty/                            ← PTY 관리
        ├── session-manager.ts
        └── pty-bridge.ts
```

## 2.3 FileExplorer 컴포넌트

### 파일 구조

```
src/components/panels/file-explorer/
├── file-explorer-panel.tsx         # 컨테이너
├── file-explorer-header.tsx        # 제목, 새 파일 버튼
├── file-tree.tsx                   # react-arborist 래퍼
├── file-tree-node.tsx              # 개별 노드 렌더러
├── file-icon.tsx                   # 확장자별 아이콘
├── git-status-indicator.tsx        # Git 상태 배지
├── context-menu.tsx                # 우클릭 메뉴
└── use-file-tree.ts                # 데이터 로딩 훅
```

### 주요 동작

1. **데이터 로딩**: `useFileTree` 훅이 `/api/files?path=<root>`를 호출하여 트리 노드 생성
2. **가상화**: `react-arborist`의 내장 가상 스크롤
3. **Git 상태**: `/api/git/status` 호출로 파일별 상태 맵 생성 → 오버레이
4. **실시간 갱신**: `/ws/files` WebSocket 이벤트로 트리 노드 업데이트
5. **컨텍스트 메뉴**: Radix UI `@radix-ui/react-context-menu` 사용

## 2.4 EditorPanel 컴포넌트

### 파일 구조

```
src/components/panels/editor/
├── editor-panel.tsx                # 컨테이너
├── editor-tab-bar.tsx              # 탭 목록
├── editor-tab.tsx                  # 개별 탭 (닫기 버튼, 더티 표시)
├── monaco-editor-wrapper.tsx       # Monaco 래퍼
├── diff-accept-bar.tsx             # AI diff 수락/거절 UI
└── use-editor-models.ts            # Monaco 모델 관리
```

### 상태 관리

```typescript
// useEditorStore (Zustand)
interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile(path: string): void;
  closeTab(id: string): void;
  setActiveTab(id: string): void;
  markDirty(id: string, dirty: boolean): void;
  applyClaudeEdit(path: string, edit: EditOperation): void;
}

interface EditorTab {
  id: string;
  path: string;
  modelId: string;     // Monaco model reference
  dirty: boolean;
  locked: boolean;     // Claude 편집 중
  diff?: DiffState;    // AI 변경사항 대기 중
}
```

### 모델 관리

- 파일별로 독립 Monaco 모델 생성 (`monaco.editor.createModel`)
- 탭 닫을 때 모델 `dispose()` 호출 (메모리 누수 방지)
- 탭 간 전환 시 에디터 인스턴스에 모델만 교체 → 커서/스크롤/undo 자동 유지

### AI diff 처리

```typescript
// Claude가 파일 편집 시
function applyClaudeEdit(path: string, newContent: string) {
  const tab = findTab(path);
  tab.diff = {
    original: tab.modelId.getValue(),
    modified: newContent,
    status: 'pending',
  };
  tab.locked = true;  // 읽기 전용 전환
  // DiffAcceptBar 표시
}

// 사용자 수락 시
function acceptDiff(tabId: string) {
  const tab = findTab(tabId);
  tab.modelId.setValue(tab.diff.modified);
  tab.diff = null;
  tab.locked = false;
}
```

## 2.5 TerminalPanel 컴포넌트

### 설계 개요

`TerminalPanel`은 React 수명주기가 PTY 프로세스를 건드리지 못하게 만들기 위해 **얇은 attach 패턴**을 따른다. xterm.js `Terminal` 인스턴스와 WebSocket 연결은 모두 컴포넌트 트리 바깥의 `TerminalManager` 싱글턴이 소유하며, React 컴포넌트는 단지 DOM 호스트를 제공할 뿐이다.

- **소유**: `TerminalManager` 싱글턴(`src/lib/terminal/terminal-manager.ts`)
- **attach point**: `XTerminalAttach`(`src/components/panels/terminal/x-terminal.tsx`)
- **컨테이너 + 탭 UI**: `TerminalPanel`(`src/components/panels/terminal/terminal-panel.tsx`)
- **상태**: `useTerminalStore`(`src/stores/use-terminal-store.ts`) — 탭 목록, 활성 세션 ID, 세션 상태(`connecting`/`open`/`closed`/`exited`)
- **프레이밍 헬퍼**: `src/lib/terminal/terminal-framing.ts`

매니저가 세션 상태 변화를 이벤트로 emit 하면 스토어가 이를 구독해 탭 라벨에 반영한다.

### TerminalManager 수명주기

| 이벤트 | 동작 |
|---|---|
| 앱 부트 (`app-shell.tsx`) | `terminalManager.boot()` 1회 호출. `useLayoutStore.subscribe`로 `fontSize` 변화를 구독. HMR 핫디스포즈 등록. |
| 세션 생성 | 스토어 `createSession` → `terminalManager.ensureSession(id)`. xterm 생성 + WS 연결(이 시점에 PTY 스폰). `term.open()`은 아직 호출하지 않음. |
| React attach | `XTerminalAttach`의 `useEffect` → `terminalManager.attach(id, host)`. 매니저가 소유한 persistent `<div>`를 host에 append 후 첫 호출에 한해 `term.open()`. `requestAnimationFrame`으로 non-zero size를 기다려 `fit()` → resize 전송 → `focus()`. |
| 탭 전환 | 스토어 `setActiveSession` → `terminalManager.activate(id)` → `fit()` + `focus()`. |
| 폰트 크기 변경 | 매니저 구독 콜백 → `setFontSize(px)` → 모든 인스턴스의 `term.options.fontSize` 변경 + `fit()`. PTY 재시작 없음. |
| 패널 collapse | `<TerminalPanel>` unmount → `XTerminalAttach.useEffect` cleanup → `terminalManager.detach(id)`. 매니저는 persistent `<div>`를 DOM에서 떼어내기만 하고 xterm/WS는 유지. |
| 탭 닫기 | 스토어 `closeSession(id)` → `terminalManager.closeSession(id)` → ws.close (서버가 PTY kill). `term.dispose()` 후 map에서 제거. |
| 쉘 종료 | 서버가 `{type:"exit", code}` 제어 프레임 전송 → 매니저가 배너 렌더 + status = `exited`. 탭은 사용자가 닫을 때까지 유지. |

### 애드온 구성

xterm.js 및 모든 애드온은 SSR 안전성을 위해 동적 `import()`로 로드한다.

```typescript
const [{ Terminal }, { FitAddon }, webgl, { SearchAddon }, { WebLinksAddon }] = await Promise.all([
  import('@xterm/xterm'),
  import('@xterm/addon-fit'),
  import('@xterm/addon-webgl').catch(() => null),
  import('@xterm/addon-search'),
  import('@xterm/addon-web-links'),
]);

const term = new Terminal({
  cursorBlink: true,
  scrollback: 10000,
  fontFamily: 'JetBrains Mono, Menlo, monospace',
  fontSize,
  theme: { background: '#0a0a0a' },
  allowProposedApi: true,
});
term.loadAddon(new FitAddon());
term.loadAddon(new SearchAddon());
term.loadAddon(new WebLinksAddon());
// WebGL 애드온은 첫 attach에서 canvas가 준비된 뒤 로드.
```

### 프레이밍과 배압

- **PTY 데이터**: 서버가 **바이너리** WebSocket 프레임으로 송신 → 클라이언트는 `event.data`가 `ArrayBuffer`인지로 구분. `term.write(Uint8Array)`가 UTF-8을 내부 디코딩.
- **제어 메시지**: 양방향으로 **텍스트 JSON** 프레임. `parseServerControlFrame`이 `exit` / `error`만을 제어로 인식하며, 그 외 텍스트는 PTY 출력으로 취급하는 fallback도 가진다.
- **클라이언트 배압**: 100 KB high / 10 KB low watermark 기반으로 `pause`/`resume` 제어 프레임을 서버에 송신.
- **서버 배압**: `paused` 상태에서 데이터를 드롭하지 않고 내부 큐에 버퍼링한다. 큐가 256 KB를 넘으면 `ptyProcess.pause()`로 상류를 멈추고, 5 MB를 넘으면 `BUFFER_OVERFLOW` 에러 프레임 전송 후 PTY kill + WS close(1011).

### 리사이즈 동기화

첫 attach와 탭 활성화·panel 재오픈·폰트 변경 시마다 매니저가 `fitAddon.fit()`을 호출한다. PTY는 기본 120×30으로 스폰되며 첫 fit 결과가 이를 덮어쓴다. 크기가 실제로 달라진 경우에만 `{type:'resize', cols, rows}` 제어 프레임을 전송한다.

## 2.6 PreviewPanel 컴포넌트

### 파일 구조

```
src/components/panels/preview/
├── preview-panel.tsx               # 컨테이너
├── preview-header.tsx              # 타입 표시, 컨트롤
├── preview-router.tsx              # 타입별 렌더러 선택
├── html-preview.tsx                # iframe srcdoc
├── pdf-preview.tsx                 # react-pdf
├── markdown-preview.tsx            # react-markdown
├── image-preview.tsx               # 줌/팬
├── slide-preview.tsx               # reveal.js iframe
└── use-preview-content.ts          # 콘텐츠 로딩
```

### 라우터 로직

```typescript
function PreviewRouter({ filePath, content }: Props) {
  const ext = getExtension(filePath);
  switch (ext) {
    case 'html':
      return isRevealSlide(content)
        ? <SlidePreview content={content} />
        : <HTMLPreview content={content} />;
    case 'pdf':
      return <PDFPreview path={filePath} />;
    case 'md':
    case 'markdown':
      return <MarkdownPreview content={content} />;
    case 'png': case 'jpg': case 'jpeg':
    case 'gif': case 'svg': case 'webp':
      return <ImagePreview path={filePath} />;
    default:
      return <UnsupportedPreview ext={ext} />;
  }
}
```

### HTMLPreview 구현

```typescript
function HTMLPreview({ content }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debouncedContent = useDebounce(content, 300);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={debouncedContent}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="w-full h-full border-0"
    />
  );
}
```

### SlidePreview 구현

```typescript
function SlidePreview({ content }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 슬라이드 변경 시 리로드 없이 DOM 패치
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'UPDATE_SLIDE',
      slides: content.slides,
    }, '*');
  }, [content.slides]);

  return (
    <iframe
      ref={iframeRef}
      src="/reveal-host.html"  // reveal.js 호스트 페이지
      sandbox="allow-scripts"
      className="w-full h-full border-0"
    />
  );
}

// reveal-host.html 내부
window.addEventListener('message', (e) => {
  if (e.data.type === 'UPDATE_SLIDE') {
    updateSlideDOM(e.data.slides);
    Reveal.sync();
  }
});
```

## 2.7 ClaudeIntegration 모듈

### 서버 측 구조

```
src/lib/claude/
├── session-manager.ts              # 세션 생성/재개/포크
├── query-handler.ts                # Agent SDK query() 래퍼
├── permission-interceptor.ts       # 도구 사용 권한 처리
├── stream-parser.ts                # NDJSON 이벤트 파싱
└── cost-tracker.ts                 # 비용/토큰 누적
```

### query-handler.ts 예시

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

export async function* handleQuery({
  prompt,
  sessionId,
  cwd,
  options,
}: QueryParams) {
  const stream = query({
    prompt,
    sessionId,
    cwd,
    ...options,
  });

  for await (const message of stream) {
    switch (message.type) {
      case 'assistant':
      case 'stream_event':
        yield { type: 'message', data: message };
        break;

      case 'tool_use':
        if (requiresPermission(message.tool)) {
          const approved = await requestPermission(message);
          if (!approved) {
            yield { type: 'error', message: 'Permission denied' };
            return;
          }
        }
        yield { type: 'tool_call', data: message };
        break;

      case 'result':
        yield { type: 'result', data: message };
        break;
    }
  }
}
```

## 2.8 상태 관리 (Zustand Stores)

### useLayoutStore

```typescript
interface LayoutState {
  // 패널 크기 (%)
  fileExplorerSize: number;
  editorSize: number;
  terminalSize: number;
  previewSize: number;

  // 접힘 상태
  fileExplorerCollapsed: boolean;
  terminalCollapsed: boolean;
  previewCollapsed: boolean;

  // 테마
  theme: 'dark' | 'light' | 'high-contrast';

  // 액션
  setPanelSize(panel: string, size: number): void;
  togglePanel(panel: string): void;
  setTheme(theme: Theme): void;
}

// persist 미들웨어 적용
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({ ... }),
    { name: 'claudegui-layout' }
  )
);
```

### useEditorStore

```typescript
interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile(path: string): Promise<void>;
  closeTab(id: string): void;
  setActiveTab(id: string): void;
  markDirty(id: string, dirty: boolean): void;
  applyClaudeEdit(path: string, edit: EditOperation): void;
  saveFile(id: string): Promise<void>;
}
```

### useTerminalStore

```typescript
interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  createSession(cwd?: string): string;
  closeSession(id: string): void;
  setActiveSession(id: string): void;
}
```

### useClaudeStore

```typescript
interface SessionStats {
  sessionId: string;
  model: string | null;
  numTurns: number | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  lastUpdated: number | null;
}

interface ClaudeState {
  sessions: ClaudeSession[];
  activeSessionId: string | null;
  messages: Record<string, ClaudeMessage[]>;  // sessionId → messages
  pendingPermissionRequest: PermissionRequest | null;
  totalCost: Record<string, number>;
  tokenUsage: Record<string, { input: number; output: number }>;
  // 세션별 컨텍스트/사용량 스냅샷 (SDK가 실제로 전달한 값만 채워진다)
  sessionStats: Record<string, SessionStats>;

  sendQuery(prompt: string): Promise<void>;
  resumeSession(id: string): void;
  forkSession(id: string): string;
  respondToPermission(approved: boolean): void;
}
```

`sessionStats`는 Agent SDK가 보낸 `system.init` 이벤트(모델 이름)와 `result` 이벤트
(`num_turns`, `duration_ms`, `usage.*`, `total_cost_usd`)만을 기반으로 누적 저장된다.
SDK가 값을 주지 않은 필드는 `null`로 유지되며, UI에서는 "-"로 표시한다. 컨텍스트 윈도우
크기 같은 값은 하드코딩하지 않고, 오직 실제 응답에 담긴 값만 노출한다.

#### SessionInfoBar (Claude 패널)

`src/components/panels/claude/session-info-bar.tsx`는 `useClaudeStore`에서 활성 세션의
`SessionStats`를 구독하여 Claude 채팅 패널 하단에 접이식 바 형태로 렌더링한다.

- 접힘(기본): `{model} · {turns} turns · ctx {used}/{limit} ({pct}) · {tokens} tok · {updated}` 한 줄 (높이 h-6)
- 펼침: 세션 ID, 모델, 턴 수, 소요 시간, 입력/출력/캐시 읽기 토큰, 마지막 업데이트 시각
- 누적 비용(`total_cost_usd`)은 Agent SDK가 제공하는 추정치이므로 접힘/펼침 어디에도 표시하지 않는다. 값은 `SessionStats.costUsd`와 `ClaudeState.totalCost`에 계속 누적되어 `max-budget` 한도 체크 등 내부 로직용으로만 사용된다 (FR-504).
- 편집 영역을 가리지 않도록 기본 상태는 접힘이며, chevron 토글 상태는 `localStorage`
  키 `claudegui-session-info-expanded`에 저장한다.
- 별도 폴링 없이 WebSocket으로 도착하는 SDK 이벤트마다 갱신되고, "업데이트 경과 시간"만
  1초 간격 `setInterval`로 재계산한다.

### usePreviewStore

```typescript
interface PreviewState {
  currentFile: string | null;
  currentType: PreviewType;
  pageNumber: number;
  zoomLevel: number;

  setFile(path: string): void;
  setPage(page: number): void;
  setZoom(level: number): void;
}
```

### 스토어 업데이트 규칙

- **React 컴포넌트**: `use...Store()` 훅으로 상태 구독
- **WebSocket 핸들러**: `use...Store.getState().setState(...)` 직접 호출 (훅 외부)
- **Persist 적용 대상**: `useLayoutStore`(사용자 레이아웃)와 `useArtifactStore`(생성 콘텐츠 캐시)
- **Persist 비적용**: editor/terminal/claude/preview (세션 데이터는 서버 재조회)

---

## 2.9 ArtifactGallery 모듈 (FR-1000)

Claude가 스트리밍으로 전달한 코드·HTML·Markdown·SVG를 "아티팩트"로 모아 한 곳에서 복사·내보낼 수 있게 해주는 교차 절단(cross-cutting) 모듈이다. 에디터/프리뷰 패널과 독립적으로 동작하며, 네 개의 핵심 파일로 구성된다.

### 모듈 구성

| 파일 | 역할 |
|------|------|
| `src/lib/claude/artifact-extractor.ts` | 정규식 기반으로 어시스턴트 텍스트에서 펜스 코드 블록, 독립 `<!doctype html>` 문서, 독립 `<svg>` 요소를 추출하여 `ExtractedArtifact[]`를 반환. 각 항목에 안정된 `{messageId}:{index}` ID와 언어·종류·제목·확장자 추정값을 부여한다. |
| `src/stores/use-artifact-store.ts` | zustand 스토어. `artifacts` 배열, `isOpen`, `autoOpen`, `highlightedId`, `pendingTurn` 상태와 `extractFromMessage/flushPendingOpen/open/close/remove/clear` 액션 제공. `persist` 미들웨어가 `artifacts`·`autoOpen`을 `localStorage`(키: `claudegui-artifacts`)에 저장한다. 최대 200개. |
| `src/lib/claude/artifact-export.ts` | `copyArtifact`, `availableExports`, `exportArtifact`를 노출. 소스(`.ts`/`.py`/`.html` …), HTML, PDF(`window.print()`), Word(`.doc`), SVG→PNG(`canvas.toBlob`) 변환을 담당. 외부 라이브러리를 추가하지 않고 브라우저 API만 사용한다. |
| `src/components/modals/artifacts-modal.tsx` | Radix Dialog 기반 갤러리. 좌측 목록 + 우측 상세 프리뷰, Copy/Export/Delete 액션, 상단 `Auto-open`·`Clear all` 툴바. `useArtifactStore`를 직접 구독한다. |

### 데이터 흐름

```text
WebSocket /ws/claude
   └─► use-claude-store.handleServerMessage
         ├─ assistant message → useArtifactStore.extractFromMessage(msgId, sid, text)
         │                         └─► artifact-extractor.extractArtifacts
         │                               └─► new artifacts → pendingTurn[]
         └─ result                → useArtifactStore.flushPendingOpen()
                                      └─► if autoOpen && pendingTurn.length > 0 → isOpen = true
```

세션 복원(`useClaudeStore.loadSession`)은 `extractFromMessage(..., { silent: true })`로 호출하여 `pendingTurn`을 건드리지 않고, 과거 대화의 아티팩트만 갤러리에 복원한다.

### 설계상의 선택

- **의존성 무추가** — `pptxgenjs`/`react-pdf`/`react-markdown` 등 기존 의존성만 사용하되, 아티팩트 내보내기 경로에서는 브라우저의 `Blob`/`<a download>`/`window.print()`/`canvas`만 활용한다. PDF·DOCX 같은 이기종 포맷도 인쇄 다이얼로그와 Word HTML 트릭으로 대체할 수 있어 번들 크기를 늘리지 않는다.
- **`result` 시점에만 자동 팝업** — 스트리밍 중에 모달이 튀어오르면 가독성을 해치므로, Agent SDK의 `result` 이벤트에서 한 번만 `flushPendingOpen`을 호출한다.
- **로컬스토리지 상한 200개** — 브라우저 저장소 한도(5 MB 내외)에 비해 안전한 크기이며, 오래된 항목이 먼저 밀려난다.
- **복구 가능한 실패** — PNG/PDF 경로에서 `window.open`이 차단되거나 `<canvas>` 변환이 실패하면 소스 HTML 다운로드로 폴백한다.
