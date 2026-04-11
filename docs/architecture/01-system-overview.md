# 1. 시스템 전체 아키텍처

## 1.1 아키텍처 개요

ClaudeGUI는 **하이브리드 로컬 서버 아키텍처**를 채택한다. 브라우저(React 프론트엔드)가 로컬 머신에서 실행되는 커스텀 Node.js 서버와 WebSocket/REST로 통신하며, 서버는 Claude CLI, 파일시스템, PTY 등 로컬 자원을 관리한다.

### 왜 커스텀 Node.js 서버인가?

| 요구사항 | 서버리스 (Vercel) | 커스텀 Node.js | 채택 |
|----------|------------------|---------------|------|
| WebSocket 양방향 스트리밍 | ❌ 지원 제한 | ✅ 네이티브 지원 | ✅ |
| 장기 실행 Claude 세션 | ❌ 타임아웃 | ✅ 상태 유지 | ✅ |
| 로컬 파일시스템 접근 | ❌ 불가 | ✅ fs 모듈 직접 접근 | ✅ |
| node-pty 통합 | ❌ 불가 | ✅ 네이티브 모듈 | ✅ |
| chokidar 파일 감시 | ❌ 상태 없음 | ✅ 지속 감시 | ✅ |
| 세션 지속성 | ❌ stateless | ✅ stateful | ✅ |

**결론**: 커스텀 Node.js 서버(`server.js`)가 유일한 선택지이다.

## 1.2 시스템 아키텍처 다이어그램

```
┌──────────────────────────────────────────────────────────────────┐
│                     Browser (Chrome)                             │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         Next.js App (React + TypeScript)                   │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  UI Layer (4-Panel Layout)                            │  │  │
│  │  │  ┌─────────┬─────────────────────┬────────────────┐  │  │  │
│  │  │  │  File   │   Monaco Editor     │  Preview       │  │  │  │
│  │  │  │Explorer │   (Multi-Tab)       │  (HTML/PDF/    │  │  │  │
│  │  │  │         ├─────────────────────┤  MD/Slides)    │  │  │  │
│  │  │  │         │   Terminal (xterm)  │                │  │  │  │
│  │  │  └─────────┴─────────────────────┴────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  State Layer (Zustand Stores)                        │  │  │
│  │  │  layout │ editor │ terminal │ claude │ preview      │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Communication Layer                                  │  │  │
│  │  │  WebSocket Clients │ REST API Client                  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │                                    │
         │ WebSocket                          │ HTTP REST
         │ (ws library)                       │
         ▼                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│              Custom Node.js Server (server.js)                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  HTTP Server + WebSocket Upgrade Handler                   │  │
│  └───────┬────────────────────────────────────────┬───────────┘  │
│          │                                        │              │
│  ┌───────▼────────┐                    ┌──────────▼───────────┐  │
│  │ WebSocket      │                    │ Next.js Request      │  │
│  │ Router         │                    │ Handler (SSR, API)   │  │
│  │                │                    │                      │  │
│  │ /ws/terminal   │                    │ /api/files/*         │  │
│  │ /ws/claude     │                    │ /api/sessions/*      │  │
│  │ /ws/files      │                    │                      │  │
│  └───┬─────┬──┬───┘                    └──────────────────────┘  │
│      │     │  │                                   │              │
│      ▼     ▼  ▼                                   ▼              │
│  ┌─────┐┌──────┐┌──────────┐              ┌──────────────┐     │
│  │node-││Agent ││chokidar  │              │  fs/promises │     │
│  │pty  ││SDK   ││Watcher   │              │  (sandboxed) │     │
│  └──┬──┘└──┬───┘└────┬─────┘              └──────┬───────┘     │
└─────┼──────┼─────────┼───────────────────────────┼─────────────┘
      │      │         │                           │
      ▼      ▼         ▼                           ▼
   ┌─────┐ ┌──────────┐ ┌─────────────────────────────────────┐
   │Shell│ │Claude CLI│ │      Local File System              │
   │(PTY)│ │ Process  │ │   /project/src, /project/docs, ...  │
   └─────┘ └──────────┘ └─────────────────────────────────────┘
```

## 1.3 기술 스택 결정 표

### 프론트엔드

| 계층 | 기술 | 선택 근거 |
|------|------|----------|
| **Framework** | Next.js 14+ App Router | SSR + 커스텀 서버 지원 |
| **Language** | TypeScript (strict) | 타입 안전성, 리팩토링 안정성 |
| **UI Library** | React 18+ | 생태계, App Router 호환 |
| **Styling** | Tailwind CSS + shadcn/ui | 유틸리티 우선, Radix 기반 접근성 |
| **Panels** | react-resizable-panels v4 | 5.2k stars, localStorage, 접기/펼치기 |
| **Editor** | @monaco-editor/react | VS Code 엔진, 100+ 언어 |
| **File Tree** | react-arborist v3.4 | 가상화, 드래그앤드롭, F2 인라인 편집 |
| **Terminal** | @xterm/xterm v5 | 17k stars, WebGL 가속 |
| **State** | Zustand v5 | 경량, persist 미들웨어 |
| **Command Palette** | cmdk | Linear/Vercel에서 검증됨 |
| **PDF Viewer** | react-pdf v10 | pdf.js 5.x, Web Worker |
| **Markdown** | react-markdown + remark-gfm | AST 기반, XSS 방지 |
| **Slides** | reveal.js 5.x | 70k stars, Reveal.sync() API |
| **Icons** | lucide-react | 일관된 스타일, 트리 쉐이킹 |

### 백엔드

| 계층 | 기술 | 선택 근거 |
|------|------|----------|
| **Runtime** | Node.js 20+ LTS | chokidar v5 ESM, 안정성 |
| **Server** | Next.js + 커스텀 server.js | WebSocket 필수 |
| **WebSocket** | ws v8 | 경량, 표준 준수 |
| **Terminal Backend** | node-pty | Microsoft 유지관리, PTY 세션 |
| **File Watching** | chokidar v5 | 크로스 플랫폼, 정확한 이벤트 |
| **CLI Integration** | @anthropic-ai/claude-agent-sdk | 공식 SDK, 타입 안전 |
| **PPTX Export** | PptxGenJS | 순수 JS, 의존성 없음 |

## 1.4 계층 구조

### 프레젠테이션 계층 (Presentation Layer)

- **역할**: UI 렌더링, 사용자 입력 처리, 레이아웃 관리
- **구성**: React 컴포넌트 (패널, 에디터, 터미널, 프리뷰)
- **위치**: `src/components/`, `src/app/`

### 상태 관리 계층 (State Layer)

- **역할**: 전역 상태 관리, WebSocket 메시지 디스패치, 영속화
- **구성**: Zustand 스토어 (layout, editor, terminal, claude, preview)
- **위치**: `src/stores/`

### 통신 계층 (Communication Layer)

- **역할**: 서버와의 양방향 통신, 재연결 관리, 메시지 직렬화
- **구성**: WebSocket 클라이언트, REST API 클라이언트
- **위치**: `src/lib/websocket/`, `src/lib/api/`

### 비즈니스 로직 계층 (Business Logic Layer) — 서버 측

- **역할**: 요청 라우팅, 인증, 파일 작업, Claude 세션 관리
- **구성**: Next.js API 핸들러, WebSocket 핸들러
- **위치**: `src/app/api/`, `server.js`의 핸들러 모듈

### 인프라 계층 (Infrastructure Layer) — 서버 측

- **역할**: 외부 자원 접근 (파일시스템, PTY, Claude CLI)
- **구성**: node-pty, chokidar, fs/promises, Agent SDK 래퍼
- **위치**: `src/lib/fs/`, `src/lib/claude/`, `src/lib/pty/`

## 1.5 주요 아키텍처 결정 (ADR)

### ADR-001: ws 라이브러리 선택

**결정**: socket.io 대신 `ws` 라이브러리 사용

**맥락**: WebSocket 통신 구현 방식 선택 필요

**근거**:
- `ws`: ~5KB 오버헤드, 표준 WebSocket 준수
- `socket.io`: ~10.4KB 오버헤드, 폴백 메커니즘 포함 (불필요)
- 브라우저 native `WebSocket`과 직접 호환
- Next.js 커스텀 서버와 통합 용이

**결과**: 낮은 오버헤드, 표준 준수, 간단한 통합

---

### ADR-002: Agent SDK 사용

**결정**: `child_process.spawn()` 직접 호출 대신 `@anthropic-ai/claude-agent-sdk` 사용

**맥락**: Claude CLI를 프로그래밍 방식으로 제어하는 방법

**근거**:
- `child_process.spawn()`은 Claude CLI에서 hang 이슈 보고됨
- Agent SDK는 async generator로 이벤트 스트림 제공
- 타입 안전한 `SDKMessage` 이벤트
- 내장 세션 관리 (resume, fork)
- `startup()` 사전 워밍업 (~20× 빠른 첫 쿼리)

**결과**: 안정성 향상, 코드 복잡도 감소, 세션 관리 자동화

---

### ADR-003: Monaco Editor 선택

**결정**: CodeMirror 6 대신 Monaco Editor 사용

**맥락**: 코드 에디터 엔진 선택

**근거**:
- VS Code와 동일한 엔진 → 개발자 친숙도
- 100+ 언어 구문 강조 기본 지원
- IntelliSense, 코드 폴딩, 다중 커서 등 IDE 기능
- diff 뷰어 내장 (AI 변경사항 표시)
- CDN 로딩으로 번들 크기 문제 완화

**대안 검토**:
- CodeMirror 6: 경량이지만 IDE 기능 부족, 추가 설정 필요

**트레이드오프**: 번들 크기 5-10MB → CDN 로더로 해결

---

### ADR-004: react-resizable-panels 선택

**결정**: 패널 레이아웃에 `react-resizable-panels` v4 사용

**맥락**: 4분할 패널 레이아웃 구현

**근거**:
- 5.2k GitHub stars, 활발한 유지관리
- `autoSaveId`로 localStorage 자동 영속화
- 접기/펼치기 (collapsedSize) 네이티브 지원
- 중첩 `PanelGroup` 지원 (수직 + 수평 조합)
- 키보드 접근성 내장

---

### ADR-005: Zustand 상태 관리

**결정**: Redux/Redux Toolkit 대신 Zustand v5 사용

**맥락**: 전역 상태 관리 라이브러리 선택

**근거**:
- 보일러플레이트 최소 (액션/리듀서 불필요)
- React 외부에서 스토어 직접 접근 가능 → WebSocket 핸들러에서 편리
- `persist` 미들웨어 내장 (localStorage 영속화)
- 슬라이스 패턴으로 모듈화 용이
- 학습 곡선 낮음

**대안 검토**:
- Redux Toolkit: 강력하지만 보일러플레이트 과다
- Jotai: atomic 접근, 세밀한 상태에만 보조 사용 예정

---

### ADR-006: reveal.js 선택

**결정**: Marp 대신 reveal.js 5.x 사용

**맥락**: HTML 프레젠테이션 엔진 선택

**근거**:
- 70k GitHub stars, 실전 검증됨
- `Reveal.sync()` API로 리로드 없이 슬라이드 업데이트 가능
- Auto-Animate, 테마 12종, 스피커 노트
- 프로그래매틱 제어 (`Reveal.slide(h, v, f)`)
- PDF/PPTX 내보내기 도구 존재 (DeckTape, PptxGenJS)

**대안 검토**:
- Marp: Markdown 기반 간편, 하지만 동적 편집 API 제한적
- Slidev: Vue 기반 → React 스택 부조화

---

### ADR-007: 커스텀 Node.js 서버

**결정**: Vercel 배포 대신 커스텀 `server.js` 사용

**맥락**: 배포 방식 선택

**근거**: 1.1절 표 참조 (WebSocket, node-pty, 장기 세션 등 필수 요구사항)

**트레이드오프**: Automatic Static Optimization 비활성화, Docker/Railway/Fly.io/self-hosted만 가능

---

### ADR-008: iframe srcdoc 방식 HTML 프리뷰

**결정**: `innerHTML` 직접 주입 대신 iframe `srcdoc` + sandbox 사용

**맥락**: HTML 프리뷰 구현 방식

**근거**:
- 완전한 CSS/JS 격리 (샌드박싱)
- XSS 공격 표면 최소화
- `sandbox="allow-scripts"` (allow-same-origin 없이)
- 부모-자식 통신은 `postMessage`로 제어
- CSS만 변경 시 `postMessage`로 스타일만 패치 → iframe 리로드 방지

**주의사항**: `allow-same-origin`과 `allow-scripts`를 **절대** 조합하지 않는다 (샌드박스 무효화)
