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

### 파일 구조

```
src/components/panels/terminal/
├── terminal-panel.tsx              # 컨테이너
├── terminal-tab-bar.tsx            # 세션 탭
├── x-terminal.tsx                  # xterm.js 래퍼
├── use-terminal-session.ts         # WebSocket 연결 훅
└── use-backpressure.ts             # 배압 제어 훅
```

### 애드온 구성

```typescript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';

const term = new Terminal({
  cursorBlink: true,
  scrollback: 10000,
  fontFamily: 'JetBrainsMono, monospace',
});

term.loadAddon(new FitAddon());
term.loadAddon(new WebglAddon());
term.loadAddon(new SearchAddon());
term.loadAddon(new WebLinksAddon());
```

### 배압 제어

```typescript
const HIGH_WATERMARK = 100 * 1024;  // 100 KB
const LOW_WATERMARK = 10 * 1024;    // 10 KB

let pendingBytes = 0;
let paused = false;

ws.onmessage = (event) => {
  pendingBytes += event.data.length;
  term.write(event.data, () => {
    pendingBytes -= event.data.length;
    if (paused && pendingBytes < LOW_WATERMARK) {
      ws.send(JSON.stringify({ type: 'resume' }));
      paused = false;
    }
  });
  if (!paused && pendingBytes > HIGH_WATERMARK) {
    ws.send(JSON.stringify({ type: 'pause' }));
    paused = true;
  }
};
```

### 리사이즈 동기화

```typescript
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
  ws.send(JSON.stringify({
    type: 'resize',
    cols: term.cols,
    rows: term.rows,
  }));
});
```

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
interface ClaudeState {
  sessions: ClaudeSession[];
  activeSessionId: string | null;
  messages: Record<string, ClaudeMessage[]>;  // sessionId → messages
  pendingPermissionRequest: PermissionRequest | null;
  totalCost: Record<string, number>;
  tokenUsage: Record<string, { input: number; output: number }>;

  sendQuery(prompt: string): Promise<void>;
  resumeSession(id: string): void;
  forkSession(id: string): string;
  respondToPermission(approved: boolean): void;
}
```

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
- **Persist 적용 대상**: `useLayoutStore`만 (사용자 설정)
- **Persist 비적용**: editor/terminal/claude/preview (세션 데이터는 서버 재조회)
