# 3. 데이터 흐름

## 3.1 Claude 명령 실행 흐름

사용자가 Claude에게 쿼리를 전송하고 응답을 받는 전체 흐름이다.

```
사용자              Browser (React)           Server (Node.js)         Claude CLI
  │                     │                          │                       │
  │ 1. 프롬프트 입력      │                          │                       │
  │──────────────────▶│                          │                       │
  │                     │ 2. ws.send({type: query})│                       │
  │                     │─────────────────────────▶│                       │
  │                     │                          │ 3. Agent SDK query()  │
  │                     │                          │──────────────────────▶│
  │                     │                          │                       │
  │                     │                          │◀────────── assistant │
  │                     │ ws.send({type: message}) │   event (스트리밍)     │
  │                     │◀─────────────────────────│                       │
  │                     │                          │                       │
  │ 4. 텍스트 실시간 표시 │                          │                       │
  │◀──────────────────│                          │                       │
  │                     │                          │◀─────── tool_use     │
  │                     │                          │   (Edit, Bash, ...)  │
  │                     │                          │                       │
  │                     │                          │ [권한 필요? → UC-03] │
  │                     │ permission_request        │                       │
  │                     │◀─────────────────────────│                       │
  │ 5. 모달 표시         │                          │                       │
  │◀──────────────────│                          │                       │
  │                     │                          │                       │
  │ 6. 승인/거부 클릭     │                          │                       │
  │──────────────────▶│                          │                       │
  │                     │ permission_response       │                       │
  │                     │─────────────────────────▶│                       │
  │                     │                          │ (승인) 도구 실행       │
  │                     │                          │──────────────────────▶│
  │                     │                          │◀──────── 파일 수정    │
  │                     │                          │                       │
  │                     │                          │◀────────── result    │
  │                     │                          │ (cost, usage,         │
  │                     │                          │  modelUsage)          │
  │                     │ ws.send({type: result})  │                       │
  │                     │◀─────────────────────────│                       │
  │ 7. 비용/토큰/컨텍스트 │                          │                       │
  │    사용률 표시        │                          │                       │
  │◀──────────────────│                          │                       │
```

**관련 FR**: FR-501, FR-502, FR-504, FR-505

---

## 3.2 파일 편집 및 동기화 흐름

### 3.2.1 사용자 직접 편집

```
사용자            Monaco Editor       useEditorStore       Server (REST)      파일시스템
  │                   │                    │                   │                   │
  │ 1. 키 입력          │                    │                   │                   │
  │─────────────────▶│                    │                   │                   │
  │                   │ 2. onChange 이벤트  │                   │                   │
  │                   │───────────────────▶│                   │                   │
  │                   │                    │ 3. markDirty()    │                   │
  │                   │                    │                   │                   │
  │ 4. Cmd+S 저장      │                    │                   │                   │
  │─────────────────▶│                    │                   │                   │
  │                   │                    │ 5. saveFile()     │                   │
  │                   │                    │───────────────────▶                    │
  │                   │                    │                   │ 6. POST /api/     │
  │                   │                    │                   │   files/write    │
  │                   │                    │                   │─────────────────▶│
  │                   │                    │                   │◀─────── success │
  │                   │                    │◀─────── success  │                   │
  │                   │                    │ 7. markDirty(false)                  │
  │                   │◀───────────────────│                   │                   │
```

### 3.2.2 Claude에 의한 외부 편집

```
Claude CLI      파일시스템        @parcel/watcher  Server (WS)     Browser         Monaco
   │                │                 │                │              │                │
   │ 1. 파일 수정    │                 │                │              │                │
   │──────────────▶│                 │                 │              │                │
   │                │ 2. change 이벤트 │                │              │                │
   │                │───────────────▶│                 │              │                │
   │                │                 │ 3. /ws/files    │              │                │
   │                │                 │   broadcast     │              │                │
   │                │                 │────────────────▶│              │                │
   │                │                 │                │ 4. ws message │                │
   │                │                 │                │──────────────▶│                │
   │                │                 │                │              │ 5. fetchFile() │
   │                │                 │                │              │               │ (REST)
   │                │                 │                │              │◀── content ── │
   │                │                 │                │              │ 6. apply to    │
   │                │                 │                │              │   Monaco model │
   │                │                 │                │              │──────────────▶│
   │                │                 │                │              │                │ 커서 보존
```

**주의**: Claude 편집 시 diff 모드 활성화 → 사용자가 수락/거절 후 최종 적용 (FR-305)

**관련 FR**: FR-307, FR-308, FR-907

---

## 3.3 터미널 데이터 흐름

### 입력 (사용자 → PTY)

```
사용자 키 입력
  │
  ▼
xterm.js onData 이벤트
  │
  ▼
ws.send(JSON {type:"input", data})   ← 텍스트 프레임
  │
  ▼
server.js /ws/terminal 핸들러
  │
  ▼
ptyProcess.write(data)
  │
  ▼
셸 프로세스 stdin
```

### 출력 (PTY → 사용자, 드롭 없음)

```
셸 프로세스 stdout
  │
  ▼
ptyProcess.onData
  │
  ▼
서버 큐(Buffer 배열) push ─── [paused] ─── 플러시 보류 (드롭 없음)
  │                                │
  │                                ▼
  │                          [bufferedBytes > 256 KB]
  │                                │
  │                                ▼
  │                          ptyProcess.pause() — 상류 중단
  │
  ▼ (16 ms 배치 타이머)
Buffer.concat(queue)
  │
  ▼
ws.send(buf, {binary: true})         ← 바이너리 프레임
  │
  ▼
Browser WebSocket onmessage
  │
  ▼
typeof event.data === 'string'?
  │   └── 예: parseServerControlFrame → exit/error 처리
  │
  ▼ (ArrayBuffer)
TerminalManager.writePtyBytes
  │
  ▼
배압 체크 (워터마크)
  │
  ├── pendingBytes < 100 KB → term.write(bytes) → GPU 렌더링
  │
  └── pendingBytes ≥ 100 KB → ws.send(JSON {type:"pause"})
                                └─ 이후 write 콜백이 < 10 KB가 되면
                                   ws.send(JSON {type:"resume"}) 및
                                   서버가 ptyProcess.resume() + 큐 플러시
```

`bufferedBytes`가 5 MB를 초과하면 서버는 `{type:"error", code:"BUFFER_OVERFLOW"}` 제어 프레임을 전송하고 PTY를 kill, WebSocket을 1011 코드로 닫는다 — 데이터는 어떤 경로로도 조용히 손실되지 않는다.

### 리사이즈 동기화

```
패널 리사이즈 또는 탭 활성화 또는 폰트 변경
  │
  ▼
TerminalManager.scheduleFit  (requestAnimationFrame, 최대 10회 재시도)
  │
  ▼
host clientWidth/Height > 0 ?
  │
  ▼ 예
fitAddon.fit() → cols, rows 재계산
  │
  ▼ (cols/rows 변경된 경우에만)
ws.send(JSON {type:"resize", cols, rows})
  │
  ▼
ptyProcess.resize(cols, rows) → 쉘이 SIGWINCH 수신
```

**관련 FR**: FR-401, FR-403, FR-404, FR-407, FR-408, FR-409

---

## 3.4 권한 요청 흐름

```
Agent SDK       Permission        WebSocket         Browser         사용자
  │             Interceptor        /ws/claude       UI
  │                 │                  │              │              │
  │ 1. tool_use     │                  │              │              │
  │   이벤트         │                  │              │              │
  │────────────────▶│                  │              │              │
  │                 │ 2. 권한 필요      │              │              │
  │                 │   판단            │              │              │
  │                 │                  │              │              │
  │                 │ 3. .claude/      │              │              │
  │                 │   settings.json  │              │              │
  │                 │   화이트리스트    │              │              │
  │                 │   체크            │              │              │
  │                 │                  │              │              │
  │                 │ [매치됨] → 자동 승인                             │
  │                 │                  │              │              │
  │                 │ [매치 안됨]       │              │              │
  │                 │                  │              │              │
  │                 │ 4. permission_   │              │              │
  │                 │   request        │              │              │
  │                 │─────────────────▶│              │              │
  │                 │                  │ 5. WS message│              │
  │                 │                  │─────────────▶│              │
  │                 │                  │              │ 6. 모달 표시  │
  │                 │                  │              │─────────────▶│
  │                 │                  │              │              │
  │                 │                  │              │◀──── 7. 클릭 │
  │                 │                  │              │ 승인/거부     │
  │                 │                  │◀─────────────│              │
  │                 │ 8. permission_   │              │              │
  │                 │   response       │              │              │
  │                 │◀─────────────────│              │              │
  │ 9. SDK 응답     │                  │              │              │
  │◀────────────────│                  │              │              │
  │                 │                  │              │              │
  │ [승인됨] 도구 실행 → 파일 수정 → 결과 반환                            │
  │                 │                  │              │              │
```

**관련 FR**: FR-505, FR-506

---

## 3.5 프리뷰 업데이트 흐름

### 파일 선택 시

```
사용자 클릭 (FileTree)
  │
  ▼
useEditorStore.openFile(path)
  │
  ▼
usePreviewStore.setFile(path)  ← 프리뷰 동기화
  │
  ▼
PreviewRouter → 타입 감지
  │
  ├── HTML → HTMLPreview (iframe srcdoc)
  ├── PDF → PDFPreview (react-pdf)
  ├── MD → MarkdownPreview
  ├── Image → ImagePreview
  └── Slides → SlidePreview (reveal.js)
```

### 에디터 변경 시

```
Monaco onChange 이벤트
  │
  ▼
debounce(300ms)
  │
  ▼
[프리뷰 타입 확인]
  │
  ├── HTML → iframe srcdoc 재설정 (또는 postMessage CSS 패치)
  ├── MD → react-markdown 재렌더링
  ├── Slides → postMessage UPDATE_SLIDE → Reveal.sync()
  └── PDF → (편집 불가)
```

### 범용 라이브 스트리밍 흐름 (FR-610, v0.6)

Claude의 어시스턴트 응답에서 모든 언어의 코드 펜스와 모든 파일 타입의 Write/Edit/MultiEdit를 감지하여 다중 페이지 라이브 프리뷰로 표시하는 흐름:

```
Claude stream (assistant message)
  │
  ▼
UniversalStreamExtractor  (O(n) 스캔 — scanOffset 기반)
  ├── feedText(chunk) — 모든 ```언어 펜스 감지 (html, python, typescript, etc.)
  │   ├── 펜스 open → onPageStart(page)  → useLivePreviewStore.addPage(page)
  │   ├── 청크 누적 → onPageChunk(id, content, renderable) → updatePageContent
  │   └── 펜스 close → onPageComplete(id, content) → completePage
  │
  └── feedToolUse(tool) — 모든 파일 타입의 Write/Edit/MultiEdit
      ├── Write → onPageStart + onPageChunk + onPageComplete
      ├── Edit/MultiEdit → baseline 기준 applyEditOps → onPageChunk + onPageComplete
      └── onWritePath → setGeneratedFilePath(filePath)
            │
            ▼
     useLivePreviewStore { pages: LivePage[], activePageIndex }
            │
            ▼
     <LiveStreamPreview>
      ├── <PageNavBar>        (다중 페이지 탭 네비게이션)
      └── <ActivePageRenderer>
           ├── viewMode === 'source' → <SourcePreview> (highlight.js)
           └── viewMode === 'rendered'
                ├── html → iframe srcdoc (150ms debounce)
                ├── svg → iframe srcdoc
                ├── markdown → ReactMarkdown (200ms debounce)
                ├── code → <SourcePreview> (구문 강조)
                └── text → <pre> 블록
```

- 각 페이지는 독립적인 `viewMode`(source/rendered)를 가지며 토글 가능하다.
- `renderable`이 false→true로 전환되면 자동으로 rendered 모드로 전환된다.
- 에디터 탭이 해당 `filePath`로 열려 있으면 에디터 content를 소스로 사용한다.

### 부분 편집 보존 흐름 (FR-610)

다중 페이지 문서 중 일부만 수정하는 후속 쿼리에서 나머지 렌더링을 보존하기 위한 흐름:

```
1차 쿼리: Write /tmp/deck.html (5페이지 전체)
  │
  ▼
UniversalStreamExtractor.feedToolUse(Write)
  ├── baselines.set('/tmp/deck.html', content)
  ├── onPageStart → addPage({kind:'html', ...})
  ├── onPageChunk → updatePageContent(pageId, content, true)
  └── onPageComplete → completePage(pageId, content)

(1차 쿼리 종료: finalizeExtractor → currentExtractor = null)
(startStream은 pages를 보존)

2차 쿼리: "3번 페이지 제목만 고쳐줘"
  │
  ▼
ensureExtractor() — new UniversalStreamExtractor
  └── seedBaseline(page.filePath, page.content)  // 기존 페이지에서 복원
  │
  ▼
UniversalStreamExtractor.feedToolUse(Edit {old_string, new_string})
  ├── baselines에서 baseline 조회
  ├── applyEditOps(baseline, [op]) → patched
  ├── onPageChunk → updatePageContent(pageId, patched, true)  // 5페이지 전체 유지
  └── onPageComplete → completePage(pageId, patched)
```

**Baseline 디스크 폴백**: 새 세션의 첫 상호작용이 `Edit`/`MultiEdit`이어서 메모리에 baseline이 없는 경우:

```
UniversalStreamExtractor.feedToolUse(Edit)
  │
  ▼
baselines에 없음 → onNeedBaseline(filePath, apply)
  │
  ▼
useClaudeStore.fetchFileContent
  │
  ▼
GET /api/files/read?path=... → { content }
  │
  ▼
apply(content) → applyEditOps → onPageChunk/onPageComplete
```

`MultiEdit`의 `edits[]`는 배열 순서대로 순차 적용하며 `replace_all` 플래그를 존중한다. `old_string`이 baseline에 존재하지 않으면 해당 연산은 건너뛰어 프리뷰 상태를 안정적으로 유지한다.

**관련 FR**: FR-606, FR-610, FR-704

---

## 3.6 프레젠테이션 대화형 편집 흐름

```
사용자              Claude            Server          Browser (React)       iframe (reveal.js)
  │                   │                 │                 │                       │
  │ 1. "3번 슬라이드    │                 │                 │                       │
  │    에 차트 추가"    │                 │                 │                       │
  │─────────────────▶│                 │                 │                       │
  │                   │ 2. 현재 슬라이드  │                 │                       │
  │                   │    HTML 읽기     │                 │                       │
  │                   │────────────────▶│                 │                       │
  │                   │◀─── 파일 내용 ──│                 │                       │
  │                   │                 │                 │                       │
  │                   │ 3. HTML 수정    │                 │                       │
  │                   │    (Edit tool)  │                 │                       │
  │                   │────────────────▶│                 │                       │
  │                   │                 │ 4. 파일 쓰기     │                       │
  │                   │                 │ → @parcel/      │                       │
  │                   │                 │   watcher 감지   │                       │
  │                   │                 │                 │                       │
  │                   │                 │ 5. /ws/files    │                       │
  │                   │                 │   change event  │                       │
  │                   │                 │────────────────▶│                       │
  │                   │                 │                 │ 6. 파일 재로드         │
  │                   │                 │                 │─ (REST)                │
  │                   │                 │                 │                       │
  │                   │                 │                 │ 7. postMessage         │
  │                   │                 │                 │   UPDATE_SLIDE         │
  │                   │                 │                 │──────────────────────▶│
  │                   │                 │                 │                       │ 8. DOM 패치
  │                   │                 │                 │                       │   Reveal.sync()
  │ 9. 즉시 변경 확인  │                 │                 │                       │
  │◀──────────────────────────────────────────────────────────────────────────── │
```

**핵심**: iframe을 리로드하지 않고 DOM만 패치 → 사용자는 중단 없이 슬라이드 변경 확인 가능

**관련 FR**: FR-703, FR-704

---

## 3.7 상태 관리 데이터 흐름

### Zustand 스토어 업데이트 경로

```
┌─────────────────────────────────────────────────────┐
│                 Zustand Stores                      │
│  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐  │
│  │ layout   │ │ editor  │ │ terminal │ │ claude │  │
│  └────┬─────┘ └────┬────┘ └────┬─────┘ └───┬────┘  │
│       │            │            │           │       │
└───────┼────────────┼────────────┼───────────┼──────┘
        │            │            │           │
        │            │            │           │
   ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌───▼────┐
   │ React   │  │ React   │  │ React   │  │ React  │
   │ (구독)  │  │ (구독)  │  │ (구독)  │  │ (구독) │
   └─────────┘  └─────────┘  └─────────┘  └────────┘
        ▲            ▲            ▲           ▲
        │            │            │           │
   ┌────┴────┐  ┌────┴────┐  ┌────┴────┐  ┌───┴────┐
   │ 사용자  │  │ 사용자  │  │  WS     │  │  WS    │
   │ 조작    │  │ 입력    │  │ /ws/    │  │ /ws/   │
   │         │  │         │  │ terminal│  │ claude │
   └─────────┘  └─────────┘  └─────────┘  └────────┘
```

### 레이아웃 상태 흐름 (패널 접힘)

5개 패널 모두 접힘 상태를 `useLayoutStore`에서 관리하며, `ImperativePanelHandle` 명령형 API를 통해 DOM 패널과 동기화된다:

```
사용자 동작 (버튼, 단축키, 리사이즈 드래그)
  │
  ▼
useLayoutStore.togglePanel(panelId) / setCollapsed(panelId, bool)
  │
  ▼
스토어 상태 변경: {panelId}Collapsed = true | false
  │
  ▼
useEffect 감지 (app-shell.tsx)
  │
  ├── collapsed → panelRef.current.collapse()
  └── expanded  → panelRef.current.expand()
        │
        ▼
react-resizable-panels 내부 레이아웃 재계산
  │
  ▼
onCollapse / onExpand 콜백 → setCollapsed 재동기화
```

모바일 레이아웃(< 1280px)에서는 패널 접힘 대신 `mobileActivePanel` 상태로 단일 활성 패널을 전환한다:

```
탭 바 탭 → setMobileActivePanel(panelId) → MobileShell 재렌더링
```

### 영속화 (Persist)

```
useLayoutStore ─── persist 미들웨어 (v3) ──▶ localStorage (1초 쓰로틀)
                                             키: 'claudegui-layout'
                                             포함: 패널 크기, 5개 접힘 상태,
                                                   테마, mobileActivePanel

(다른 스토어는 영속화하지 않음)
```

### WebSocket 핸들러 → 스토어 업데이트

```typescript
// src/lib/websocket/claude-handler.ts
const ws = new WebSocket('/ws/claude');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  // React 훅 없이 스토어 직접 업데이트
  switch (msg.type) {
    case 'message':
      useClaudeStore.getState().appendMessage(msg.data);
      break;
    case 'permission_request':
      useClaudeStore.getState().setPendingPermission(msg);
      break;
    case 'result':
      useClaudeStore.getState().updateCost(msg.data);
      break;
    case 'completion_response':
      // AI 인라인 자동완성 응답 → 등록된 콜백으로 전달 (FR-309)
      claudeClient.handleCompletionResponse(msg);
      break;
  }
};
```

이 방식으로 WebSocket 이벤트가 React 렌더링 사이클과 독립적으로 상태를 업데이트할 수 있다.

**관련 FR**: FR-104, FR-308, FR-309, FR-507
