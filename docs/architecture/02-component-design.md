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
    │   └── watcher.ts                  (@parcel/watcher)
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
├── file-explorer-panel.tsx         # 컨테이너 (FR-208 업로드, 키보드 훅 마운트)
├── file-tree.tsx                   # react-arborist 래퍼 + 인라인 편집 렌더
├── file-context-menu.tsx           # 호이스팅된 단일 컨텍스트 메뉴 (FR-206)
├── delete-confirm-dialog.tsx       # 삭제 확인 다이얼로그 (FR-202)
├── use-file-actions.ts             # CRUD/clipboard 액션 훅
├── use-file-keyboard.ts            # 트리 스코프 키보드 단축키 (FR-212)
├── use-file-tree.ts                # 데이터 로딩 훅
├── use-files-websocket.ts          # /ws/files 구독
├── file-icon.tsx                   # 확장자별 아이콘
├── git-status-indicator.tsx        # Git 상태 배지
└── use-git-status.ts               # Git 상태 맵 fetch
```

관련 전역 store:
- `src/stores/use-file-context-menu-store.ts` — 컨텍스트 메뉴 상태 (`{ open, anchor, target, selectionPaths, scope }`)
- `src/stores/use-file-clipboard-store.ts` — 인-앱 클립보드 (`{ paths, mode }`, FR-211)

### 주요 동작

1. **데이터 로딩**: `useFileTree` 훅이 `/api/files?path=<root>`를 호출하여 트리 노드 생성.
2. **가상화**: `react-arborist`의 내장 가상 스크롤.
3. **Git 상태**: `/api/git/status` 호출로 파일별 상태 맵 생성 → 오버레이.
4. **실시간 갱신**: `/ws/files` WebSocket 이벤트로 트리 노드 갱신 (디바운스 + rAF 배치).
5. **컨텍스트 메뉴 (FR-206)**: 노드 렌더러는 `<ContextMenu>`를 직접 들지 않고, `onContextMenu`에서 `useFileContextMenuStore.openAtNode()`를 호출하여 좌표·target·selectionPaths를 발행한다. 패널 루트의 단일 `<FileContextMenu>`가 controlled `open`과 invisible fixed-position trigger로 Radix DropdownMenu를 anchor한다. 가상화 리스트 재조정이나 노드 hover 리렌더가 메뉴 상태에 영향을 주지 않으므로, 우클릭 직후 마우스 이동만으로 메뉴가 닫히는 react-arborist + 노드 단위 ContextMenu의 알려진 결함이 해소된다. 해제는 `Esc`/바깥 클릭/다른 노드 우클릭 세 가지 경로뿐이다.
6. **선택 모델 (FR-210)**: react-arborist 내장 selection을 사용한다. `Tree.onSelect`가 노드 배열을 발화하면 패널 컨테이너가 `selection`/`selectionRef` 상태로 보관해 키보드 훅과 컨텍스트 메뉴에 공급한다.
7. **인라인 편집 (FR-202)**: 노드 렌더러는 `node.isEditing`일 때 `<input>`을 렌더하고 `Enter`/`Esc`/`onBlur`를 통해 `node.submit()` 또는 `node.reset()`을 호출한다. 새 파일/폴더는 패널이 placeholder 이름(` 2`, ` 3` …으로 충돌 회피)으로 즉시 생성한 뒤 `treeRef.beginRename(path)`로 인라인 편집에 진입시킨다.
8. **인-앱 클립보드 (FR-211) / 키보드 단축키 (FR-212)**: `useFileActions`가 copy/cut/paste/duplicate/delete API를 한 곳에 모은다. `useFileKeyboard`는 `data-file-explorer-panel="true"` 컨테이너 안에 포커스가 있을 때만 활성화되어 위 액션과 트리 헬퍼(`tree.selectAll`, `tree.deselectAll`, `tree.edit(id)`)를 키 입력에 매핑한다. 잘라내기된 노드는 `italic + opacity-50`로 시각화한다.
9. **트리 내부 드래그 이동/복사 (FR-203)**: react-arborist `onMove`를 와이어링한다. 네이티브 `dragstart`/`dragover`에서 `altKey`를 ref로 캡처해 기본 이동(`filesApi.rename`)과 Alt-복사(`filesApi.copy`)를 분기한다. 자기 자신/자손으로의 이동은 거부한다.
10. **삭제 확인 (FR-202)**: `useDeleteConfirmStore.request(paths)`가 Promise를 반환하는 비동기 prompt 패턴을 제공하고, 패널 루트의 `<DeleteConfirmDialog>`가 다중 선택 시 영향 받는 경로 리스트와 함께 모달을 띄운다.
11. **OS 파일 드롭/붙여넣기 업로드 (FR-208)**: `FileExplorerPanel`의 루트 `div`는 `tabIndex={0}`을 가지며 `onDragEnter/onDragOver/onDragLeave/onDrop`과 `onPaste`를 구현한다. `e.dataTransfer.types`에 `'Files'`가 포함된 드래그만 수락해 react-arborist의 내부 노드 드래그와 충돌을 피한다. 드롭 또는 붙여넣기로 수집한 `File[]`는 `filesApi.upload(destDir, files)`를 통해 `POST /api/files/upload`로 전송되고, 성공 후 `refreshRoot()`로 트리를 즉시 갱신한다. 드래그 중에는 `ring-2 ring-primary` 경계와 "Drop files to upload to project root" 오버레이를 표시한다.

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
- **attach point**: `XTerminalAttach`(`src/components/panels/terminal/x-terminal.tsx`) — Radix `ContextMenu`로 감싼 호스트 div. 호스트 `<div>`의 배경은 `style={{ background: 'var(--terminal-bg)' }}`로 CSS 변수에 바인딩되어 테마 토글·탭 전환·첫 마운트에서 검정 플래시를 내지 않는다(FR-419).
- **컨테이너 + 탭 UI**: `TerminalPanel`(`src/components/panels/terminal/terminal-panel.tsx`) — 인라인 rename, cwd 라벨, unread 인디케이터, 프로젝트 전환 배너, Restart 칩, 스플릿 pane 렌더러, "Open in system terminal" `ExternalLink` 버튼 (`FR-420`)
- **검색 오버레이**: `TerminalSearchOverlay`(`src/components/panels/terminal/terminal-search-overlay.tsx`)
- **테마 팔레트**: `src/lib/terminal/terminal-themes.ts` (`TERMINAL_THEMES`) — 단일 소스. `TerminalManager`가 import 해 `setTheme`으로 전파하며, `globals.css`의 `--terminal-bg`/`--terminal-fg` CSS 변수와 hex 파리티를 유지해야 한다(`tests/unit/terminal-themes-contrast.test.ts`가 검증).
- **상태**: `useTerminalStore`(`src/stores/use-terminal-store.ts`) — 탭 목록, 활성 세션 ID, 세션 상태(`connecting`/`open`/`closed`/`exited`), cwd, displayName, unread, searchOverlayOpen, splitEnabled, primarySessionId, secondarySessionId, activePaneIndex
- **소켓 래퍼**: `src/lib/terminal/terminal-socket.ts` (`TerminalSocket`) — 자동 재연결 없음 (ReconnectingWebSocket 대비). 재연결이 필요할 때는 매니저가 `serverSessionId`를 URL에 실어 새 소켓을 연다(FR-414).
- **서버측 세션 레지스트리**: `server-handlers/terminal/session-registry.mjs` (`TerminalSessionRegistry` 싱글턴) — PTY 수명·링 버퍼(256 KB)·GC(30분)·transient/exit 리스너 fan-out 관리. ADR-020.
- **쉘 해결기**: `server-handlers/terminal/shell-resolver.mjs` (`resolveShell`, `shellFlags`, `buildPtyEnv`)
- **OS 터미널 바이패스**: `src/app/api/terminal/open-native/route.ts` (POST 엔드포인트), `src/app/api/terminal/open-native/launchers.ts` (`resolveLauncher` 순수 함수, 플랫폼별 커맨드 테이블), `terminalApi.openNative`(클라이언트 API), `Cmd/Ctrl+Shift+O` 전역 단축키. 상세는 `FR-420`.
- **파일 탐색기 통합**: `src/app/api/files/reveal/route.ts` (Reveal in Finder/Explorer), `filesApi.reveal`, `file-tree.tsx` 컨텍스트 메뉴의 `Open terminal here` (WS URL에 `?cwd=<path>` 쿼리), `Open in system terminal`(FR-420)
- **에디터 통합**: `src/components/panels/editor/monaco-editor-wrapper.tsx`의 module-level `activeMonacoEditor` 레퍼런스와 `getActiveEditorSelectionOrLine()`, 그리고 `useEditorStore.pendingReveal`(링크 프로바이더에서 `revealLineInCenter`)
- **프레이밍 헬퍼**: `src/lib/terminal/terminal-framing.ts` — `TerminalCloseControl`(클라→서버), `TerminalSessionServerControl`(서버→클라) 포함

매니저는 두 종류의 이벤트를 emit한다:
- `SessionListener` → 상태/exitCode 변화
- `CwdListener` → OSC 7 cwd 변경

스토어가 각 이벤트를 구독해 탭 라벨·상태 인디케이터·cwd 접미어를 갱신한다.

### TerminalManager 수명주기

| 이벤트 | 동작 |
|---|---|
| 앱 부트 (`app-shell.tsx`) | `terminalManager.boot()` 1회 호출. `useLayoutStore.subscribe`로 `fontSize` 변화를 구독. `attachCustomKeyEventHandler`에 전달할 예약 키 predicate을 등록(`Cmd+T/W/F/K`, `Cmd+Shift+R`, `Ctrl+Tab`, `Cmd+1..9`). HMR 핫디스포즈 등록. |
| 세션 생성 | 스토어 `createSession` → `terminalManager.ensureSession(id)`. xterm 생성(SearchAddon 인스턴스를 저장해 두고, `term.parser.registerOscHandler(7, …)`로 OSC 7 리스너 등록) + `TerminalSocket` 연결(이 시점에 PTY 스폰). `term.open()`은 아직 호출하지 않음. |
| 소켓 open | `createSocket`의 `onOpen` 콜백이 `resize` 프레임을 송신. 첫 open인 경우 250 ms 뒤에 `injectShellHelpers(inst)`가 OSC 7 emitter 스니펫을 `{type:"input"}` 프레임으로 1회 주입. |
| React attach | `XTerminalAttach`의 `useEffect` → `terminalManager.attach(id, host)`. 매니저가 소유한 persistent `<div>`를 host에 append 후 첫 호출에 한해 `term.open()`. `requestAnimationFrame`으로 non-zero size를 기다려 `fit()` → resize 전송 → `focus()`. WebGL 애드온은 이 시점에 지연 로드. |
| 탭 전환 | 스토어 `setActiveSession` → `terminalManager.activate(id)` → `fit()` + `focus()`. searchOverlayOpen은 false로 리셋. |
| 폰트 크기 변경 | 매니저 구독 콜백 → `setFontSize(px)` → 모든 인스턴스의 `term.options.fontSize` 변경 + `fit()`. PTY 재시작 없음. |
| 패널 collapse | `<TerminalPanel>` unmount → `XTerminalAttach.useEffect` cleanup → `terminalManager.detach(id)`. 매니저는 persistent `<div>`를 DOM에서 떼어내기만 하고 xterm/WS는 유지. |
| 소켓 unexpected close | `createSocket`의 `onClose` 콜백이 status를 `closed`로 전이, xterm 버퍼에 `[connection to PTY lost]` 라인 기록. **재연결 시도 없음**. |
| 쉘 종료 | 서버가 `{type:"exit", code}` 제어 프레임 전송 → `applyServerControl`이 status를 `exited`로 전이. 탭은 사용자가 닫을 때까지 유지. |
| Restart | `restartSession(id)` — `closed`/`exited`에서만 허용. xterm `dispose` 없이 스크롤백 유지, `─── restarted at HH:MM:SS ───` separator 삽입, pendingBytes/paused/exitCode 리셋, status `connecting`, `createSocket(inst)` 재호출. `helpersInjected=true`이므로 OSC 7 스니펫은 재주입되지 않는다. |
| 탭 닫기 | 스토어 `closeSession(id)` → `terminalManager.closeSession(id)` → ws.close (서버가 PTY kill). `term.dispose()` 후 map에서 제거. |

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

### 쉘 초기화와 환경 변수 (FR-410)

서버 측에서 PTY를 spawn하기 전에 `server-handlers/terminal/shell-resolver.mjs`의 세 헬퍼가 순서대로 호출된다:

1. `resolveShell(env, platform)` — `CLAUDEGUI_SHELL` → `$SHELL`/`$COMSPEC` → 플랫폼별 대체 순으로 쉘을 결정한다.
2. `shellFlags(shellPath)` — `zsh`/`bash`/`fish`/`sh` 계열은 `['-l','-i']`, `pwsh`/`powershell`은 `['-NoLogo']`, `cmd`는 `[]`를 반환한다. 이로써 dotfile이 자동 소스되어 사용자 PATH·alias·프롬프트가 살아난다.
3. `buildPtyEnv(shellPath, baseEnv, platform)` — `TERM`, `COLORTERM`, `TERM_PROGRAM`, `TERM_PROGRAM_VERSION`, `CLAUDEGUI_PTY`, `CLAUDEGUI_SHELL_PATH`를 덧붙이고, `NODE_OPTIONS`·`ELECTRON_RUN_AS_NODE`·`NEXT_TELEMETRY_DISABLED`·`__NEXT_PRIVATE_*` 등 Next.js 서버 전용 변수는 strip한다.

터미널 핸들러는 반환된 `{ shell, args, env }`와 ProjectContext의 활성 루트(`getActiveRoot()`)를 `pty.spawn`에 그대로 전달한다. 세션별 cwd는 OSC 7 경로로 추적된다.

### 키보드 중재 (FR-806)

터미널 단축키는 **하이브리드 라우팅**을 사용한다:

- `TerminalManager`가 xterm의 `attachCustomKeyEventHandler`로 예약 키 조합을 감지하면 `false`를 반환해 xterm이 PTY에 해당 키를 기록하지 못하게 한다.
- 동일한 조합은 `src/hooks/use-global-shortcuts.ts`에서 window-level keydown 리스너가 포착하고, `isFocusInsideTerminal()`이 참인 경우에만 `useTerminalStore` 액션(createSession, closeActiveSession, toggleSearchOverlay, clearActiveBuffer, restartActiveSession, next/prev/activateTabByIndex)을 디스패치한다.
- `isFocusInsideTerminal()`은 `document.activeElement`에서 `closest('[data-terminal-panel="true"]')`로 스코프를 판정한다. xterm이 내부적으로 hidden textarea에 입력을 라우팅하므로 이 방식이 안정적이다.
- `Cmd+K` 충돌: 포커스가 터미널 안일 때 Command Palette(`FR-801`)의 `Cmd+K` 핸들러는 즉시 early-return 한다. 밖에 있으면 원래대로 팔레트가 열린다.

### 검색 오버레이 (FR-405)

`TerminalInstance.searchAddon` 인스턴스를 유지해 `findNext`/`findPrevious`/`clearDecorations`를 공개 메서드로 노출한다. `TerminalSearchOverlay` 컴포넌트가 토글 상태(대소문자/단어/regex)와 100 ms 디바운스된 인크리멘털 검색을 관리한다. 닫힐 때 데코레이션을 제거하고 `terminalManager.activate(id)`로 xterm에 포커스를 복원한다.

## 2.6 PreviewPanel 컴포넌트

### 파일 구조

```
src/components/panels/preview/
├── preview-panel.tsx               # 컨테이너 + 헤더(소스/렌더 토글, 다운로드)
├── preview-router.tsx              # 타입별 렌더러 선택 + viewMode 분기
├── html-preview.tsx                # iframe srcdoc
├── pdf-preview.tsx                 # react-pdf
├── markdown-preview.tsx            # react-markdown
├── image-preview.tsx               # 줌/팬
├── slide-preview.tsx               # reveal.js iframe
├── source-preview.tsx              # highlight.js 기반 소스 뷰 (FR-614)
├── live-html-preview.tsx           # 스트리밍 전용 경로
└── preview-download-menu.tsx       # 즉시 다운로드 드롭다운
```

`usePreviewStore`는 `currentFile`/`pageNumber`/`zoom`/`fullscreen` 외에 `viewMode: 'rendered' | 'source'` 필드를 유지한다(FR-614). 기본값은 `'rendered'`이며 `setFile` 호출 시 자동으로 `'rendered'`로 리셋되어 파일 전환 시 소스 뷰가 고착되지 않는다. `isSourceToggleable(type)` 헬퍼가 `html`/`markdown`/`slides`에만 토글을 허용한다.

### 라우터 로직

```typescript
function PreviewRouter({ filePath, content }: Props) {
  const viewMode = usePreviewStore((s) => s.viewMode); // 'rendered' | 'source'
  const type = detectPreviewType(filePath);

  // 프리뷰 불가 타입 또는 선택 해제 → 완전한 빈 화면 (FR-601)
  if (!filePath || type === 'none') return <div className="h-full w-full" aria-hidden />;

  // 텍스트 기반 타입은 viewMode === 'source'이면 구문 강조 소스 뷰로 분기 (FR-614)
  if (type === 'html')
    return viewMode === 'source'
      ? <SourcePreview content={content} language="html" />
      : <HTMLPreview content={content} />;
  if (type === 'markdown')
    return viewMode === 'source'
      ? <SourcePreview content={content} language="markdown" />
      : <MarkdownPreview content={content} />;
  if (type === 'slides')
    return viewMode === 'source'
      ? <SourcePreview content={content} language="html" />
      : <SlidePreview content={content} />;

  // 바이너리/렌더 전용 타입
  if (type === 'pdf') return <PDFPreview path={filePath} />;
  if (type === 'image') return <ImagePreview path={filePath} />;
  if (type === 'docx') return <DocxPreview path={filePath} />;
  if (type === 'xlsx') return <XlsxPreview path={filePath} />;
  if (type === 'pptx') return <PptxPreview path={filePath} />;
  return null;
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

### Contain-fit 렌더링과 콘텐츠 윤곽선 (FR-612)

프리뷰 패널은 비율에 관계없이 컨텐츠 전체 레이아웃을 노출하고, 배경이 겹쳐도 경계가 보이도록 다음 규칙을 적용한다. 이 규칙은 `usePreviewStore.fullscreen` 상태와 무관하게 동일하다.

- **Slides (`reveal-host.html`)**: `Reveal.initialize`를 고정 논리 크기(`width: 960, height: 700`)로 호출하고 `margin: 0.04`, `minScale: 0.05`, `maxScale: 2.0`을 지정해 어떤 가로세로 비율에서도 전체 슬라이드가 축소 배치되게 한다. `.reveal .slides > section`에는 `box-shadow: 0 0 0 1px rgba(255,255,255,0.28), 0 6px 24px rgba(0,0,0,0.45)`로 외곽선을 그린다.
- **PDF (`pdf-preview.tsx`)**: 스크롤 컨테이너를 `ResizeObserver`로 관찰하고 첫 페이지 로드 시 `getViewport({ scale: 1 })`로 네이티브 크기를 캡처한다. 이후 `Page`에 `width = min(availableWidth, availableHeight × aspect)`을 전달하여 페이지가 컨테이너 안에 완전히 들어오도록 한다. 페이지 캔버스는 `ring-1 ring-border/70 shadow-md` 박스로 감싼다. 파일 경로가 바뀌면 네이티브 크기 캐시를 초기화한다.
- **HTML / Live HTML / Markdown**: `bg-muted` 외곽 + 내부 `ring-1 ring-border/70 shadow-sm`로 콘텐츠 영역을 감싸 외부 UI 배경과 명확히 구분한다.

### 소스/렌더 뷰 토글 (FR-614)

텍스트 기반 포맷(`html`/`markdown`/`slides`)은 프리뷰 패널 헤더의 `Code`/`Eye` 토글 버튼으로 렌더 뷰와 소스 뷰를 전환할 수 있다. 버튼은 `preview-panel.tsx`의 헤더 영역(다운로드 메뉴 왼쪽)에 배치되며, `!showLive && isSourceToggleable(type)` 조건일 때만 노출된다. 라이브 HTML 스트리밍이 활성화된 동안에는 `live-html-preview.tsx` 내부의 기존 토글이 그대로 동작하고 헤더 토글은 숨겨진다(두 경로는 상호 배타적).

소스 뷰 구현(`source-preview.tsx`)은 `highlight.js/lib/core`에 `xml`(HTML), `markdown` 언어만 등록한 뒤 `hljs.highlight()` 결과를 `<pre><code class="hljs language-...">`에 주입한다. 테마 CSS(`highlight.js/styles/github-dark.css`)는 `src/app/layout.tsx`에서 한 번만 import되며, 외곽 컨테이너는 FR-612 규칙(`bg-muted` + `ring-1 ring-border/70 shadow-sm`)을 따른다.

### 프리뷰 즉시 다운로드 (FR-613)

프리뷰 패널 헤더에는 현재 렌더 중인 콘텐츠를 포맷별로 즉시 다운로드하는 드롭다운이 포함된다. 라이브 프리뷰가 활성화된 동안에도 메뉴는 유지되며, 스트리밍된 버퍼(혹은 동기화 중인 에디터 탭 내용)를 인라인 HTML 아티팩트로 취급하여 즉시 다운로드한다.

- **어댑터** (`src/lib/preview/preview-download.ts`): `(filePath, type, content)` 입력을 `src/lib/claude/artifact-extractor.ts`의 `ExtractedArtifact` 모양으로 변환한다. 텍스트 프리뷰(`html`/`markdown`/`slides`, 그리고 `.svg` 이미지)는 `source: 'inline'`로, 나머지 바이너리(`pdf`/`image`(SVG 제외)/`docx`/`xlsx`/`pptx`)는 `source: 'file'` + `filePath`로 빌드된다. 이후 `availableExports()` / `exportArtifact()` (`src/lib/claude/artifact-export.ts`)에 위임하여 기존 다운로드·인쇄 파이프라인을 그대로 재사용한다.
- **헤더 컴포넌트** (`src/components/panels/preview/preview-download-menu.tsx`): 다음 우선순위로 다운로드 소스를 해석한다.
  1. **라이브 모드 우선 (`showingLive`)**: `useLivePreviewStore.autoSwitch && mode !== 'idle'`일 때, 필드를 이 순서로 확정한다. filePath = `generatedFilePath ?? 'live-preview.html'`, `type = 'html'`, `content = (editorTab[generatedFilePath]?.content) ?? buffer`. 버퍼가 빈 문자열이면 메뉴를 렌더링하지 않는다.
  2. **일반 파일 프리뷰**: `usePreviewStore.currentFile` 또는 활성 에디터 탭 경로에서 `PreviewType`을 도출하고, 텍스트 기반 타입(`html`/`markdown`/`slides` + `.svg`)은 편집기 탭 in-memory 내용을 먼저 시도하고 없으면 `filesApi.read()`로 지연 로드한다. 파일 기반 바이너리 타입은 content를 요구하지 않는다.
  3. 확정된 입력을 `previewDownloadOptions(input)` → `downloadPreview(input, format)`으로 넘긴다.
- **라이브 스트리밍 표기**: `mode === 'live-code'`(아직 렌더 가능한 단위가 감지되지 않은 부분 청크)일 때는 드롭다운 헤더 캡션이 `Download (streaming…)`, `mode === 'live-html'`(렌더 가능)일 때는 `Download live buffer`, 비(非)라이브 상태에서는 `Download as`로 표시되어 사용자가 어느 상태에서 캡처한 스냅샷인지 인지할 수 있다. 라이브 HTML 버퍼는 `html-stream-extractor.ts`가 누적한 전체 문서(이전 페이지까지 생성 완료 + 현재 스트리밍 중인 꼬리)를 담으므로, 5페이지 문서 중 3페이지가 완성된 시점에서 다운로드하면 해당 시점의 전체 버퍼가 저장된다.
- **패널 배치** (`src/components/panels/preview/preview-panel.tsx`): 헤더 우측의 `Fullscreen` 토글 왼쪽에 `PreviewDownloadMenu`를 배치한다. `showLive` 여부와 무관하게 항상 렌더링된다.
- **포맷 매트릭스**는 FR-613에 정의된 표를 따른다. DOCX/XLSX/PPTX는 "Original file" 한 가지만 노출하며 트랜스코드는 v1.0 범위 밖이다. PDF 내보내기는 브라우저 인쇄 대화상자를 통해 OS "PDF로 저장"으로 라우팅되므로 서버 측 PDF 렌더러(Puppeteer 등)는 필요하지 않다.

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

### ClaudeChatPanel — 프롬프트 @ 멘션 (FR-511)

`src/components/panels/claude/claude-chat-panel.tsx`의 입력 영역은 `@` 자동완성을 지원한다. 사용자 키 입력마다 `detectMention(value, cursor)`(`use-file-mentions.ts`)가 커서 직전의 `@` 토큰 유무를 확인한다. `@` 앞이 공백이거나 문자열 시작이 아니면 무시되어 이메일 형태의 문자열은 멘션으로 인식되지 않는다.

후보 목록은 `listProjectFiles()`(`src/lib/fs/list-project-files.ts`)가 `GET /api/files`를 재귀 호출(깊이 3, 파일+디렉토리)하여 수집하며, `useFileMentions` 훅이 `useProjectStore.activeRoot` 변경 시마다 재크롤링한다. 필터링은 `filterMentionCandidates()`가 순수 함수로 수행한다 (정확 일치 > 전체 prefix > 파일명 prefix > 부분 문자열 > 서브시퀀스 순, 최대 20개).

드롭다운(`MentionPopover`)은 `textarea`의 `relative` 컨테이너 안에서 `absolute bottom-full`로 배치되어 편집 영역 위쪽에 떠 있는다. 키보드 처리(↑/↓/Enter/Tab/Escape)는 `claude-chat-panel.tsx`의 `onKeyDown`에서 멘션이 열려 있을 때만 가로채며, 닫혀 있을 때의 Enter는 기존대로 메시지를 제출한다. 선택 결과는 `@<project-relative path>` (디렉토리는 뒤에 `/`) 형태로 원 토큰을 치환한 뒤 커서를 삽입 지점 뒤로 이동시킨다.

`@` 참조는 Claude Agent SDK(`sendQuery(prompt)`)에 원문 그대로 전달된다 — GUI는 참조를 파일 내용으로 미리 확장하지 않으며, 해석은 CLI/SDK의 표준 문법 처리에 위임한다.

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

Claude가 스트리밍으로 전달한 코드·HTML·Markdown·SVG는 물론, Write/Edit/MultiEdit 도구 호출로 저장한 이미지·PDF·Word·Excel·PowerPoint 파일까지 "아티팩트"로 모아 복사·미리보기·내보내기를 제공하는 교차 절단(cross-cutting) 모듈이다.

### 모듈 구성

| 파일 | 역할 |
|------|------|
| `src/lib/claude/artifact-extractor.ts` | 정규식 기반 텍스트 추출기. 펜스 코드 블록, 독립 `<!doctype html>` 문서, 독립 `<svg>` 요소를 추출하며 `classifyByPath`/`isBinaryKind`/`titleFromPath` 헬퍼로 확장자→kind 매핑과 바이너리 판별을 제공한다. 텍스트 기반 아티팩트는 `{messageId}:{index}` 안정 ID를 사용한다. |
| `src/lib/claude/artifact-from-tool.ts` | `Write`/`Edit`/`MultiEdit` tool_use 블록을 아티팩트 레코드로 변환. Write는 `file_path` 확장자로 kind를 결정해 텍스트 본문을 인라인 스냅샷으로 저장하거나(`source: "inline"`) 바이너리는 `source: "file"`로 경로만 보관한다. Edit/MultiEdit은 기존 인라인 아티팩트에 `old_string → new_string` 패치를 적용한다. 모든 tool_use 아티팩트 ID는 `file:{absolutePath}` 형식이라 같은 파일에 대한 반복 호출이 한 항목으로 합쳐진다(FR-1008). |
| `src/stores/use-artifact-store.ts` | zustand 스토어. `artifacts`, `isOpen`, `autoOpen`, `highlightedId`, `pendingTurn`, `modalSize` 상태와 `extractFromMessage`/`ingestToolUse`/`findByFilePath`/`flushPendingOpen`/`open`/`close`/`setAutoOpen`/`setModalSize`/`remove`/`clear` 액션 제공. `persist` v3 미들웨어가 `claudegui-artifacts` 키에 최대 200개의 아티팩트와 함께 `autoOpen`·`modalSize`를 영속화하며, `onRehydrateStorage` 훅이 복원된 `filePath`들을 서버 레지스트리에 재등록한다(FR-1009). |
| `src/lib/claude/artifact-export.ts` | `copyArtifact`, `availableExports`, `exportArtifact`를 노출. 인라인 텍스트는 소스/HTML/Word(`.doc`)/PDF/PNG(SVG→`canvas.toBlob`) 내보내기를 제공한다. PDF는 `printViaIframe()`이 비가시 `<iframe>`에 `srcdoc`(또는 1.5MB 초과 시 blob URL)로 독립 HTML을 로드하고, 이미지 `decode()` 대기 + 2프레임 RAF 후 `contentWindow.print()`를 호출한 뒤 `afterprint`와 60초 안전 타이머로 정리한다. 생성 HTML은 `@page`/`@media print` 규칙을 포함한다. 파일 기반 바이너리 아티팩트는 `downloadBinaryFile`이 `/api/artifacts/raw` → `/api/files/raw` 폴백으로 원본 파일을 다운로드한다. |
| `src/lib/claude/artifact-registry.ts` | 서버 측 인-프로세스 아티팩트 경로 레지스트리(최대 1024). `registerArtifactPath`, `isArtifactPathRegistered` 등을 제공한다. |
| `src/lib/claude/artifact-url.ts` | 클라이언트 전용 URL/바이트 헬퍼. `/api/artifacts/raw`를 먼저 시도하고 실패 시 `/api/files/raw`로 폴백한다. |
| `src/app/api/artifacts/register/route.ts` | `POST /api/artifacts/register`. `{ paths: [] }`를 받아 `fs.stat()` 검증 후 레지스트리에 등록. 레이트 리밋과 50MB 상한을 적용한다. |
| `src/app/api/artifacts/raw/route.ts` | `GET /api/artifacts/raw?path=<abs>`. 레지스트리에 등록된 경로에 한해 MIME을 판정해 바이트를 반환한다. `docx`/`xlsx`/`xlsm`/`pptx`/`pdf`/이미지 MIME 테이블 포함. |
| `src/components/panels/preview/docx-preview.tsx` | `mammoth/mammoth.browser`로 DOCX → HTML 변환 후 `sandbox=""` iframe에 주입. |
| `src/components/panels/preview/xlsx-preview.tsx` | SheetJS(`xlsx`)로 각 시트를 `sheet_to_html` 변환, 탭 기반 전환 UI 제공. |
| `src/components/panels/preview/pptx-preview.tsx` | JSZip으로 OOXML을 해제하고 `ppt/slides/slideN.xml`의 `<a:t>` 텍스트 프레임, 관련 `_rels` 이미지를 추출해 16:9 슬라이드 뷰로 렌더링. |
| `src/components/panels/preview/pdf-preview.tsx` | `srcOverride` 프롭으로 아티팩트 URL(`/api/artifacts/raw?path=…`)을 받아 기존 react-pdf 뷰어를 재사용. |
| `src/components/modals/artifacts-modal.tsx` | Radix Dialog 기반 갤러리. 10종 종류 배지, Preview/Source 토글, 종류별 렌더러 라우팅, 파일 기반 fallback 카드를 담당한다. |

### 데이터 흐름

```text
WebSocket /ws/claude
   └─► use-claude-store.handleServerMessage
         ├─ assistant message
         │    ├─ text  → useArtifactStore.extractFromMessage(msgId, sid, text)
         │    │           └─► artifact-extractor.extractArtifacts
         │    │                 └─► new text artifacts → pendingTurn[]
         │    └─ tool_use (Write / Edit / MultiEdit)
         │         └─► useArtifactStore.ingestToolUse(toolMsgId, sid, tool)
         │               ├─► artifactFromWrite / artifactFromEdit
         │               │    └─► dedupe by `file:{absolutePath}`
         │               └─► POST /api/artifacts/register (filePath)
         └─ result
              └─► useArtifactStore.flushPendingOpen()
                    └─► if autoOpen && pendingTurn.length > 0 → isOpen = true

useArtifactStore (localStorage rehydrate)
   └─► onRehydrateStorage → POST /api/artifacts/register(paths[])

ArtifactsModal preview
   └─► fetchArtifactBytes(filePath)
         ├─► GET /api/artifacts/raw?path=<abs>   (registry hit)
         └─► GET /api/files/raw?path=<abs>       (project-scoped fallback)
```

세션 복원(`useClaudeStore.loadSession`)은 `extractFromMessage(..., { silent: true })`로 호출하여 `pendingTurn`을 건드리지 않고, 과거 대화의 텍스트 아티팩트만 갤러리에 복원한다. 파일 기반 아티팩트는 `onRehydrateStorage`에서 재등록된다.

### 설계상의 선택

- **교차 프로젝트 접근 경로** — Write/Edit가 만든 파일은 현재 프로젝트 샌드박스(`resolveSafe`)와 무관하게 세션 동안 `/api/artifacts/raw`로 읽을 수 있어야 한다. 서버는 "레지스트리에 미리 등록된 절대 경로만" 읽는 좁은 화이트리스트 방식을 사용해 `resolveSafe`를 우회하는 동시에 임의 파일 읽기를 허용하지 않는다. 레지스트리는 인-프로세스 Map이라 서버 재시작 시 비워지며, 클라이언트의 하이드레이션 경로가 이를 복원한다.
- **localStorage 보호** — 바이너리 아티팩트를 base64로 저장하면 브라우저 할당량(≈5MB)을 즉시 초과하므로, 바이너리 종류는 `content`를 비우고 `filePath`만 보관한다. 텍스트 종류는 기존처럼 인라인으로 저장되어 프로젝트를 전환해도 본문을 복원할 수 있다.
- **동적 import로 오피스 번들 지연 로드** — `mammoth`(≈800KB), `xlsx`, `jszip`은 해당 종류의 아티팩트를 처음 열람할 때만 번들링되어 초기 페이지 로드에 영향이 없다.
- **`result` 시점에만 자동 팝업** — 스트리밍 중에 모달이 튀어오르면 가독성을 해치므로, Agent SDK의 `result` 이벤트에서 한 번만 `flushPendingOpen`을 호출한다.
- **복구 가능한 실패** — PNG/PDF 경로에서 `window.open`이 차단되거나 `<canvas>` 변환이 실패하면 소스 HTML 다운로드로 폴백한다. 파일 기반 바이너리 아티팩트의 preview가 실패하면 Export 단일 버튼이 포함된 metadata 카드로 전환된다.
