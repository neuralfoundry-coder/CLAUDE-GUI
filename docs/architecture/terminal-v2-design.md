# 터미널 아키텍처 v2 설계서

## 1. 현재 아키텍처 문제점 요약

### 구조적 문제
| # | 문제 | 위치 | 심각도 |
|---|------|------|--------|
| A1 | **God Object**: `TerminalManager` 989줄 — PTY, xterm, WebSocket, 검색, 폰트, 테마, 링크, 백프레셔 전부 담당 | `terminal-manager.ts` | Critical |
| A2 | **이중 상태**: Store `sessions[]` vs Manager `instances Map` — 동기화 보장 없음 | store + manager | Critical |
| A3 | **재연결 없음**: WebSocket 끊기면 수동 재시작 필수. 서버는 30분 PTY 유지하지만 클라이언트가 재연결 시도 안 함 | `terminal-socket.ts` | Critical |
| A4 | **하드코딩 타이밍**: OSC 7 100ms/800ms, 배치 16ms, 연결 15s, exit 1s, GC 30min — 적응형 아님 | 전체 | High |

### 서버 문제
| # | 문제 | 위치 |
|---|------|------|
| S1 | `fs.statSync()` 블로킹 I/O | `terminal-handler.mjs:63` |
| S2 | PTY pause/resume 상태 불일치 — throw 시 영구 데드락 | `terminal-handler.mjs:240-263` |
| S3 | 링 버퍼 메모리: 분리된 세션당 256KB × 30분 방치 | `session-registry.mjs` |
| S4 | exit 후 1초 지연 → 오래된 콘텐츠 리플레이 가능 | `session-registry.mjs:90` |
| S5 | node-pty 로드 실패 시 재시도 없음 — 영구 장애 | `terminal-handler.mjs:18-26` |
| S6 | `ws.send()` 실패 무시 — 로깅/복구 없음 | `terminal-handler.mjs:28-35` |

### 클라이언트 문제
| # | 문제 | 위치 |
|---|------|------|
| C1 | 백프레셔 비대칭: 서버 256KB / 클라이언트 100KB, 정렬 안 됨 | manager + handler |
| C2 | 입력 큐 32KB 초과 시 무음 데이터 손실 | `terminal-manager.ts:368` |
| C3 | xterm 모듈 즉시 로딩 — 터미널 안 써도 200-300ms 부트 지연 | `terminal-manager.ts:109` |
| C4 | 백프레셔 시각 피드백 없음 — 터미널이 멈춘 것처럼 보임 | 없음 |
| C5 | 탭 전환 시 검색 상태 유실 | component state |
| C6 | WebGL 어댑터 중복 로드 레이스 | `terminal-manager.ts:746` |
| C7 | 페이지 새로고침 시 세션 전부 소실 | store 비영속 |

---

## 2. 신규 아키텍처 설계

### 2.1 모듈 분해

현재 989줄 `TerminalManager`를 4개 독립 모듈로 분해:

```
src/lib/terminal/
├── terminal-instance.ts          ~250줄  xterm.js 래퍼 (순수 렌더링)
├── terminal-connection.ts        ~280줄  WebSocket + 재연결 + 백프레셔
├── terminal-session-controller.ts ~280줄  인스턴스+연결 오케스트레이터
├── terminal-registry.ts          ~200줄  컬렉션 관리 + 스토어 연결
├── terminal-framing.ts           ~110줄  와이어 프로토콜 (확장)
└── terminal-themes.ts            ~134줄  테마 정의 (변경 없음)

삭제:
├── terminal-manager.ts           ← 4개 모듈로 대체
└── terminal-socket.ts            ← terminal-connection.ts에 흡수
```

### 2.2 모듈 A: `terminal-instance.ts` — xterm.js 래퍼

WebSocket/네트워크 의존성 없음. 순수 렌더링 계층.

```typescript
interface TerminalInstanceConfig {
  fontSize: number;
  fontFamily: string;
  theme: ITheme;
  scrollback: number;
  reservedKeyPredicate: ((e: KeyboardEvent) => boolean) | null;
  fileLinkHandler: ((path: string, line?: number) => void) | null;
  onData: (data: string) => void;      // 사용자 키입력 콜백
  onActivity: () => void;              // 데이터 수신 콜백
}

class TerminalInstance {
  constructor(config: TerminalInstanceConfig);

  // DOM 생명주기
  open(host: HTMLElement): void;        // 최초 마운트 (term.open)
  attach(host: HTMLElement): void;      // 기존 DOM 재부착
  detach(): void;                       // DOM 분리 (WebSocket 유지)
  dispose(): void;                      // 완전 파괴

  // 데이터
  write(data: string | Uint8Array): Promise<void>;  // xterm write + 완료 콜백
  clear(): void;
  writeln(text: string): void;          // 시스템 메시지 출력

  // 크기
  fit(): { cols: number; rows: number } | null;
  get cols(): number;
  get rows(): number;

  // 외관
  setFontSize(px: number): void;
  setTheme(theme: ITheme): void;
  setFontFamily(family: string): void;

  // 검색 (SearchAddon 위임)
  findNext(query: string, opts?: ISearchOptions): boolean;
  findPrevious(query: string, opts?: ISearchOptions): boolean;
  clearSearch(): void;

  // 선택/클립보드
  hasSelection(): boolean;
  getSelection(): string;
  selectAll(): void;

  // 상태
  get isOpened(): boolean;
}
```

**핵심 설계**:
- xterm.js `Terminal` + `FitAddon` + `SearchAddon` + `WebLinksAddon` 소유
- `WebglAddon`은 첫 `open()` 시 지연 로딩 (실패 시 소프트웨어 렌더러 유지)
- `ResizeObserver`로 컨테이너 크기 감시 → 자동 fit
- 파일 링크 프로바이더: regex 매칭 + `fileLinkHandler` 콜백
- `write()` 반환 Promise로 백프레셔 추적 가능
- **테스트**: jsdom + xterm mock으로 단위 테스트 가능

### 2.3 모듈 B: `terminal-connection.ts` — WebSocket + 재연결

```typescript
type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

interface TerminalConnectionConfig {
  baseUrl: string;
  browserId: string;
  initialCwd: string | null;
  onPtyData: (data: Uint8Array) => void;
  onControl: (msg: TerminalServerControl) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

class TerminalConnection {
  constructor(config: TerminalConnectionConfig);

  get status(): ConnectionStatus;
  get serverSessionId(): string | null;

  // 데이터 전송
  sendInput(data: string): void;        // 4KB 청킹 + microtask yield
  sendResize(cols: number, rows: number): void;
  sendPause(): void;
  sendResume(): void;
  sendClose(): void;                     // 서버에 명시적 PTY 종료 요청

  // 생명주기
  close(): void;                         // PTY 유지한 채 연결만 끊기 (재연결 가능)
  dispose(): void;                       // 재연결 포기 + 정리

  // 재연결
  setServerSessionId(id: string): void;  // 서버로부터 받은 세션 ID 저장
}
```

**재연결 전략**:
```
WebSocket 예기치 않게 닫힘
  └─ serverSessionId 있음?
     ├─ YES: 'reconnecting' 전환
     │   └─ 지수 백오프: 1s → 2s → 4s → 8s → 16s → 30s (최대)
     │       └─ ?sessionId=<id> 파라미터로 재연결
     │           ├─ 성공: 서버가 링 버퍼 리플레이 → 'open'
     │           └─ 5회 실패: 'closed' → 재시작 UI 표시
     └─ NO: 즉시 'closed'
```

**입력 큐**: `connecting` + `reconnecting` 상태에서 키입력 버퍼링. 32KB 초과 시 사용자에게 토스트 경고 (무음 손실 대신).

**백프레셔 프로토콜**:
- `pendingBytes` 추적 (xterm write 완료 콜백)
- HIGH_WATERMARK(100KB) 초과 → `sendPause()` + `onPaused` 콜백
- LOW_WATERMARK(10KB) 미만 → `sendResume()` + `onResumed` 콜백

### 2.4 모듈 C: `terminal-session-controller.ts` — 오케스트레이터

`TerminalInstance` + `TerminalConnection`을 하나의 세션으로 조합.

```typescript
type SessionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'exited';

interface SessionControllerConfig {
  id: string;
  initialCwd: string | null;
  baseUrl: string;
  browserId: string;
  fontSize: number;
  fontFamily: string;
  theme: ITheme;
  reservedKeyPredicate: ((e: KeyboardEvent) => boolean) | null;
  fileLinkHandler: ((path: string, line?: number) => void) | null;
  onStatusChange: (status: SessionStatus, exitCode: number | null) => void;
  onCwdChange: (cwd: string | null) => void;
  onActivity: () => void;
  onBackpressureChange: (paused: boolean) => void;
}

class TerminalSessionController {
  constructor(config: SessionControllerConfig);

  // DOM
  attach(host: HTMLElement): void;
  detach(): void;
  activate(): void;                     // fit + focus

  // 생명주기
  restart(): void;                      // closed/exited → 새 연결
  close(): void;                        // 명시적 종료
  dispose(): void;

  // 위임 (TerminalInstance)
  setFontSize(px: number): void;
  setTheme(theme: ITheme): void;
  setFontFamily(family: string): void;
  findNext/findPrevious/clearSearch(...): ...;
  hasSelection/getSelection/selectAll/paste(...): ...;

  // 상태
  get status(): SessionStatus;
  get cwd(): string | null;
  get exitCode(): number | null;
  get serverSessionId(): string | null;
  get isBackpressured(): boolean;
}
```

**핵심 책임**:
- 서버 제어 프레임 디스패치 (`exit`, `error`, `session`, `backpressure_ack`)
- OSC 7 핸들러 등록 → cwd 추적
- 재시작 로직: xterm 클리어 + 새 연결 생성
- 리플레이 수신 시 xterm 클리어 후 바이너리 쓰기
- 백프레셔 상태를 `onBackpressureChange` 콜백으로 전파

### 2.5 모듈 D: `terminal-registry.ts` — 컬렉션 관리

유일하게 Zustand 스토어를 import하는 모듈.

```typescript
class TerminalRegistry {
  boot(): void;                                       // 스토어 구독 시작
  dispose(): void;                                    // 전체 정리

  has(id: string): boolean;
  get(id: string): TerminalSessionController | undefined;
  async ensureSession(id: string, opts?: {
    initialCwd?: string;
    serverSessionId?: string;                         // 재연결용
  }): Promise<void>;
  closeSession(id: string): void;

  setFileLinkHandler(handler: FileLinkHandler): void;
  setReservedKeyPredicate(predicate: ReservedKeyPredicate | null): void;
}

export const terminalRegistry: TerminalRegistry;      // 싱글톤
```

**핵심 책임**:
- xterm 모듈 지연 로딩 (첫 `ensureSession` 호출 시, 부트 시 아님)
- `useLayoutStore` 구독 → 폰트 크기/테마/줌 변경 시 전체 인스턴스 업데이트
- `useSettingsStore` 구독 → 폰트 패밀리/리가처 변경
- OS 테마 변경 감지 (`matchMedia`)
- 세션 상태 변경 → 스토어 업데이트 (단방향)

---

## 3. 상태 관리: 단일 진실 소스

### 원칙
- **Zustand 스토어 = 세션 메타데이터의 유일한 진실 소스**
- **Registry = 런타임 객체(xterm, WebSocket)의 보관소** (직렬화 불가 → 스토어에 넣지 않음)
- **동기화 방향**: Controller → Store (단방향). Store는 Registry를 읽지 않음.

### 스토어 스키마 변경

```typescript
interface TerminalSession {
  id: string;
  name: string;
  createdAt: number;
  status: SessionStatus;              // 'reconnecting' 추가
  exitCode: number | null;
  cwd: string | null;
  customName: boolean;
  unread: boolean;
  backpressured: boolean;             // ✨ 신규: 백프레셔 시각 피드백
  serverSessionId: string | null;     // ✨ 신규: 재연결/영속화용
  searchState: SearchState | null;    // ✨ 신규: 탭 전환 시 검색 유지
}

interface SearchState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}
```

### 세션 영속화 (페이지 새로고침 생존)

```typescript
// use-terminal-store.ts에 persist 미들웨어 추가
export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({ ... }),
    {
      name: 'claudegui-terminal-sessions',
      storage: createJSONStorage(() => sessionStorage), // 탭 내에서만 유지
      partialize: (state) => ({
        sessions: state.sessions.map(s => ({
          ...s,
          status: 'connecting' as const,  // 복원 시 재연결 시작
          backpressured: false,
          unread: false,
        })),
        activeSessionId: state.activeSessionId,
        primarySessionId: state.primarySessionId,
        secondarySessionId: state.secondarySessionId,
        splitEnabled: state.splitEnabled,
        activePaneIndex: state.activePaneIndex,
      }),
    }
  )
);
```

**복원 플로우**: 페이지 로드 → sessionStorage에서 세션 복원 → XTerminalAttach 마운트 → `registry.ensureSession(id, { serverSessionId })` → 서버에 `?sessionId=<id>`로 연결 → 링 버퍼 리플레이 → 이음새 없는 복원.

---

## 4. 프로토콜 변경

### 신규 서버→클라이언트 프레임

```typescript
// 백프레셔 확인 응답 (S2 문제 해결)
interface TerminalBackpressureAckControl {
  type: 'backpressure_ack';
  paused: boolean;          // 실제 PTY 상태 확인
  bufferedBytes: number;    // 서버 버퍼 현재 크기
}

// session 프레임 확장
interface TerminalSessionServerControl {
  type: 'session';
  id: string;
  replay: boolean;
  fresh?: boolean;          // ✨ true면 serverSessionId가 만료되어 새 PTY 생성됨
}
```

### 정렬된 백프레셔

| 계층 | 고수위 | 저수위 | 동작 |
|------|--------|--------|------|
| 서버 출력 버퍼 | 256KB | 64KB | `ptyProcess.pause()`/`resume()` + `backpressure_ack` 전송 |
| 클라이언트 xterm 큐 | 100KB | 10KB | `pause`/`resume` 전송 |
| 세션 킬 | 5MB | — | 세션 파괴 (변경 없음) |

서버는 `pause`/`resume` 수신 시 `backpressure_ack`로 실제 PTY 상태를 확인 응답. 클라이언트는 `backpressure_ack.paused`가 true일 때만 `backpressured=true` 설정.

---

## 5. 서버 핸들러 리팩토링

### 5.1 `terminal-handler.mjs` 수정

```javascript
// S1 해결: 비동기 CWD 검증 + symlink 해소
async function resolveInitialCwd(req) {
  // fs.statSync → fs.promises.stat + fs.promises.realpath
  const real = await fs.promises.realpath(abs);
  if (root && !(real === root || real.startsWith(root + path.sep))) {
    return fallback(); // symlink가 프로젝트 밖을 가리키면 거부
  }
  const stat = await fs.promises.stat(real);
  return stat.isDirectory() ? real : path.dirname(real);
}

// S2 해결: PTY pause/resume 확인 응답
function maybePausePty() {
  if (ptyPaused || bufferedBytes < PTY_PAUSE_THRESHOLD) return;
  try {
    ptyProcess.pause();
    ptyPaused = true;
    sendControl(ws, { type: 'backpressure_ack', paused: true, bufferedBytes });
  } catch (err) {
    dbg.error('PTY pause failed', err);
    sendControl(ws, { type: 'backpressure_ack', paused: false, bufferedBytes });
    // ptyPaused는 false 유지 — 정확한 상태
  }
}

// S5 해결: node-pty 3회 재시도
let ptyModule = null;
let ptyLoadAttempts = 0;
async function loadPty() {
  if (ptyModule) return ptyModule;
  if (ptyLoadAttempts >= 3) return null;
  ptyLoadAttempts++;
  try {
    ptyModule = (await import('node-pty')).default ?? await import('node-pty');
    return ptyModule;
  } catch (err) {
    dbg.error(`node-pty load failed (${ptyLoadAttempts}/3)`, err);
    return null;
  }
}

// S6 해결: send 실패 로깅
function sendControl(ws, msg) {
  if (ws.readyState !== ws.OPEN) {
    dbg.warn('sendControl skipped: ws not open', { type: msg.type });
    return false;
  }
  try {
    ws.send(JSON.stringify(msg));
    return true;
  } catch (err) {
    dbg.error('sendControl failed', err);
    return false;
  }
}
```

### 5.2 `session-registry.mjs` 수정

```javascript
// S4 해결: exit 후 1초 지연 제거
// 기존: setTimeout(() => this.destroy(id), 1000)
// 신규: exit 상태만 설정, destroy는 WebSocket close 시 또는 명시적 close 프레임 수신 시

// S3 해결: 주기적 링 버퍼 정리
constructor() {
  this._gcInterval = setInterval(() => {
    for (const [id, record] of this._sessions) {
      if (record.attached === 0 && !record.exited) {
        // 분리된 활성 세션: 링 버퍼를 절반으로 축소
        this._trimRingBuffer(record, RING_BUFFER_BYTES / 2);
      }
    }
  }, 5 * 60 * 1000); // 5분마다
}
```

---

## 6. 마이그레이션 전략

점진적 6단계 — 각 단계에서 기존 테스트 통과 유지.

### Phase 1: `TerminalInstance` 추출 (비파괴)
- `terminal-manager.ts`에서 xterm.js 관련 코드를 `terminal-instance.ts`로 추출
- Manager가 TerminalInstance를 import해서 위임
- **검증**: `npm test` + E2E `terminal-ui.spec.ts` 통과

### Phase 2: `TerminalConnection` 추출 (비파괴)
- WebSocket 로직을 `terminal-connection.ts`로 추출
- `terminal-socket.ts` 흡수 후 삭제
- 재연결 로직 추가 (초기에는 maxAttempts=0으로 비활성)
- **검증**: 기존 소켓 테스트 마이그레이션 + 재연결 단위 테스트

### Phase 3: `TerminalSessionController` 생성 (비파괴)
- Instance + Connection을 조합하는 오케스트레이터 생성
- OSC 7, 서버 제어 프레임 디스패치, restart 로직 이동
- Manager는 이제 컬렉션 + 스토어 연결만 담당
- **검증**: 전체 E2E 통과

### Phase 4: 최종 전환 (import 변경)
- `terminal-manager.ts` → `terminal-registry.ts` 이름 변경
- 전체 import 갱신: `terminal-panel.tsx`, `x-terminal.tsx`, `terminal-search-overlay.tsx`, `use-terminal-store.ts`
- `terminalManager` → `terminalRegistry` export 변경
- 재연결 활성화 (maxAttempts=5)
- 스토어에 `serverSessionId`, `backpressured`, `searchState` 추가
- sessionStorage 영속화 추가
- **검증**: 전체 E2E + 수동 재연결 테스트

### Phase 5: 서버 개선
- `resolveInitialCwd` 비동기화 + realpath
- `backpressure_ack` 프레임 추가
- node-pty 재시도 로직
- exit 후 1초 지연 제거
- 주기적 링 버퍼 정리
- `terminal-framing.ts` 타입 확장
- **검증**: 서버 핸들러 단위 테스트 + E2E

### Phase 6: UX 개선
- 백프레셔 시각 표시기 (탭에 주황색 점)
- 재연결 중 오버레이 UI
- 검색 상태 스토어 영속화 (탭 전환 시 유지)
- copy-on-select 150ms 디바운스
- xterm 모듈 첫 터미널 열 때만 로딩 (부트 시 아님)
- 입력 큐 초과 시 토스트 경고
- **검증**: 전체 E2E + 수동 UX 테스트

---

## 7. 데이터 플로우 다이어그램

### 키입력 (사용자 → PTY)
```
사용자 타이핑
  ↓
xterm.onData(data)
  ↓
TerminalInstance.onData 콜백
  ↓
TerminalSessionController
  ↓
TerminalConnection.sendInput(data)
  ├─ status === 'open': 4KB 청킹 + WS 전송
  ├─ status === 'connecting'|'reconnecting': 입력 큐 버퍼링
  └─ status === 'closed'|'exited': 무시
  ↓
서버 수신 → ptyProcess.write(data)
```

### PTY 출력 (서버 → 화면)
```
ptyProcess.onData → 링 버퍼 + 배치 큐
  ↓ (16ms 타이머)
WS.send(바이너리)
  ↓
TerminalConnection.onPtyData 콜백
  ↓
TerminalSessionController
  ↓
TerminalInstance.write(bytes): Promise
  ↓
xterm 렌더링 → write 완료 콜백
  ↓
pendingBytes 감소
  ├─ < LOW_WATERMARK: Connection.sendResume()
  └─ > HIGH_WATERMARK: Connection.sendPause()
  ↓
서버: backpressure_ack 응답
  ↓
Controller → Store: session.backpressured = paused
  ↓
UI: 탭에 throttled 표시기
```

### 세션 생명주기
```
[생성] → connecting → open ←→ reconnecting → closed
              |          |          |             |
              |          v          |             v
              |        exited       |          [재시작]
              |          |          |             |
              v          v          v             v
           [닫기]     [닫기]     [닫기]       connecting

페이지 새로고침:
  sessionStorage → sessions 복원 → connecting → ?sessionId= → open
  (serverSessionId 만료 시 → fresh=true → 새 PTY)
```

---

## 8. 신규 파일 목록 및 예상 규모

| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `src/lib/terminal/terminal-instance.ts` | ~250 | xterm.js 래퍼 |
| `src/lib/terminal/terminal-connection.ts` | ~280 | WebSocket + 재연결 + 백프레셔 |
| `src/lib/terminal/terminal-session-controller.ts` | ~280 | 오케스트레이터 |
| `src/lib/terminal/terminal-registry.ts` | ~200 | 컬렉션 + 스토어 연결 |
| `src/lib/terminal/terminal-framing.ts` | ~110 | 프로토콜 (확장) |
| `src/lib/terminal/terminal-themes.ts` | ~134 | 테마 (변경 없음) |
| `server-handlers/terminal-handler.mjs` | ~400 | 서버 핸들러 (리팩토링) |
| `server-handlers/terminal/session-registry.mjs` | ~210 | 세션 레지스트리 (개선) |

**삭제되는 파일**:
- `src/lib/terminal/terminal-manager.ts` (989줄) → 4개 모듈로 대체
- `src/lib/terminal/terminal-socket.ts` (74줄) → `terminal-connection.ts`에 흡수

**총 코드 변화**: 1063줄 삭제, ~1010줄 생성 + ~610줄 수정 (핸들러/레지스트리/스토어/프레이밍)

---

## 9. 테스트 전략

| 모듈 | 테스트 방법 |
|------|------------|
| `terminal-instance.ts` | xterm mock으로 단위 테스트: open/attach/detach/write/fit/search |
| `terminal-connection.ts` | ws mock으로 단위 테스트: 연결/재연결/입력 큐/백프레셔 |
| `terminal-session-controller.ts` | Instance+Connection mock으로 통합 테스트: OSC 7/제어 프레임/재시작 |
| `terminal-registry.ts` | 스토어 mock으로 단위 테스트: ensureSession/closeSession/스토어 동기화 |
| 서버 핸들러 | 기존 `terminal-handler.test.ts` 확장 + backpressure_ack 테스트 |
| E2E | 기존 `terminal-ui.spec.ts` + 재연결 시나리오 추가 |
