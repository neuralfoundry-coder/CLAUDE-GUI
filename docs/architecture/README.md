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

## 관련 문서

- [SRS](../srs/README.md) — 요구사항 명세
- [리서치 문서](../research/) — 초기 기획 문서
- [CLAUDE.md](../../CLAUDE.md) — 프로젝트 컨벤션
