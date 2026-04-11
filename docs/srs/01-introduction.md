# 1. 서론

## 1.1 목적

본 문서는 **ClaudeGUI** 프로젝트의 소프트웨어 요구사항을 정의한다. ClaudeGUI는 Anthropic의 Claude CLI를 웹 기반 IDE 형태로 래핑하여, 터미널의 한계를 극복하고 시각적 편집 환경을 제공하는 시스템이다.

대상 독자:
- 프론트엔드/백엔드 개발자
- UI/UX 디자이너
- QA 엔지니어
- 프로젝트 관리자

## 1.2 프로젝트 범위

### 포함 범위

- 4분할 패널 레이아웃 (파일 탐색기, 코드 에디터, 터미널, 프리뷰)
- Monaco Editor 기반 코드 편집 (멀티탭, 구문 강조)
- xterm.js 기반 터미널 에뮬레이션
- Claude Agent SDK를 통한 CLI 통합 및 실시간 스트리밍
- 멀티포맷 실시간 프리뷰 (HTML, PDF, Markdown, 이미지, 프레젠테이션)
- reveal.js 기반 HTML 프레젠테이션 생성 및 대화형 편집
- 권한 요청 인터셉트 및 GUI 승인/거부 인터페이스
- 세션 관리 (생성, 재개, 포크)
- 커맨드 팔레트 및 키보드 단축키

### 제외 범위

- 멀티 유저 / 멀티 테넌트 지원
- 클라우드 SaaS 배포 (로컬 실행 전용)
- Claude CLI 자체의 기능 수정 또는 확장
- 모바일 네이티브 앱
- LSP (Language Server Protocol) 통합 (1.0 이후 고려)

## 1.3 용어 및 약어 정의

| 용어 | 정의 |
|------|------|
| **Agent SDK** | `@anthropic-ai/claude-agent-sdk` — Claude CLI를 프로그래밍 방식으로 제어하기 위한 Anthropic 공식 SDK |
| **NDJSON** | Newline-Delimited JSON — 줄바꿈으로 구분된 JSON 스트리밍 형식 |
| **PTY** | Pseudo-Terminal — 터미널 에뮬레이션을 위한 가상 터미널 디바이스 |
| **MCP** | Model Context Protocol — 외부 도구 연동 프로토콜 |
| **WebSocket** | 브라우저와 서버 간 양방향 전이중 통신 프로토콜 |
| **SSR** | Server-Side Rendering — 서버에서 HTML을 생성하여 클라이언트에 전송하는 방식 |
| **CSR** | Client-Side Rendering — 브라우저에서 JavaScript로 UI를 렌더링하는 방식 |
| **srcdoc** | iframe의 HTML 콘텐츠를 인라인으로 지정하는 속성 |
| **reveal.js** | HTML 기반 프레젠테이션 프레임워크 (70k+ GitHub stars) |
| **Monaco** | VS Code의 코어 에디터 엔진 |
| **xterm.js** | 브라우저 기반 터미널 에뮬레이터 라이브러리 |
| **@parcel/watcher** | 네이티브 FSEvents/inotify/ReadDirectoryChangesW 위에서 동작하는 크로스플랫폼 파일 시스템 감시 라이브러리 (ClaudeGUI가 chokidar v5 대신 채택 — ADR-024) |
| **node-pty** | Node.js용 의사 터미널 바인딩 (Microsoft 유지관리) |
| **Zustand** | 경량 React 상태 관리 라이브러리 |

## 1.4 참고 문서

### 내부 문서

- [Claude GUI: Development Plan for a Web-Based IDE Wrapping Claude CLI](../research/Claude%20GUI_%20Development%20Plan%20for%20a%20Web-Based%20IDE%20Wrapping%20Claude%20CLI.md)
- [Claude CLI GUI 개발 계획서](../research/Claude%20CLI%20GUI%20개발%20계획서.md)
- [웹 기반 AI 에디터 시스템 보고서](../research/이%20보고서는%20Anthropic%20Claude%20CLI를%20기반으로%20한%20웹%20기반%20AI%20에디터%20시스템.md)

### 외부 문서

- Anthropic Claude Code 공식 문서
- Claude Agent SDK API 레퍼런스
- Next.js 14+ App Router 문서
- Monaco Editor API 문서
- xterm.js API 문서

## 1.5 개요

본 SRS는 IEEE 830 표준을 기반으로 다음 구조로 구성된다:

- **2장 전체 설명**: 제품 관점, 사용자 특성, 운영 환경, 제약사항
- **3장 기능 요구사항**: 9개 카테고리(FR-100~FR-900)의 상세 기능 명세
- **4장 비기능 요구사항**: 성능, 보안, 사용성, 호환성, 유지보수성
- **5장 유스케이스**: 8개 주요 시나리오
- **6장 외부 인터페이스**: UI, 소프트웨어, 통신, 하드웨어 인터페이스
- **7장 제약조건 및 가정사항**: 기술/비즈니스 제약과 의존성
