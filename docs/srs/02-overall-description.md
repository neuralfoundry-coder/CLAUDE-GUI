# 2. 전체 설명

## 2.1 제품 관점

ClaudeGUI는 Anthropic Claude CLI의 **웹 기반 GUI 래퍼**이다. CLI의 모든 기능을 보존하면서, 전문 IDE 수준의 시각적 편집 환경을 추가한다.

기존의 터미널 기반 워크플로우에서는 다음과 같은 한계가 있다:

- 파일 탐색이 `ls`/`tree` 명령에 의존
- 코드 편집 시 별도 에디터 필요
- HTML/PDF/프레젠테이션 등 결과물의 시각적 확인 불가
- Claude의 작업 진행 상황을 텍스트 스트림으로만 파악

ClaudeGUI는 이러한 한계를 해결하여, Claude를 **"에이전트 관리 콘솔"** 관점에서 운영할 수 있는 통합 환경을 제공한다.

### 기존 유사 프로젝트와의 차별점

| 프로젝트 | 차이점 |
|----------|--------|
| **claudecodeui** (siteboon) | 기본적 WebSocket 브릿지 수준. 멀티포맷 프리뷰, 프레젠테이션 편집 미지원 |
| **claude-code-web** (vultuk) | CodeMirror 기반. 전문 IDE 수준 편집기 미달, 프리뷰 패널 없음 |
| **code-server** | VS Code 래핑. Claude CLI 전용 통합 없음 |
| **Bolt.new/bolt.diy** | WebContainer(WASM) 기반. 로컬 파일시스템 직접 접근 불가 |

ClaudeGUI의 핵심 차별점:
1. **전문 IDE + 리치 프리뷰**: 코드 편집과 HTML/PDF/슬라이드 프리뷰를 한 화면에 통합
2. **대화형 시각 편집**: Claude에게 자연어로 슬라이드 수정 요청 → 실시간 WYSIWYG 반영
3. **에이전트 가시성**: stream-json 파싱으로 Claude의 추론 과정(현재 파일, 검색 쿼리, 도구 호출)을 실시간 표시

## 2.2 제품 기능 요약

| # | 기능 | SRS 참조 |
|---|------|----------|
| 1 | 4분할 패널 레이아웃 (접기/펼치기, 리사이즈) | FR-100 |
| 2 | 파일 탐색기 (트리 뷰, Git 상태, 드래그앤드롭) | FR-200 |
| 3 | Monaco 코드 에디터 (멀티탭, AI diff, 실시간 동기화) | FR-300 |
| 4 | 터미널 에뮬레이션 (ANSI, GPU 가속, 다중 세션) | FR-400 |
| 5 | Claude CLI 통합 (Agent SDK, 스트리밍, 세션 관리) | FR-500 |
| 6 | 멀티포맷 프리뷰 (HTML, PDF, Markdown, 이미지) | FR-600 |
| 7 | HTML 프레젠테이션 (reveal.js, 대화형 편집, 내보내기) | FR-700 |
| 8 | 커맨드 팔레트 및 키보드 단축키 | FR-800 |
| 9 | 파일 시스템 API (CRUD, 감시, 샌드박싱) | FR-900 |

## 2.3 사용자 특성

### 주요 대상 사용자

- **소프트웨어 개발자**: Claude Pro/Max/Team/Enterprise 구독자
- **기술 수준**: CLI 사용 경험이 있는 중급 이상 개발자
- **사용 환경**: 로컬 개발 환경 (macOS, Windows, Linux)

### 사용자 기대

- VS Code와 유사한 키바인딩 및 편집 경험
- 터미널 전환 없이 Claude 작업 결과를 즉시 시각적으로 확인
- Claude의 파일 수정을 에디터에서 직접 수락/거절
- 프레젠테이션 등 비코드 산출물도 대화형으로 편집

## 2.4 운영 환경

### 지원 운영체제

- macOS 13 (Ventura) 이상
- Windows 10 이상
- Ubuntu 20.04 LTS 이상

### 필수 소프트웨어

| 소프트웨어 | 최소 버전 | 비고 |
|-----------|----------|------|
| Node.js | 20.0+ | `@parcel/watcher` / node-pty 네이티브 바이너리, ESM dynamic import 안정성 |
| Claude CLI | 최신 | `claude` 명령어 PATH 등록 필수 |
| npm | 10.0+ | 패키지 관리 |
| Chrome | 최신 2개 버전 | 기본 타겟 브라우저 |
| C++ 빌드 도구 | — | node-pty 네이티브 빌드 (python3, make, g++) |

### 네트워크

- Anthropic API 접속을 위한 인터넷 연결 필수
- 서버는 기본적으로 `localhost:3000`에 바인딩
- 원격 접근 필요 시 SSH 터널 또는 Cloudflare Tunnel 사용

## 2.5 설계 및 구현 제약사항

1. **커스텀 서버 필수**: WebSocket 지원을 위해 Next.js 커스텀 `server.js` 사용. Vercel 등 서버리스 플랫폼 배포 불가.
2. **node-pty 네이티브 의존성**: C++ 컴파일러 및 Python 3 빌드 환경 필요.
3. **단일 사용자**: 멀티 테넌트 아키텍처 아님. 로컬 머신의 현재 OS 사용자 권한으로 실행.
4. **Claude CLI 의존**: Claude CLI가 설치되어 있어야 핵심 기능 동작.
5. **번들 크기**: Monaco Editor의 번들 크기(5-10MB)로 인해 CDN 로딩 방식 채택.

## 2.6 가정 및 의존성

### 가정

- 사용자가 Claude CLI를 사전 설치하고 인증을 완료한 상태
- 로컬 머신에서 Node.js 20+ 환경이 준비됨
- 네이티브 모듈 빌드를 위한 C++ 빌드 도구가 설치됨
- 브라우저로 Chrome을 사용

### 외부 의존성

- **Anthropic Claude Agent SDK**: API 안정성 및 하위 호환성 유지 가정
- **Claude CLI**: `--output-format stream-json` 옵션 지속 지원 가정
- **npm 패키지**: 주요 의존성의 활발한 유지관리 상태 (Monaco, xterm.js, reveal.js 등)
