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
  │                     │                          │   (cost, usage)       │
  │                     │ ws.send({type: result})  │                       │
  │                     │◀─────────────────────────│                       │
  │ 7. 비용/토큰 표시     │                          │                       │
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
Claude CLI      파일시스템        chokidar         Server (WS)     Browser         Monaco
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
WebSocket.send(바이너리 데이터)
  │
  ▼
server.js /ws/terminal 핸들러
  │
  ▼
node-pty.write(data)
  │
  ▼
셸 프로세스 stdin
```

### 출력 (PTY → 사용자)

```
셸 프로세스 stdout
  │
  ▼
node-pty onData 이벤트
  │
  ▼
Batching Buffer (16ms 간격)   ← 60 FPS 동기화
  │
  ▼
WebSocket.send(바이너리 데이터)
  │
  ▼
Browser WebSocket onmessage
  │
  ▼
배압 체크 (워터마크)
  │
  ├── OK → xterm.write(data)
  │         │
  │         ▼
  │        GPU 렌더링 (WebGL 애드온)
  │
  └── HIGH → ws.send({type: "pause"}) → 서버에서 일시 중지
```

### 리사이즈 동기화

```
브라우저 창 리사이즈
  │
  ▼
ResizeObserver 트리거
  │
  ▼
FitAddon.fit() → cols, rows 재계산
  │
  ▼
ws.send({type: "resize", cols, rows})
  │
  ▼
node-pty.resize(cols, rows)
  │
  ▼
셸 프로세스 SIGWINCH 수신
```

**관련 FR**: FR-401, FR-403, FR-404, FR-407

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

**관련 FR**: FR-606, FR-704

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
  │                   │                 │ → chokidar      │                       │
  │                   │                 │   감지           │                       │
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

### 영속화 (Persist)

```
useLayoutStore ─── persist 미들웨어 ──▶ localStorage
                                        키: 'claudegui-layout'

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
  }
};
```

이 방식으로 WebSocket 이벤트가 React 렌더링 사이클과 독립적으로 상태를 업데이트할 수 있다.

**관련 FR**: FR-104, FR-308, FR-507
