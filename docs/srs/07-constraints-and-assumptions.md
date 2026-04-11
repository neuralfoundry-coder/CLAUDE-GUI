# 7. 제약조건 및 가정사항

## 7.1 기술적 제약

### TC-01: 커스텀 서버 필수

- WebSocket 기반 실시간 통신(터미널, Claude 스트리밍, 파일 감시)을 위해 Next.js 커스텀 `server.js`가 필수이다.
- Vercel, Netlify 등 서버리스 플랫폼에 배포할 수 없다.
- Next.js의 Automatic Static Optimization이 비활성화된다.

### TC-02: node-pty 네이티브 빌드 의존성

- `node-pty`는 C++ 네이티브 모듈로, 빌드 시 다음 도구가 필요하다:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools + Python 3
  - Linux: `build-essential`, `python3`
- 사전 빌드된 바이너리가 없는 플랫폼에서는 수동 빌드가 필요할 수 있다.

### TC-03: Monaco Editor 번들 크기

- Monaco Editor의 코어 번들은 5-10MB에 달한다.
- CDN 로더(`@monaco-editor/loader`)를 사용하여 초기 번들에서 제외한다.
- 오프라인 환경에서는 별도 CDN 미러링 또는 로컬 번들링이 필요하다.

### TC-04: `@parcel/watcher` 네이티브 바이너리

- 파일 감시는 `@parcel/watcher` v2를 사용한다. macOS FSEvents / Linux inotify / Windows ReadDirectoryChangesW 위에서 동작하는 네이티브 프리빌트 바이너리를 포함한다.
- 지원 OS × CPU 조합(`darwin-x64`, `darwin-arm64`, `linux-x64-glibc`, `linux-x64-musl`, `linux-arm64-glibc`, `win32-x64` 등)에 대해 npm 설치 시 올바른 프리빌트가 선택된다.
- 지원 외 플랫폼에서 빌드할 때는 Python 3, `make`, C++ 툴체인이 필요하다 (`node-gyp` 소스 컴파일).
- chokidar v5는 더 이상 사용하지 않는다 — v4부터 네이티브 fsevents 경로를 제거해 macOS에서 `fs.watch` 로 폴백하며, 서브디렉토리마다 파일 디스크립터 1개를 소모해 256 FD/프로세스 기본 한도에 닿으면 `EMFILE` 크래시가 발생하는 것이 실측되었다 (ADR-024 참조).

### TC-05: WebSocket과 Next.js HMR 충돌

- 커스텀 서버에서 WebSocket 업그레이드를 처리할 때, Next.js HMR용 WebSocket(`/_next/webpack-hmr`)을 별도 라우팅해야 한다.
- 동일 HTTP 서버에서 애플리케이션 WebSocket과 HMR WebSocket을 분리 처리한다.

### TC-06: 브라우저 파일시스템 접근 제한

- 웹 브라우저에서 로컬 파일시스템에 직접 접근할 수 없다.
- 반드시 Node.js 서버 브릿지를 통해 파일 시스템 작업을 수행해야 한다.
- Chrome File System Access API는 보조적으로만 사용 가능 (모든 브라우저 미지원).

---

## 7.2 비즈니스 제약

### BC-01: 단일 사용자 환경

- ClaudeGUI는 로컬 개발자 도구로, 멀티 유저/멀티 테넌트를 지원하지 않는다.
- 로컬 머신의 OS 사용자 권한으로 실행된다.
- 동시에 여러 사용자가 같은 인스턴스에 접속하는 시나리오는 고려하지 않는다.

### BC-02: 영속 저장소 없음 (v1.0)

- ClaudeGUI v1.0은 자체 데이터베이스를 사용하지 않는다.
- Claude 세션 데이터는 Claude CLI가 `~/.claude/projects/`에서 관리하며, ClaudeGUI는 해당 디렉토리를 읽기 전용으로 조회한다.
- 패널 크기·테마 등 UI 선호 설정은 브라우저 `localStorage`에 저장한다.
- 서버는 stateless이며, 프로세스 재시작 시 메모리 상의 세션 상태(PTY, WS 연결)만 손실된다.
- 향후 메타데이터 저장 요구가 생기면 `migrations/` 디렉토리 도입을 재평가한다.

### BC-02: Claude 구독 필수

- Claude CLI 사용을 위해 Anthropic의 Claude Pro, Max, Team, 또는 Enterprise 플랜 구독이 필요하다.
- API 키(`ANTHROPIC_API_KEY`) 또는 인증 토큰(`ANTHROPIC_AUTH_TOKEN`)이 설정되어 있어야 한다.

### BC-03: 오픈소스 라이선스 호환

- 사용하는 모든 오픈소스 라이브러리의 라이선스가 프로젝트 라이선스와 호환되어야 한다.
- reveal.js: MIT 라이선스 (상업적 기능 사용 시 별도 라이선스 확인)
- Monaco Editor: MIT 라이선스
- xterm.js: MIT 라이선스

---

## 7.3 가정사항

### A-01: Claude CLI 사전 설치

- 사용자가 ClaudeGUI 실행 전에 `claude` CLI를 설치하고 PATH에 등록했다고 가정한다.
- CLI 버전 호환성은 최신 안정 버전을 기준으로 한다.

### A-02: 인증 완료 상태

- 사용자가 Claude CLI 인증(`claude login` 또는 API 키 설정)을 사전에 완료했다고 가정한다.
- ClaudeGUI는 자체 인증 플로우를 제공하지 않는다.

### A-03: Agent SDK API 안정성

- `@anthropic-ai/claude-agent-sdk`의 핵심 API(`query()`, `startup()`, 이벤트 타입)가 하위 호환성을 유지한다고 가정한다.
- 주요 브레이킹 체인지 발생 시 ClaudeGUI 업데이트가 필요할 수 있다.

### A-04: 네트워크 가용성

- Anthropic API 호출을 위한 인터넷 연결이 가용하다고 가정한다.
- 오프라인 상태에서는 Claude 관련 기능이 비활성화되며, 에디터/터미널/파일 탐색기만 동작한다.

### A-05: 프로젝트 규모

- 일반적인 소프트웨어 개발 프로젝트 규모(수천~수만 개 파일)를 대상으로 한다.
- 100만 개 이상 파일의 초대형 모노레포는 성능 보장 범위 밖이다.

---

## 7.4 의존성 매트릭스

### 핵심 의존성

| 패키지 | 최소 버전 | 역할 | 리스크 |
|--------|----------|------|--------|
| `next` | 14.0 | 앱 프레임워크 | App Router API 변경 |
| `react` | 18.2 | UI 라이브러리 | React 19 마이그레이션 |
| `@anthropic-ai/claude-agent-sdk` | 최신 | CLI 통합 | API 브레이킹 체인지 |
| `@monaco-editor/react` | 4.6 | 코드 에디터 | Monaco 버전 호환 |
| `@xterm/xterm` | 5.0 | 터미널 | xterm.js 6.x 마이그레이션 |
| `node-pty` | 1.0 | PTY 백엔드 | 네이티브 빌드 실패 |
| `react-resizable-panels` | 2.0 | 패널 레이아웃 | — |
| `react-arborist` | 3.4 | 파일 트리 | — |
| `ws` | 8.0 | WebSocket 서버 | — |
| `@parcel/watcher` | 2.5 | 파일 감시 (FSEvents/inotify 네이티브 백엔드) | 지원 외 플랫폼에서 소스 빌드 필요 |
| `reveal.js` | 5.0 | 프레젠테이션 | — |
| `zustand` | 5.0 | 상태 관리 | — |
| `react-pdf` | 10.0 | PDF 렌더링 | pdf.js 호환 |
| `react-markdown` | 9.0 | MD 렌더링 | — |
| `cmdk` | 1.0 | 커맨드 팔레트 | — |
| `PptxGenJS` | 3.0 | PPTX 내보내기 | — |

### 의존성 업데이트 전략

- **주간**: npm audit으로 보안 취약점 점검
- **월간**: 마이너 버전 업데이트 검토
- **분기별**: 메이저 버전 업데이트 평가 및 마이그레이션 계획
- **즉시**: 보안 취약점 발견 시 긴급 패치

---

## 7.5 리스크 관리

| 리스크 | 영향도 | 발생 확률 | 대응 전략 |
|--------|--------|----------|-----------|
| Agent SDK API 변경 | 높음 | 중간 | SDK 래퍼 레이어 추상화, 버전 고정 |
| Claude CLI 출력 형식 변경 | 높음 | 낮음 | NDJSON 파서 분리, 통합 테스트 |
| node-pty 빌드 실패 | 중간 | 중간 | Docker 빌드 환경 제공, 사전 빌드 바이너리 |
| Monaco CDN 가용성 | 중간 | 낮음 | 로컬 번들 폴백 옵션 |
| 브라우저 API 변경 | 낮음 | 낮음 | Chrome 릴리스 노트 모니터링 |
| reveal.js 라이선스 변경 | 중간 | 낮음 | 대안: Marp, Slidev 평가 |
