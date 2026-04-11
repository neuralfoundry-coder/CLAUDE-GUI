# ClaudeGUI 아키텍처 설계 문서

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

## 관련 문서

- [SRS](../srs/README.md) — 요구사항 명세
- [리서치 문서](../research/) — 초기 기획 문서
- [CLAUDE.md](../../CLAUDE.md) — 프로젝트 컨벤션
