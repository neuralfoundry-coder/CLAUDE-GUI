# ClaudeGUI 아키텍처 설계 문서

> 🌐 **Language / 언어**: [한국어](./README.md) · [English](../en/architecture/README.md)

| 항목 | 내용 |
|------|------|
| **문서 버전** | 1.0 |
| **작성일** | 2026-04-11 |
| **상태** | 초안 (Draft) |

## 목차

1. [시스템 전체 아키텍처](./01-system-overview.md)
2. [컴포넌트 상세 설계](./02-component-design.md)
3. [데이터 흐름](./03-data-flow.md)
4. [API 설계](./04-api-design.md)
5. [보안 아키텍처](./05-security-architecture.md)
6. [배포 및 운영](./06-deployment.md)

## 주요 아키텍처 결정 (ADR) 요약

| ID | 결정 | 근거 |
|----|------|------|
| ADR-001 | `ws` 라이브러리 (socket.io 대신) | 낮은 오버헤드(~5KB vs 10.4KB), 표준 WebSocket 준수 |
| ADR-002 | Agent SDK 사용 (child_process 대신) | 프로세스 행(hang) 이슈 회피, 타입 안전성, 세션 관리 |
| ADR-003 | Monaco Editor (CodeMirror 대신) | VS Code 수준 기능, 100+ 언어 지원, 개발자 친숙도 |
| ADR-004 | `react-resizable-panels` | 5.2k stars, localStorage 지원, 접기/펼치기 |
| ADR-005 | Zustand (Redux 대신) | 경량, React 외부 접근, 보일러플레이트 최소 |
| ADR-006 | reveal.js (Marp 대신) | 70k stars, 풍부한 API, Reveal.sync() 실시간 편집 |
| ADR-007 | 커스텀 Node.js 서버 (Vercel 대신) | WebSocket 필수, 장기 프로세스 지원 |
| ADR-008 | iframe srcdoc (eval 대신) | 샌드박싱 보안, postMessage 통신 |
| ADR-009 | Git 상태 조회에 `git` CLI 사용 | isomorphic-git 번들 비용 회피, 성능, 단순성 — `src/lib/fs/git-status.ts` |
| ADR-010 | `/api/files/raw` 바이너리 엔드포인트 분리 | 이미지/PDF 스트리밍 전용, 텍스트 READ와 보안 경계 분리 |
| ADR-011 | Agent SDK `canUseTool` 콜백 기반 권한 처리 | tool_use 스트림 인터셉트 대신 공식 SDK 옵션 사용 — 이벤트 순서 및 aborted signal 안정적 처리. 구현: `server-handlers/claude-handler.mjs` |
| ADR-012 | `didWebSocketSetup = true` 플래그로 NextCustomServer 자체 upgrade 리스너 차단 | Next 14 내부 WebSocket setup과 ClaudeGUI의 `/ws/*` 라우팅 충돌 방지. Next 메이저 업그레이드 시 재검증 필요. 구현: `server.js` |
| ADR-013 | `/ws/files`와 `/ws/claude` 싱글톤 클라이언트 | 페이지 내 여러 훅이 호출해도 단일 WS 연결만 유지. `getFilesClient()`, `getClaudeClient()` — `src/lib/websocket/*-client.ts`. 연결 상태는 `useConnectionStore`로 통합. |
| ADR-014 | 라인 기반 LCS diff + hunk 단위 부분 수락 | Monaco DiffEditor API 대신 순수 JS LCS 구현 사용. 서버/클라 일관 결과, 테스트 용이. 구현: `src/lib/diff/line-diff.ts`, `src/stores/use-editor-store.ts`의 `toggleHunk`/`applyAcceptedHunks` |
| ADR-015 | `.claude/settings.json`의 `permissions.allow`/`deny` 편집 UI | `canUseTool` 콜백은 사용자 승인만 처리하고, 영구 자동승인은 settings.json의 Claude Code 표준 규칙을 통해 설정. 파싱/저장: `src/lib/claude/settings-manager.ts` |
| ADR-016 | `ProjectContext` 싱글톤 기반 런타임 프로젝트 핫스왑 | 부팅 시 1회 고정이던 `PROJECT_ROOT`를 런타임에 교체. `src/lib/project/project-context.mjs`가 단일 source of truth이며 files/terminal/claude 핸들러와 `resolveSafe`가 모두 `getActiveRoot()`를 조회. 변경 시 chokidar 재시작 + `project-changed` WS 브로드캐스트. 상태는 `~/.claudegui/state.json`에 영속화. |
| ADR-017 | HTML 스트리밍 추출기 (상태 머신) | Claude 어시스턴트 텍스트에서 ` ```html ` 펜스 블록과 `Write`/`Edit` `tool_use`를 감시해 부분 HTML을 라이브 프리뷰로 흘려 보냄. 렌더 가능 판정(`<!doctype` / 균형 태그)으로 iframe srcdoc vs. 소스 뷰 폴백 전환. 구현: `src/lib/claude/html-stream-extractor.ts`, `src/stores/use-live-preview-store.ts`. |
| ADR-018 | Tauri v2 + Node 사이드카 네이티브 인스톨러 | Electron 대신 Tauri 웹뷰 + 번들 Node.js 사이드카로 `server.js` 실행. `.dmg`/`.msi` 40~60MB, node-pty ABI는 CI에서 번들 Node 버전 기준 재빌드. 첫 실행 시 앱 로컬 `node-prefix`에 `@anthropic-ai/claude-code` 자동 설치 후 PTY env.PATH에 prepend. 구현: `installer/tauri/`, `scripts/installer-runtime/ensure-claude-cli.mjs`. |
| ADR-019 | 터미널 세션 지속성 정책 — 로그인·인터랙티브 쉘 + 자동 재연결 제거 + Restart-in-place | (a) PTY를 `['-l','-i']` 플래그로 spawn해 사용자 dotfile을 소스한다(FR-410). (b) ~터미널 WebSocket은 자동 재연결하지 않는다~ → **ADR-020이 supersede**. (c) ~서버측 세션 레지스트리는 도입하지 않는다~ → **ADR-020이 supersede**. (d) 프로젝트 전환 시 기존 탭에 자동 `cd`를 주입하지 않는다 — 실행 중 프로세스 훼손 위험. 대신 "Open new tab here" 배너를 표시한다. (e) cwd 추적은 OSC 7 emitter 스니펫을 연결 직후 한 번 주입하는 방식으로 구현한다. 구현: `server-handlers/terminal/shell-resolver.mjs`, `src/lib/terminal/terminal-socket.ts`, `src/lib/terminal/terminal-manager.ts` (`restartSession`, `injectShellHelpers`), `src/components/panels/terminal/terminal-panel.tsx`. |
| ADR-020 | 서버측 터미널 세션 레지스트리 + 재연결 재생 (ADR-019 (b)/(c) 대체) | v0.5에서 사용자 요청으로 도입. PTY를 프로세스 메모리 내 `TerminalSessionRegistry`에 등록하고 WebSocket disconnect 시 PTY를 kill하지 않고 detach만 수행한다. 30분 grace 타이머 동안 `?sessionId=<uuid>`로 재연결하면 링 버퍼(256 KB)를 `{type:"session",replay:true}` + 바이너리 프레임으로 재생해 스크롤백이 복원된다. 탭 close 버튼은 `{type:"close"}` 제어 프레임을 송신해 즉시 destroy. Restart in-place도 동일 경로를 공유한다(끊었다가 같은 id로 재연결 = 재생). 서버 프로세스 재시작 시 모든 세션 손실(영속화는 미래 작업). 근거: 사용자 워크플로우에서 HMR/브라우저 새로고침 시 쉘 상태 손실이 반복적으로 발생해 ADR-019의 "단순함 우선" 타협을 재평가함. 구현: `server-handlers/terminal/session-registry.mjs`, `server-handlers/terminal-handler.mjs`, `src/lib/terminal/terminal-manager.ts` (`buildSocketUrl`, `applyServerControl`의 `session` 케이스, `closeSession`의 `{type:"close"}` 송신), `src/lib/terminal/terminal-framing.ts` (`TerminalCloseControl`, `TerminalSessionServerControl`). |
| ADR-021 | 탐색기 기반 동적 재루팅 + 사일런트 cwd 폴백 제거 (ADR-016 보강) | v0.6에서 사용자 요청으로 도입. (a) `validateProjectRoot`의 `$HOME` 금지 조항을 삭제하고 파일시스템 루트(`/`, Windows 드라이브 루트)만 거부한다 — 사용자가 홈 디렉토리 또는 그 상위 임의 경로를 프로젝트로 열 수 있어야 한다는 요구에 대응. dotfile deny 리스트(`resolveSafe`)는 유지되어 민감 파일 접근은 계속 차단. (b) `resolveInitialRoot`가 `process.cwd()`로 폴백하던 로직을 삭제하고 `null`을 반환하게 변경 — 서버가 실행된 위치(예: 홈 디렉토리)가 조용히 프로젝트 루트가 되어 Claude가 엉뚱한 경로에 파일을 생성하는 문제를 방지. (c) `getActiveRoot(): string \| null`로 시그니처 완화. 활성 루트 부재 시 `claude-handler`는 `runQuery`에서 `4412` 에러를 즉시 반환하고, `resolveSafe`/`getProjectRoot()`는 `SandboxError(4412)`를 던지며, `chokidar` 감시는 idle 상태로 대기한다. 터미널은 `os.homedir()` 폴백을 유지한다. (d) `AppShell`의 `useEffect`가 refresh 완료 후 루트가 null이면 `ProjectPickerModal`을 강제로 연다. (e) 탐색기 UI에 Up 버튼, 브레드크럼, "Open as project root" 컨텍스트 메뉴를 추가해 재루팅을 사용자 조작으로 노출(`FR-209`). 구현: `src/lib/project/project-context.mjs`, `server-handlers/claude-handler.mjs`, `src/lib/fs/resolve-safe.ts`, `server-handlers/files-handler.mjs`, `src/stores/use-project-store.ts`, `src/components/layout/app-shell.tsx`, `src/components/panels/file-explorer/file-explorer-panel.tsx`, `src/components/panels/file-explorer/file-tree.tsx`. |

## 관련 문서

- [SRS](../srs/README.md) — 요구사항 명세
- [리서치 문서](../research/) — 초기 기획 문서
- [CLAUDE.md](../../CLAUDE.md) — 프로젝트 컨벤션
