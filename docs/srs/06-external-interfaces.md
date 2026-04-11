# 6. 외부 인터페이스

## 6.1 사용자 인터페이스

### 4분할 패널 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│                          Header Bar                             │
│  [Logo] [Session: my-project] [⌘K Command Palette]  [Settings] │
├──────────┬──────────────────────────────┬───────────────────────┤
│          │                              │                       │
│  File    │     Monaco Editor            │    Preview Panel      │
│  Explorer│     ┌─────┬─────┬─────┐      │                       │
│          │     │Tab 1│Tab 2│Tab 3│      │    ┌───────────────┐  │
│  📁 src  │     └─────┴─────┴─────┘      │    │               │  │
│  ├─📄 app│     [code editing area]      │    │  HTML / PDF / │  │
│  ├─📁 lib│                              │    │  Markdown /   │  │
│  └─📁 ...│                              │    │  Slides /     │  │
│          │                              │    │  Image        │  │
│          │                              │    │               │  │
│          ├──────────────────────────────┤    │               │  │
│          │                              │    └───────────────┘  │
│          │     Terminal (xterm.js)       │    [Page: 1/5] [◀ ▶] │
│          │     $ claude "fix the bug"   │                       │
│          │     ▌                         │                       │
├──────────┴──────────────────────────────┴───────────────────────┤
│  Status Bar: [Branch: main] [Claude: idle] [Cost: $0.05]       │
└─────────────────────────────────────────────────────────────────┘
```

### 패널별 UI 요소

**파일 탐색기 (좌측)**
- 디렉토리 트리 뷰
- 폴더 접기/펼치기 화살표
- 파일 아이콘 (확장자별)
- Git 상태 표시 (색상 코드)
- 헤더: 프로젝트명, 새 파일/폴더 버튼, 새로고침 버튼

**코드 에디터 (중앙 상단)**
- 탭 바: 파일명, 닫기(×), 미저장 표시(●)
- 에디터 영역: 줄 번호, 코드 하이라이팅, 미니맵
- diff 뷰: 변경사항 수락/거절 버튼
- 브레드크럼: 현재 파일 경로

**터미널 (중앙 하단)**
- 세션 탭 바: 세션 이름, 추가(+), 닫기(×)
- 터미널 본문: ANSI 렌더링 영역
- 검색 바: `Ctrl+F` 활성화 시

**프리뷰 패널 (우측)**
- 렌더러 타입 표시: [HTML] [PDF] [Markdown] [Image] [Slides]
- 콘텐츠 영역: 렌더러별 뷰
- 하단: 페이지 네비게이션, 줌 컨트롤
- 프레젠테이션 모드: 슬라이드 섬네일 사이드바

### 권한 요청 모달

```
┌─────────────────────────────────────┐
│  ⚠️  Permission Request             │
│                                     │
│  Tool: Edit                         │
│  File: src/lib/auth.ts              │
│                                     │
│  Claude wants to modify this file.  │
│  Lines 42-58 will be changed.       │
│                                     │
│  [  Deny  ]         [ Approve ]     │
└─────────────────────────────────────┘
```

### 커맨드 팔레트

```
┌──────────────────────────────────────┐
│  🔍 Type a command...                │
│ ─────────────────────────────────── │
│  > Open File          Cmd+P         │
│  > Toggle Terminal    Cmd+J         │
│  > Toggle Sidebar     Cmd+B         │
│  > New Claude Session               │
│  > Export as PPTX                    │
│  > Change Theme                      │
└──────────────────────────────────────┘
```

---

## 6.2 소프트웨어 인터페이스

### Claude Agent SDK

| 항목 | 내용 |
|------|------|
| **패키지** | `@anthropic-ai/claude-agent-sdk` |
| **연동 방식** | Node.js 서버에서 SDK 인스턴스 생성, async generator로 이벤트 수신 |
| **입력** | 사용자 프롬프트, 세션 ID, 옵션(max-turns, max-budget 등) |
| **출력** | `SDKMessage` 이벤트 스트림 (assistant, stream_event, tool_call, result) |
| **세션 저장소** | `~/.claude/projects/` 디렉토리 |

### Claude CLI

| 항목 | 내용 |
|------|------|
| **바이너리** | `claude` (PATH 등록 필수) |
| **통신 형식** | `--output-format stream-json` (NDJSON) |
| **입력 형식** | `--input-format stream-json` (양방향 NDJSON) |
| **구조화 출력** | `--json-schema` 옵션 |
| **사전 워밍업** | `startup()` 메서드 (~20× 속도 개선) |

### Node.js 파일시스템

| 항목 | 내용 |
|------|------|
| **모듈** | `node:fs/promises` |
| **경로 검증** | `node:path` — `path.resolve()` 바운드 체크 |
| **심볼릭 링크** | `fs.lstat()` 검증 |
| **인코딩** | 텍스트 파일 UTF-8, 바이너리 파일 Buffer |

### chokidar

| 항목 | 내용 |
|------|------|
| **패키지** | `chokidar` v5 (ESM) |
| **감시 대상** | 프로젝트 루트 디렉토리 (재귀적) |
| **무시 패턴** | `node_modules`, `.git`, `dist`, `build` |
| **이벤트** | `add`, `change`, `unlink`, `addDir`, `unlinkDir` |
| **출력** | WebSocket `/ws/files` 채널로 브로드캐스트 |

### node-pty

| 항목 | 내용 |
|------|------|
| **패키지** | `node-pty` (Microsoft 유지관리) |
| **기능** | 의사 터미널 생성, 셸 프로세스 관리 |
| **지원 셸** | bash, zsh (macOS/Linux), cmd, PowerShell (Windows) |
| **통신** | stdin/stdout 스트림 → WebSocket 양방향 전달 |

---

## 6.3 통신 인터페이스

### REST API 엔드포인트

| 메서드 | 경로 | 설명 | 요청 | 응답 |
|--------|------|------|------|------|
| GET | `/api/files?path=<dir>` | 디렉토리 목록 | — | `{ entries: [{ name, type, size, mtime }] }` |
| GET | `/api/files/read?path=<file>` | 파일 읽기 | — | `{ content, encoding }` |
| POST | `/api/files/write` | 파일 쓰기 | `{ path, content }` | `{ success: true }` |
| DELETE | `/api/files?path=<path>` | 파일/폴더 삭제 | — | `{ success: true }` |
| POST | `/api/files/mkdir` | 디렉토리 생성 | `{ path }` | `{ success: true }` |
| POST | `/api/files/rename` | 이름변경/이동 | `{ oldPath, newPath }` | `{ success: true }` |
| GET | `/api/files/stat?path=<file>` | 메타데이터 조회 | — | `{ size, mtime, isDirectory, isFile }` |
| GET | `/api/sessions` | 세션 목록 | — | `{ sessions: [{ id, name, created, cost }] }` |
| POST | `/api/sessions` | 새 세션 생성 | `{ name?, cwd }` | `{ session_id }` |
| GET | `/api/sessions/:id` | 세션 상세 | — | `{ id, name, messages, cost }` |

### WebSocket 프로토콜

**`/ws/terminal`**

```
# 클라이언트 → 서버 (모두 텍스트 JSON)
{ "type": "input", "data": "ls\r" }
{ "type": "resize", "cols": 120, "rows": 30 }
{ "type": "pause" }
{ "type": "resume" }

# 서버 → 클라이언트 (PTY 출력 — 바이너리 프레임, 16ms 배치)
[binary] 쉘 stdout 바이트

# 서버 → 클라이언트 (제어 — 텍스트 JSON)
{ "type": "exit", "code": 0 }
{ "type": "error", "code": "BUFFER_OVERFLOW", "message": "terminal output buffer exceeded 5242880 bytes" }
```

**`/ws/claude`**

```
# 클라이언트 → 서버
{ "type": "query", "prompt": "Fix the login bug", "sessionId": "abc123", "options": { "maxTurns": 10 } }
{ "type": "permission_response", "requestId": "req-1", "approved": true }
{ "type": "abort" }

# 서버 → 클라이언트
{ "type": "message", "data": { "type": "assistant", "content": "..." } }
{ "type": "message", "data": { "type": "stream_event", "delta": "..." } }
{ "type": "tool_call", "data": { "tool": "Edit", "args": { "file": "src/auth.ts", ... } } }
{ "type": "permission_request", "requestId": "req-1", "tool": "Bash", "args": { "command": "npm test" } }
{ "type": "result", "data": { "cost_usd": 0.05, "usage": { "input": 1200, "output": 800 }, "session_id": "abc123" } }
{ "type": "error", "message": "Session not found" }
```

**`/ws/files`**

```
# 서버 → 클라이언트
{ "type": "change", "event": "change", "path": "src/lib/auth.ts" }
{ "type": "change", "event": "add", "path": "src/lib/new-file.ts" }
{ "type": "change", "event": "unlink", "path": "src/lib/old-file.ts" }

# 클라이언트 → 서버
{ "type": "watch", "path": "/new/project/root" }
```

### 연결 관리

- **하트비트**: 서버에서 29초마다 ping 전송, 클라이언트 pong 응답
- **재연결**: 지수 백오프 (1초 시작, 2배 증가, 30초 상한)
- **에러 응답**: `{ "error": "메시지", "code": 에러코드 }`

---

## 6.4 하드웨어 인터페이스

### 최소 사양

| 항목 | 최소 | 권장 |
|------|------|------|
| **CPU** | 듀얼코어 | 쿼드코어 이상 |
| **RAM** | 4GB | 8GB 이상 |
| **디스크** | 500MB 여유 | 1GB 이상 여유 |
| **해상도** | 1280 × 720 | 1920 × 1080 이상 |
| **네트워크** | 인터넷 연결 (API 호출용) | 안정적 브로드밴드 |

### 비고

- GPU: xterm.js WebGL 가속을 위해 WebGL 2.0 지원 그래픽카드 권장
- 디스크 I/O: SSD 권장 (파일 감시 및 대규모 프로젝트 탐색 성능)
