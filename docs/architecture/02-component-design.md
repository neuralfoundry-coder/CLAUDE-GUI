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

    {isDesktop ? (
      <!-- 데스크톱 레이아웃 (≥ 1280px): 5패널 모두 collapsible -->
      <PanelGroup direction="horizontal">
        <Panel id="file-explorer" ref={fileExplorerRef} collapsible collapsedSize={0}>
          <FileExplorerPanel />
        </Panel>

        <PanelResizeHandle onDoubleClick={resetAdjacentPanels} />

        <Panel id="center">
          <PanelGroup direction="vertical">
            <Panel id="editor" ref={editorRef} collapsible collapsedSize={0}>
              <EditorPanel />
            </Panel>

            <PanelResizeHandle onDoubleClick={resetAdjacentPanels} />

            <Panel id="terminal" ref={terminalRef} collapsible collapsedSize={0}>
              <TerminalPanel />
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle onDoubleClick={resetAdjacentPanels} />

        <Panel id="claude" ref={claudeRef} collapsible collapsedSize={0}>
          <ClaudeChatPanel>
            <ClaudeTabBar />          {/* 탭 생성/닫기/이름 변경/컨텍스트 메뉴 */}
            <ClaudeChatView />        {/* 활성 탭의 메시지·입력·스트리밍 영역 */}
            <SessionInfoBar tabId={activeTabId} />
          </ClaudeChatPanel>
        </Panel>

        <PanelResizeHandle onDoubleClick={resetAdjacentPanels} />

        <Panel id="preview" ref={previewRef} collapsible collapsedSize={0}>
          <PreviewPanel />
        </Panel>
      </PanelGroup>
    ) : (
      <!-- 모바일 레이아웃 (< 1280px) -->
      <MobileShell />
    )}

    <StatusBar />
    <CommandPalette />                 (cmdk modal)
    <PermissionRequestModal />         (when Claude requests permission)
  </RootLayout>
</App>
```

**패널 접힘 구현**: 5개 패널 모두 `react-resizable-panels`의 `collapsible` 프롭과 `ImperativePanelHandle` 명령형 API를 사용한다. 조건부 렌더링(`{!collapsed && <Panel />}`)이 아닌 항상 렌더링 + `collapse()`/`expand()` 호출 방식으로, 패널 접힘 시에도 내부 상태(터미널 버퍼, 에디터 모델 등)가 보존된다. 스토어의 `setCollapsed` 액션이 `useEffect`를 통해 `ImperativePanelHandle.collapse()`/`expand()`로 동기화된다.

**더블클릭 리사이즈 리셋**: 각 `PanelResizeHandle`의 `onDoubleClick`에 `handleDoubleClickReset` 핸들러가 연결되어 인접 패널을 `DEFAULT_PANEL_SIZES`로 복원한다.

**반응형 모바일 레이아웃**: `useMediaQuery('(min-width: 1280px)')` 훅이 뷰포트 너비를 감지한다. 1280px 미만에서는 `<MobileShell />`이 하단 탭 바와 단일 패널 뷰를 렌더링한다. 5개 탭(Files, Editor, Terminal, Claude, Preview)으로 구성되며 `useLayoutStore.mobileActivePanel`이 현재 활성 탭을 관리한다.

**새 파일**:
- `src/hooks/use-media-query.ts` — `useMediaQuery` 훅. `window.matchMedia` 리스너로 뷰포트 변경을 추적. SSR에서는 `true`(데스크톱 우선) 반환.
- `src/components/layout/mobile-shell.tsx` — 모바일 탭 레이아웃. 5개 `PanelId` 탭과 각 패널 컴포넌트를 하단 탭 바로 전환.

### 동적 패널 분할 시스템 (FR-108, FR-109)

데스크톱 레이아웃은 고정된 `PanelGroup` 트리 대신 **재귀적 분할 트리**(`SplitNode` / `LeafNode`)로 구성된다. `useSplitLayoutStore`가 트리 구조를 관리하며, `SplitLayoutRenderer`가 트리를 재귀적으로 `react-resizable-panels`의 `PanelGroup` / `Panel`로 렌더링한다.

```
SplitLayoutRenderer(node)
├── SplitNode → <PanelGroup direction={direction}>
│   ├── <Panel>{SplitLayoutRenderer(child[0])}</Panel>
│   ├── <PanelResizeHandle />
│   └── <Panel>{SplitLayoutRenderer(child[1])}</Panel>
│
└── LeafNode → <Panel collapsible>
        <LeafPanel panelType={type} leafId={id} />
    </Panel>
```

**탭 드래그 앤 드롭**: `@dnd-kit/core` + `@dnd-kit/sortable`를 사용하여 탭 재정렬 및 분할 생성을 지원한다. `DndProvider`가 데스크톱 레이아웃을 감싸며, 각 탭 바는 `SortableContext`로 감싸져 있다. 드롭 존은 패널 영역의 25% 가장자리(상/하/좌/우)와 중앙(50%)으로 나뉘며, `DropZoneOverlay`가 시각적 피드백을 제공한다.

**새 파일**:
- `src/stores/use-split-layout-store.ts` — 분할 트리 상태 관리. `splitLeaf`, `removeLeaf`, `updateRatio`, 패널 타입별 접힘 제어.
- `src/components/layout/split-layout-renderer.tsx` — 재귀적 레이아웃 렌더러.
- `src/components/layout/leaf-panel.tsx` — 리프 노드를 해당 패널 컴포넌트로 라우팅.
- `src/components/dnd/dnd-provider.tsx` — `DndContext` 래퍼. 탭 재정렬과 분할 생성 처리.
- `src/components/dnd/sortable-tab-item.tsx` — `useSortable` 기반 개별 탭 래퍼.
- `src/components/dnd/drop-zone-overlay.tsx` — 드래그 시 드롭 존 시각적 하이라이트.
- `src/hooks/use-drop-zones.ts` — 포인터 좌표를 5개 드롭 존으로 변환하는 유틸리티.

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
│       ├── browserId 추출 (URL ?browserId= 쿼리)
│       ├── /_next/webpack-hmr          → Next.js HMR (dev only)
│       ├── /ws/terminal                → PTY Session Handler (browserId별 cwd)
│       ├── /ws/claude                  → Agent SDK Handler (browserId별 cwd)
│       └── /ws/files                   → @parcel/watcher Broadcaster (browserId별 루트)
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
├── editor-panel.tsx                # 컨테이너 (헤더 바 + 탭 바 + 에디터)
├── editor-tab-bar.tsx              # 탭 목록
├── editor-settings-dropdown.tsx    # 에디터 설정 드롭다운 (기어 아이콘)
├── monaco-editor-wrapper.tsx       # Monaco 래퍼 (확장 옵션 + 커서 추적)
├── claude-completion-provider.ts   # Claude AI 인라인 자동완성 프로바이더
├── diff-accept-bar.tsx             # AI diff 수락/거절 UI
src/lib/editor/
└── language-map.ts                 # 파일 확장자 → 언어 매핑 유틸리티
```

### 상태 관리

```typescript
// useEditorStore (Zustand)
interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  cursorLine: number | null;        // 현재 커서 행
  cursorCol: number | null;         // 현재 커서 열
  completionLoading: boolean;       // AI 자동완성 로딩 중
  openFile(path: string): void;
  closeTab(id: string): void;
  setActiveTab(id: string): void;
  setCursorPosition(line: number, col: number): void;
  setCompletionLoading(loading: boolean): void;
  applyClaudeEdit(path: string, modified: string): void;
}

interface EditorTab {
  id: string;
  path: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  locked: boolean;     // Claude 편집 중
  diff?: DiffState;    // AI 변경사항 대기 중
}

// useSettingsStore (Zustand, persist)
// 에디터 관련 설정:
//   editorWordWrap, editorTabSize, editorUseSpaces,
//   editorMinimapEnabled, editorRenderWhitespace,
//   editorStickyScroll, editorBracketColors,
//   editorCompletionEnabled, editorCompletionDelay
```

### 모델 관리

- 파일별로 독립 Monaco 모델 생성 (`monaco.editor.createModel`)
- 탭 닫을 때 모델 `dispose()` 호출 (메모리 누수 방지)
- 탭 간 전환 시 에디터 인스턴스에 모델만 교체 → 커서/스크롤/undo 자동 유지

### AI 인라인 자동완성

- `claude-completion-provider.ts`에서 Monaco `InlineCompletionsProvider`를 등록
- 사용자 타이핑 멈춤 후 디바운스(500ms) → WebSocket `completion_request` 전송
- 서버 사이드(`claude-handler.mjs`)에서 Agent SDK `query()`를 `maxTurns: 1`로 호출
- 응답을 ghost text로 표시, Tab으로 수락
- `AbortController`로 이전 요청 자동 취소
- 커서 전후 코드 컨텍스트(100줄/30줄) 윈도우로 대용량 파일 대응

### AI diff 처리

```typescript
// diff.status: 'pending' | 'streaming'
// 'streaming' — Claude가 아직 도구 입력을 스트리밍 중 (Accept/Reject 비활성화)
// 'pending'  — 도구 실행 완료, 사용자 승인 대기

// Claude가 Write/Edit/MultiEdit 실행 시 (use-claude-store.ts에서 자동 연결)
// 1. input_json_delta 스트리밍 → updateStreamingEdit(path, partial) → status:'streaming'
// 2. content_block_stop → applyClaudeEdit(path, final) → status:'pending'

function applyClaudeEdit(path: string, newContent: string) {
  const tab = findTab(path);
  const original = tab.diff?.original ?? tab.content; // streaming baseline 보존
  tab.diff = {
    original,
    modified: newContent,
    status: 'pending',
    hunks: computeHunks(original, newContent),
    acceptedHunkIds: allHunkIds,
  };
  tab.locked = true;
}

function updateStreamingEdit(path: string, partialContent: string) {
  // applyClaudeEdit과 동일하나 status:'streaming' 설정
}

// syncExternalChange 가드: tab.diff가 설정된 상태에서는 skip
function syncExternalChange(path: string) {
  const tab = findTab(path);
  if (tab.diff) return; // Claude diff 표시 중 — 덮어쓰지 않음
  // ... 기존 로직
}
```

### 자동 패널 확장

- Claude가 파일을 편집하면 에디터 패널이 접혀있을 경우 자동으로 펼친다.
- HTML/SVG/MD 파일의 경우 프리뷰 패널도 자동으로 펼친다.
- `forwardToolToEditor()` 헬퍼가 `useLayoutStore.setCollapsed()`를 호출한다.

### 스트리밍 활동 표시

- 채팅 패널에 `StreamingActivityBar`를 추가하여 현재 편집 중인 파일을 표시한다.
- DiffAcceptBar에 shimmer 프로그레스 바와 "Claude is editing..." 인디케이터를 추가하였다.

## 2.5 TerminalPanel 컴포넌트

### 설계 개요

`TerminalPanel`은 React 수명주기가 PTY 프로세스를 건드리지 못하게 만들기 위해 **얇은 attach 패턴**을 따른다. xterm.js `Terminal` 인스턴스와 WebSocket 연결은 모두 컴포넌트 트리 바깥의 `TerminalManager` 싱글턴이 소유하며, React 컴포넌트는 단지 DOM 호스트를 제공할 뿐이다.

- **소유**: `TerminalManager` 싱글턴(`src/lib/terminal/terminal-manager.ts`)
- **attach point**: `XTerminalAttach`(`src/components/panels/terminal/x-terminal.tsx`) — Radix `ContextMenu`로 감싼 호스트 div. 호스트 `<div>`의 배경은 `style={{ background: 'var(--terminal-bg)' }}`로 CSS 변수에 바인딩되어 테마 토글·탭 전환·첫 마운트에서 검정 플래시를 내지 않는다(FR-419).
- **컨테이너 + 탭 UI**: `TerminalPanel`(`src/components/panels/terminal/terminal-panel.tsx`) — 인라인 rename, cwd 라벨, unread 인디케이터, 프로젝트 전환 배너, Restart 칩, 스플릿 pane 렌더러, "Open in system terminal" `ExternalLink` 버튼 (`FR-420`)
- **검색 오버레이**: `TerminalSearchOverlay`(`src/components/panels/terminal/terminal-search-overlay.tsx`)
- **테마 팔레트**: `src/lib/terminal/terminal-themes.ts` (`TERMINAL_THEMES`) — 단일 소스. `ConcreteTheme` 타입(`'system'`을 제외한 실제 색상 테마)과 `resolveTheme()` 유틸리티를 노출한다. `resolveTheme(theme)`는 `'system'`이면 `window.matchMedia('(prefers-color-scheme: dark)')`를 평가해 `'dark'`/`'light'`로 변환하고, 그 외에는 그대로 반환한다. `TerminalManager`가 import 해 `setTheme`으로 전파하며, `globals.css`의 `--terminal-bg`/`--terminal-fg` CSS 변수와 hex 파리티를 유지해야 한다(`tests/unit/terminal-themes-contrast.test.ts`가 검증).
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
| 소켓 open | `createSocket`의 `onOpen` 콜백이 `resize` 프레임을 송신. OSC 7 emitter 스니펫 주입은 서버측에서 PTY spawn 직후 수행되므로 클라이언트에서는 별도 처리 없음. |
| React attach | `XTerminalAttach`의 `useEffect` → `terminalManager.attach(id, host)`. 매니저가 소유한 persistent `<div>`를 host에 append 후 첫 호출에 한해 `term.open()`. `requestAnimationFrame`으로 non-zero size를 기다려 `fit()` → resize 전송 → `focus()`. WebGL 애드온은 이 시점에 지연 로드. |
| 탭 전환 | 스토어 `setActiveSession` → `terminalManager.activate(id)` → `fit()` + `focus()`. searchOverlayOpen은 false로 리셋. |
| 폰트 크기 변경 | 매니저 구독 콜백 → `setFontSize(px)` → 모든 인스턴스의 `term.options.fontSize` 변경 + `fit()`. PTY 재시작 없음. |
| 패널 collapse | `<TerminalPanel>` unmount → `XTerminalAttach.useEffect` cleanup → `terminalManager.detach(id)`. 매니저는 persistent `<div>`를 DOM에서 떼어내기만 하고 xterm/WS는 유지. |
| 소켓 error | `createSocket`의 `onError` 콜백이 콘솔에 경고 로그를 기록한다. 서버 `error` control frame 수신 시 `connecting` 상태이면 즉시 `closed`로 전이한다. |
| 연결 타임아웃 | WebSocket 핸드셰이크 15초 초과 시 `connectTimers` 맵의 타이머가 세션을 `closed`로 전이하고 소켓을 닫는다. 타이머는 `onOpen`/`onClose`에서 클리어된다. |
| 소켓 unexpected close | `createSocket`의 `onClose` 콜백이 status를 `closed`로 전이, xterm 버퍼에 `[connection to PTY lost]` 라인 기록. **재연결 시도 없음**. |
| 쉘 종료 | 서버가 `{type:"exit", code}` 제어 프레임 전송 → `applyServerControl`이 status를 `exited`로 전이. 탭은 사용자가 닫을 때까지 유지. |
| Restart | `restartSession(id)` — `closed`/`exited`에서만 허용. xterm `dispose` 없이 스크롤백 유지, `─── restarted at HH:MM:SS ───` separator 삽입, pendingBytes/paused/exitCode 리셋, status `connecting`, `createSocket(inst)` 재호출. OSC 7 스니펫 주입은 서버측에서 새 PTY spawn 시 자동 수행된다. |
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

### 패널별 확대/축소 (FR-807)

각 패널은 독립적인 줌 배율(`panelZoom: Record<PanelId, number>`)을 `useLayoutStore`에 저장한다. 포커스 추적은 `usePanelFocus` 훅(`src/hooks/use-panel-focus.ts`)이 `onMouseDown`/`onFocus` 핸들러를 반환하여 각 패널 루트 `<div>`에 바인딩하는 방식으로 구현한다.

**줌 적용 방식**:
- 에디터/터미널: `fontSize × panelZoom[panel]`을 Monaco/xterm `fontSize` 옵션에 전달. `TerminalManager`는 `useLayoutStore.subscribe`에서 `panelZoom.terminal` 변화도 감지.
- 파일 탐색기 / Claude 채팅 / 프리뷰: 콘텐츠 영역에 CSS `zoom` 프로퍼티를 조건부 적용 (`zoom !== 1`일 때만).

**UI 컨트롤**: `PanelZoomControls` 컴포넌트(`src/components/panels/panel-zoom-controls.tsx`)가 `−` / 퍼센트 / `+` 버튼을 렌더링. 헤더 내부에 배치되며, `onMouseDown` stopPropagation으로 줌 버튼 클릭 시 패널 포커스가 이동하지 않게 한다.

**단축키**: `Cmd+Shift+=`/`-`/`0` (macOS) · `Ctrl+Shift+=`/`-`/`0` (기타)로 포커스된 패널의 확대/축소/리셋을 수행. `use-global-shortcuts.ts`에 등록.

### 검색 오버레이 (FR-405)

`TerminalInstance.searchAddon` 인스턴스를 유지해 `findNext`/`findPrevious`/`clearDecorations`를 공개 메서드로 노출한다. `TerminalSearchOverlay` 컴포넌트가 토글 상태(대소문자/단어/regex)와 100 ms 디바운스된 인크리멘털 검색을 관리한다. 닫힐 때 데코레이션을 제거하고 `terminalManager.activate(id)`로 xterm에 포커스를 복원한다.

## 2.6 PreviewPanel 컴포넌트

### 파일 구조

```
src/components/panels/preview/
├── preview-panel.tsx               # 컨테이너 + 헤더(소스/렌더 토글, 다운로드)
├── preview-router.tsx              # 타입별 렌더러 선택 + viewMode 분기
├── html-preview.tsx                # iframe srcdoc
├── html-editor.tsx                 # 분할 뷰 HTML 편집기 (FR-616)
├── pdf-preview.tsx                 # react-pdf
├── markdown-preview.tsx            # react-markdown
├── markdown-editor.tsx             # 분할 뷰 Markdown 편집기 (FR-616)
├── image-preview.tsx               # 줌/팬
├── slide-preview.tsx               # 멀티페이지 세로 스크롤 + 선택 + Edit 모드
├── source-preview.tsx              # highlight.js 기반 소스 뷰 (FR-614)
├── live-html-preview.tsx           # 스트리밍 전용 경로
└── preview-download-menu.tsx       # 즉시 다운로드 드롭다운
```

`usePreviewStore`는 `currentFile`/`pageNumber`/`zoom`/`fullscreen` 외에 `viewMode: 'rendered' | 'source'` 필드를 유지한다(FR-614). 기본값은 `'rendered'`이며 `setFile` 호출 시 자동으로 `'rendered'`로 리셋되어 파일 전환 시 소스 뷰가 고착되지 않는다. `isSourceToggleable(type)` 헬퍼가 `html`/`markdown`/`slides`에만 토글을 허용한다. `renderedHtml: string | null` 필드(FR-613)는 파일 기반 프리뷰 컴포넌트(docx/xlsx/pptx/image)가 렌더링한 HTML을 캐싱하여 크로스 포맷 내보내기(PDF/HTML/Doc)를 가능하게 한다. `setFile` 호출 시 `null`로 초기화된다.

슬라이드 편집을 위해 `slideEditMode: boolean`과 `selectedSlideIndex: number`(0-based) 필드가 추가되었다(FR-702, FR-703). `setFile` 호출 시 두 값 모두 초기화(`false`, `0`)된다. Edit 토글 버튼은 `type === 'slides' && viewMode !== 'source'`일 때만 헤더에 표시된다.

HTML/Markdown 직접 편집을 위해 `editMode: boolean` 필드가 추가되었다(FR-616). `setFile` 호출 시 `false`로 초기화된다. Edit 토글 버튼은 `type === 'html' || type === 'markdown'`이고 `viewMode !== 'source'`일 때 헤더에 표시된다. 편집 모드에서는 분할 뷰(좌: textarea 코드 편집, 우: 실시간 프리뷰)를 제공하며, 1초 디바운스 자동 저장으로 에디터 탭과 디스크에 동기화한다.

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
      : <SlidePreview content={content} onContentChange={handleSlideContentChange} />;

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

### SlidePreview 구현 (멀티페이지 세로 스크롤 + Edit 모드)

```typescript
// 1. HTML에서 <section> 요소를 파싱하여 개별 슬라이드 배열로 변환
const sections = parseSections(content); // string[]

// 2. 각 슬라이드를 카드로 렌더 (세로 스크롤, 클릭 선택)
sections.map((sec, i) => (
  <SlideCard
    sectionHtml={sec}
    index={i}
    isSelected={i === selectedSlideIndex}
    onSelect={handleSelect}
  />
));

// 3. Edit 모드 진입 시 SlideEditor 표시
// - 프롬프트 입력 → getClaudeClient().sendQuery(instruction)
// - HTML 코드 편집 (<textarea>) + Cmd+S 저장
// - 실시간 프리뷰 (iframe srcDoc)
// - 저장 → reconstructHtml(original, updatedSections) → onContentChange
```

`SlideCard`는 각 `<section>`을 reveal.js CSS가 적용된 축소 iframe으로 렌더하며, 선택 상태에 따라 `border-primary` 강조를 적용한다. `SlideEditor`는 프롬프트 입력, HTML 코드 편집기, 실시간 프리뷰를 3분할로 제공하며, 저장 시 `reconstructHtml`로 원본 HTML을 재조합하여 에디터 탭과 디스크에 동기화한다.

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

- **어댑터** (`src/lib/preview/preview-download.ts`): `(filePath, type, content, renderedHtml?)` 입력을 `src/lib/claude/artifact-extractor.ts`의 `ExtractedArtifact` 모양으로 변환한다. 텍스트 프리뷰(`html`/`markdown`/`slides`, 그리고 `.svg` 이미지)는 `source: 'inline'`로, 나머지 바이너리(`pdf`/`image`(SVG 제외)/`docx`/`xlsx`/`pptx`)는 `source: 'file'` + `filePath`로 빌드된다. 이후 `availableExports()` / `exportArtifact()` (`src/lib/claude/artifact-export.ts`)에 위임하여 기존 다운로드·인쇄 파이프라인을 그대로 재사용한다. `renderedHtml`이 존재하면 `exportWithRenderedHtml()`로 라우팅하여 파일 기반 타입의 크로스 포맷 내보내기(PDF/HTML/Doc)를 처리한다.
- **렌더링된 HTML 캐시** (`usePreviewStore.renderedHtml`): 프리뷰 컴포넌트(docx/xlsx/pptx/image)는 렌더링 시 생성한 HTML을 스토어에 게시한다. 파일이 전환되면(`setFile`) 자동으로 `null`로 초기화된다. 이 캐시가 존재하면 `availableExports(artifact, true)`가 "Original file" 외에 PDF/HTML/Doc 옵션을 추가로 반환한다.
- **PDF 직접 인쇄** (`printPdfDirect()`): PDF 파일은 원본 바이트를 숨겨진 iframe에 로드하고 `contentWindow.print()`를 호출하여 브라우저 인쇄 대화상자를 직접 띄운다. PDF 내보내기 설정 다이얼로그(`PdfExportDialog`)는 건너뛴다.
- **헤더 컴포넌트** (`src/components/panels/preview/preview-download-menu.tsx`): 다음 우선순위로 다운로드 소스를 해석한다.
  1. **라이브 모드 우선 (`showingLive`)**: `useLivePreviewStore.autoSwitch && mode !== 'idle'`일 때, 필드를 이 순서로 확정한다. filePath = `generatedFilePath ?? 'live-preview.html'`, `type = 'html'`, `content = (editorTab[generatedFilePath]?.content) ?? buffer`. 버퍼가 빈 문자열이면 메뉴를 렌더링하지 않는다.
  2. **일반 파일 프리뷰**: `usePreviewStore.currentFile` 또는 활성 에디터 탭 경로에서 `PreviewType`을 도출하고, 텍스트 기반 타입(`html`/`markdown`/`slides` + `.svg`)은 편집기 탭 in-memory 내용을 먼저 시도하고 없으면 `filesApi.read()`로 지연 로드한다. 파일 기반 바이너리 타입은 content를 요구하지 않지만, `usePreviewStore.renderedHtml`을 함께 전달하여 크로스 포맷 내보내기를 활성화한다.
  3. 확정된 입력을 `previewDownloadOptions(input)` → `downloadPreview(input, format)`으로 넘긴다.
- **라이브 스트리밍 표기**: `mode === 'live-code'`(아직 렌더 가능한 단위가 감지되지 않은 부분 청크)일 때는 드롭다운 헤더 캡션이 `Download (streaming…)`, `mode === 'live-html'`(렌더 가능)일 때는 `Download live buffer`, 비(非)라이브 상태에서는 `Download as`로 표시되어 사용자가 어느 상태에서 캡처한 스냅샷인지 인지할 수 있다. 라이브 HTML 버퍼는 `html-stream-extractor.ts`가 누적한 전체 문서(이전 페이지까지 생성 완료 + 현재 스트리밍 중인 꼬리)를 담으므로, 5페이지 문서 중 3페이지가 완성된 시점에서 다운로드하면 해당 시점의 전체 버퍼가 저장된다.
- **패널 배치** (`src/components/panels/preview/preview-panel.tsx`): 헤더 우측의 `Fullscreen` 토글 왼쪽에 `PreviewDownloadMenu`를 배치한다. `showLive` 여부와 무관하게 항상 렌더링된다.
- **포맷 매트릭스**는 FR-613에 정의된 표를 따른다. PDF 내보내기는 브라우저 인쇄 대화상자를 통해 OS "PDF로 저장"으로 라우팅되므로 서버 측 PDF 렌더러(Puppeteer 등)는 필요하지 않다.

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

### ClaudeChatPanel — 파일/이미지 드래그 앤 드롭 (FR-517)

`src/components/panels/claude/use-chat-drop.ts`의 `useChatDrop` 훅이 Claude 채팅 패널의 드래그 앤 드롭 및 클립보드 붙여넣기를 관리한다. 공유 유틸리티 `src/lib/fs/collect-files.ts`의 `collectFilesFromDataTransfer()`와 `hasFilePayload()`를 사용하여 `DataTransfer`에서 파일을 추출한다 (파일 탐색기 패널과 동일 유틸리티 공유).

파일이 드롭되면 `filesApi.mkdir('uploads')` → `filesApi.upload('uploads', files)` 순서로 호출하여 프로젝트 `uploads/` 디렉토리에 저장한 뒤, 서버가 반환한 `writtenPath`를 `@{path}` 형식으로 입력창에 삽입한다. 클립보드 붙여넣기 시 이미지는 `paste-{timestamp}.{ext}` 파일명으로 동일 경로에 업로드된다.

UI 구성:
- `DropOverlay`(`drop-overlay.tsx`): 드래그 중 패널 전체에 반투명 오버레이를 표시하여 드롭 가능 영역을 안내한다.
- `AttachedFilesBar`(`attached-files-bar.tsx`): 업로드된/업로드 중인 파일을 칩 형태로 입력창 위에 표시하며, 각 칩에 상태 아이콘(스피너/체크/에러)과 제거 버튼을 포함한다.
- 업로드 중에는 전송 버튼이 비활성화되며, 메시지 전송 시 모든 칩이 초기화된다.

## 2.8 상태 관리 (Zustand Stores)

### useLayoutStore

```typescript
type Theme = 'dark' | 'light' | 'high-contrast' | 'retro-green' | 'system';
type PanelId = 'fileExplorer' | 'editor' | 'terminal' | 'claude' | 'preview';

interface LayoutState {
  // 패널 크기 (%)
  fileExplorerSize: number;
  editorSize: number;
  terminalSize: number;
  previewSize: number;

  // 접힘 상태 — 5개 패널 모두 접힘 가능
  fileExplorerCollapsed: boolean;
  editorCollapsed: boolean;
  terminalCollapsed: boolean;
  claudeCollapsed: boolean;
  previewCollapsed: boolean;

  // 테마 — 'system'은 OS 설정(prefers-color-scheme)을 따름
  theme: Theme;

  // 모바일 — < 1280px에서 활성 탭
  mobileActivePanel: PanelId;

  // 패널별 확대/축소 (FR-807)
  focusedPanel: PanelId | null;  // 현재 포커스된 패널 (ephemeral, persist 제외)
  panelZoom: Record<PanelId, number>;  // 패널별 줌 배율 (기본 1.0, 범위 0.5–2.0)

  // 액션
  setPanelSize(panel: string, size: number): void;
  togglePanel(panel: PanelId): void;
  setCollapsed(panel: PanelId, collapsed: boolean): void;
  resetPanelSizes(): void;
  setTheme(theme: Theme): void;
  setMobileActivePanel(panel: PanelId): void;
  setFocusedPanel(panel: PanelId | null): void;
  increasePanelZoom(panel: PanelId): void;
  decreasePanelZoom(panel: PanelId): void;
  resetPanelZoom(panel: PanelId): void;
}

// persist 미들웨어 적용 (v4 마이그레이션: panelZoom, focusedPanel 추가)
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({ ... }),
    { name: 'claudegui-layout', version: 4 }
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
interface ClaudeTab {
  id: string;            // 탭 고유 ID (UUID)
  name: string;          // 탭 표시 이름 (첫 메시지 기반 자동 명명)
  sessionId: string | null;  // 첫 메시지 전송 전에는 null
}

interface ClaudeTabState {
  messages: ClaudeMessage[];
  isStreaming: boolean;
  pendingPermissionRequest: PermissionRequest | null;
  sessionStats: SessionStats | null;
}

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
  // 멀티탭 구조
  tabs: ClaudeTab[];                         // 열린 탭 목록
  activeTabId: string;                       // 현재 활성 탭 ID
  tabStates: Record<string, ClaudeTabState>; // tabId → 탭별 상태

  // 레거시 호환 (세션 목록 관리)
  sessions: ClaudeSession[];
  totalCost: Record<string, number>;
  tokenUsage: Record<string, { input: number; output: number }>;

  sendQuery(prompt: string): Promise<void>;
  resumeSession(id: string): void;
  forkSession(id: string): string;
  respondToPermission(approved: boolean): void;

  // 탭 관리 액션
  createTab(): string;
  closeTab(tabId: string): void;
  setActiveTab(tabId: string): void;
  renameTab(tabId: string, name: string): void;
}
```

멀티탭 리팩토링으로 기존의 플랫 상태(`activeSessionId`, `messages: Record<string, ClaudeMessage[]>`)가 `tabs` + `tabStates` 구조로 변경되었다. 각 탭은 독립된 세션과 메시지 목록을 가지며, 스트리밍 응답은 `session_id`를 기준으로 해당 탭의 `ClaudeTabState`에 라우팅된다. 새 탭은 `sessionId: null` 상태로 생성되고, 첫 메시지 전송 시 백엔드 세션이 자동으로 생성된다.

`sessionStats`는 Agent SDK가 보낸 `system.init` 이벤트(모델 이름)와 `result` 이벤트
(`num_turns`, `duration_ms`, `usage.*`, `total_cost_usd`)만을 기반으로 누적 저장된다.
SDK가 값을 주지 않은 필드는 `null`로 유지되며, UI에서는 "-"로 표시한다. 컨텍스트 윈도우
크기 같은 값은 하드코딩하지 않고, 오직 실제 응답에 담긴 값만 노출한다.

#### ModelSelector (Claude 패널 헤더)

`src/components/panels/claude/model-selector.tsx`는 Claude 채팅 패널 헤더에 모델 선택 드롭다운을 제공한다 (FR-512).

- `useSettingsStore.selectedModel`에서 현재 선택된 모델을 읽고 `setSelectedModel`로 변경한다.
- 모델 목록은 `src/lib/claude/model-specs.ts`의 `MODEL_SPECS` 상수에서 가져온다.
- 선택된 모델은 `useSettingsStore`의 `persist` 미들웨어를 통해 `localStorage`에 저장된다.
- 쿼리 전송 시 `claude-client.ts`의 `sendQuery`가 `selectedModel`을 읽어 `ClaudeQueryMessage.options.model`에 포함한다.
- 또한 `sendQuery`는 `useEditorStore`에서 활성 탭 정보를 읽어 `ClaudeQueryMessage.activeFile`에 포함한다 (FR-518). 서버 측에서는 이 정보를 `[Active file: <path>, line <n>:<col>]` 형태의 prefix로 프롬프트에 주입한다.
- shadcn/ui `DropdownMenu` 컴포넌트를 사용한다.

#### ChatFilterBar (Claude 패널)

`src/components/panels/claude/chat-filter-bar.tsx`는 메시지 영역 상단에 `MessageKind`별 필터 토글 바를 제공한다 (FR-515).

- Text, Tools, Auto, Errors 카테고리 각각 아이콘+레이블+개수 배지로 구성된 토글 버튼이다.
- `useClaudeStore.messageFilter`(Set\<MessageKind\>)와 `toggleFilter` 액션으로 상태를 관리한다.
- `claude-chat-panel.tsx`에서 `useMemo`로 `messages.filter(m => messageFilter.has(m.kind))`를 수행하여 필터링된 메시지만 렌더링한다.
- **성능**: 전체 `messages` 배열 대신 `useShallow`를 사용해 kind별 카운트만 파생 구독하여 스트리밍 중 불필요한 리렌더를 방지한다.
- 사용자 메시지(`role: 'user'`)는 필터와 무관하게 항상 표시된다.

#### ChatMessageItem (Claude 패널)

`src/components/panels/claude/chat-message-item.tsx`는 `ChatMessage`의 `kind`에 따라 특화된 렌더링을 제공한다.

- `text`: ReactMarkdown + remarkGfm으로 마크다운 렌더링. 스트리밍 중 블링크 커서 표시.
- `tool_use`: 접이식 도구명 헤더 + JSON args. 기본 접힌 상태.
- `auto_decision`: 방패 아이콘 + allow/deny 색상 레이블.
- `error`: 파괴적 배경 + 경고 아이콘.
- `system`: 봇 아이콘 + muted 텍스트.
- **성능**: `React.memo`로 래핑되어 `id`, `content`, `isStreaming` 변경 시에만 리렌더된다. 메시지 목록은 `@tanstack/react-virtual`로 가상화되어 뷰포트에 보이는 항목만 DOM에 마운트한다.

#### SessionInfoBar (Claude 패널)

`src/components/panels/claude/session-info-bar.tsx`는 `tabId` prop을 받아 해당 탭의
`ClaudeTabState.sessionStats`를 `useClaudeStore`에서 구독하여 Claude 채팅 패널 하단에 접이식 바 형태로 렌더링한다.

- 접힘(기본): `{model} · {turns} turns · ctx {percent} [progress bar] · {tokens} tok · {updated}` 한 줄 (높이 h-6). 컨텍스트 퍼센트 옆에 인라인 미니 프로그레스 바(40px, 3px)가 표시된다 (FR-514).
- 펼침: 세션 ID, 모델, 턴 수, 소요 시간, 입력/출력/캐시 읽기 토큰, 마지막 업데이트 시각. 추가로:
  - **컨텍스트 프로그레스 바**: 전체 너비 시각적 프로그레스 바와 수치 라벨 (FR-514)
  - **모델 스펙**: 최대 출력 토큰, 입력/출력 가격, 기능 뱃지 (FR-513). `src/lib/claude/model-specs.ts`의 `findModelSpec`으로 모델 스펙을 조회한다.
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
- **Persist 적용 대상**: `useLayoutStore`(사용자 레이아웃), `useArtifactStore`(생성 콘텐츠 캐시), `useSettingsStore`(터미널 폰트, 선택 모델 등 사용자 설정)
- **Persist 비적용**: editor/terminal/claude/preview (세션 데이터는 서버 재조회)
- **Persist 쓰로틀**: `useLayoutStore`는 1초 디바운스된 커스텀 스토리지 어댑터를 사용하여 패널 리사이즈 등 빈번한 상태 변경 시 `localStorage` 동기 I/O 부하를 최소화한다. `beforeunload` 시 즉시 플러시한다.

### 테마 관리 — 시스템 테마, color-scheme, FOUC 방지

`Theme` 타입은 `'dark' | 'light' | 'high-contrast' | 'retro-green' | 'system'`이다. `'system'`은 OS의 `prefers-color-scheme` 미디어 쿼리를 따른다.

- **`useTheme` 훅** (`src/hooks/use-theme.ts`): `useLayoutStore.theme`을 구독하고, `'system'`이면 `window.matchMedia('(prefers-color-scheme: dark)')`의 `change` 이벤트를 리스닝하여 `'dark'`/`'light'`로 해석한다. 해석된 테마 클래스를 `<html>`에 적용하고, `color-scheme` CSS 프로퍼티를 `'light'` 또는 `'dark'`로 설정하여 스크롤바·폼 컨트롤 등 네이티브 UI 요소가 앱 테마를 따르게 한다.
- **`resolveTheme()` 유틸리티** (`src/lib/terminal/terminal-themes.ts`): 서버 사이드 안전한 해석 함수. `'system'`을 `'dark'`/`'light'`로 변환한다. `TerminalManager`가 이를 사용해 테마 전환 시 올바른 xterm ITheme을 선택한다.
- **FOUC 방지**: `src/app/layout.tsx`의 `<head>` 인라인 `<script>`가 `localStorage`에서 저장된 테마를 읽어 React 하이드레이션 전에 `<html>` 클래스와 `color-scheme`을 즉시 설정한다. 이로써 첫 페인트에서 기본 다크 → 실제 테마로의 깜빡임(FOUC)이 발생하지 않는다.

---

## 2.9 ArtifactGallery 모듈 (FR-1000)

Claude가 스트리밍으로 전달한 코드·HTML·Markdown·SVG는 물론, Write/Edit/MultiEdit 도구 호출로 저장한 이미지·PDF·Word·Excel·PowerPoint 파일까지 "아티팩트"로 모아 복사·미리보기·내보내기를 제공하는 교차 절단(cross-cutting) 모듈이다.

### 모듈 구성

| 파일 | 역할 |
|------|------|
| `src/lib/claude/artifact-extractor.ts` | 정규식 기반 텍스트 추출기. 펜스 코드 블록, 독립 `<!doctype html>` 문서, 독립 `<svg>` 요소를 추출하며 `classifyByPath`/`isBinaryKind`/`titleFromPath` 헬퍼로 확장자→kind 매핑과 바이너리 판별을 제공한다. 텍스트 기반 아티팩트는 `{messageId}:{index}` 안정 ID를 사용한다. |
| `src/lib/claude/artifact-from-tool.ts` | `Write`/`Edit`/`MultiEdit` tool_use 블록을 아티팩트 레코드로 변환. Write는 `file_path` 확장자로 kind를 결정해 텍스트 본문을 인라인 스냅샷으로 저장하거나(`source: "inline"`) 바이너리는 `source: "file"`로 경로만 보관한다. Edit/MultiEdit은 기존 인라인 아티팩트에 `old_string → new_string` 패치를 적용한다. 모든 tool_use 아티팩트 ID는 `file:{absolutePath}` 형식이라 같은 파일에 대한 반복 호출이 한 항목으로 합쳐진다(FR-1008). |
| `src/stores/use-artifact-store.ts` | zustand 스토어. `artifacts`, `isOpen`, `autoOpen`, `highlightedId`, `pendingTurn`, `modalSize` 상태와 `extractFromMessage`/`ingestToolUse`/`findByFilePath`/`flushPendingOpen`/`open`/`close`/`setAutoOpen`/`setModalSize`/`remove`/`clear` 액션 제공. `persist` v3 미들웨어가 `claudegui-artifacts` 키에 최대 200개의 아티팩트와 함께 `autoOpen`·`modalSize`를 영속화하며, `onRehydrateStorage` 훅이 복원된 `filePath`들을 서버 레지스트리에 재등록한다(FR-1009). |
| `src/lib/claude/artifact-export.ts` | `copyArtifact`, `availableExports`, `exportArtifact`, `exportWithRenderedHtml`, `printPdfDirect`를 노출. 인라인 텍스트는 소스/HTML/Word(`.doc`)/PDF/PNG(SVG→`canvas.toBlob`) 내보내기를 제공한다. PDF는 `printViaIframe()`이 비가시 `<iframe>`에 `srcdoc`(또는 1.5MB 초과 시 blob URL)로 독립 HTML을 로드하고, 이미지 `decode()` 대기 + 2프레임 RAF 후 `contentWindow.print()`를 호출한 뒤 `afterprint`와 60초 안전 타이머로 정리한다. 생성 HTML은 `@page`/`@media print` 규칙을 포함한다. 파일 기반 바이너리 아티팩트는 `downloadBinaryFile`이 `/api/artifacts/raw` → `/api/files/raw` 폴백으로 원본 파일을 다운로드한다. `exportWithRenderedHtml()`은 프리뷰 컴포넌트가 캐싱한 렌더링 HTML을 인라인 HTML 아티팩트로 변환하여 PDF/HTML/Doc 내보내기를 처리한다. `printPdfDirect()`는 PDF 파일 원본을 숨겨진 iframe에 로드하여 직접 인쇄한다. `availableExports(artifact, hasRenderedHtml?)`는 두 번째 인수로 렌더링 HTML 존재 여부를 받아 파일 기반 타입에 추가 포맷 옵션을 동적으로 노출한다. |
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

---

## 2.10 원격 접근 모듈 (FR-1300)

서버의 바인딩 주소를 동적으로 전환하고 토큰 인증을 통해 외부 접속을 관리하는 모듈이다.

### 서버 측 컴포넌트

| 파일 | 역할 |
|------|------|
| `src/lib/server-config.mjs` | `~/.claudegui/server-config.json` 읽기/쓰기 |
| `src/lib/server-config-wrapper.ts` | API route에서 사용하는 TypeScript 래퍼 |
| `src/app/api/server/status/route.ts` | 서버 상태 조회 (hostname, port, LAN IPs) |
| `src/app/api/server/config/route.ts` | 설정 읽기/쓰기 |
| `src/app/api/server/restart/route.ts` | In-process 서버 재시작 트리거 |

### server.js 변경사항

- **설정 로드**: 시작 시 `~/.claudegui/server-config.json`에서 `remoteAccess`와 `remoteAccessToken` 읽기.
- **동적 hostname**: `remoteAccess: true`이면 `0.0.0.0`, 아니면 `127.0.0.1`. `HOST` 환경변수가 우선.
- **토큰 미들웨어**: HTTP 요청의 `Authorization: Bearer` 헤더와 WebSocket upgrade의 `?token=` 파라미터 검증. localhost 요청 면제.
- **In-process 재시작**: `global.__restartServer` 함수로 HTTP/WS 서버만 닫고 새 설정으로 재생성. Next.js `app.prepare()`는 재사용.

### 클라이언트 측 컴포넌트

| 파일 | 역할 |
|------|------|
| `src/stores/use-remote-access-store.ts` | 원격 접근 상태 관리 (Zustand, localStorage 미사용) |
| `src/components/modals/remote-access-modal.tsx` | 설정 모달 (토글, 토큰, 네트워크 정보) |
| `src/components/layout/header.tsx` | Globe 아이콘 버튼 (활성 시 녹색) |
| `src/components/layout/status-bar.tsx` | "Remote (IP)" 상태 표시 |
| `src/lib/runtime.ts` | Tauri 런타임 감지 (`isTauri()`) |

### 데이터 흐름

```
사용자 → Globe 버튼 → RemoteAccessModal
  ├─ 토글 변경 → PUT /api/server/config → ~/.claudegui/server-config.json
  └─ 적용 → POST /api/server/restart (standalone)
           └─ invoke('restart_server') (Tauri)
               ↓
       HTTP+WS 서버 닫기 → 설정 재로드 → 새 서버 listen
               ↓
       /api/health 폴링 → 상태 갱신 → 모달 닫기
```

---

## 2.11 MCP 서버 통합 모듈 (FR-1400, ADR-025)

### 서버 측 컴포넌트

| 파일 | 역할 |
|------|------|
| `src/lib/claude/settings-manager.ts` | `ClaudeSettings.mcpServers` 타입 정의 (`McpServerEntry`, `McpServerConfig`) |
| `server-handlers/claude-handler.mjs` | `runQuery()`에서 MCP 서버 로딩·전달, `getMcpServerStatus()` export |
| `src/app/api/mcp/route.ts` | `GET/PUT /api/mcp` — MCP 서버 설정 CRUD |
| `src/app/api/mcp/status/route.ts` | `GET /api/mcp/status` — SDK 세션의 MCP 연결 상태 조회 |

### 클라이언트 측 컴포넌트

| 파일 | 역할 |
|------|------|
| `src/stores/use-mcp-store.ts` | MCP 상태 관리 (Zustand, persist 미사용 — source of truth는 서버) |
| `src/components/modals/mcp-servers-modal.tsx` | MCP 서버 관리 모달 (추가/편집/삭제/토글, 프리셋 템플릿) |
| `src/components/layout/header.tsx` | Blocks 아이콘 버튼 (활성 서버 시 파란색) |
| `src/components/layout/status-bar.tsx` | "MCP: N servers" 상태 인디케이터 |
| `src/components/command-palette/command-palette.tsx` | "MCP: Manage Servers", "MCP: Refresh Status" 항목 |

### 데이터 흐름

```
사용자 → Blocks 버튼 / Cmd+K "MCP" → McpServersModal
  ├─ 서버 추가/편집/삭제/토글 → PUT /api/mcp → .claude/settings.json (mcpServers 병합)
  └─ 상태 조회 → GET /api/mcp/status → sdk.mcpServerStatus()
               ↓
Claude 쿼리 시:
  runQuery() → loadSettings() → enabled 서버 필터 → queryOptions.mcpServers
               ↓
  SDK가 MCP 프로세스 시작·통신·도구 라우팅 전담
               ↓
  MCP 도구 호출 → canUseTool(ADR-011) 권한 게이트 → 기존 허용/거부 모달
```

---

## 2.12 멀티 브라우저 독립 프로젝트 모듈 (FR-1500, ADR-027)

### 서버 측 컴포넌트

| 파일 | 역할 |
|------|------|
| `src/lib/project/browser-session-registry.mjs` | `browserId → { root, lastSeen }` 매핑 관리, refCount 기반 와처 공유, 30분 GC |
| `server.js` | WebSocket upgrade 시 `?browserId=` 추출, REST 미들웨어에서 `X-Browser-Id` 헤더 추출 |
| `server-handlers/files-handler.mjs` | `browserId`별 프로젝트 루트로 와처 구독, `project-changed` 이벤트를 해당 `browserId` 연결에만 전송 |
| `server-handlers/claude-handler.mjs` | `browserId`별 프로젝트 루트를 `runQuery()`의 cwd로 사용, `persistSession: false`로 세션 잠금 충돌 방지, `_activeQueries` Map으로 브라우저별 활성 Query 추적 |
| `server-handlers/terminal-handler.mjs` | `browserId`별 프로젝트 루트를 PTY spawn의 초기 cwd로 사용 |

### 클라이언트 측 컴포넌트

- 클라이언트는 탭 로드 시 `sessionStorage`에서 `browserId`를 조회하고, 없으면 UUID를 생성하여 저장한다.
- 모든 HTTP 요청에 `X-Browser-Id` 헤더를 추가한다.
- WebSocket 연결 URL에 `?browserId=<uuid>` 쿼리 파라미터를 포함한다.

### 데이터 흐름

```
탭 A (project-foo)                     탭 B (project-bar)
  │ browserId=aaa                        │ browserId=bbb
  │                                      │
  └─→ X-Browser-Id: aaa ──┐   ┌── X-Browser-Id: bbb ←─┘
                           ▼   ▼
                      server.js
                           │
                  BrowserSessionRegistry
                  ┌────────┴────────┐
                  │  aaa → /foo     │  bbb → /bar
                  └────────┬────────┘
                    ┌──────┴──────┐
               watcher(/foo)  watcher(/bar)   ← refCount 기반 공유
                    │              │
              project-changed → 탭 A만   project-changed → 탭 B만
```

### `browserId` 누락 시 폴백

`browserId`가 없는 요청(구 버전 클라이언트 등)은 기존 `ProjectContext` 글로벌 싱글톤(ADR-016)의 `getActiveRoot()`를 사용한다. 이를 통해 하위 호환성이 유지된다.
