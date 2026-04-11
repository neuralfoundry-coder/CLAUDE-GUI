# 4. API 설계

## 4.1 REST API

모든 REST 엔드포인트는 `/api` 접두사를 사용한다. 응답 형식은 JSON이며, 에러 시 표준 포맷을 따른다.

### 공통 응답 포맷

```typescript
// 성공
{ "success": true, "data": ... }

// 에러
{ "success": false, "error": "메시지", "code": 숫자 }
```

### 4.1.1 파일 시스템 API

#### `GET /api/files`

디렉토리 내용을 조회한다.

**쿼리 파라미터**:
- `path` (필수): 조회할 디렉토리 경로 (프로젝트 루트 상대 경로)

**응답**:
```json
{
  "success": true,
  "data": {
    "path": "src",
    "entries": [
      {
        "name": "app",
        "type": "directory",
        "size": 0,
        "mtime": "2026-04-10T12:34:56.000Z"
      },
      {
        "name": "page.tsx",
        "type": "file",
        "size": 1024,
        "mtime": "2026-04-11T09:00:00.000Z"
      }
    ]
  }
}
```

#### `GET /api/files/read`

파일 내용을 조회한다.

**쿼리 파라미터**:
- `path` (필수): 파일 경로
- `encoding` (선택): `utf-8` (기본) 또는 `base64`

**응답**:
```json
{
  "success": true,
  "data": {
    "content": "...",
    "encoding": "utf-8",
    "size": 1024
  }
}
```

**에러**:
- `404` - 파일 없음
- `403` - 경로 샌드박스 위반
- `413` - 파일 크기 초과 (텍스트 10MB / 바이너리 50MB)

#### `POST /api/files/write`

파일을 저장한다.

**요청 본문**:
```json
{
  "path": "src/app/page.tsx",
  "content": "...",
  "encoding": "utf-8"
}
```

**응답**:
```json
{ "success": true, "data": { "size": 1024 } }
```

#### `DELETE /api/files`

파일 또는 빈 디렉토리를 삭제한다.

**쿼리 파라미터**:
- `path` (필수)

#### `POST /api/files/mkdir`

디렉토리를 생성한다.

**요청 본문**:
```json
{ "path": "src/new-folder", "recursive": true }
```

#### `POST /api/files/rename`

파일/디렉토리의 이름을 변경하거나 이동한다.

**요청 본문**:
```json
{
  "oldPath": "src/old-name.ts",
  "newPath": "src/new-name.ts"
}
```

#### `GET /api/files/stat`

파일 메타데이터를 조회한다.

**쿼리 파라미터**:
- `path` (필수)

**응답**:
```json
{
  "success": true,
  "data": {
    "size": 1024,
    "mtime": "2026-04-11T09:00:00.000Z",
    "ctime": "2026-04-10T12:34:56.000Z",
    "isDirectory": false,
    "isFile": true,
    "isSymbolicLink": false
  }
}
```

### 4.1.2 Git API (선택)

#### `GET /api/git/status`

프로젝트 Git 상태를 조회한다.

**응답**:
```json
{
  "success": true,
  "data": {
    "branch": "main",
    "files": {
      "src/auth.ts": "modified",
      "src/new.ts": "untracked",
      "src/old.ts": "deleted"
    }
  }
}
```

### 4.1.3 세션 API

#### `GET /api/sessions`

Claude 세션 목록을 조회한다. 로컬 `~/.claude/projects/` 디렉토리를 기반으로 한다.

**응답**:
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "abc123",
        "name": "feature/auth",
        "cwd": "/Users/dev/myproject",
        "createdAt": "2026-04-01T10:00:00.000Z",
        "lastUsedAt": "2026-04-11T09:00:00.000Z",
        "totalCost": 0.25,
        "messageCount": 42
      }
    ]
  }
}
```

#### `POST /api/sessions`

새 세션을 생성한다.

**요청 본문**:
```json
{
  "name": "feature/new-login",
  "cwd": "/Users/dev/myproject"
}
```

**응답**:
```json
{ "success": true, "data": { "sessionId": "xyz789" } }
```

#### `GET /api/sessions/:id`

세션 상세 정보 및 메시지 히스토리를 조회한다.

**응답**:
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "feature/auth",
    "messages": [...],
    "totalCost": 0.25,
    "tokenUsage": { "input": 15000, "output": 8000 }
  }
}
```

#### `DELETE /api/sessions/:id`

세션을 삭제한다.

---

## 4.2 WebSocket 프로토콜

### 4.2.1 공통 규칙

- 메시지 포맷: JSON (UTF-8 텍스트 프레임) 또는 바이너리 프레임
- 제어 메시지는 `type` 필드로 구분
- 하트비트: 서버가 29초마다 ping, 클라이언트 pong 응답
- 재연결: 지수 백오프 (1s → 2s → 4s → ... → 30s)

### 4.2.2 `/ws/terminal`

터미널 PTY 세션과 연결된다.

#### 연결 시

쿼리 파라미터 또는 첫 메시지로 세션 정보를 전달한다.

```
ws://localhost:3000/ws/terminal?sessionId=xyz&cwd=/Users/dev/myproject
```

서버는 새 `node-pty` 프로세스를 생성하고 연결을 유지한다.

#### 클라이언트 → 서버

**사용자 입력** (바이너리 프레임):
```
[바이너리] 0x01 0x02 0x03 ...
```

**리사이즈** (JSON 텍스트 프레임):
```json
{ "type": "resize", "cols": 120, "rows": 30 }
```

**배압 제어**:
```json
{ "type": "pause" }
{ "type": "resume" }
```

#### 서버 → 클라이언트

**PTY 출력** (바이너리 프레임, 16ms 배치):
```
[바이너리] ANSI 이스케이프 시퀀스 포함
```

**프로세스 종료**:
```json
{ "type": "exit", "code": 0 }
```

---

### 4.2.3 `/ws/claude`

Claude Agent SDK와 연결된다.

#### 클라이언트 → 서버

**쿼리 전송**:
```json
{
  "type": "query",
  "requestId": "req-123",
  "prompt": "Fix the login bug",
  "sessionId": "abc123",
  "options": {
    "maxTurns": 10,
    "maxBudget": 1.0,
    "model": "claude-opus-4-6"
  }
}
```

**권한 응답**:
```json
{
  "type": "permission_response",
  "requestId": "perm-456",
  "approved": true
}
```

**요청 중단**:
```json
{ "type": "abort", "requestId": "req-123" }
```

#### 서버 → 클라이언트

**어시스턴트 메시지**:
```json
{
  "type": "message",
  "requestId": "req-123",
  "data": {
    "type": "assistant",
    "content": "Let me check the login function..."
  }
}
```

**스트리밍 델타**:
```json
{
  "type": "message",
  "requestId": "req-123",
  "data": {
    "type": "stream_event",
    "delta": "partial text..."
  }
}
```

**도구 호출 알림**:
```json
{
  "type": "tool_call",
  "requestId": "req-123",
  "data": {
    "tool": "Edit",
    "args": {
      "file_path": "src/auth.ts",
      "old_string": "...",
      "new_string": "..."
    }
  }
}
```

**권한 요청**:
```json
{
  "type": "permission_request",
  "requestId": "perm-456",
  "tool": "Bash",
  "args": {
    "command": "npm test"
  },
  "reason": "Claude wants to run tests"
}
```

**최종 결과**:
```json
{
  "type": "result",
  "requestId": "req-123",
  "data": {
    "cost_usd": 0.05,
    "usage": {
      "input_tokens": 1200,
      "output_tokens": 800,
      "cache_read_tokens": 500
    },
    "session_id": "abc123",
    "duration_ms": 4500
  }
}
```

**에러**:
```json
{
  "type": "error",
  "requestId": "req-123",
  "message": "Session not found",
  "code": 4404
}
```

---

### 4.2.4 `/ws/files`

chokidar 파일 변경 이벤트를 브로드캐스트한다.

#### 클라이언트 → 서버

**감시 디렉토리 설정**:
```json
{ "type": "watch", "path": "/Users/dev/myproject" }
```

#### 서버 → 클라이언트

**파일 변경 이벤트**:
```json
{
  "type": "change",
  "event": "change",
  "path": "src/lib/auth.ts",
  "timestamp": "2026-04-11T09:00:00.000Z"
}
```

**이벤트 종류**: `add`, `change`, `unlink`, `addDir`, `unlinkDir`, `ready`

---

## 4.3 연결 관리

### 재연결 전략

```typescript
class ReconnectingWebSocket {
  private backoff = 1000;  // 1초 시작
  private readonly maxBackoff = 30000;  // 30초 상한

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onopen = () => {
      this.backoff = 1000;  // 리셋
    };
  }

  private scheduleReconnect() {
    setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
  }
}
```

### 하트비트

서버는 29초마다 WebSocket ping을 전송한다 (브라우저 기본 idle 타임아웃이 30초인 점 고려).

```typescript
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.isAlive === false) return client.terminate();
    client.isAlive = false;
    client.ping();
  });
}, 29000);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});
```

---

## 4.4 에러 코드 정의

| 코드 | 의미 | HTTP 상태 |
|------|------|----------|
| 4400 | 잘못된 요청 (파라미터 누락/형식 오류) | 400 |
| 4401 | 인증 실패 | 401 |
| 4403 | 경로 샌드박스 위반 / 권한 없음 | 403 |
| 4404 | 리소스 없음 (파일/세션) | 404 |
| 4413 | 파일 크기 초과 | 413 |
| 4429 | 요청 속도 제한 초과 | 429 |
| 5500 | 서버 내부 에러 | 500 |
| 5501 | Claude CLI 실행 실패 | 500 |
| 5502 | PTY 프로세스 생성 실패 | 500 |
| 5503 | 파일 시스템 작업 실패 | 500 |
| 5504 | WebSocket 연결 끊김 | — |

### 에러 응답 예시

```json
{
  "success": false,
  "error": "Path outside project root",
  "code": 4403,
  "details": {
    "requestedPath": "../../../etc/passwd"
  }
}
```
