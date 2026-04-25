# 3. 기능 요구사항

## 3.1 패널 레이아웃 시스템 (FR-100)

### FR-101: 패널 구성

- 시스템은 주요 패널로 구성된 IDE 레이아웃을 제공해야 한다.
  - **좌측**: 파일 탐색기 (수직)
  - **중앙**: 코드 에디터
  - **우측**: Claude 채팅 + 프리뷰 패널 (수직)
- 내장 터미널 패널은 기본 레이아웃에서 제외된다. 대신 헤더 우측 상단의 외부 터미널 열기 버튼(`ExternalLink` 아이콘) 또는 `Cmd/Ctrl+Shift+O` 단축키로 OS 기본 터미널을 호출한다.
- `react-resizable-panels` v4를 사용하여 구현한다.

### FR-102: 패널 리사이즈

- 사용자는 패널 경계의 드래그 핸들을 이용하여 패널 크기를 조절할 수 있어야 한다.
- 최소 크기 제한을 두어 패널이 완전히 사라지지 않도록 한다.

### FR-103: 패널 접기/펼치기

- **5개 패널 모두** 접기(collapse)/펼치기(expand)가 가능해야 한다.
  - 파일 탐색기, 에디터, 터미널, Claude 채팅, 프리뷰
- 접힌 상태에서는 아이콘만 표시하거나(`collapsedSize: 4px`) 완전히 숨김(`collapsedSize: 0`) 처리한다.
- 에디터 패널 헤더에 `Code2` 아이콘 토글 버튼, Claude 채팅 패널 헤더에 `MessageSquare` 아이콘 토글 버튼을 제공하여 각 패널의 접기/펼치기를 제어한다.
- 대응 키보드 단축키:
  - `Ctrl+Cmd+B` / `Ctrl+Alt+B` — 파일 탐색기 토글
  - `Ctrl+Cmd+E` / `Ctrl+Alt+E` — 에디터 토글
  - `Ctrl+Cmd+K` / `Ctrl+Alt+K` — Claude 채팅 토글
  - `Ctrl+Cmd+P` / `Ctrl+Alt+P` — 프리뷰 토글
  - `Cmd+Shift+O` / `Ctrl+Shift+O` — 외부 터미널 열기

### FR-104: 레이아웃 상태 영속화

- 패널 크기 및 접힘 상태는 `localStorage`에 자동 저장되어야 한다.
- `react-resizable-panels`의 `autoSaveId` 속성을 활용한다.
- 브라우저 새로고침 시 마지막 레이아웃 상태가 복원되어야 한다.

### FR-105: 중첩 패널 그룹

- 중앙 영역은 에디터(상단)와 터미널(하단)로 수직 분할되어야 한다.
- 중첩된 `PanelGroup` 구조를 지원한다.

### FR-106: 리사이즈 핸들 더블클릭 초기화

- `PanelResizeHandle`을 더블클릭하면 인접 패널의 크기가 기본값으로 리셋되어야 한다.
- 이를 통해 사용자가 수동으로 드래그하지 않아도 레이아웃을 빠르게 복구할 수 있다.

### FR-107: 반응형 모바일 레이아웃

- 뷰포트 너비가 **1280px 미만**인 경우 단일 패널 탭 모드로 전환해야 한다.
- 하단에 탭 바를 제공하며, 다음 4개 탭으로 패널을 전환한다:
  - Files, Editor, Claude, Preview
- 탭 전환 시 해당 패널만 전체 화면으로 표시하고 나머지는 숨긴다.
- 뷰포트가 1280px 이상으로 복귀하면 기존(또는 마지막 저장된) 레이아웃으로 자동 복원한다.

### FR-108: 동적 패널 분할

- 사용자는 기존 패널을 가로 또는 세로로 분할하여 새로운 패널을 생성할 수 있어야 한다.
- 분할은 재귀적 이진 트리(`SplitNode` / `LeafNode`) 구조로 관리된다.
- 최대 분할 깊이는 4단계로 제한하여 사용 불가능한 미세 패널을 방지한다.
- 분할된 레이아웃은 `localStorage`에 자동 저장되며 새로고침 시 복원된다.
- 빈 패널(모든 탭이 제거된 경우)은 자동으로 제거되고 부모 split이 축소된다.
- 탭 바 컨텍스트 메뉴에서 "Split Right", "Split Down" 옵션을 제공한다.

### FR-109: 탭 드래그 앤 드롭

- 사용자는 탭을 드래그하여 같은 패널 내에서 탭 순서를 변경할 수 있어야 한다.
- `@dnd-kit/core` + `@dnd-kit/sortable` 라이브러리를 사용한다.
- 에디터, 클로드, 터미널 패널의 탭이 모두 드래그 재정렬을 지원한다.
- 탭을 다른 패널의 가장자리(상/하/좌/우 25% 영역)에 드롭하면 해당 방향으로 새 분할이 생성된다.
- 드래그 중 드롭 존에 시각적 하이라이트(반투명 sky-500 오버레이)를 표시한다.
- 드래그 활성화 거리: 5px (의도하지 않은 드래그 방지).

---

## 3.2 파일 탐색기 (FR-200)

### FR-201: 디렉토리 트리 렌더링

- 프로젝트 디렉토리를 재귀적 트리 구조로 표시해야 한다.
- `react-arborist` v3.4 기반으로 가상화 렌더링을 수행한다.
- 수천 개 파일이 있어도 60 FPS 스크롤을 유지해야 한다.

### FR-202: 파일/폴더 CRUD

- 파일 및 폴더의 생성, 이름 변경(F2), 삭제를 지원해야 한다.
- **이름 변경은 인라인 편집**(react-arborist `tree.edit()`)으로 수행한다. `Enter`로 확정, `Esc`로 취소, 포커스 이탈 시 자동 확정한다. 빈 문자열, `.`, `..`, 경로 구분자(`/`, `\`), `\0`은 거부한다.
- **새 파일/새 폴더는 생성-후-인라인-편집** 방식이다. macOS Finder처럼 `untitled.txt` / `untitled folder` (이미 존재하면 ` 2`, ` 3` 접미사로 고유화) placeholder를 즉시 만든 뒤 새 노드에 자동으로 rename 모드를 진입시킨다.
- **삭제 확인은 shadcn `<Dialog>` 기반 `DeleteConfirmDialog`** 를 사용한다. 단일/다중 선택을 모두 지원하며, 다중 선택 시 영향 받는 경로 목록을 모달 내부에 표시한다. 폴더 삭제는 기본 **재귀 삭제**(`fs.rm({ recursive: true })`)이며, API는 `DELETE /api/files?path=…&recursive=1`로 옵트인한다.
- 다중 선택된 항목의 일괄 삭제는 순차로 수행하되, 일부가 실패해도 나머지를 계속 시도하고 종료 시 실패 목록을 사용자에게 집계 표시한다.
- 구현: `src/components/panels/file-explorer/file-tree.tsx` (인라인 input 렌더), `src/components/panels/file-explorer/use-file-actions.ts` (`deletePaths`), `src/components/panels/file-explorer/delete-confirm-dialog.tsx`, `src/lib/fs/file-operations.ts` (`deleteEntry({ recursive })`).

### FR-203: 트리 내부 드래그 앤 드롭 (이동/복사)

- 트리 내부에서 노드를 드래그하여 다른 디렉토리로 이동·복사할 수 있어야 한다.
- 기본 드래그는 **이동**(`filesApi.rename`을 통해 동일 파일시스템 내 rename), `Alt`/`Option` 수정자 드래그는 **복사**(`filesApi.copy`)이다. 수정자 키는 네이티브 `dragstart`/`dragover`에서 캡처하여 react-arborist의 `onMove` 콜백에 ref로 전달한다.
- 자기 자신 또는 자손 디렉토리로의 이동은 거부하고 사유를 표시한다. 복사 모드에서는 동일 위치 복제도 허용한다 (` (1)` 접미사 자동 부여).
- 다중 선택된 노드의 드래그도 일괄 처리한다. 부분 실패 시 성공한 항목은 적용하고 실패 목록을 모아 알린다.
- 본 규정은 **트리 내부 노드** 드래그에만 적용된다. OS 파일 탐색기에서의 드롭(`FR-208`)은 `e.dataTransfer.types`에 `'Files'` 포함 여부로 분기되므로 두 경로가 충돌하지 않는다.
- 구현: `src/components/panels/file-explorer/file-tree.tsx` (`onMove`, `dragAltKeyRef`), `src/components/panels/file-explorer/file-explorer-panel.tsx` (`onMove` 핸들러), `src/app/api/files/copy/route.ts`.

### FR-204: Git 상태 표시

- 파일명 옆에 Git 상태를 시각적으로 표시해야 한다.
  - Modified (M) — 노란색
  - Added (A) — 녹색
  - Deleted (D) — 빨간색
  - Untracked (U) — 연녹색
  - Renamed (R) — 파란색
  - Conflicted (!) — 짙은 빨간색
- 구현: `GET /api/git/status`는 `git status --porcelain` 출력을 파싱하여 경로→상태 맵을 반환한다. 모든 Git 명령은 10초 타임아웃이 적용된다.
- 프로젝트가 Git 저장소가 아니면 `isRepo: false`로 응답하고 인디케이터를 표시하지 않는다.

### FR-204a: Git Diff 뷰어

- 파일 컨텍스트 메뉴에서 "View Git Diff"를 선택하면, `GET /api/git/diff?path=<file>` 엔드포인트가 `git diff`와 `git show HEAD:<file>`을 실행하여 현재 작업본과 HEAD 간의 차이를 Monaco diff 에디터에 표시한다.
- 구현: `src/app/api/git/diff/route.ts`, `src/lib/api-client.ts` (`gitApi.diff`), `src/components/panels/file-explorer/file-context-menu.tsx`

### FR-205: 파일 아이콘 매핑

- 파일 확장자에 따라 적절한 아이콘을 표시해야 한다.
- 지원 확장자: `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md`, `.html`, `.css`, `.py`, `.go`, `.rs` 등

### FR-206: 컨텍스트 메뉴 (호이스팅된 단일 인스턴스)

- 파일/폴더 우클릭 시 컨텍스트 메뉴를 표시해야 한다.
- **메뉴는 패널 루트에 단일 인스턴스로 호이스팅**된다 (`src/components/panels/file-explorer/file-context-menu.tsx`). 우클릭 시 노드 렌더러는 `useFileContextMenuStore.openAtNode({ clientX, clientY }, target, selectionPaths)`를 호출하고, 메뉴는 `position: fixed`인 invisible anchor를 트리 좌표로 이동시켜 Radix DropdownMenu로 띄운다. 이 구조 덕분에 react-arborist의 가상화 리스트 재조정이나 노드 hover 리렌더가 메뉴 상태에 영향을 주지 않는다.
- **해제 조건은 (a) `Esc`, (b) 메뉴 바깥 클릭, (c) 다른 노드 우클릭에 의한 앵커 교체** 세 가지뿐이다. 단순한 마우스 이동만으로는 메뉴가 닫히지 않는다 (Radix DropdownMenu 기본 동작과 일치).
- **메뉴 항목** — 노드 스코프:
  - `열기` (파일), `프로젝트 루트로 열기` (디렉토리)
  - `Open terminal here`, `Open in system terminal`, `Reveal in Finder/File Explorer`
  - `Cut` (Cmd/Ctrl+X), `Copy` (Cmd/Ctrl+C), `Paste` (Cmd/Ctrl+V — 클립보드가 비어 있으면 비활성), `Duplicate` (Cmd/Ctrl+D)
  - `Copy path`
  - 디렉토리에 한해 `New file…`, `New folder…`
  - `Rename` (F2 — 인라인 편집 진입)
  - `Delete` (Del — `DeleteConfirmDialog`)
- **메뉴 항목** — 빈 영역 스코프 (트리 빈 공간 우클릭 시): `New file…`, `New folder…`, `Paste`, `Refresh`.
- 다중 선택 상태에서 우클릭하면 선택된 모든 경로가 `selectionPaths`로 전달되어 `Cut/Copy/Delete`가 일괄 동작한다. 우클릭한 노드가 기존 선택에 포함돼 있지 않으면 그 노드만 단일 선택으로 교체한다 (Finder/Explorer와 일치).

### FR-207: 가상화 렌더링

- 화면에 보이는 노드만 DOM에 렌더링하여 대규모 프로젝트를 지원해야 한다.
- `react-arborist`의 내장 가상화 기능을 활용한다.

### FR-208: 로컬 파일 드래그 앤 드롭 / 붙여넣기 업로드

- 사용자는 로컬 OS 파일 탐색기(macOS Finder, Windows Explorer 등)에서 웹 파일 탐색기 패널로 파일을 **드래그 앤 드롭**하여 현재 프로젝트에 복사할 수 있어야 한다.
- 사용자는 클립보드에 복사된 파일/이미지를 웹 파일 탐색기 패널에서 **붙여넣기**(`Cmd+V` / `Ctrl+V`)하여 프로젝트 루트에 복사할 수 있어야 한다. 패널에 포커스가 있을 때 `onPaste` 이벤트의 `clipboardData.files`를 소비한다.
- 드래그 중에는 패널이 `ring-2 ring-primary` 경계와 "Drop files to upload to project root" 오버레이를 표시하여 사용자에게 시각적 피드백을 제공한다. `e.dataTransfer.types`에 `'Files'`가 포함된 경우에만 드롭을 수락하고, react-arborist의 내부 노드 드래그와는 구분되어야 한다.
- **폴더 타겟팅**: 파일 트리 영역 내부에 드롭할 경우 커서 아래의 노드를 기준으로 대상 폴더를 결정한다. 디렉토리 노드 위에 드롭하면 해당 디렉토리에 업로드하고, 파일 노드 위에 드롭하면 해당 파일의 부모 디렉토리에 업로드하며, 빈 영역에 드롭하면 프로젝트 루트에 업로드한다. 트리 영역 밖(패널 헤더 등)에 드롭하면 프로젝트 루트에 업로드한다. 이 동작은 트리 컨테이너의 **캡처 페이즈** `drop` 이벤트 리스너로 구현되며, react-dnd의 HTML5Backend가 이벤트를 소비하기 전에 외부 파일 드롭을 가로챈다.
- 업로드는 `POST /api/files/upload` 엔드포인트(04-api-design.md 참조)를 사용한다. 페이로드는 `multipart/form-data`이며 필드는 `destDir`(프로젝트 루트 기준 상대경로, 비어 있으면 루트) 및 반복되는 `files`로 구성된다.
- 서버는 다음을 강제해야 한다:
  - `resolveSafe(destDir)`로 대상 디렉토리를 프로젝트 루트 샌드박스 내부로 제한한다.
  - 파일명은 `path.basename`으로 정규화하고 `.`, `..`, `/`, `\`, `\0`을 포함하는 이름을 거부한다.
  - 파일당 최대 크기 `MAX_BINARY_SIZE` (50 MB), 요청 총합 최대 200 MB를 초과하면 `413 Payload Too Large`를 반환한다.
  - 알려진 바이너리 확장자(PNG, JPEG, PDF, ZIP 등)에 대해 선언된 MIME 타입과 매직 바이트 시그니처의 일관성을 검증한다. 불일치 시 `400 Bad Request`를 반환한다.
  - 동일 파일명이 이미 존재하면 덮어쓰지 않고 ` (1)`, ` (2)` 접미사로 고유화한다(최대 100회 재시도).
- 업로드 성공 후 클라이언트는 `refreshRoot()`로 파일 트리를 즉시 갱신한다. `/ws/files` 감시자도 이벤트를 발행하지만 디바운스 지연 없이 즉시 반영하기 위해 수동 갱신을 병행한다.
- 실패 시 헤더의 상태 라벨이 `upload failed: <message>`로 표시되며 `text-destructive`로 강조된다.
- 구현: `src/app/api/files/upload/route.ts`, `src/lib/api-client.ts` (`filesApi.upload`), `src/components/panels/file-explorer/file-explorer-panel.tsx` (드롭/페이스트 핸들러, 오버레이), `src/components/panels/file-explorer/file-tree.tsx` (캡처 페이즈 외부 파일 드롭 핸들러, `onExternalFileDrop` 프롭).

### FR-209: 탐색기 루트 네비게이션 (상위/하위 재루팅)

- 파일 탐색기는 현재 활성 프로젝트 루트를 **상위 디렉토리 또는 임의의 하위 디렉토리로 이동**할 수 있어야 한다. 이동한 디렉토리는 새로운 활성 루트가 되며, 동일 프로세스 전체(파일 API 샌드박스, 터미널 신규 세션 cwd, Claude 쿼리 cwd, `@parcel/watcher` 감시 대상)에 즉시 반영된다.
- **UI 구성**:
  - 패널 헤더에 **↑ Up 버튼**(`lucide-react`의 `ArrowUp`) — 클릭 시 `useProjectStore.openParent()`를 호출해 `path.dirname(activeRoot)`을 새 루트로 설정한다. 부모가 파일시스템 루트(`/` 또는 `C:\`)가 되는 경우 백엔드에서 `4403`으로 거부되며 버튼은 비활성화된다.
  - 헤더 아래 **브레드크럼 바** — 현재 루트의 각 경로 세그먼트를 클릭 가능한 버튼으로 표시한다. 마지막 세그먼트는 현재 위치로 하이라이트되며, 다른 세그먼트 클릭 시 해당 조상 디렉토리로 루트를 이동한다.
  - 디렉토리 노드의 우클릭 **컨텍스트 메뉴 최상단에 "Open as project root"** 항목을 추가한다. 파일 노드에는 표시하지 않는다. 선택 시 해당 디렉토리의 절대 경로로 `openProject()`를 호출한다.
- **제약**:
  - 파일시스템 루트(`/`, Windows 드라이브 루트)는 여전히 거부한다(`FR-908` 참조).
  - `$HOME`은 사용자의 명시적 선택으로 허용한다(이전 `4403` 금지 조항 삭제). 이는 `~` 아래 dotfile/스크립트 프로젝트를 편집하려는 합법적인 사용 케이스를 지원하기 위함이다. `resolveSafe`의 dotfile deny 리스트(`.env`, `.git`, `.ssh`, `.claude`, `.aws`, `.npmrc`, `id_rsa`, `id_ed25519`, `credentials` 등)는 계속 적용되어 민감 파일 접근을 차단한다.
- **상태 전환**: 루트가 변경되면 기존 에디터 탭과 프리뷰 선택이 리셋되고(`FR-908`의 기존 동작), 파일 트리가 새 루트 기준으로 재로드된다. 터미널의 실행 중 세션은 유지되지만 신규 세션은 새 루트에서 시작한다.
- 구현: `src/components/panels/file-explorer/file-explorer-panel.tsx` (Up 버튼·브레드크럼), `src/components/panels/file-explorer/file-tree.tsx` (컨텍스트 메뉴 항목), `src/stores/use-project-store.ts` (`openParent()`, `parentDirectory()`).

### FR-210: 다중 선택

- 파일 탐색기는 여러 노드를 동시에 선택할 수 있어야 한다.
- 마우스: 단일 클릭=교체 선택, `Cmd`/`Ctrl`+클릭=토글, `Shift`+클릭=범위 선택, 빈 영역 클릭=선택 해제. 모두 react-arborist 내장 셀렉션 모델로 동작한다.
- 키보드: `↑`/`↓`로 포커스 이동, `Cmd`/`Ctrl`+`A`로 가시 노드 전체 선택, `Esc`로 선택 해제.
- 컨텍스트 메뉴, 키보드 단축키, 드래그 이동, 일괄 삭제 등 모든 액션은 현재 선택을 단일 진실 원천으로 사용한다.
- 구현: `src/components/panels/file-explorer/file-tree.tsx` (`onSelect` → `onSelectionChange`), `src/components/panels/file-explorer/file-explorer-panel.tsx` (`selection`/`selectionRef`).

### FR-211: 인-앱 파일 클립보드 (Cut/Copy/Paste/Duplicate)

- 파일 탐색기는 OS 클립보드와 분리된 자체 인-앱 클립보드를 가진다 (`useFileClipboardStore` — `{ paths, mode: 'copy' | 'cut' | null }`).
- **Copy** (`Cmd`/`Ctrl`+`C`): 현재 선택을 `mode='copy'`로 클립보드에 적재한다. 시각 표시는 없다 (Finder와 동일).
- **Cut** (`Cmd`/`Ctrl`+`X`): 현재 선택을 `mode='cut'`로 적재한다. 잘라내기된 노드는 트리에서 `italic + opacity-50`로 표시된다.
- **Paste** (`Cmd`/`Ctrl`+`V`): 현재 포커스된 디렉토리(없으면 활성 루트)로 클립보드 내용을 적용한다. `copy` 모드는 `filesApi.copy`로, `cut` 모드는 `filesApi.rename`(이동)으로 처리한다. 동일명이 존재하면 ` (1)`, ` (2)` 접미사로 고유화한다 (FR-208의 업로드 규칙과 일치).
- **Duplicate** (`Cmd`/`Ctrl`+`D`): 단일 선택을 동일 디렉토리에 ` (1)` 접미사로 즉시 복제한다.
- 잘라내기 후 붙여넣기가 모두 성공하면 클립보드는 자동으로 비워진다. 일부 실패 시 클립보드는 유지되어 사용자가 다른 위치에서 재시도할 수 있다.
- 자기 자신 또는 자손으로의 이동·복사는 거부한다. 실패는 사용자에게 알린다.
- 구현: `src/stores/use-file-clipboard-store.ts`, `src/components/panels/file-explorer/use-file-actions.ts` (`copyToClipboard`, `cutToClipboard`, `paste`, `duplicate`), `src/app/api/files/copy/route.ts`, `src/lib/api-client.ts` (`filesApi.copy`).

### FR-212: 파일 탐색기 키보드 단축키

- 파일 탐색기 패널에 포커스가 있을 때(`isFocusInsideFileExplorer()` — `data-file-explorer-panel="true"` 컨테이너 기준) 다음 단축키가 활성화된다. 다른 패널에 포커스가 있을 때는 발화하지 않는다.

| 키 | 동작 |
|---|---|
| `↑` / `↓` / `←` / `→` / `Home` / `End` | 트리 노드 포커스 이동 (react-arborist 내장) |
| `Enter` / `Space` | 파일 열기 / 폴더 토글 |
| `F2` | 인라인 이름 변경 진입 |
| `Del` / `Backspace` | `DeleteConfirmDialog`를 거쳐 선택 항목 삭제 |
| `Cmd`/`Ctrl` + `A` | 가시 노드 전체 선택 |
| `Cmd`/`Ctrl` + `C` | 선택 항목 Copy |
| `Cmd`/`Ctrl` + `X` | 선택 항목 Cut |
| `Cmd`/`Ctrl` + `V` | 현재 디렉토리에 Paste |
| `Cmd`/`Ctrl` + `D` | 단일 선택 Duplicate |
| `Cmd`/`Ctrl` + `N` | 새 파일 생성 + 인라인 이름 변경 |
| `Cmd`/`Ctrl` + `Shift` + `N` | 새 폴더 생성 + 인라인 이름 변경 |
| `Esc` | 선택 해제 + 컨텍스트 메뉴 닫기 |

- 모든 단축키는 기존 `useKeyboardShortcut`/`hasPrimaryModifier` 인프라를 재사용하고, 플랫폼별 modifier(`Cmd` on macOS, `Ctrl` elsewhere)를 자동으로 매핑한다.
- 구현: `src/components/panels/file-explorer/use-file-keyboard.ts`, `src/hooks/use-keyboard-shortcut.ts` (재사용).

---

## 3.3 코드 에디터 (FR-300)

### FR-301: Monaco Editor 통합

- `@monaco-editor/react` 패키지를 통해 Monaco Editor를 통합해야 한다.
- 기본적으로 CDN 로더 방식으로 번들 크기를 최적화한다. `NEXT_PUBLIC_MONACO_LOCAL=true` 환경변수를 설정하면 로컬 번들(`/monaco-editor/min/vs`)에서 로딩하여 오프라인/느린 네트워크 환경을 지원한다.
- 에디터 탭 바 아래에 브레드크럼 내비게이션 바를 표시하여 현재 파일의 전체 경로를 세그먼트별로 보여준다 (`src/components/panels/editor/editor-breadcrumb.tsx`).

### FR-302: 멀티탭 지원

- 여러 파일을 동시에 탭으로 열 수 있어야 한다.
- 각 탭은 독립적인 Monaco 모델을 유지한다.
- 탭 닫기, 탭 순서 변경(드래그)을 지원한다.
- 탭 우클릭 컨텍스트 메뉴를 지원해야 한다:
  - **Close** — 해당 탭 닫기
  - **Close Others** — 해당 탭 외 모든 탭 닫기
  - **Close to the Right** — 해당 탭 우측의 모든 탭 닫기
  - **Close All** — 모든 탭 닫기

### FR-303: 구문 강조

- Monaco의 내장 구문 강조를 활용하여 100개 이상의 언어를 지원해야 한다.
- 파일 확장자에 따라 언어 모드를 자동 감지한다.

### FR-304: 상태 보존

- 탭 간 전환 시 다음 상태를 보존해야 한다:
  - 커서 위치
  - 스크롤 위치
  - Undo/Redo 히스토리
  - 선택 영역

### FR-305: AI 변경사항 수락/거절 UI

- Claude가 파일을 수정하면 diff 뷰로 변경사항을 표시해야 한다.
- 사용자는 변경사항을 **수락(Accept)** 또는 **거절(Reject)** 할 수 있다.
- 부분 수락(특정 hunk만)을 지원한다.

### FR-306: 에디터 잠금 모드

- Claude가 파일을 편집 중일 때 해당 파일 탭을 읽기 전용으로 전환할 수 있어야 한다.
- 잠금 상태는 시각적으로 구분한다 (아이콘 또는 배지).

### FR-307: 파일 저장

- `Cmd+S` (macOS) / `Ctrl+S` (Windows/Linux) 단축키로 현재 파일을 저장해야 한다.
- REST API `/api/files/write`를 통해 서버 측 파일시스템에 기록한다.
- 저장되지 않은 변경이 있는 탭은 점(dot) 표시로 구분한다.

### FR-308: 외부 변경 실시간 반영

- `@parcel/watcher`가 감지한 외부 파일 변경을 에디터에 실시간 반영해야 한다.
- WebSocket `/ws/files` 채널로 변경 이벤트를 수신한다.
- 사용자 커서 위치를 보존하면서 콘텐츠를 업데이트한다.
- 에디터에 미저장 변경이 있을 경우 충돌 알림을 표시한다.
- Claude diff가 표시 중인 탭(`tab.diff` 설정됨)은 외부 변경 동기화를 건너뛴다 — tool_use 결과가 이미 diff 뷰를 설정했기 때문이다.

### FR-309: AI 인라인 코드 자동완성

- Claude를 활용한 인라인 코드 자동완성(ghost text)을 지원해야 한다.
- 사용자가 타이핑을 멈추면 설정된 딜레이(기본 500ms) 후 자동완성 제안이 표시된다.
- Tab 키로 제안을 수락하고, Esc 키로 무시할 수 있다.
- WebSocket `/ws/claude` 채널의 `completion_request`/`completion_response` 메시지를 사용한다.
- 커서 전후 코드 컨텍스트(전 100줄, 후 30줄)를 전송하여 정확한 완성을 제공한다.
- 설정에서 자동완성을 활성화/비활성화할 수 있다.

### FR-310: 에디터 패널 헤더 및 설정

- 에디터 패널 상단에 "Editor" 헤더 바를 표시해야 한다 (다른 패널과 일관성 유지).
- 헤더 우측에 다음 정보를 표시한다:
  - 현재 파일의 언어 라벨
  - 커서 위치 (Ln, Col)
  - AI 자동완성 로딩 표시
  - 설정 드롭다운 (기어 아이콘)
- 설정 드롭다운에서 다음 옵션을 조절할 수 있다:
  - 탭 크기 (2/4/8)
  - 스페이스/탭 전환
  - 워드 랩 on/off
  - 미니맵 on/off
  - 스티키 스크롤 on/off
  - 브래킷 색상 on/off
  - 공백 표시 (없음/경계/전체)
  - AI 자동완성 on/off

### FR-311: 고급 편집 기능

- 다음 Monaco Editor 고급 기능을 기본 활성화해야 한다:
  - 자동 괄호/따옴표 닫기
  - 브래킷 쌍 색상화 및 가이드 라인
  - 코드 폴딩 (인덴테이션 기반)
  - 찾기/바꾸기 (Cmd+F / Cmd+H)
  - 멀티커서 편집 (Alt+클릭)
  - 부드러운 스크롤 및 커서 애니메이션
  - 스티키 스크롤 (현재 스코프 표시)
  - 연결 편집 (Linked editing)

### FR-312: Claude 도구 실행 실시간 에디터 Diff 스트리밍

- Claude가 `Write`/`Edit`/`MultiEdit` 도구를 실행하면 **에디터에서 실시간 diff 뷰를 표시**해야 한다.
- **`input_json_delta` 스트리밍**: SDK가 도구 입력을 토큰 단위로 스트리밍할 때(`content_block_delta` + `input_json_delta`), 500ms 간격으로 부분 JSON을 파싱하여 에디터에 `streaming` 상태의 diff를 표시한다. `content_block_stop` 수신 시 최종 diff(`pending`)로 전환한다.
- **diff 상태 확장**: `diff.status`는 `'pending' | 'streaming'` 타입을 갖는다. `streaming` 상태에서는 DiffAcceptBar의 Accept/Reject 버튼이 비활성화되며, 프로그레스 바와 "Claude is editing..." 인디케이터가 표시된다.
- **자동 탭 열기**: 대상 파일이 에디터에 열려있지 않으면 자동으로 `openFile(filePath)`을 호출한다.
- **자동 패널 확장**: 에디터 패널이 접혀있으면 자동으로 펼친다. HTML/SVG/MD 파일의 경우 프리뷰 패널도 자동으로 펼친다.
- **레이스 컨디션 방지**: `tab.diff`가 설정된 상태에서 `/ws/files` 알림이 도착하면 `syncExternalChange`를 건너뛰어 diff 뷰가 유지된다.
- 구현: `src/stores/use-claude-store.ts` (도구 입력 추적 + 에디터 연결), `src/stores/use-editor-store.ts` (`updateStreamingEdit` + `syncExternalChange` 가드), `src/components/panels/editor/diff-accept-bar.tsx` (스트리밍 UI).

### FR-313: 채팅 패널 스트리밍 UX 고도화

- **Thinking 인디케이터**: Claude가 응답을 시작하면(`system` 메시지 수신 + `isStreaming` 활성) 첫 번째 토큰이 도착하기 전에 빈 content의 스트리밍 메시지를 삽입하여 블링킹 커서를 표시한다.
- **tool_use 파일 경로 표시**: `Write`/`Edit`/`MultiEdit` 도구의 `toolInput.file_path`를 채팅 메시지에 파일 아이콘과 함께 표시한다. 클릭 시 에디터에서 해당 파일을 연다.
- **ReactMarkdown 성능 최적화**: `useDeferredValue`로 스트리밍 중 Markdown 렌더링 배치를 최적화한다.
- **스트리밍 활동 상태 바**: 파일 편집 도구 실행 중 "Writing file.tsx..." 또는 "Editing file.tsx..." 상태를 입력 영역 위에 표시한다.
- 구현: `src/stores/use-claude-store.ts` (thinking placeholder), `src/components/panels/claude/chat-message-item.tsx` (파일 경로 + useDeferredValue), `src/components/panels/claude/claude-chat-panel.tsx` (StreamingActivityBar).

---

## 3.4 터미널 (FR-400)

### FR-401: 터미널 에뮬레이션

- `@xterm/xterm` v5 기반의 완전한 터미널 에뮬레이션을 제공해야 한다.
- WebSocket `/ws/terminal`을 통해 서버의 `node-pty` 세션과 연결한다.
- 프레이밍 규칙은 프레임 타입으로 명확히 구분한다:
  - **PTY → 클라이언트**: 쉘 출력은 **바이너리 프레임**(`ArrayBuffer`)으로 전송된다. xterm.js가 UTF-8을 내부에서 디코딩한다.
  - **제어 메시지 (양방향)**: `exit`, `error`, `resize`, `input`, `pause`, `resume`은 **텍스트 JSON 프레임**으로 전송된다.
- 출력 내용이 우연히 `{`로 시작해도(`cat package.json` 등) 제어 프레임으로 오인되지 않는다.
- 터미널 파이프라인은 Claude 채팅 입력과 완전히 분리되어야 한다. `/ws/terminal`과 `/ws/claude`는 심볼 수준에서도 교차 의존이 없어야 한다.
- 서버는 쉘을 **로그인 + 인터랙티브** 모드로 spawn해야 한다. 구체적인 쉘 해결 순서, 플래그 매핑, 환경 변수는 `FR-410`에서 정의한다.
- **입력 큐잉**: WebSocket이 아직 `OPEN` 상태가 아닌 동안(초기 로드, 재시작 등) 사용자가 입력한 키 입력은 `inputQueue`에 버퍼링되며, WebSocket 연결 완료 즉시 순서대로 전송된다. 큐 상한은 32 KB이며, 초과 시 가장 오래된 입력부터 폐기된다. 연결 중 상태에서는 "Connecting to shell…" 오버레이가 표시되어 키 입력이 연결 후 전달됨을 안내한다.
- **시각성 요구사항 (WCAG AA)**: `TERMINAL_THEMES`의 모든 foreground·ANSI 16 색상은 해당 테마 `background` 위에서 **4.5:1 이상의 대비율**을 만족해야 한다. 예외는 관례상 배경과 같은 톤을 쓰는 `black`/`brightBlack` 일부 엔트리(테마별로 WCAG가 실제로 충족하는 경우에만)와 오버레이로 렌더되는 `cursor`/`selectionBackground`뿐이다. 이 요구는 `tests/unit/terminal-themes-contrast.test.ts`가 자동 검증한다.
- 팔레트는 단일 소스 `src/lib/terminal/terminal-themes.ts`에서 정의되며, `TerminalManager`는 이를 import해 `setTheme(theme)` 호출 시 모든 인스턴스에 전파한다.

### FR-402: ANSI 이스케이프 코드 렌더링

- 256색 ANSI 컬러, 볼드, 이탤릭, 밑줄, 깜빡임 등 스타일을 렌더링해야 한다.
- 커서 이동 및 화면 지우기 이스케이프 시퀀스를 처리해야 한다.

### FR-403: GPU 가속 렌더링

- xterm.js WebGL 애드온을 활용하여 GPU 가속 렌더링을 적용해야 한다.
- WebGL 컨텍스트가 실패하면 canvas 렌더러로 자동 폴백한다.
- 대량의 터미널 출력(로그 스트리밍 등)에서도 부드러운 렌더링을 유지한다.

### FR-404: 리사이즈 동기화

- 터미널 패널 크기가 변경되면 PTY의 `cols`/`rows`를 동기화해야 한다.
- xterm.js `fit` 애드온을 사용하여 자동 리사이즈를 수행한다.
- 리사이즈 이벤트는 WebSocket을 통해 `{ type: "resize", cols, rows }` 형태로 서버에 전송한다.
- PTY는 기본 120×30으로 생성되며, 클라이언트가 호스트 DOM에 attach 된 직후의 첫 `fit()`이 실제 크기로 덮어쓴다.
- 탭 활성화·패널 재오픈·폰트 크기 변경 시 `fitAddon.fit()`을 다시 호출하고, 크기가 달라진 경우에만 resize 이벤트를 송신한다.

### FR-405: 버퍼 검색

- 터미널 패널이 포커스인 상태에서 `Cmd/Ctrl+F`를 누르면 플로팅 검색 오버레이가 열려야 한다.
- 오버레이는 터미널 본문 우상단에 표시되며, 입력 필드와 다음 토글을 갖는다: 대소문자 구분(`Aa`), 단어 단위(`W`), 정규식(`.*`).
- 입력 변경 시 100 ms 디바운스 후 `searchAddon.findNext(query, opts)`로 인크리멘털 검색을 수행한다.
- 키 인터랙션: `Enter`(다음), `Shift+Enter`(이전), `Esc`(닫기).
- 오버레이를 닫으면 `searchAddon.clearDecorations()`을 호출하고 xterm에 포커스를 복원한다.
- xterm의 `attachCustomKeyEventHandler`가 `Cmd/Ctrl+F` 입력을 veto해 PTY로 전달되지 않게 한다.
- 구현: `src/components/panels/terminal/terminal-search-overlay.tsx`, `src/lib/terminal/terminal-manager.ts`의 `findNext`/`findPrevious`/`clearSearchHighlight`.

### FR-406: 클릭 가능한 URL

- 터미널 출력에서 URL을 자동 감지하여 클릭 가능한 링크로 표시해야 한다.
- xterm.js `web-links` 애드온을 활용한다.

### FR-407: 배압(Backpressure) 제어 — 절대 드롭 없음

- 터미널 출력이 과도할 때 워터마크 기반 배압 제어를 적용해야 하며, **데이터를 드롭해서는 안 된다**.
- 클라이언트 워터마크 (xterm.js write backlog 기준):
  - High watermark: **100 KB** — 클라이언트가 서버에 `{type:"pause"}` 송신
  - Low watermark: **10 KB** — 클라이언트가 서버에 `{type:"resume"}` 송신
- 서버 동작:
  - `pause` 수신 시 PTY 출력을 내부 큐에 버퍼링한다. 플러시는 중단하지만 데이터는 유지한다.
  - 버퍼가 **256 KB**를 초과하면 `ptyProcess.pause()`로 상류 쉘 자체의 출력을 멈춰 추가 누적을 막는다 (POSIX 한정; Windows에서는 no-op).
  - `resume` 수신 시 `ptyProcess.resume()`과 함께 큐를 즉시 플러시하고 순서를 보존한다.
  - 버퍼가 **5 MB** 상한을 초과하면 `{type:"error", code:"BUFFER_OVERFLOW"}` 제어 프레임을 전송하고 PTY를 kill, WebSocket을 `1011` 코드로 닫는다.
- xterm.js의 50 MB 내부 쓰기 버퍼는 이 워터마크에 도달하기 전에 클라이언트가 이미 pause를 요청하므로 터치되지 않는다.

### FR-408: 다중 터미널 세션과 수명 보장

- 여러 개의 터미널 세션을 동시에 생성하고 전환할 수 있어야 한다. 각 세션은 독립적인 PTY 프로세스(= 1 WebSocket 연결)와 연결된다.
- 클라이언트 측에서는 `TerminalManager` 싱글턴(`src/lib/terminal/terminal-manager.ts`)이 xterm 인스턴스와 WebSocket을 세션 ID 단위로 소유한다. React 컴포넌트(`XTerminalAttach`)는 단순히 DOM 호스트를 제공하는 attach point 역할만 수행한다.
- PTY는 다음 상황에서 **종료되어서는 안 된다**:
  - 사용자가 터미널 패널을 접거나(Ctrl+Cmd+J) 다시 펴는 경우
  - 다른 터미널 탭으로 전환하는 경우
  - 글로벌 폰트 크기를 변경하는 경우 (매니저가 `term.options.fontSize`만 갱신)
  - Next.js Fast Refresh / 컴포넌트 리마운트
- PTY는 다음 상황에서만 종료된다:
  - 사용자가 명시적으로 탭 close 버튼을 누름
  - 쉘이 스스로 종료(`exit` 등) — 서버가 `{type:"exit", code}` 제어 프레임을 전송
  - `BUFFER_OVERFLOW` 초과로 인한 강제 종료
- **자동 재연결 없음**: 터미널 WebSocket은 자동 재연결하지 않는다. 소켓이 예기치 않게 닫히면 세션 상태가 `closed`로 전이되고, xterm 버퍼에 `[connection to PTY lost]` 마커 라인이 기록된다. 상세 정책은 `FR-411`.
- **Restart 액션**: 세션이 `closed` 또는 `exited` 상태일 때 사용자는 탭 또는 패널의 Restart 버튼을 눌러 동일한 세션 ID를 유지하면서 새 PTY를 연결할 수 있다. 기존 xterm 스크롤백은 보존되며 `─── restarted at HH:MM:SS ───` separator 라인이 삽입된다.

### FR-409: 터미널 포커스 관리

- 터미널 탭을 활성화하면(탭 클릭 또는 신규 생성) xterm에 자동으로 포커스가 전달되어 사용자가 추가 클릭 없이 타이핑할 수 있어야 한다.
- 패널을 접었다가 다시 펴면 활성 탭에 포커스가 복원되어야 한다.
- 탭 라벨에는 세션 상태(`connecting` / `open` / `closed` / `exited`)를 시각적으로 구분하는 인디케이터를 표시한다.

### FR-410: 터미널 쉘 초기화 및 환경 변수

- 서버는 `server-handlers/terminal/shell-resolver.mjs`의 `resolveShell()`·`shellFlags()`·`buildPtyEnv()`로 쉘을 결정해 spawn해야 한다.
- **쉘 해결 순서**:
  1. `process.env.CLAUDEGUI_SHELL`이 설정되고 경로가 실제 존재하면 사용한다.
  2. POSIX: `$SHELL` → `/bin/zsh` → `/bin/bash` → `/bin/sh` 순으로 탐색한다.
  3. Windows: `$COMSPEC` → `cmd.exe`. `CLAUDEGUI_SHELL=pwsh` 등으로 PowerShell을 지정할 수 있다.
- **플래그 매핑** (쉘 basename 소문자, `.exe` 접미사 제거 후 매칭):
  | Shell | Args |
  |---|---|
  | `zsh`, `bash`, `fish`, `sh`, `dash`, `ash`, `ksh` | `['-l', '-i']` (로그인 + 인터랙티브) |
  | `pwsh`, `powershell` | `['-NoLogo']` |
  | `cmd` | `[]` |
- **환경 변수**: `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=ClaudeGUI`, `TERM_PROGRAM_VERSION=<package.json version>`, `CLAUDEGUI_PTY=1`, `CLAUDEGUI_SHELL_PATH=<resolved shell>`. POSIX에서 `LANG`/`LC_ALL`이 비어 있으면 `en_US.UTF-8`을 적용한다(사용자 값 우선).
- `NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE`, `NEXT_TELEMETRY_DISABLED`, `__NEXT_PRIVATE_*` 등 Next.js 서버 전용 변수는 방어적으로 strip한다.
- `CLAUDEGUI_EXTRA_PATH`가 설정되어 있으면 `PATH` 앞에 prepend한다.
- 쉘은 로그인 + 인터랙티브 모드로 시작하므로 `.zshrc`·`.zprofile`·`.bashrc`·`.bash_profile` 등 사용자 dotfile이 자동 소스된다. 그 결과 `claude`, `nvm`, `pyenv`, `brew`, 사용자 프롬프트, 자동완성, alias가 GUI 터미널에서도 정상 동작한다.

### FR-411: 터미널 세션 지속성 정책

- 터미널 WebSocket(`/ws/terminal`)은 **자동 재연결하지 않는다**. 연결이 예기치 않게 끊어지면 세션은 `closed` 상태가 되고, xterm 버퍼에 안내 라인이 기록된다.
- **연결 타임아웃**: WebSocket 핸드셰이크가 15초 내에 완료되지 않으면 세션을 `closed`로 전이하고 `[connection timed out]` 메시지를 표시한다. 사용자는 Restart 버튼으로 재시도할 수 있다.
- **연결 중 취소**: "Connecting to shell…" 오버레이에 5초 후 Cancel 버튼이 나타나며, 클릭 시 세션을 `closed`로 전이하여 Restart UI를 노출한다.
- **WebSocket 에러 처리**: `TerminalSocket`의 `onError` 이벤트를 콘솔에 로깅하여 연결 실패 원인을 진단할 수 있다. 서버가 `error` control frame을 전송하고 세션이 아직 `connecting` 상태이면 즉시 `closed`로 전이한다.
- 서버 측 세션 레지스트리나 ID 기반 재부착은 이 버전에서 도입하지 않는다. 로컬 데스크톱 앱 특성상 복잡도 대비 이득이 작고, 주요 단절 원인(서버 프로세스 종료, HMR 사이클)은 세션 레지스트리로 해결되지 않는다.
- 사용자는 다음 두 경로로 세션을 복구할 수 있다:
  - **Restart**: `closed`/`exited` 상태에서 탭 인라인 Restart 버튼 또는 패널 내 플로팅 Restart 버튼, 혹은 단축키 `Cmd/Ctrl+Shift+R`을 통해 동일한 세션 ID로 새 PTY를 spawn한다. xterm 스크롤백은 보존되며 separator 라인이 삽입된다.
  - **Close & New**: 탭을 닫고 새 탭을 연다. 세션 ID와 스크롤백은 폐기된다.
- `ReconnectingWebSocket`은 `/ws/claude`·`/ws/files` 등 다른 채널용으로 유지되며, 터미널 전용으로는 `src/lib/terminal/terminal-socket.ts`의 `TerminalSocket`을 사용한다.
- 관련 ADR: [ADR-019](./README.md).

### FR-412: 클립보드 및 붙여넣기 UX

- xterm 호스트를 우클릭하면 Radix `ContextMenu` 기반 컨텍스트 메뉴가 열려야 하며, 메뉴 항목은 Copy, Paste, Select All, Clear, Find…으로 구성된다.
- Copy는 현재 선택(`term.hasSelection()`)이 있을 때만 활성화되며 `navigator.clipboard.writeText`로 복사한다.
- Paste는 `navigator.clipboard.readText`로 읽은 뒤 `TerminalManager.paste(id, text)`를 통해 PTY로 전송한다. 붙여넣기 크기가 **10 MB**를 초과하면 사용자 확인 다이얼로그를 띄운다.
- 사용자 입력이 **4 KB**를 초과하면 `sendInput` 헬퍼가 4 KB 슬라이스로 나눠 여러 개의 `{type:'input'}` 프레임을 `queueMicrotask` 사이에 분산 전송한다. 이는 대용량 붙여넣기의 JSON 오버헤드와 단일 프레임 지연을 완화한다.
- xterm v5는 TTY 애플리케이션이 `\e[?2004h`를 요청하면 자동으로 bracketed paste mode를 활성화한다(zsh/bash/vim/emacs 모두 기본). 클라이언트는 이 동작을 방해하지 않는다.

### FR-413: 터미널 탭 메타데이터

- **Rename**: 탭 라벨을 더블클릭하면 인라인 `<input>`으로 전환되어 이름을 편집할 수 있다. Enter 저장, Esc 취소, blur 저장. 한 번 이상 rename된 세션은 `customName: true`로 기록된다.
- **CWD 라벨**: 탭 라벨에 현재 PTY의 cwd basename을 `·` 구분자와 함께 표시한다(`Terminal 1 · src`). basename이 20자 초과이면 생략부호(`…`)로 자른다. 전체 경로는 탭 `title` 속성에 노출된다.
- **OSC 7**: `TerminalManager`는 `term.parser.registerOscHandler(7, …)`로 쉘의 OSC 7 (`\e]7;file://host/path\e\\`) 이벤트를 수신해 세션의 `cwd` 필드를 갱신하고 store에 전파한다. `URL` 파싱이 실패하면 무시한다.
- **쉘 헬퍼 자동 주입**: 서버(`terminal-handler.mjs`)가 PTY spawn 직후 OSC 7 emitter 스니펫을 PTY stdin에 직접 기록한다. 이 스니펫은 `ZSH_VERSION`/`BASH_VERSION`을 감지해 zsh의 `precmd_functions` 또는 bash의 `PROMPT_COMMAND`에 설치된다. 선행 공백이 붙어 있어 `HISTCONTROL=ignorespace` 사용자의 히스토리에는 남지 않는다. 스니펫 기록 직후 `clear` 명령과 링 버퍼 리셋을 수행하여 주입 내용이 사용자에게 노출되지 않는다. 주입은 PTY 생성 시 1회만 수행되며, Restart 시 새 PTY가 spawn되므로 자동으로 재주입된다.
- **프로젝트 전환 배너**: `useProjectStore.activeRoot`가 변경되었고 기존 탭 중 하나의 `cwd`가 새 활성 루트와 불일치하면, 터미널 패널 상단에 비침습 배너가 표시된다. 배너는 "Open new tab here" / "Dismiss" 액션을 제공한다. 자동 `cd` 주입은 수행하지 않는다(실행 중 프로세스 훼손 방지). Dismiss는 현재 활성 루트에 대해서만 유효하며, 활성 루트가 다시 변경되면 재등장한다.

### FR-414: 서버측 터미널 세션 레지스트리 및 재연결 재생 (ADR-019/020)

- 서버는 `server-handlers/terminal/session-registry.mjs`의 `TerminalSessionRegistry` 싱글턴에서 모든 PTY의 생명주기를 관리한다. 이 결정은 ADR-019(a)·(d)·(e)를 유지하고 (b)·(c)를 supersede한다. 근거는 ADR-020 참조.
- **레지스트리 책임**:
  - 각 PTY를 UUID로 등록하고, 256 KB 링 버퍼에 출력을 누적한다.
  - 클라이언트 attach / detach를 카운트한다. attach 시 GC 타이머를 취소, detach 시 GC 타이머를 재시작(30분 grace period).
  - `destroy(id)` 호출 시 PTY kill + 레지스트리에서 제거.
  - PTY가 자체 종료(`exit`)하면 exit 코드를 기록하고 1초 후 자동 destroy한다.
- **프로토콜 변경**:
  - 클라이언트는 WS 업그레이드 URL에 `?sessionId=<uuid>`를 포함할 수 있다. 서버는 해당 세션이 레지스트리에 존재하면 attach, 아니면 새로 spawn 후 등록한다.
  - 서버는 attach 직후 `{type:"session", id, replay: boolean}` 텍스트 프레임을 송신한다. `replay: true`이면 바로 다음에 링 버퍼 스냅샷이 단일 바이너리 프레임으로 이어진다.
  - 클라이언트는 `replay: true` 수신 시 `term.clear()`로 xterm 버퍼를 비우고 이어지는 바이너리 프레임을 받는다.
  - 클라이언트가 서버측 세션을 즉시 파괴하려면 `{type:"close"}` 제어 프레임을 송신한다. WS close 이벤트만으로는 detach가 수행되며 PTY는 살아있다.
- **수명 규칙**:
  - `ws.close`(예: 페이지 새로고침, 네트워크 끊김, HMR 사이클) → detach, PTY 유지, 30분 GC 타이머 시작.
  - 30분 내 같은 sessionId로 재연결 시 attach, GC 취소, 링 버퍼 재생.
  - 30분 경과 시 PTY kill + 레지스트리 제거. 사용자가 그 이후에 재연결하면 서버는 새 PTY를 spawn하고 `[previous session was evicted — started a fresh shell]` 배너를 클라이언트가 표시한다.
  - 사용자가 탭 close 버튼을 누르면 클라이언트가 `{type:"close"}`를 송신 → 서버가 즉시 destroy.
  - PTY가 자체 종료(`exit`)하면 서버가 exit 프레임 송신 후 1초 뒤 destroy.
- **Restart와의 관계**: `FR-408` Restart 액션은 이제 기존 세션을 즉시 destroy 하지 않는다. 대신 새 소켓을 동일 `sessionId`로 재연결해 링 버퍼를 재생한다. 사용자는 Restart를 "끊긴 터미널 연결 회복"의 단일 경로로 사용할 수 있다.
- **수명 보장**: 세션 레지스트리는 프로세스 메모리에만 존재한다. 서버 프로세스 재시작 시 모든 세션이 손실된다. 영속화는 미래 작업이다.

### FR-415: 파일 탐색기 컨텍스트 메뉴 (Open terminal here / Reveal in Finder)

- 파일 탐색기(`src/components/panels/file-explorer/file-tree.tsx`)의 각 노드는 우클릭 시 Radix `ContextMenu`를 열어야 한다. 메뉴 항목:
  - **Open terminal here** — 해당 디렉토리(파일이면 상위 디렉토리)를 초기 cwd로 하는 새 터미널 세션을 생성한다. 터미널 패널이 접혀 있으면 자동으로 펼친다. 서버 프로토콜은 WS URL의 `?cwd=<path>` 쿼리 파라미터를 통해 전달되며, 서버는 `resolveSafe` 동등 로직으로 프로젝트 루트 밖의 경로를 거부한다.
  - **Reveal in Finder / File Explorer** — 플랫폼별 네이티브 파일 관리자를 실행한다. macOS는 `open -R <abs>`, Windows는 디렉토리 `explorer <abs>` 또는 파일 `explorer /select,<abs>`, Linux는 `xdg-open <dirname>`. 구현: `POST /api/files/reveal` 라우트. 경로는 `resolveSafe`로 검증되며 존재하지 않으면 404.
  - Rename / Copy path / Delete는 기존 동작을 유지한다.

### FR-416: 백그라운드 탭 미확인 출력 인디케이터

- 비활성 터미널 탭이 PTY 출력을 받으면 탭 라벨에 작은 원형 인디케이터가 표시되어야 한다. 사용자가 해당 탭을 활성화(setActiveSession)하면 즉시 제거된다.
- `TerminalManager`는 `writePtyBytes`/`writePtyChunk` 시점마다 `emitActivity(inst)`를 호출하고, 스토어의 `markUnread(id)` 액션이 활성 세션이 아닐 때만 `unread: true`로 플래그를 설정한다.

### FR-417: 터미널 출력 내 파일 경로 자동 링크

- PTY 출력에 포함된 파일 경로 (`src/foo.ts`, `./bar.py:42`, `/abs/baz.rs:10:4`, `C:\path\x.cs:7`) 는 xterm `registerLinkProvider`를 통해 클릭 가능한 링크로 표시되어야 한다.
- 클릭 시 `TerminalManager.fileLinkHandler`가 호출되며, `AppShell`은 이를 `useEditorStore.openFile(path, { line, col })`에 연결한다. 상대 경로는 세션의 `cwd`(OSC 7로 추적) 기준으로 resolve 된다. 프로젝트 루트 접두사는 스트립되어 `resolveSafe`가 받아들일 수 있는 경로로 변환된다.
- Monaco 편집기는 `pendingReveal` 필드(`useEditorStore`)를 감시하며, 파일이 열리면 `revealLineInCenter` + `setPosition`으로 해당 라인을 중앙에 표시하고 포커스한다.

### FR-418: 터미널 스플릿 뷰 (2-pane 수평 분할)

- 사용자는 `Cmd/Ctrl+D`로 터미널 본문을 2개의 수평 분할 pane으로 나눌 수 있어야 한다. 각 pane은 독립적인 활성 세션을 가진다.
- 스토어 필드: `splitEnabled: boolean`, `primarySessionId: string | null`, `secondarySessionId: string | null`, `activePaneIndex: 0 | 1`. `activeSessionId`는 `activePaneIndex`의 pane이 참조하는 세션으로 동기화된다.
- 사용자 인터랙션:
  - 활성 pane 전환: `Cmd/Ctrl+[` / `Cmd/Ctrl+]` 또는 pane 클릭(mouseDown).
  - 활성 pane은 1px sky-500 ring으로 시각 구분한다.
  - 키보드 단축키(새 탭, 닫기, 검색, clear, restart, tab 이동)는 모두 **활성 pane**의 세션을 대상으로 동작한다.
  - 탭 바는 단일이며, 탭 클릭은 현재 활성 pane에 해당 세션을 할당한다.
  - Split 토글 시: 활성화하면 pane 1에 할당할 기존 세션을 찾거나 새 세션을 생성한다. 비활성화하면 pane 1 세션은 백그라운드 탭으로 유지되며 자동으로 닫히지 않는다.
- `closeSession`은 pane 할당을 자동으로 재정렬한다: 닫힌 세션이 있던 pane에 다른 세션을 fallback으로 배정하고, 두 pane이 같은 세션을 가리키게 되면 대체 세션을 배정한다. pane 1이 비게 되면 split 모드가 자동 비활성화된다.

### FR-419: 터미널 테마 동기화 및 폰트 설정

- 터미널 색상은 `useLayoutStore.theme` (`dark` / `light` / `high-contrast` / `retro-green`)을 따라야 한다. `TerminalManager`는 `src/lib/terminal/terminal-themes.ts`의 `TERMINAL_THEMES` 상수로 각 앱 테마에 대한 xterm `ITheme`을 정의하며, boot 시 `useLayoutStore` 구독을 통해 `setTheme(theme)`을 모든 인스턴스에 전파한다.
- **호스트 배경 동기화**: xterm 호스트 `<div>`는 테마 토글·탭 전환·패널 마운트 직후 WebGL 캔버스가 그리기 전에 **잘못된 색 플래시**를 보여서는 안 된다. 이를 위해 `src/app/globals.css`에 `:root`/`.dark`/`.high-contrast`/`.retro-green` 블록마다 `--terminal-bg` / `--terminal-fg` CSS 변수를 정의하고, `x-terminal.tsx`의 호스트 div가 `style={{ background: 'var(--terminal-bg)' }}`로 이를 소비한다. CSS 변수 값은 `TERMINAL_THEMES[theme].background`/`foreground`와 **반드시 동일한 hex**여야 하며, 드리프트는 `tests/unit/terminal-themes-contrast.test.ts`가 자동 검출한다.
- 터미널 폰트 패밀리와 ligature 토글은 `useSettingsStore`의 영속 필드 `terminalFontFamily` / `terminalFontLigatures`로 관리된다. 기본값은 `JetBrains Mono, Menlo, monospace` / `false`. 변경 시 매니저가 모든 인스턴스에 `term.options.fontFamily`를 재적용하고 `fit()`을 트리거한다.
- `terminalCopyOnSelect` 설정(기본 `false`)이 켜지면 xterm의 `onSelectionChange` 이벤트에서 `navigator.clipboard.writeText`로 현재 선택을 자동 복사한다.
- 3가지 설정 모두 Command Palette 커맨드로 접근 가능하다 ("Terminal: Set Font Family…", "Terminal: Enable/Disable Font Ligatures", "Terminal: Enable/Disable Copy-on-Select").

### FR-420: OS 터미널 바이패스 (Open in system terminal)

- 사용자는 `Cmd/Ctrl+Shift+O` 단축키, 터미널 탭 스트립의 `ExternalLink` 아이콘 버튼, xterm 컨텍스트 메뉴의 "Open in system terminal" 항목, 또는 파일 탐색기 컨텍스트 메뉴의 "Open in system terminal" 항목을 통해 **현재 탭의 cwd**(없으면 활성 프로젝트 루트)를 OS 기본 터미널 앱에서 새 창으로 열 수 있어야 한다. 내부 xterm 세션은 영향을 받지 않는다.
- 엔드포인트: `POST /api/terminal/open-native`, body `{ cwd?: string }`. 미지정 시 `getActiveRoot()` 사용. `cwd`는 `resolveSafe`로 프로젝트 루트 안으로 정규화되며, 파일 경로면 `path.dirname`으로 자동 보정된다.
- 플랫폼별 launcher 결정은 `src/app/api/terminal/open-native/launchers.ts`의 순수 함수 `resolveLauncher({platform, cwd, env, exists})`가 담당한다:
  - **darwin**: `CLAUDEGUI_EXTERNAL_TERMINAL` → `open -na <value> <cwd>` (override) / 그 외에는 `/Applications/iTerm.app` 존재 시 iTerm, 없으면 Terminal.app. 내장 앱(iTerm, Terminal.app)은 **AppleScript**(osascript)를 사용하여 새 창을 열고 cwd를 정확히 설정한다. `open -na` 방식 대신 AppleScript를 사용함으로써 cwd가 "열 파일"이 아닌 작업 디렉토리로 올바르게 적용된다.
  - **win32**: `CLAUDEGUI_EXTERNAL_TERMINAL` → `<value> -d <cwd>` / 없으면 `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` 탐지 후 Windows Terminal / 최후로 `cmd.exe /c start "" cmd.exe /K cd /d <cwd>`.
  - **linux/BSD**: `CLAUDEGUI_EXTERNAL_TERMINAL` → `$TERMINAL` → `x-terminal-emulator` → `gnome-terminal` → `konsole` → `xfce4-terminal` → `tilix` → `alacritty` → `kitty` → `wezterm` → `foot` → `rio` → `xterm` 순으로 PATH 탐색. cwd 전달 플래그는 각 emulator별로 다르며(`--working-directory`, `-d`, `start --cwd` 등) 테이블로 캡슐화된다. `xterm`은 `-e 'cd <escaped> && exec $SHELL'`로 폴백한다.
- 환경 변수 `CLAUDEGUI_EXTERNAL_TERMINAL`로 OS 기본값을 override할 수 있다. 값은 macOS에서는 `open -a`의 앱 이름으로, Linux에서는 binary 이름으로, Windows에서는 실행 파일 경로로 해석된다.
- 오류 처리: 설치된 터미널이 없거나 override가 PATH에서 찾을 수 없으면 `NoLauncherError` → HTTP 501 (`code: 4501`). `spawn` 실패(ENOENT 등)는 100 ms 윈도우 안에서 async `error` 이벤트를 race해 HTTP 500 (`code: 5500`) + 이유 문자열로 보고한다. `resolveSafe` 위반은 403 (`code: 4403`). cwd 미존재는 404 (`code: 4404`).
- 보안: 새 창은 `spawn(..., { detached: true, stdio: 'ignore', cwd: targetDir })` + `child.unref()`로 분리 실행되며 클라이언트는 stdout/stderr을 소비하지 않는다. 서버 `127.0.0.1` 바인딩 전제를 유지하고 `0.0.0.0` 노출을 금한다.
- **인라인 피드백**: 성공 시 터미널 패널 상단에 초록 배너("Opened in {launcher}")가 3초간 표시되며, 실패 시 빨간 배너(오류 메시지)가 8초간 표시된다. `alert()` 대신 비차단 인라인 알림을 사용한다.

---

## 3.5 Claude CLI 통합 (FR-500)

### FR-501: Agent SDK 통합

- `@anthropic-ai/claude-agent-sdk`를 통해 Claude Code 프로세스를 관리해야 한다.
- `child_process.spawn()` 직접 사용 대신 SDK를 사용하여 안정성을 확보한다.
- `startup()` 메서드를 통한 사전 워밍업(~20x 빠른 첫 쿼리)을 지원한다.

### FR-502: 스트리밍 응답 표시

- Agent SDK의 `query()` async iterator로부터 `SDKMessage` 이벤트를 실시간 수신해야 한다.
- 메시지 타입별 처리:
  - `system` (subtype `init`): 세션 id, 모델, 사용 가능 도구 목록 저장
  - `assistant`: `message.content[]` 블록 배열 순회 — `text` 블록은 어시스턴트 메시지로, `tool_use` 블록은 tool 메시지로 표시
  - `user`: 도구 실행 결과 피드백 — UI에는 표시하지 않음
  - `result`: 최종 결과 (`total_cost_usd`, `usage.input_tokens`/`output_tokens`, `session_id`, `subtype`)
- **메시지 타입 시스템 (v0.6)**: 각 `ChatMessage`는 `kind: MessageKind` 필드로 세분화된다.
  - `MessageKind = 'text' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'auto_decision'`
  - `tool_use` 메시지는 전체 `toolInput`을 저장하며, 300자 절단 없이 접이식 카드로 표시한다.
  - `isStreaming?: boolean` 필드로 현재 청크 수신 중인 메시지를 식별한다.
- **프로그레시브 텍스트 스트리밍 (v0.6)**: 동일 턴의 연속 `assistant` 이벤트는 새 메시지를 생성하지 않고 기존 메시지의 `content`에 append한다. `result` 도착 시 `isStreaming: false`로 전환한다.
- **메시지 필터 (v0.6)**: `messageFilter: Set<MessageKind>`로 표시할 타입을 토글할 수 있다. 헤더 아래 필터 바에 각 종류별 칩(카운트 배지 포함)을 표시한다. 사용자 메시지는 필터 대상에서 제외(항상 표시).
- **메시지 렌더러 (v0.6)**: `kind`별 전용 렌더러:
  - `text`: react-markdown + 스트리밍 커서 애니메이션
  - `tool_use`: 접이식 카드 (도구명 헤더 + 확장 가능한 JSON 본문)
  - `auto_decision`: 인라인 pill/badge (allow=녹색, deny=빨강)
  - `error`: 빨간 배경 + 에러 아이콘
  - `system`: 중앙 정렬 디바이더
- **타이핑 인디케이터 (v0.6)**: `isStreaming`이 true이고 스트리밍 중인 assistant 메시지가 아직 없을 때 "Claude is thinking..." 펄스 인디케이터를 표시한다.
- 구현: `src/stores/use-claude-store.ts` (`MessageKind`, `ChatMessage` 확장, `messageFilter`, `toggleFilter`, 프로그레시브 append), `src/components/panels/claude/chat-message-item.tsx`, `src/components/panels/claude/chat-filter-bar.tsx`, `src/components/panels/claude/claude-chat-panel.tsx`.

### FR-503: 세션 관리

- **멀티탭**: Claude 채팅 패널은 다중 탭을 지원한다. 각 탭은 독립된 세션, 메시지, 스트리밍 상태를 가진다.
  - 탭 생성: `+` 버튼 또는 `/new` 슬래시 명령으로 새 탭을 생성한다.
  - 탭 닫기/이름 변경: 탭 닫기 버튼, 더블클릭 이름 변경, 우클릭 컨텍스트 메뉴를 지원한다.
  - 탭 자동 명명: 사용자가 첫 메시지를 보내면 해당 메시지 내용을 기반으로 탭 이름이 자동 설정된다.
  - 자동 세션 생성: 새 탭에서 첫 메시지를 전송하면 백엔드 세션이 자동으로 생성된다.
  - `/clear`는 활성 탭의 메시지만 초기화한다.
  - 스트리밍 응답은 `session_id`를 기준으로 해당 탭에 정확히 라우팅된다.
- **새 세션 생성**: 프로젝트 디렉토리 기준 새 대화 시작
- **세션 재개**: 기존 세션 ID로 대화 이어가기
- **세션 포크**: 기존 세션에서 분기하여 새 대화 시작
- **세션 명명**: 사용자가 세션에 이름을 부여
- 세션 목록은 `~/.claude/projects/` 기반으로 조회

### FR-504: 토큰 사용량 표시

- 각 쿼리의 토큰 사용량(입력/출력)을 표시해야 한다.
- `result` 메시지의 `usage` 필드를 활용한다.
- 누적 비용(`total_cost_usd`)은 Agent SDK가 제공하는 추정치이므로 세션 정보 바에는
  노출하지 않는다. 내부적으로는 `SessionStats.costUsd` 및 `ClaudeState.totalCost`로
  계속 누적하여 `max-budget` 한도 체크(FR-508) 등 비표시 용도로만 사용한다.
- **세션 정보 바 (Session Info Bar)**: Claude 채팅 패널 하단에 현재 활성 세션에 대한
  통계를 접이식 바 형태로 표시한다.
  - 접힘(기본) 상태: 모델명, 턴 수, **컨텍스트 사용률**(현재/한도 및 %), 총 토큰 수,
    마지막 업데이트 시각을 단일 라인(높이 24px)으로 노출한다. 편집 영역을 침범하지
    않기 위해 기본값은 접힘이다.
  - 펼침 상태: 세션 ID, 모델, `num_turns`, `duration_ms`, **컨텍스트(사용/한도 및 %)**,
    입력/출력/캐시 읽기 토큰, 마지막 업데이트 경과 시간을 표 형태로 표시한다.
  - 값의 출처는 Agent SDK가 실제로 전달한 이벤트 필드(`system.init`의 `model`,
    `result`의 `num_turns`/`duration_ms`/`usage.*`/`modelUsage.*`)로 한정한다. 컨텍스트 윈도우 크기는 `result.modelUsage[model].contextWindow`에서,
    현재 턴 컨텍스트 사용량은 동일 엔트리의 `inputTokens + cacheReadInputTokens +
    cacheCreationInputTokens`에서 읽는다. SDK가 제공하지 않는 값에 대한 하드코딩
    추정치는 여전히 금지하며, 데이터가 도착하기 전에는 해당 필드를 "-"로 표시한다.
  - 컨텍스트 사용률은 마지막 `result` 이벤트 기준의 스냅샷이며(턴 누적이 아니다),
    50% 미만 녹색, 50% 이상 노랑, 80% 이상 빨강의 경고 색을 적용한다.
  - 값은 세션 ID별로 `sessionStats: Record<string, SessionStats>`에 누적되며,
    세션 전환 시 활성 세션의 스냅샷만 표시된다. WebSocket 푸시를 통해 갱신되므로
    별도의 폴링은 수행하지 않는다.
  - 펼침/접힘 상태는 `localStorage`에 저장되어 재방문 시 복원된다.

### FR-505: 권한 요청 인터셉트

- Agent SDK의 `canUseTool` 콜백 옵션을 사용해 Claude가 도구 실행을 요청할 때 GUI 모달을 표시해야 한다.
- 모달에는 다음 정보를 포함한다:
  - 요청된 도구 이름
  - 인자 (파일 경로, 명령어 등)
  - 위험도 배지 (`safe` / `warning` / `danger`)
  - **Deny**, **Allow Once**, **Always Allow** 세 가지 버튼
- 버튼별 동작은 명확히 구분된다:
  - **Deny**: `{ behavior: 'deny', message }`를 SDK에 반환. Claude는 해당 도구 사용을 포기하고 대안을 모색한다.
  - **Allow Once (1회 허용)**: 해당 호출 1건만 통과시킨다. 설정 파일에 어떤 흔적도 남기지 않는다.
  - **Always Allow (항상 허용)**: `.claude/settings.json`의 `permissions.allow`에 규칙을 저장한 뒤 현재 호출도 승인한다. 같은 툴에 대한 이후 호출은 모달 없이 자동 통과된다.
- 물리적 사용자 클릭을 요구한다 — `Allow Once`는 세션 내에서도 자동 승인으로 확장되지 않는다.
- `permissionMode: 'default'`에서 Agent SDK는 안전한 작업(읽기, 단순 Bash 명령)을 자동 승인할 수 있다. 이 경우 `canUseTool`은 호출되지 않으며, 도구 사용은 채팅 패널의 tool 메시지로만 기록된다.
- 모달을 닫거나(Escape/백드롭) 세션이 종료되면 대기 중인 요청은 자동으로 Deny로 해결된다.

### FR-506: 자동 승인 규칙 (영구 모드)

- `.claude/settings.json`의 `permissions.allow` / `permissions.deny` 목록과 연동하여 도구 호출을 서버 측에서 자동 승인/거부해야 한다.
- 매칭은 `canUseTool` 호출 시점에 파일을 다시 읽어 평가하며, "Always Allow"로 추가된 규칙이 다음 호출부터 즉시 반영된다.
- 규칙 문법:
  - 툴 이름만: `Write`, `Edit`, `Read` 등 — 해당 툴의 모든 호출이 매칭된다.
  - Bash 패턴: `Bash(<prefix>:*)` — 명령어가 해당 prefix로 시작하면 매칭된다. `:*`가 없으면 완전 일치.
- Bash 호출에 대한 "Always Allow"는 명령어의 첫 토큰을 기준으로 `Bash(<firstToken>:*)` 규칙을 생성한다 (예: `npm test ...` → `Bash(npm:*)`).
- 자동 승인/거부가 발동되면 서버는 `auto_decision` WebSocket 이벤트를 전송하고, UI는 채팅 패널에 시스템 메시지로 기록한다.
- 사용자는 `PermissionRulesModal`을 통해 현재 저장된 `allow` / `deny` 규칙을 조회·추가·삭제할 수 있어야 한다.
- 위험도가 `danger`로 평가된 호출에 대해서는 "Always Allow" 버튼을 비활성화하여 위험 명령이 실수로 영구 허용 목록에 들어가는 것을 방지한다.

### FR-507: 도구 사용 현황 시각화

- Claude의 현재 작업 상태를 실시간 표시해야 한다:
  - 현재 읽고 있는 파일
  - 실행 중인 검색 쿼리
  - 호출 중인 도구명
- 파일 탐색기에서 Claude가 접근 중인 파일을 하이라이트한다.

### FR-508: 실행 제한 설정

- `max-turns`: 최대 대화 턴 수 설정
- `max-budget`: 세션당 최대 비용(USD) 설정
- 한도 도달 시 사용자에게 알림 후 확인을 요청한다.

### FR-509: 컨텍스트 컴팩션

- `/compact` 명령어를 통한 컨텍스트 압축을 지원해야 한다.
- 컨텍스트 사용량 표시 및 임계치 도달 시 자동 알림을 제공한다.

### FR-510: 인증 상태 표시 (v0.3)

- 시스템은 Claude CLI 인증 상태를 헤더 배지로 실시간 표시해야 한다.
- 인증 소스는 `credentials-file` (`~/.claude/.credentials.json`), `env` (`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`), `none` 중 하나이다.
- CLI 미설치 상태도 구분하여 표시 (`cliInstalled: false`) 한다.
- 인증 성공 시 배지에 계정명 대신 **"Verified"** 를 표시한다.
- 미인증 시 배지에 **"Sign In"** 을 표시하고, 클릭 시 로그인 안내 모달을 연다.
- 로그인 모달은 두 가지 인증 방법을 탭으로 제공한다:
  - **CLI Login 탭**: `claude login` 명령어 안내 및 터미널 열기 버튼.
  - **API Key 탭**: `ANTHROPIC_API_KEY` 직접 입력·저장·삭제 UI. 키는 서버 측 `~/.claudegui/server-config.json`에 저장되며, 프론트엔드에 키 값은 노출되지 않는다 (`hasApiKeySaved: boolean`만 전달).
- API Key 관리 엔드포인트: `POST /api/auth/api-key` (저장), `DELETE /api/auth/api-key` (삭제). localhost 전용.
- 구현: `src/lib/claude/auth-status.ts`, `GET /api/auth/status`, `src/app/api/auth/api-key/route.ts`, `src/components/layout/auth-badge.tsx`, `src/components/modals/login-prompt-modal.tsx`.

### FR-511: 프롬프트 @ 파일/디렉토리 참조

- Claude 프롬프트 입력창에서 사용자가 `@` 문자를 입력하면 프로젝트 내 파일과 디렉토리를 자동완성으로 참조할 수 있어야 한다 (Claude Code CLI 표준 기능 재현).
- 후보 목록은 현재 활성 프로젝트 루트(`useProjectStore.activeRoot`)를 기준으로 `GET /api/files`를 재귀 호출해 깊이 3까지 크롤링하여 수집하며, 파일과 디렉토리를 모두 포함한다. 숨김/보호 파일(`.env`, `.git`, `.claude` 등)은 `/api/files`의 기본 필터 정책을 따른다.
- 입력창 상단 오버레이(`MentionPopover`)에 최대 20개의 후보가 표시된다. 후보 순위는 `path`에 대한 완전 일치 > 전체 prefix 일치 > 파일명 prefix 일치 > 부분 문자열 일치 > 서브시퀀스 일치 순으로 정해진다.
- 멘션 트리거 규칙: `@` 앞 문자가 공백이거나 `@`가 문자열 시작일 때에만 멘션으로 간주한다 (이메일 형태 `user@domain` 등 제외). 공백이 개입되면 멘션이 종료된다.
- 키보드 조작: `ArrowUp`/`ArrowDown`으로 후보 이동, `Enter`/`Tab`으로 선택, `Escape`로 닫기. 드롭다운이 열려 있는 동안 `Enter`는 메시지 제출 대신 후보 선택으로 동작한다.
- 선택된 항목은 입력창의 `@<query>` 토큰을 `@<프로젝트 상대 경로>` 형태로 치환하며, 디렉토리의 경우 뒤에 `/`를 덧붙인다. 토큰 뒤에 공백이 없으면 공백 한 칸을 자동 삽입하고 커서를 삽입 지점 뒤로 이동한다.
- 프롬프트 전송 시 `@` 참조는 원문 그대로 Claude Agent SDK(`sendQuery(prompt)`)에 전달된다. 참조 해석·파일 내용 첨부는 SDK/CLI의 표준 문법 처리에 위임하며, GUI에서는 별도의 preprocessing을 수행하지 않는다.
- 구현: `src/lib/fs/list-project-files.ts`, `src/components/panels/claude/use-file-mentions.ts`, `src/components/panels/claude/mention-popover.tsx`, `src/components/panels/claude/claude-chat-panel.tsx`.

### FR-512: 모델 선택

- 사용자가 Claude 채팅 패널 헤더의 드롭다운을 통해 사용할 모델을 선택할 수 있어야 한다.
- 선택지: `Auto`(기본, SDK 기본 모델) 및 지원 모델 목록(`claude-opus-4-6`(1M ctx), `claude-sonnet-4-6`(200K ctx), `claude-haiku-4-5-20251001`(200K ctx)).
- 각 모델 항목은 모델명, 설명(예: "Most capable for complex work"), 컨텍스트 윈도우 크기, 입력 가격 티어를 표시한다.
- 선택된 모델은 `useSettingsStore.selectedModel`에 저장되며 `localStorage`를 통해 persist된다.
- 쿼리 전송 시 `ClaudeQueryMessage.options.model`에 선택된 모델 ID를 포함하여 서버에 전달한다.
- 구현: `src/lib/claude/model-specs.ts`, `src/components/panels/claude/model-selector.tsx`, `src/stores/use-settings-store.ts`, `src/lib/websocket/claude-client.ts`.

### FR-513: 모델 스펙 표시

- 세션 정보 바 펼침 상태에서 현재 활성 모델의 상세 스펙을 표시해야 한다.
- 표시 항목: 최대 출력 토큰, 입력/출력 가격(per 1M tokens), 기능 뱃지(`vision`, `code`, `extended-thinking`).
- 모델 스펙은 `src/lib/claude/model-specs.ts`의 정적 데이터에서 조회한다. SDK 응답의 `system.init.model` 또는 사용자 선택 모델 ID로 매칭하되, 정확 매치 실패 시 prefix 매치를 시도한다.
- 구현: `src/components/panels/claude/session-info-bar.tsx`, `src/lib/claude/model-specs.ts`.

### FR-514: 컨텍스트 사용률 시각적 프로그레스 바

- FR-504의 컨텍스트 사용률 텍스트에 더해 시각적 프로그레스 바를 제공해야 한다.
- 접힘 상태: 컨텍스트 퍼센트 옆에 인라인 미니 프로그레스 바(40px 너비, 3px 높이)를 표시한다.
- 펼침 상태: 전체 너비 프로그레스 바(높이 6px, 라운드)와 수치 라벨을 표시한다.
- 색상 기준은 FR-504와 동일: <50% 녹색(`bg-emerald-500`), 50-80% 노랑(`bg-amber-500`), ≥80% 빨강(`bg-red-500`).
- 구현: `src/components/panels/claude/session-info-bar.tsx`.

### FR-515: 활동 스트림 필터

- Claude 채팅 패널의 메시지 영역 상단에 `MessageKind`별 필터 토글 바를 제공해야 한다.
- 필터 카테고리: Text(`text`), Tools(`tool_use`, `tool_result`), Auto(`auto_decision`), Errors(`error`).
- 각 필터 버튼은 아이콘 + 레이블 + 현재 해당 종류 메시지 개수 배지를 포함한다.
- 활성화/비활성화 토글 동작으로 해당 카테고리 메시지를 즉시 숨기거나 표시한다.
- 사용자 메시지(`role: 'user'`)는 필터와 무관하게 항상 표시된다.
- 필터 상태는 `useClaudeStore.messageFilter`에 관리되며 세션 리셋 시 모든 필터가 활성화로 초기화된다.
- 구현: `src/components/panels/claude/chat-filter-bar.tsx`, `src/components/panels/claude/claude-chat-panel.tsx`.

### FR-516: 슬래시 명령어 시스템

- Claude 채팅 입력창에서 `/`로 시작하는 텍스트를 입력하면 사용 가능한 슬래시 명령어 목록을 팝오버로 표시해야 한다.
- 슬래시 명령어는 두 유형으로 분류된다:
  - **클라이언트 명령어**: GUI 내에서 직접 처리
  - **패스스루 명령어**: 입력 전체를 Claude CLI에 전달
- 패스스루 명령어는 `requiresSession` 플래그에 따라 세션 필수 여부가 결정된다:
  - `requiresSession: true` (기본): 활성 세션이 없으면 실행 차단 (`/compact`, `/context`)
  - `requiresSession: false`: 세션 없이도 실행 가능하며 새 세션 자동 생성 (`/init`, `/plan`, `/review`, `/pr-comments`)
- 팝오버는 입력이 `/`로 시작하고 공백이 없는 동안 표시되며, 타이핑에 따라 prefix 매칭으로 필터링된다.
- 키보드 조작: `ArrowUp`/`ArrowDown`으로 후보 이동, `Enter`로 즉시 실행, `Tab`으로 입력창에 명령어 이름을 채움, `Escape`로 닫기.
- 명령어 카테고리별 그룹핑 (6개):
  - **Session**: `/clear`, `/new`, `/compact`
  - **Info**: `/usage`, `/context`, `/cost`, `/model`, `/help`
  - **Mode**: `/plan`, `/review`
  - **System**: `/bug`, `/config`, `/doctor`, `/login`, `/logout`, `/status`, `/vim`, `/terminal-setup`
  - **Tools**: `/permissions`, `/approved-tools`, `/mcp`
  - **Project**: `/init`, `/memory`, `/pr-comments`, `/add-dir`
- 총 25개 슬래시 명령어를 지원하여 Claude Code CLI와 동일한 명령어 경험을 제공한다.
- 클라이언트 명령어는 채팅 영역에 시스템 메시지(`role: 'system'`, `kind: 'system'`)로 결과를 표시한다.
- `/help`는 `SLASH_COMMANDS` 레지스트리에서 동적으로 생성된 전체 명령어 마크다운 테이블을 표시한다.
- `/usage`, `/context`, `/cost`는 `useClaudeStore.sessionStats`의 현재 활성 세션 데이터를 조회하여 표시한다.
- `/model`은 현재 모델 정보와 `src/lib/claude/model-specs.ts` 스펙을 조회하여 표시한다.
- `/doctor`는 서버 상태, CLI 설치 여부, 인증 상태, WebSocket 연결, MCP 서버를 종합 진단한다.
- `/config`, `/permissions`, `/approved-tools`는 `/api/settings`에서 설정을 조회하여 표시한다.
- `/mcp`는 MCP 서버 상태를 조회하고 MCP 서버 관리 모달을 연다.
- `/memory`는 프로젝트 루트의 `CLAUDE.md`를 에디터에서 연다.
- `/vim`은 Monaco 에디터의 vim 키바인딩 모드를 토글한다 (`useSettingsStore.editorVimMode`).
- `/login`, `/logout`는 인증 상태를 확인/변경한다 (`/api/auth/status`, `/api/auth/logout`).
- `/bug`는 GitHub Issues 페이지를 새 탭에서 연다.
- `/add-dir <path>`는 프로젝트 컨텍스트에 디렉토리를 추가한다 (`POST /api/project`).
- 별칭(alias) 지원: `/reset`은 `/new`의 별칭이다.
- 구현: `src/lib/claude/slash-commands.ts`, `src/lib/claude/slash-command-handlers.ts`, `src/components/panels/claude/slash-command-popover.tsx`, `src/components/panels/claude/claude-chat-panel.tsx`.

### FR-517: 파일/이미지 드래그 앤 드롭 입력

- Claude 채팅 패널에 파일 또는 이미지를 드래그 앤 드롭하면 프로젝트 `uploads/` 디렉토리에 업로드한 후 `@uploads/filename` 참조를 입력창에 자동 삽입해야 한다.
- 클립보드에서 이미지를 붙여넣기(Cmd+V / Ctrl+V)하면 동일한 업로드→참조 삽입 흐름이 작동해야 한다.
  - 붙여넣기된 이미지는 `paste-{timestamp}.{ext}` 형식의 파일명으로 저장된다.
- 드래그 중 채팅 패널 위에 시각적 오버레이(`DropOverlay`)를 표시하여 드롭 가능 영역임을 안내해야 한다.
- 업로드된 파일은 입력창 상단에 파일 칩(`AttachedFilesBar`)으로 표시되며, 각 칩은 파일명·상태(업로드 중/완료/에러)·제거 버튼을 포함한다.
- 파일 칩의 제거 버튼을 클릭하면 칩과 입력창의 `@` 참조가 함께 제거된다.
- 업로드 중에는 전송 버튼이 비활성화된다.
- 전송 시 모든 파일 칩이 초기화된다.
- 기존 `/api/files/upload` 엔드포인트와 `filesApi.upload()`를 재사용하며, 파일 크기 제한(50MB/파일, 200MB/전체)이 적용된다.
- 텍스트 또는 URL 드래그는 무시한다(`hasFilePayload` 검증).
- 구현: `src/components/panels/claude/use-chat-drop.ts`, `src/components/panels/claude/drop-overlay.tsx`, `src/components/panels/claude/attached-files-bar.tsx`, `src/lib/fs/collect-files.ts`.

### FR-518: 활성 에디터 파일 컨텍스트 자동 전달

- Claude 채팅 패널은 에디터 패널에서 현재 활성화된(포커스된) 파일을 자동으로 인식하여 쿼리에 포함해야 한다.
- 전달되는 컨텍스트 정보: 파일 경로, 커서 위치(행/열), 미저장 상태(`dirty`), 보류 중인 diff 유무(`hasDiff`).
- 클라이언트 측: `ClaudeClient.sendQuery()` 호출 시 `useEditorStore`에서 활성 탭 정보를 조회하여 `ClaudeQueryMessage.activeFile` 필드로 서버에 전송한다.
- 서버 측: `claude-handler.mjs`의 `runQuery()`에서 `activeFile` 정보가 존재하면 프롬프트 앞에 `[Active file: <path>, line <n>:<col>, unsaved, has pending diff]` 형태의 컨텍스트 prefix를 자동 삽입한다.
- UI: 채팅 패널 입력 영역 바로 위에 현재 활성 파일 경로를 표시하는 인라인 인디케이터(`Focusing: <path>`)를 제공한다. 활성 파일이 없으면 인디케이터를 숨긴다.
- 기존 `@` 파일 참조(FR-511)와 독립적으로 동작한다. `@` 참조는 명시적 파일 지정이고, 활성 파일 컨텍스트는 암시적 포커스 정보이다.
- WebSocket 메시지 타입: `ActiveFileContext` (`path`, `dirty`, `hasDiff`, `cursorLine?`, `cursorCol?`).
- 구현: `src/types/websocket.ts`, `src/lib/websocket/claude-client.ts`, `server-handlers/claude-handler.mjs`, `src/components/panels/claude/claude-chat-panel.tsx`.

### FR-520: 네이티브 앱 실행 모드 (v0.3)

- Tauri v2 기반 네이티브 앱(`.dmg` / `.msi`)으로 ClaudeGUI를 실행할 수 있어야 한다.
- 앱은 번들된 Node.js 사이드카로 `server.js`를 실행하고, 네이티브 웹뷰가 `127.0.0.1:<random-port>`에 연결한다.
- 첫 실행 시 Claude CLI가 PATH에 없으면 앱 로컬 `node-prefix`에 자동 설치 후 PTY `PATH`에 prepend한다.
- 구현: `installer/tauri/`, `scripts/installer-runtime/ensure-claude-cli.mjs`.

---

## 3.6 프리뷰 패널 (FR-600)

### FR-601: 파일 타입 자동 감지

- 파일 확장자를 기반으로 적절한 렌더러를 자동 선택해야 한다.
  - `.html` → HTML 프리뷰
  - `.pdf` → PDF 프리뷰
  - `.md` → Markdown 프리뷰
  - `.png`, `.jpg`, `.gif`, `.svg`, `.webp` → 이미지 프리뷰
  - `.reveal.html`, 프레젠테이션 모드 → reveal.js 프리뷰
- 인식되지 않는 확장자이거나 파일이 선택되지 않은 경우 프리뷰 패널은 **완전한 빈 화면**(도움말 텍스트 없음)을 렌더해야 한다.

### FR-602: HTML 프리뷰

- `iframe`의 `srcdoc` 속성을 통해 HTML을 렌더링해야 한다.
- `sandbox="allow-scripts"` 적용 (`allow-same-origin` 금지).
- CSS만 변경된 경우 `postMessage`를 통해 스타일만 업데이트 (iframe 리로드 방지).
- 파일 선택 시 콘텐츠를 즉시 로드해야 한다. 비동기 fetch는 취소 가능해야 하며(cancellation flag), 파일 전환 시 이전 콘텐츠를 즉시 초기화하여 stale 콘텐츠가 표시되지 않도록 한다.
- 구현: `src/components/panels/preview/preview-router.tsx` (콘텐츠 로딩 + 취소 로직), `src/components/panels/preview/html-preview.tsx` (iframe 렌더링).

### FR-603: PDF 프리뷰

- `react-pdf` (pdf.js 5.x 기반)를 사용하여 PDF를 렌더링해야 한다.
- 페이지별 네비게이션 (이전/다음, 페이지 번호 직접 입력)을 지원한다.
- 좌측에 `<Thumbnail>` 사이드바를 표시할 수 있다.
- PDF.js Web Worker를 활용하여 메인 스레드 블로킹을 방지한다.

### FR-604: Markdown 프리뷰

- `react-markdown` + `remark-gfm` + `rehype-highlight`를 사용하여 렌더링해야 한다.
- 지원 기능: GFM 테이블, 체크리스트, 코드 블록 구문 강조, LaTeX 수식
- `---` (수평 구분선)을 페이지 구분자로 인식할 수 있다.
- `dangerouslySetInnerHTML` 사용을 금지하고 sanitize 옵션을 적용한다.

### FR-605: 이미지 프리뷰

- 주요 이미지 포맷을 렌더링해야 한다: PNG, JPEG, GIF, SVG, WebP
- `react-zoom-pan-pinch`를 활용한 줌/팬 기능을 제공한다.
- 대용량 이미지는 스트리밍으로 점진적 로딩한다.

### FR-606: 디바운스 기반 실시간 갱신

- 에디터 변경 시 프리뷰를 즉시 갱신하지 않고 300ms 디바운스를 적용해야 한다.
- 변경된 섹션만 업데이트 (전체 리렌더링 방지).

### FR-607: 페이지 네비게이션 UI

- 다중 페이지 콘텐츠(PDF, 프레젠테이션)에 대해 페이지 네비게이션을 제공해야 한다.
- UI 요소: 이전/다음 버튼, 현재 페이지 / 전체 페이지 표시, 페이지 점프

### FR-610: 범용 스트리밍 라이브 프리뷰 (v0.3 → v0.6 확장)

- Claude의 어시스턴트 응답에서 **모든 언어의 코드 펜스**(` ```html `, ` ```python `, ` ```typescript ` 등) 또는 **모든 파일 타입**에 대한 `Write`/`Edit`/`MultiEdit` `tool_use`를 감지하여 프리뷰 패널을 **파일 선택과 무관하게** 실시간 업데이트해야 한다.
- **다중 페이지 모델 (v0.6)**: 하나의 스트림에서 발생하는 각 코드 펜스 또는 `tool_use`는 독립적인 "페이지(`LivePage`)"로 관리된다. 각 페이지는 `id`, `kind`(html/svg/markdown/code/text), `language`, `title`, `content`, `renderable`, `complete`, `viewMode`(source/rendered) 속성을 갖는다.
- **페이지 종류별 렌더링**:
  - `html`: 렌더 가능한 단위(`<!doctype`, `<html`, `<body`, 균형 잡힌 최상위 태그) 감지 시 iframe `srcdoc`으로 렌더, 그렇지 않으면 소스 뷰 폴백. iframe은 `sandbox="allow-scripts"` (`allow-same-origin` 금지). 디바운스 80ms.
  - `svg`: `</svg>` 닫힘 태그 감지 시 iframe 렌더, 그렇지 않으면 소스 뷰. 디바운스 150ms.
  - `markdown`: 항상 점진적 렌더링 가능 (react-markdown). 디바운스 100ms.
  - `code`: highlight.js 구문 강조 소스 뷰 (JavaScript, TypeScript, Python, CSS, JSON, Bash, YAML, SQL 등 지원).
  - `text`: `<pre>` 블록 소스 뷰.
- **페이지별 코드/프리뷰 듀얼 모드**: 모든 페이지는 소스 뷰와 렌더 뷰를 `viewMode` 토글로 전환할 수 있다. `renderable`이 false→true로 변할 때 자동으로 렌더 뷰로 전환된다.
- **페이지 네비게이션**: 다중 페이지가 존재하면 상단에 탭 바가 표시되며, 각 탭은 종류(HTML/SVG/MD/Code/Text) + 제목 + 스트리밍 인디케이터를 보여준다. 좌우 화살표로 이동 가능.
- 부분 편집 보존 규칙: `Edit`/`MultiEdit` `tool_use`는 `UniversalStreamExtractor`가 유지하는 파일별 baseline을 기준으로 `old_string → new_string` 치환을 수행한다. 이는 HTML뿐 아니라 모든 텍스트 파일 타입에 적용된다.
- **라이브 프리뷰 페이지 지속성**: 새로운 Claude 쿼리가 시작되어도 `useLivePreviewStore.pages`는 초기화되지 않는다. 후속 쿼리의 `Edit`/`MultiEdit`가 이전 페이지의 연장선에서 동작할 수 있도록 하기 위해서이다.
- **Baseline 디스크 폴백**: 메모리 baseline이 없는 상태에서 `Edit`/`MultiEdit`가 도착하면 `UniversalStreamExtractor`는 `onNeedBaseline(filePath, apply)` 이벤트를 방출한다. `useClaudeStore`는 `/api/files/read`를 통해 해당 파일 내용을 비동기로 읽어 `apply(content)`를 호출하고, extractor는 그 결과를 기준으로 치환을 적용한다.
- **에디터 인수인계 규칙**: `Write`/`Edit` `tool_use`로 감지된 파일 경로는 `LivePage.filePath`에 저장된다. 사용자가 해당 파일을 에디터 탭으로 열면, 라이브 프리뷰는 에디터 탭의 `content`를 소스로 사용한다.
- 쿼리 종료 이벤트(`result`) 시 finalize하여 모드를 `'complete'`로 전환한다.
- 구현: `src/lib/claude/universal-stream-extractor.ts` (범용 추출기), `src/lib/claude/html-stream-extractor.ts` (레거시, deprecated), `src/stores/use-live-preview-store.ts` (다중 페이지 `LivePage[]` 모델), `src/stores/use-claude-store.ts` (추출기 연결, baseline 폴백), `src/components/panels/preview/live-stream-preview.tsx` (범용 라이브 프리뷰), `src/components/panels/preview/page-nav-bar.tsx` (페이지 네비게이션), `src/components/panels/preview/source-preview.tsx` (확장된 구문 강조).

### FR-611: 프리뷰 전체화면 모드 (v0.3)

- 프리뷰 패널은 전체화면 모드를 제공해야 한다 (`position: fixed; inset: 0; z-index: 9999`).
- `Esc` 키로 전체화면을 해제할 수 있어야 한다.
- 전체화면 상태는 `usePreviewStore.fullscreen` 필드로 관리한다.

### FR-612: Contain-fit 기본 렌더링 및 콘텐츠 경계 윤곽선

- 프리뷰(슬라이드, PDF, HTML, Markdown)는 **패널 모드와 전체화면 모드 모두에서**, 컨테이너의 가로·세로 비율과 무관하게 콘텐츠의 전체 레이아웃이 잘리지 않고 표시되어야 한다(contain-fit 기본값).
  - **슬라이드**: reveal.js를 고정 논리 크기(`width: 960, height: 700`)로 초기화하고, `margin: 0.04`, `minScale: 0.05`, `maxScale: 2.0`을 적용하여 어떤 비율에서도 한 슬라이드 전체가 보이도록 축소 배치한다.
  - **PDF**: `ResizeObserver`로 스크롤 컨테이너 크기를 관측하고 첫 `Page.onLoadSuccess`에서 `getViewport({ scale: 1 })`로 네이티브 크기를 캡처한 뒤, `width = min(availableWidth, availableHeight × aspect)`로 전달하여 페이지 전체가 컨테이너 안에 들어오도록 렌더한다. 파일이 바뀌면 네이티브 크기 캐시를 초기화한다.
  - **HTML / Live HTML / Markdown**: 콘텐츠를 제공하는 영역(iframe 또는 문서 컨테이너)을 `bg-muted` 외곽 + 내부 `ring-1 ring-border/70` 박스로 감싸 내부 배경이 외부 배경과 구분되도록 한다.
- 모든 프리뷰 타입은 배경색 충돌(예: 흰 문서 위 흰 패널, 검은 슬라이드 위 검은 iframe)이 발생하더라도 콘텐츠의 경계가 **항상 시각적으로 식별**되어야 한다. 이를 위해:
  - 슬라이드 섹션은 `reveal-host.html`에서 `box-shadow: 0 0 0 1px rgba(255,255,255,0.28), 0 6px 24px rgba(0,0,0,0.45)`로 외곽선을 그린다.
  - PDF 페이지 캔버스는 `ring-1 ring-border/70` + `shadow-md`로 감싼다.
  - HTML / Live HTML iframe, Markdown 문서 컨테이너는 `ring-1 ring-border/70` + `shadow-sm`로 감싼다.
- 이 규칙은 `usePreviewStore.fullscreen` 값과 독립적으로 동일하게 적용되어야 한다.
- 구현: `public/reveal-host.html`, `src/components/panels/preview/pdf-preview.tsx`, `src/components/panels/preview/html-preview.tsx`, `src/components/panels/preview/live-html-preview.tsx`, `src/components/panels/preview/markdown-preview.tsx`, `src/components/panels/preview/slide-preview.tsx`.

### FR-613: 프리뷰 즉시 다운로드

- 프리뷰 패널 헤더는 현재 렌더 중인 콘텐츠를 즉시 다운로드할 수 있는 드롭다운(아이콘: `Download`)을 제공해야 한다. 드롭다운은 현재 프리뷰의 `PreviewType`에 따라 **적용 가능한 포맷만** 표시한다.
- **라이브 프리뷰 중에도 다운로드는 활성화되어야 한다.** 라이브 프리뷰(`useLivePreviewStore.mode !== 'idle'` 이면서 `autoSwitch`가 켜진 상태)가 활성화된 동안에는 스트리밍된 `buffer`(또는 `generatedFilePath`가 에디터 탭으로 열려 있는 경우 해당 탭의 in-memory 내용)를 인라인 HTML 아티팩트로 취급하여 **현재까지 생성된 분량을 즉시 다운로드**할 수 있어야 한다. HTML 타입의 전체 포맷 매트릭스(Source `.html` / PDF / Word `.doc`)를 그대로 적용한다. 사용자는 5페이지 문서가 스트리밍되는 동안 이미 생성된 페이지가 포함된 현재 버퍼를 받을 수 있고, 스트리밍이 완료되면 자동으로 최종 문서가 다운로드 대상이 된다.
- 헤더 드롭다운 캡션은 `live-code` 스트리밍 중이면 `Download (streaming…)`, `live-html` 렌더 가능한 상태이면 `Download live buffer`, 일반 파일 프리뷰에서는 `Download as`로 표시하여 현재 스냅샷이 어떤 상태에서 캡처된 것인지 시각적으로 구분한다.
- 라이브 버퍼가 비어 있으면(`buffer === ''`) 메뉴는 렌더링하지 않는다(다운로드할 바이트가 없음).
- 포맷 매트릭스(타입 → 사용 가능한 포맷):

  | PreviewType | 사용 가능한 포맷 |
  |---|---|
  | `html` | Source(`.html`), PDF(인쇄 대화상자), Word(`.doc`) |
  | `markdown` | Source(`.md`), HTML(`.html`), PDF(인쇄 대화상자), Word(`.doc`) |
  | `slides` | Source(`.md`), HTML(`.html`), PDF(인쇄 대화상자) |
  | `image` (SVG) | Source(`.svg`), PNG(`.png`), PDF(인쇄 대화상자) |
  | `image` (PNG/JPEG/GIF/WebP 등) | Original file, PDF(인쇄 대화상자), HTML(`.html`), Word(`.doc`) |
  | `pdf` | Original file, PDF(인쇄 대화상자—직접 인쇄) |
  | `docx` | Original file, PDF(인쇄 대화상자), HTML(`.html`), Word(`.doc`) |
  | `xlsx` | Original file, PDF(인쇄 대화상자), HTML(`.html`), Word(`.doc`) |
  | `pptx` | Original file, PDF(인쇄 대화상자), HTML(`.html`), Word(`.doc`) |

- 텍스트 기반 타입(`html`/`markdown`/`slides`, 그리고 `.svg` 이미지)은 에디터 탭의 in-memory 내용이 있으면 이를 사용하고, 없으면 `filesApi.read()`로 디스크에서 읽어 변환/다운로드한다. 파일 기반 바이너리 타입(`pdf`/`image`(SVG 제외)/`docx`/`xlsx`/`pptx`)은 `/api/files/raw?path=...`에서 원본 바이트를 스트리밍하여 다운로드한다.
- **렌더링된 HTML 캐싱을 통한 크로스 포맷 내보내기**: 파일 기반 바이너리 타입(docx/xlsx/pptx/래스터 이미지)의 프리뷰 컴포넌트는 렌더링된 HTML을 `usePreviewStore.renderedHtml`에 캐싱한다. 이 캐시가 존재하면 PDF(인쇄 대화상자), HTML(`.html`), Word(`.doc`) 내보내기가 추가로 활성화된다. 내보내기 시 `exportWithRenderedHtml()`이 캐시된 HTML을 인라인 HTML 아티팩트로 변환하여 기존 `printViaIframe()`/다운로드 파이프라인을 재사용한다.
  - **DOCX**: mammoth.js가 변환한 HTML 전체를 캐싱.
  - **XLSX**: SheetJS가 생성한 모든 시트의 HTML 테이블을 페이지 구분자(`page-break-before`)로 연결하여 캐싱. 인쇄 시 전체 시트가 출력된다.
  - **PPTX**: 추출된 텍스트/이미지를 슬라이드별 HTML로 재구성하여 가로(landscape) 레이아웃으로 캐싱.
  - **래스터 이미지**: `<img>` 태그를 감싸는 단순 HTML을 캐싱. SVG는 기존 인라인 파이프라인을 사용하므로 제외.
- **PDF 직접 인쇄**: PDF 파일은 `printPdfDirect()`를 통해 원본 PDF를 숨겨진 iframe에 로드하고 브라우저 인쇄 대화상자를 직접 호출한다. 이를 통해 페이지 선택, 양면 인쇄 등 OS 인쇄 옵션을 그대로 사용할 수 있다. PDF 내보내기 설정 다이얼로그는 표시하지 않는다(이미 PDF이므로).
- **PDF 내보내기 설정 다이얼로그**: PDF 내보내기를 선택하면 브라우저 인쇄 대화상자를 띄우기 전에 `PdfExportDialog`를 표시하여 다음 옵션을 선택할 수 있다.
  - **페이지 방향**: 자동 감지(기본, HTML 자체 `@page` 규칙 존중) / 세로(Portrait) / 가로(Landscape).
  - **페이지 크기**: A4(기본) / Letter / Legal.
  - 자동 감지 모드에서 HTML 콘텐츠가 프레젠테이션(reveal.js, 다수 `<section>`) 또는 `@page { … landscape }` 규칙을 포함하면 가로 방향을 권장 힌트로 표시한다(`detectLandscapeHint()`).
- PDF 인쇄 CSS는 `buildPrintCss(options)`로 동적 생성되며, 선택된 방향·크기를 `@page { size: … }` 규칙에 반영한다. 자동 모드에서는 `@page` 규칙을 주입하지 않아 HTML 문서의 기존 레이아웃을 온전히 보존한다.
- 페이지 구분 규칙 강화: `<hr>`은 `page-break-after: always`로 페이지 구분자 역할을 하고, `<section>`, `.slide`, `[data-page-break]`은 `page-break-before: always`를 적용한다. 제목(`h1`–`h6`)은 `page-break-after: avoid`로 본문과 분리되지 않도록 보호한다.
- PDF 내보내기는 `window.print()`로 브라우저 인쇄 대화상자를 띄워 운영체제의 "PDF로 저장"으로 내보낸다(FR-1004의 아티팩트 내보내기와 동일 정책). 서버 측 PDF 렌더러(Puppeteer 등)는 요구하지 않는다.
- 구현: `src/lib/preview/preview-download.ts`(프리뷰 상태를 `ExtractedArtifact` 모양으로 어댑터, `renderedHtml` 기반 크로스 포맷 라우팅 포함), `src/lib/claude/artifact-export.ts`(`availableExports()` 확장 + `exportWithRenderedHtml()` + `printPdfDirect()` 추가), `src/components/panels/preview/preview-download-menu.tsx`(헤더 드롭다운 + PDF 다이얼로그 연동 + `renderedHtml` 소비), `src/components/panels/preview/pdf-export-dialog.tsx`(PDF 내보내기 설정 다이얼로그), `src/stores/use-preview-store.ts`(`renderedHtml` 캐시 상태 추가), `src/components/panels/preview/{docx,xlsx,pptx,image}-preview.tsx`(렌더링된 HTML을 스토어에 게시).

### FR-614: 프리뷰 소스/렌더 뷰 토글 (v0.5)

- 텍스트 기반 포맷의 파일 프리뷰(`html`, `markdown`, `slides`)는 **렌더 뷰**와 **소스 뷰**를 자연스럽게 전환할 수 있어야 한다. 바이너리/렌더 전용 타입(`pdf`, `image`, `docx`, `xlsx`, `pptx`)은 토글 대상이 아니다.
- 프리뷰 패널 헤더에 `Code` / `Eye` 아이콘의 토글 버튼을 두어(`PreviewDownloadMenu` 왼쪽), 현재 상태의 **반대쪽으로 전환**하는 의미 체계를 `live-html-preview.tsx`와 동일하게 유지한다. `aria-label`/`title`은 목표 상태를 가리킨다(`Show source` / `Show rendered`).
- 토글 상태는 `usePreviewStore.viewMode: 'rendered' | 'source'` 필드로 관리하며 기본값은 `'rendered'`이다. `setFile` 호출 시 `viewMode`는 자동으로 `'rendered'`로 리셋되어 다른 파일을 열 때 소스 뷰가 의도치 않게 고착되지 않는다.
- 소스 뷰는 `highlight.js` 기반 구문 강조(`<pre><code class="hljs language-xml|markdown">`)로 렌더하며, 라이트/다크 테마 모두에서 가독성을 유지하기 위해 `highlight.js/styles/github-dark.css`를 전역 레이아웃에서 로드한다. 컨테이너는 FR-612 규칙(`bg-muted` 외곽 + `ring-1 ring-border/70 shadow-sm`)을 그대로 따른다.
- HTML 스트리밍 라이브 프리뷰(`FR-610`)는 **기존 내부 토글을 유지**하며, 헤더 토글 버튼은 `showLive === true`(= `autoSwitch && liveMode !== 'idle'`)일 때 숨겨진다. 두 경로는 상호 배타적으로 동작한다.
- 구현: `src/stores/use-preview-store.ts`(`viewMode`, `setViewMode`, `toggleViewMode`, `isSourceToggleable` 헬퍼), `src/components/panels/preview/preview-panel.tsx`(헤더 토글 버튼), `src/components/panels/preview/preview-router.tsx`(소스 뷰 분기), `src/components/panels/preview/source-preview.tsx`(신규 구문 강조 뷰어), `src/app/layout.tsx`(하이라이트 테마 CSS).

### FR-615: 프리뷰 TTS (Text-to-Speech) 읽기 (v0.6)

- 텍스트 기반 프리뷰(`html`, `markdown`, `slides`)는 브라우저 내장 Web Speech API(`window.speechSynthesis`)를 사용하여 콘텐츠를 **소리내어 읽어주는** 기능을 제공해야 한다.
- 프리뷰 패널 헤더에 `Volume2` / `VolumeX` 아이콘의 토글 버튼을 두어 재생/정지를 전환한다. 재생 중에는 `bg-accent`로 강조한다.
- 토글 버튼은 다음 조건에서만 표시한다:
  - 프리뷰 타입이 `html`, `markdown`, `slides` 중 하나
  - 라이브 프리뷰 모드가 아닐 때 (`showLive === false`)
  - 브라우저가 `speechSynthesis`를 지원할 때
- 텍스트 추출 로직:
  - **Markdown**: 원본 마크다운 텍스트를 그대로 사용
  - **HTML**: `DOMParser`로 파싱 후 `body.textContent` 추출
  - **Slides**: HTML `<section>` 요소를 파싱하여 `selectedSlideIndex`에 해당하는 슬라이드의 텍스트만 추출. 인덱스가 없으면 전체 슬라이드를 `.` 구분자로 연결
- 파일이 변경되면 진행 중인 TTS를 자동으로 정지한다.
- Chrome/Chromium의 15초 자동 일시정지 버그에 대응하여 10초 간격으로 `pause()`→`resume()`을 호출하는 keep-alive 로직을 포함한다.
- 컴포넌트 언마운트 시 `speechSynthesis.cancel()`로 정리한다.
- 시스템 기본 음성을 사용하며 별도의 음성 선택 UI는 제공하지 않는다.
- 구현: `src/hooks/use-speech-synthesis.ts`(Web Speech API 래퍼 훅), `src/lib/preview/extract-preview-text.ts`(텍스트 추출 유틸리티), `src/components/panels/preview/preview-panel.tsx`(헤더 TTS 버튼).

### FR-616: 프리뷰 직접 편집 모드 (v0.7)

- 텍스트 기반 프리뷰(`html`, `markdown`)는 **분할 뷰 편집 모드**를 제공해야 한다. 슬라이드(`slides`)는 기존 FR-703 편집 모드를 유지한다.
- 프리뷰 패널 헤더에 `Pencil` 아이콘의 편집 토글 버튼을 두며, `html` 또는 `markdown` 타입이고 `viewMode === 'rendered'`일 때만 표시한다. 활성 시 `bg-accent`로 강조한다.
- 편집 모드 상태는 `usePreviewStore.editMode`로 관리하며, `setFile` 호출 시 자동으로 `false`로 리셋된다.
- 편집 모드 진입 시 다음 분할 뷰를 제공한다:
  - **좌측 (flex-1)**: `<textarea>` 기반 코드 편집 영역. monospace 폰트, Tab 키 공백 삽입 지원.
  - **우측 (w-2/5)**: 실시간 프리뷰. HTML은 `iframe srcdoc`(300ms 디바운스), Markdown은 `react-markdown`(300ms 디바운스)으로 렌더.
- **자동 저장**: 마지막 키 입력 후 1초 디바운스로 자동 저장한다. 에디터 탭이 열려 있으면 `updateTabContent`로 동기화하고, `filesApi.write()`로 디스크에 기록한다.
- 편집 모드 헤더 레이블은 `"{type} · edit"`으로 표시한다.
- 구현: `src/stores/use-preview-store.ts`(`editMode`, `setEditMode`, `toggleEditMode`), `src/components/panels/preview/html-editor.tsx`(HTML 분할 편집기), `src/components/panels/preview/markdown-editor.tsx`(Markdown 분할 편집기), `src/components/panels/preview/preview-router.tsx`(편집 모드 라우팅), `src/components/panels/preview/preview-panel.tsx`(헤더 편집 버튼).

---

## 3.7 프레젠테이션 기능 (FR-700)

### FR-701: reveal.js 슬라이드 렌더링 (멀티페이지 세로 스크롤)

- HTML 기반 슬라이드 렌더링 시 모든 `<section>` 요소를 파싱하여 **세로 스크롤** 형태로 페이지를 구분하여 표시해야 한다. 단일 페이지(reveal.js 기본 뷰)가 아닌 전체 슬라이드 목록을 한눈에 볼 수 있는 카드 레이아웃을 제공한다.
- 각 슬라이드 카드는 reveal.js CSS를 적용한 축소 프리뷰(iframe `srcDoc`)로 렌더하며, 좌측 상단에 슬라이드 번호 배지를 표시한다.
- 슬라이드 목록 상단에 전체 슬라이드 수와 현재 선택된 슬라이드 번호를 표시한다.
- 데이터 모델: `[{ id, html, css, notes, transition, background }]` JSON 배열

### FR-702: 슬라이드 선택 및 네비게이션

- 각 슬라이드 카드는 **클릭으로 선택** 가능해야 한다. 선택된 슬라이드는 `border-primary` 강조 테두리와 `shadow-lg` 그림자로 시각적으로 구분한다.
- 선택 상태는 `usePreviewStore.selectedSlideIndex`(0-based)로 관리하며, 파일 변경 시(`setFile`) 자동으로 0으로 리셋된다.
- 슬라이드 수가 변경되면(`<section>` 파싱 결과) 선택 인덱스가 범위를 초과하지 않도록 자동 클램핑한다.

### FR-703: 대화형 슬라이드 편집 (Edit 모드)

- 프리뷰 패널 헤더에 `Pencil` 아이콘의 Edit 토글 버튼을 제공하며, `slides` 타입이고 `viewMode === 'rendered'`일 때만 표시한다. 활성 시 `bg-accent`로 강조한다.
- Edit 모드 상태는 `usePreviewStore.slideEditMode`로 관리하며, `setFile` 호출 시 자동으로 `false`로 리셋된다.
- Edit 모드 진입 시 선택된 슬라이드에 대해 다음 UI를 제공한다:
  1. **프롬프트 입력**: 상단에 텍스트 입력 필드와 `Send` 버튼을 제공하여 자연어로 슬라이드 수정을 요청할 수 있다. `Enter`로 전송하며, 현재 슬라이드 HTML 컨텍스트를 포함하여 Claude에게 `sendQuery`로 전달한다.
     - 예: "제목을 더 크게 만들어줘"
     - 예: "배경색을 파란색으로 변경"
  2. **HTML 코드 편집기**: `<textarea>` 기반 코드 편집 영역에서 선택된 슬라이드의 `<section>` HTML을 직접 수정할 수 있다. `Cmd+S`/`Ctrl+S`로 저장한다.
  3. **실시간 프리뷰**: 편집 영역 우측에 현재 편집 중인 HTML의 라이브 프리뷰를 표시한다.
- 저장 시 수정된 `<section>` HTML을 원본 전체 HTML에 재조합(`reconstructHtml`)하여 에디터 탭과 디스크에 동기화한다.
- 구현: `src/components/panels/preview/slide-preview.tsx`(`SlideCard`, `SlideEditor` 컴포넌트), `src/stores/use-preview-store.ts`(`slideEditMode`, `selectedSlideIndex`), `src/components/panels/preview/preview-panel.tsx`(Edit 버튼), `src/components/panels/preview/preview-router.tsx`(`onContentChange` 콜백).

### FR-704: 실시간 DOM 패치

- 슬라이드 수정 시 iframe을 리로드하지 않는다.
- 부모 페이지에서 `postMessage`로 `<section>` innerHTML을 패치한 후 `Reveal.sync()`를 호출한다.
- `Reveal.slide(h, v, f)`로 특정 슬라이드로 이동한다.

### FR-705: 테마 및 트랜지션

- reveal.js 내장 12개 테마를 선택할 수 있어야 한다.
- 슬라이드별 트랜지션 효과(slide, fade, convex 등)를 설정할 수 있다.
- Auto-Animate 기능을 지원한다.

### FR-706: 스피커 노트

- 슬라이드별 스피커 노트를 작성/편집할 수 있어야 한다.
- 프레젠테이션 모드에서 스피커 뷰를 제공한다.

### FR-707: PPTX 내보내기

- `PptxGenJS`를 사용하여 `.pptx` 파일로 내보내기를 지원해야 한다.

### FR-708: PDF 내보내기

- DeckTape(Puppeteer 기반) 또는 reveal.js `?print-pdf` 쿼리를 활용하여 PDF로 내보내기를 지원해야 한다.

### FR-709: 에디터-프리뷰 양방향 동기화

- 에디터에서 특정 슬라이드 코드를 선택하면 프리뷰에서 해당 슬라이드로 이동한다.
- 프리뷰에서 슬라이드를 클릭하면 에디터에서 해당 코드로 스크롤한다.
- `data-index` 메타데이터를 활용한다.

---

## 3.8 커맨드 팔레트 및 단축키 (FR-800)

### FR-801: 커맨드 팔레트

- `Cmd+K` (macOS) / `Ctrl+Shift+P`로 커맨드 팔레트를 열 수 있어야 한다.
- `cmdk` 라이브러리를 사용하여 구현한다.
- 퍼지 검색(fuzzy search)을 지원한다.

### FR-802: 빠른 파일 열기

- `Cmd+P` / `Ctrl+P`로 파일명 검색 및 열기를 지원해야 한다.
- 파일 인덱스는 `useFileIndexStore` Zustand 스토어에 캐시되며, 커맨드 팔레트를 처음 열 때 빌드된다. 이후 `/ws/files` WebSocket 이벤트(add/unlink)를 통해 증분 업데이트된다.

### FR-802a: 전역 파일 내용 검색

- `Cmd+Shift+F` / `Ctrl+Shift+F`로 전체 프로젝트의 파일 내용 검색을 지원해야 한다.
- 서버 측에서 `ripgrep`(사용 불가 시 `grep` 폴백)을 사용하여 검색한다(`GET /api/files/search`).
- 검색 결과는 최대 200개로 제한하며, 파일별로 그룹화하여 표시한다.
- 대소문자 구분 토글 및 glob 파일 필터를 지원한다.
- 결과를 클릭하면 해당 파일의 해당 라인으로 에디터를 연다.
- 구현: `src/app/api/files/search/route.ts`, `src/stores/use-search-store.ts`, `src/components/panels/search/search-panel.tsx`, `src/components/layout/search-overlay.tsx`

### FR-803: 사이드바 토글

- `Cmd+B` / `Ctrl+B`로 파일 탐색기 패널을 토글할 수 있어야 한다.

### FR-804: 외부 터미널 열기

- `Cmd+Shift+O` / `Ctrl+Shift+O` 또는 헤더 우측 상단 `ExternalLink` 아이콘 버튼으로 OS 기본 터미널 앱을 현재 프로젝트 루트에서 연다.
- 내장 터미널 패널은 기본 레이아웃에서 제외되었으므로 `Cmd+J` 토글은 더 이상 제공하지 않는다.

### FR-804-1: 에디터 토글

- `Ctrl+Cmd+E` / `Ctrl+Alt+E`로 에디터 패널을 토글할 수 있어야 한다.

### FR-804-2: Claude 채팅 토글

- `Ctrl+Cmd+K` / `Ctrl+Alt+K`로 Claude 채팅 패널을 토글할 수 있어야 한다.

### FR-804-3: 프리뷰 토글

- `Ctrl+Cmd+P` / `Ctrl+Alt+P`로 프리뷰 패널을 토글할 수 있어야 한다.

### FR-805: 키보드 단축키 커스터마이징

- 사용자가 키보드 단축키를 재설정할 수 있는 설정 화면을 제공해야 한다.

### FR-806: 터미널 키보드 단축키

다음 단축키는 **터미널 패널이 포커스인 경우에만** 활성화된다(단, `Cmd+Shift+Enter`는 에디터 포커스일 때 동작). 포커스 스코프는 `src/hooks/use-keyboard-shortcut.ts`의 `isFocusInsideTerminal()`로 판정하며, `data-terminal-panel="true"` 속성을 가진 조상 노드의 존재를 확인한다.

| Key (macOS / 기타) | 동작 |
|---|---|
| `Cmd+T` / `Ctrl+T` | 새 터미널 탭 |
| `Cmd+W` / `Ctrl+W` | 활성 탭 닫기 |
| `Cmd+1..9` / `Ctrl+1..9` | N번 탭 활성화 |
| `Ctrl+Tab` | 다음 탭 |
| `Ctrl+Shift+Tab` | 이전 탭 |
| `Cmd+F` / `Ctrl+F` | 검색 오버레이 토글 (`FR-405`) |
| `Cmd+K` / `Ctrl+K` | 활성 터미널 버퍼 clear (`term.clear()`) |
| `Cmd+Shift+R` / `Ctrl+Shift+R` | 활성 세션 Restart (`FR-408`/`FR-411`/`FR-414`) |
| `Cmd+D` / `Ctrl+D` | 터미널 스플릿 토글 (`FR-418`) |
| `Cmd+]` / `Ctrl+]` · `Cmd+[` / `Ctrl+[` | 스플릿 모드에서 활성 pane 전환 |
| `Cmd+Shift+O` / `Ctrl+Shift+O` | OS 기본 터미널 앱에서 현재 탭 cwd 열기 (`FR-420`) — 전역 동작 |
| `Cmd+Shift+Enter` / `Ctrl+Shift+Enter` | **에디터 선택 영역(또는 현재 라인)을 활성 터미널에 실행** (포커스는 에디터에 유지) |

**구현 세부**:

- `TerminalManager`는 부팅 시 `attachCustomKeyEventHandler`로 위 조합을 veto하여 xterm이 PTY에 해당 키를 기록하지 않게 한다.
- 글로벌 단축키 핸들러(`src/hooks/use-global-shortcuts.ts`)가 동일한 조합을 감지해 `useTerminalStore` 액션을 디스패치한다.
- `Cmd+K` 충돌 중재: 터미널 포커스 시 Command Palette(`FR-801`)의 `Cmd+K` 핸들러는 no-op 처리되며, 터미널 버퍼 clear가 동작한다. 그 외 포커스에서는 기존대로 커맨드 팔레트가 열린다.

### FR-807: 패널별 확대/축소

각 패널(파일 탐색기, 에디터, 터미널, Claude 채팅, 프리뷰)은 **독립적으로** 확대/축소할 수 있어야 한다.

- **상태**: `useLayoutStore.panelZoom` — 패널별 줌 배율 (`Record<PanelId, number>`), 기본값 `1.0`, 범위 `0.5 – 2.0`, 단계 `0.1`.
- **포커스 추적**: `useLayoutStore.focusedPanel`로 현재 포커스된 패널을 추적한다. 패널 영역 클릭 또는 포커스 시 자동 설정된다.
- **UI 컨트롤**: 각 패널 헤더에 `+` / `−` 버튼 및 현재 줌 퍼센트(예: `100%`)를 표시한다. 퍼센트 클릭 시 `100%`로 리셋한��.
- **키보드 단축키**:

| Key (macOS / 기타) | 동작 |
|---|---|
| `Cmd+Shift+=` / `Ctrl+Shift+=` | 포커스된 패널 확대 (+10%) |
| `Cmd+Shift+-` / `Ctrl+Shift+-` | 포커스된 패널 축소 (-10%) |
| `Cmd+Shift+0` / `Ctrl+Shift+0` | 포커스된 패널 줌 리셋 (100%) |

- **적용 방식**:
  - 에디터: `fontSize × zoom` 배율로 Monaco Editor `fontSize` 옵션에 적용
  - 터미널: `fontSize × zoom` 배율로 xterm `fontSize` 옵션에 적용
  - 파일 탐색기 / Claude 채팅 / 프리뷰: CSS `zoom` 속성을 콘텐츠 영역에 적용
- **영속성**: `panelZoom`은 `localStorage`에 저장된다. `focusedPanel`은 세션 간 영속화하지 않는다.

---

## 3.9 파일 시스템 API (FR-900)

### FR-901: 디렉토리 목록 조회

- REST API `GET /api/files?path=<dir>`를 통해 디렉토리 내용을 조회해야 한다.
- 응답: 파일/폴더 목록 (이름, 타입, 크기, 수정일시)

### FR-902: 파일 읽기/쓰기

- `GET /api/files/read?path=<file>` — 파일 내용 조회
- `POST /api/files/write` — 파일 내용 저장
- 인코딩: UTF-8 기본, 바이너리 파일은 Base64

### FR-903: 파일/폴더 생성 및 삭제

- `POST /api/files/mkdir` — 디렉토리 생성
- `DELETE /api/files?path=<path>` — 파일 또는 빈 폴더 삭제

### FR-904: 파일 이름변경/이동

- `POST /api/files/rename` — `{ oldPath, newPath }` 형태로 이름변경 또는 이동

### FR-905: 파일 메타데이터 조회

- `GET /api/files/stat?path=<file>` — 파일 크기, 수정 시간, 타입(파일/디렉토리) 조회

### FR-905b: 바이너리 파일 스트리밍

- `GET /api/files/raw?path=<file>` — 이미지, PDF 등 바이너리 파일을 Content-Type과 함께 스트리밍
- 확장자 기반 MIME 자동 감지
- 50MB 초과 시 413 반환

### FR-906: 경로 순회 공격 방지

- 모든 경로 파라미터에 대해 `path.resolve()` 기반 바운드 체크를 수행해야 한다.
- 프로젝트 루트 디렉토리 외부 접근을 차단한다.
- dotfile (`.env`, `.git`, `.claude`) 접근을 기본 차단한다.
- 심볼릭 링크를 `fs.lstat()`로 검증한 후에만 따라간다.

### FR-907: 실시간 파일 변경 감지

- `@parcel/watcher` v2를 사용하여 프로젝트 디렉토리의 파일 변경을 감지해야 한다. 네이티브 FSEvents(macOS) / inotify(Linux) / ReadDirectoryChangesW(Windows) 위에서 동작하며, 루트당 OS 핸들 1개만 소비한다 (ADR-024).
- 변경 이벤트를 WebSocket `/ws/files` 채널로 브로드캐스트한다.
- 네이티브 감시기가 방출하는 `create`/`update`/`delete` 이벤트를 `add`/`change`/`unlink`로 정규화하고, 추가로 `ready`(구독 완료) 및 `error`(감시기 오류)를 전송한다.
- `node_modules`, `.next`, `.git`, `.claude`, `dist`, `build`, `out`, `coverage`, `test-results`, `playwright-report`, `.turbo`, `.cache`, `.claude-worktrees` 등의 서브트리는 감시 대상에서 제외한다 (ignore 글롭 + JS dotfile 필터). `.claude-project`는 사용자 설정이므로 예외적으로 감시 대상에 남긴다.

### FR-908: 런타임 프로젝트 핫스왑 (v0.3)

- 시스템은 실행 중에 프로젝트 루트를 교체할 수 있어야 한다 (서버 재시작 없이).
- `GET /api/project`는 현재 루트(미설정 시 `null`) + 최근 목록을 반환한다.
- `POST /api/project` (`{ path }`)는 다음 검증을 통과한 경우 루트를 교체한다:
  - 절대 경로 (상대 경로는 `4400` 거부)
  - 존재하는 디렉토리 (`4404` / `4400`)
  - 읽기 권한 (`4403`)
  - **파일시스템 루트(`/`, Windows 드라이브 루트)는 거부(`4403`)**. `$HOME` 금지 조항은 삭제되었다 — 사용자는 탐색기의 Up 버튼/브레드크럼/"Open as project root" 컨텍스트 메뉴(`FR-209`)를 통해 `~` 및 그 상위의 임의 디렉토리로 루트를 이동할 수 있다. dotfile 접근 차단은 `resolveSafe`의 deny 리스트에서 계속 적용된다.
- **부트스트랩 루트 해석 순서**: (1) `PROJECT_ROOT` 환경변수, (2) `~/.claudegui/state.json`의 `lastRoot`, (3) **폴백 없음** — 세 단계 모두 실패하면 `getActiveRoot()`는 `null`을 반환한다. 이전 버전의 `process.cwd()` 사일런트 폴백은 삭제되었다. 이유: 서버 실행 위치가 조용히 프로젝트 루트가 되어 Claude가 엉뚱한 경로에 파일을 생성하는 문제를 방지하기 위함이다.
- **활성 루트 없을 때의 동작**:
  - 클라이언트는 부팅 시 `useProjectStore.refresh()`가 완료된 후 `activeRoot === null`이면 **프로젝트 선택 모달을 강제로 연다**(`AppShell`의 `useEffect`로 구현).
  - Claude WS 핸들러는 `runQuery` 호출 시 `getActiveRoot()`가 `null`이면 즉시 `{ code: 4412, message: "No project is open. Open a folder in the file explorer before running Claude queries." }` 에러를 클라이언트로 보내고 쿼리를 시작하지 않는다.
  - `resolveSafe`/`getProjectRoot()`는 `null` 상태에서 `SandboxError('No project is open', 4412)`를 던진다. 파일 API 라우트는 이를 HTTP `412 Precondition Failed`로 응답한다.
  - 파일 감시기(`@parcel/watcher`)는 루트가 `null`인 동안 대기(idle) 상태를 유지하며, 루트가 설정되는 시점에 `onActiveRootChange` 리스너가 실제 구독을 시작한다.
  - 터미널 신규 세션은 `null` 상태에서는 사용자 홈 디렉토리(`os.homedir()`)로 폴백해 동작을 유지한다(기존 세션 보존 정책과의 일관성을 위해).
- 교체 시:
  - `@parcel/watcher` 구독을 기존 루트에서 `unsubscribe()` 후 새 루트로 재구독
  - 모든 `/ws/files` 클라이언트에 `{ type: 'project-changed', root, timestamp }` 브로드캐스트
  - 새로 스폰되는 PTY 세션은 신규 루트를 `cwd`로 사용 (기존 세션은 유지)
  - Claude 쿼리도 신규 루트를 `cwd`로 사용
- 클라이언트는 `project-changed` 수신 시 에디터 탭, 프리뷰 선택을 리셋하고 파일 트리를 재로드한다.
- 상태는 `~/.claudegui/state.json`에 `{ lastRoot, recents }` 형식으로 영속화한다. 활성 루트가 `null`인 동안은 `state.json`에 쓰지 않는다.
- 구현: `src/lib/project/project-context.mjs`, `src/app/api/project/route.ts`, `src/stores/use-project-store.ts`, `src/components/modals/project-picker-modal.tsx`, `src/components/layout/app-shell.tsx`, `server-handlers/claude-handler.mjs`, `src/lib/fs/resolve-safe.ts`, `server-handlers/files-handler.mjs`.

---

## 3.10 생성 콘텐츠 갤러리 (FR-1000)

### FR-1001: 자동 아티팩트 추출

- 시스템은 Claude 어시스턴트 메시지를 수신할 때마다 본문을 파싱하여 다음 종류의 "아티팩트(생성 콘텐츠)"를 자동으로 추출해야 한다.
  - 펜스 코드 블록: HTML, SVG, Markdown, TypeScript/JavaScript, Python, Go, Rust, Shell, CSS, JSON, YAML 등 모든 언어.
  - 펜스 밖에 단독으로 나타나는 `<!doctype html> … </html>` 전체 문서.
  - 펜스 밖에 단독으로 나타나는 `<svg …> … </svg>` 요소.
- 본문 텍스트 기반 아티팩트는 `{messageId}:{index}` 형식의 안정된 ID를 가져야 한다.
- Write/Edit 도구 호출로 수집된 아티팩트는 `file:{absolutePath}` 형식의 경로 기반 ID를 사용해 같은 파일에 대한 반복 Write/Edit이 단일 항목으로 합쳐진다(FR-1008 참조).
- 메시지 재로드 시(세션 복원) 기존 ID가 그대로 사용되어 중복이 쌓이지 않는다.
- 24자 미만의 지나치게 짧은 텍스트 블록은 노이즈로 간주해 제외한다.
- 아티팩트 종류는 다음과 같이 확장된다: `html`, `svg`, `markdown`, `code`, `text`, `image`, `pdf`, `docx`, `xlsx`, `pptx`. 바이너리 종류(`image`/`pdf`/`docx`/`xlsx`/`pptx`)는 `source = "file"`로 표시되며 본문은 저장하지 않고 절대 경로(`filePath`)만 보관한다.

### FR-1002: 자동 팝업 표시

- Claude 한 턴(응답)에서 하나 이상의 아티팩트가 새로 추출되면, 턴 종료(`result` 이벤트) **또는 에러(`error` 이벤트)** 시점에 생성 콘텐츠 갤러리 모달이 자동으로 열려야 한다. 에러 발생 시에도 이전에 수집된 아티팩트가 유실되지 않도록 `flushPendingOpen`을 호출한다.
- 사용자가 갤러리 설정에서 "Auto-open on new content"를 비활성화한 경우에는 열리지 않는다.
- 수동으로 갤러리를 열 때(`open()` 호출) 특정 `highlightedId`가 지정되지 않으면 가장 최근 아티팩트가 자동 선택되어 프리뷰 영역이 빈 상태로 표시되지 않는다.
- 세션 히스토리를 불러올 때 발생하는 아티팩트 추출은 "사일런트 추출"로 처리되며 자동 팝업을 발생시키지 않는다.

### FR-1003: 영속 저장 (localStorage)

- 추출된 아티팩트는 브라우저 `localStorage`에 보존되어야 하며, 새로고침 이후에도 동일 갤러리가 복원되어야 한다.
- 저장 키: `claudegui-artifacts` (zustand `persist` 미들웨어, `version: 4`). v2까지는 `artifacts`/`autoOpen`만 영속화했으며 v3부터는 FR-1005의 모달 크기(`modalSize`)도 함께 저장한다.
- **인메모리 상한은 200개**, **localStorage 영속 상한은 30개**로 제한한다. `partialize`에서 `artifacts.slice(-30)`으로 가장 최근 30건만 저장하여 localStorage 할당량을 보호한다. 인메모리에서는 세션 동안 최대 200개를 유지한다.
- `autoOpen` 설정 역시 동일 키에 영속화한다.
- 바이너리 아티팩트(`source: "file"`)는 콘텐츠를 base64로 인코딩하지 않고 절대 경로(`filePath`)와 메타데이터만 저장한다. localStorage 할당량을 보호하기 위함이다.
- 하이드레이션 후 `onRehydrateStorage` 훅이 `filePath`가 있는 아티팩트를 모아 `POST /api/artifacts/register`로 서버 측 레지스트리에 재등록하여 FR-1009의 교차 프로젝트 접근 경로를 복원한다.
- v1 → v2 마이그레이션: 기존 v1 레코드에 `source: "inline"`, `updatedAt: createdAt` 기본값을 채워 호환을 유지한다.
- v3 → v4 마이그레이션: 기존 200개 상한 데이터를 30개로 트림한다.

### FR-1004: 복사 및 내보내기

- 갤러리에서 각 아티팩트는 다음 두 가지 동작을 지원한다.
  - **Copy**: 인라인 아티팩트는 본문 텍스트를 클립보드에 복사하고, 파일 기반 아티팩트는 절대 경로(`filePath`)를 복사한다(`navigator.clipboard.writeText`).
  - **Export**: 드롭다운 메뉴로 아티팩트의 `kind`와 `source`에 따라 다음 형식 중 적용 가능한 것들을 제공한다.
    - **Source**: 언어별 확장자(`.ts`, `.py`, `.html`, `.svg`, `.md` 등)로 다운로드 (인라인 텍스트 아티팩트).
    - **HTML (.html)**: Markdown/코드/SVG 아티팩트를 독립 실행형 `<!doctype html>` 문서로 다운로드.
    - **PDF**: 비가시 `<iframe>`을 현재 문서에 주입해 독립 실행형 HTML을 `srcdoc`로 로드한 뒤, 모든 `<img>`의 `decode()` 대기와 2프레임의 `requestAnimationFrame`을 거쳐 `contentWindow.print()`를 호출한다. `afterprint` 이벤트와 60초 안전 타이머로 iframe을 정리하고, 생성된 HTML에는 `@page { size: A4; margin: 15mm }`와 `@media print` 규칙(`page-break-inside: avoid`, 색상 보존)이 포함된다. 1.5MB를 초과하는 콘텐츠는 `srcdoc` 대신 blob URL로 폴백한다. 이전 팝업 창 기반 구현은 팝업 차단·렌더링 타이밍·인쇄 CSS 누락 문제로 인해 대체되었다.
    - **Word (.doc)**: MS Word 호환 HTML을 `application/msword`로 다운로드한다(Word/Pages에서 열람 가능).
    - **SVG → PNG**: `<canvas>` 래스터화를 통해 PNG로 저장.
    - **Plain text (.txt)**: 일반 코드·텍스트 아티팩트용 plain text 저장.
    - **Original (.docx/.xlsx/.pptx/.pdf/image)**: 파일 기반 바이너리 아티팩트 전용. `GET /api/artifacts/raw?path=…`를 우선 호출하고 실패 시 `GET /api/files/raw`로 폴백하여 원본 파일을 그대로 다운로드한다.
- Export 메뉴는 `availableExports(artifact)` 함수가 아티팩트 `kind`와 `source`에 따라 동적으로 생성한다.

### FR-1005: 갤러리 UI

- 갤러리 모달은 좌측 목록 + 우측 상세 프리뷰 레이아웃으로 구성된다.
- **검색 및 필터**: 사이드바 상단에 검색 입력창과 종류별(All/HTML/SVG/Code/…) 필터 칩을 제공한다. 검색은 제목, 언어, 파일 경로를 대상으로 대소문자 무시 부분 일치를 수행한다. 필터 칩은 현재 아티팩트에 존재하는 종류만 동적으로 표시된다.
- 각 목록 항목은 종류 배지(HTML/SVG/Markdown/Code/Text/Image/PDF/DOCX/XLSX/PPTX), 제목(파일 기반이면 파일명), 언어/확장자, 상대 시각을 표시한다. 파일 기반 아티팩트는 추가로 파일 경로 마지막 2세그먼트를 표시한다.
- 각 목록 항목은 호버 시 드러나는 개별 삭제(Trash) 버튼을 포함한다. 버튼 클릭 시 해당 아티팩트만 `useArtifactStore.remove(id)`로 제거되며, 현재 선택된 항목이 삭제되면 기존 자동 재선택 이펙트가 다음 항목을 선택한다. 행의 기본 클릭 동작(선택)과 분리되도록 삭제 버튼은 클릭 이벤트 전파를 중단한다. 접근성을 위해 행은 `role="button"` + `tabIndex=0` + Enter/Space 키보드 선택을 지원하고, 내부 삭제 버튼은 `aria-label="Delete {title}"`을 노출한다.
- 상세 영역은 **Preview / Source** 토글을 제공한다. 기본값은 Preview이며, 아티팩트 종류별 렌더링은 다음과 같다.
  - **HTML**: `<iframe sandbox="allow-scripts">` + `srcDoc` (allow-same-origin은 금지; 프리뷰 패널과 동일한 정책).
  - **SVG**: `data:image/svg+xml;charset=utf-8,…` URI를 `<img>`로 렌더링하여 내장 스크립트·이벤트 핸들러가 실행되지 않도록 한다.
  - **Markdown**: 기존 `MarkdownPreview` 컴포넌트(`react-markdown` + `remark-gfm` + `rehype-sanitize`)를 재사용한다.
  - **Image**: 인라인 SVG는 data URI로, 파일 기반 이미지는 `GET /api/artifacts/raw?path=…`를 `<img>` 소스로 사용해 렌더링한다.
  - **PDF**: 기존 `PdfPreview` 컴포넌트에 `srcOverride` 프롭으로 `/api/artifacts/raw` URL을 전달해 재사용한다.
  - **DOCX**: `DocxPreview`가 `mammoth/mammoth.browser`로 HTML을 변환한 뒤 `sandbox=""`(스크립트 완전 차단) iframe에 주입한다.
  - **XLSX/XLSM**: `XlsxPreview`가 SheetJS(`xlsx`)로 각 시트를 `sheet_to_html`로 변환하고 탭 UI로 전환한다.
  - **PPTX**: `PptxPreview`가 JSZip으로 OOXML을 해제한 뒤 각 `ppt/slides/slideN.xml`의 `<a:t>` 텍스트 프레임을 제목/본문으로 추출하고, 관련 `_rels`에서 참조된 이미지를 `URL.createObjectURL`로 렌더링한다(근사치 미리보기).
  - **Code/Text**: Preview를 제공하지 않고 Source 모드로 고정된다.
  - **파일 기반 바이너리이지만 현재 프로젝트가 원본 프로젝트가 아니고 레지스트리 재등록에 실패한 경우**: 파일명·경로·안내문과 Export 단일 버튼만 보여주는 fallback 카드로 표시한다.
- Copy, Export, Delete 버튼과 상단 툴바의 `Auto-open on new content` 체크박스, `Clear all` 버튼을 제공한다.
- **모달 크기 조정**: 모달은 우측 하단 드래그 핸들로 사용자가 자유롭게 크기를 조정할 수 있다. 최소 크기는 640×480px, 최대 크기는 뷰포트에서 20px를 뺀 값으로 클램프된다. 변경된 크기는 `useArtifactStore.setModalSize`를 통해 `claudegui-artifacts` 스토어(`version: 3`)에 영속화되어 재로그인·재부팅 후에도 유지된다. Radix Dialog가 `translate(-50%, -50%)`로 중앙 정렬하므로 드래그 델타에 2배를 곱해 커서와 1:1로 추적한다. 기본 크기는 `min(1024px, 90vw) × min(720px, 80vh)`이며, 창 크기가 저장된 크기보다 작아지면 자동으로 재클램프된다.
- 접근성: 모달은 Radix Dialog 기반이며 ESC로 닫힌다.

### FR-1006: 진입점, 배지 및 단축키

- Claude 채팅 패널 헤더에 `FileStack` 아이콘 버튼을 두어 갤러리를 수동으로 열 수 있어야 한다.
- 아이콘 배지로 현재 저장된 아티팩트 수(최대 `99+`)를 표시한다.
- 글로벌 단축키 **`Cmd/Ctrl + Shift + A`**로 갤러리를 토글한다 (`src/hooks/use-global-shortcuts.ts`).

### FR-1008: Write/Edit 도구 호출 기반 아티팩트 수집

- 시스템은 Claude가 내보낸 `Write`/`Edit`/`MultiEdit` 도구 호출(tool_use 블록)을 감지해 펜스 코드 블록 추출과 별개로 자동으로 아티팩트를 갱신해야 한다. 이는 Claude가 본문 텍스트에 출력하지 않고 파일로 직접 쓴 마지막 슬라이드가 "Generated Content"에서 누락되던 문제를 해결하기 위함이다.
- 처리 규칙
  - **Write**: `file_path`의 확장자를 기준으로 종류(FR-1001 목록)를 분류한다.
    - 텍스트 기반(html/svg/markdown/code/text): `input.content`를 그대로 `content` 필드에 스냅샷으로 저장하고 `source = "inline"`으로 표시한다.
    - 바이너리 기반(image/pdf/docx/xlsx/pptx): 콘텐츠는 저장하지 않고 `source = "file"`, `filePath = input.file_path`만 보관한다.
  - **Edit/MultiEdit**: 동일 `filePath`에 대응하는 기존 아티팩트를 찾아 `edits[]`의 `old_string → new_string` 패치를 `artifactFromEdit`이 적용한 뒤 `updatedAt`을 갱신한다. 기존 아티팩트가 없으면 `null`을 반환해 아무 변경도 하지 않는다.
  - 동일 `file:{absolutePath}` ID를 사용하므로 `dedupe()`가 이전 레코드의 `createdAt`을 유지하면서 최신 `content`/`updatedAt`으로 덮어쓴다.
- 저장소 동작
  - `useArtifactStore.ingestToolUse(messageId, sessionId, tool, { silent? })`가 진입점이다. `use-claude-store`의 assistant 이벤트 핸들러가 `extractor.feedToolUse(tool)` 호출 직후 루프를 돌려 호출한다.
  - 비-silent 호출은 `pendingTurn`에 ID를 추가해 `result` 이벤트 시 FR-1002의 자동 팝업 플로우와 동일하게 처리된다.
  - 성공 시 `filePath`를 `POST /api/artifacts/register`로 서버 레지스트리에 등록한다(FR-1009).
- 구현: `src/lib/claude/artifact-from-tool.ts`, `src/lib/claude/artifact-extractor.ts`의 `classifyByPath`/`isBinaryKind`/`titleFromPath`, `src/stores/use-artifact-store.ts`의 `ingestToolUse`/`findByFilePath`.

### FR-1009: 교차 프로젝트 바이너리 접근 및 오피스 뷰어

- 시스템은 현재 활성 프로젝트가 변경된 이후에도 같은 Claude 세션에서 생성된 이미지/PDF/Word/Excel/PowerPoint 아티팩트를 프리뷰·내보내기할 수 있어야 한다.
- 서버 측 아티팩트 레지스트리
  - `src/lib/claude/artifact-registry.ts`에 최대 1024개 경로를 유지하는 인-프로세스 Map(초과 시 가장 오래된 항목 축출). 등록된 항목은 24시간 TTL이 적용되며, 만료된 항목은 신규 등록 시 lazy eviction 및 조회 시 자동 제거된다.
  - `POST /api/artifacts/register` — `{ paths: string[] }`를 받아 절대 경로 여부와 `fs.stat()`을 검증하고 50MB(`MAX_BINARY_SIZE`) 상한을 지킨 파일만 레지스트리에 추가한다. 기존 파일 API와 동일한 레이트 리미터(`rateLimit`/`clientKey`)를 통과해야 한다.
  - `GET /api/artifacts/raw?path=<abs>` — 레지스트리에 등록된 경로에 한해서만 바이트를 스트리밍한다. `resolveSafe` 프로젝트 샌드박스는 우회하지만, 레지스트리에 있는 경로만 읽으므로 현재 세션에서 캡처한 파일로 범위가 제한된다. Content-Type은 `docx`/`xlsx`/`xlsm`/`pptx`/이미지·PDF 등을 포함한 MIME 테이블로 산정한다.
- 클라이언트 측 동작
  - `useArtifactStore.ingestToolUse`는 새 바이너리 아티팩트가 생길 때마다 해당 `filePath`를 `registerArtifactPaths`로 등록한다.
  - `onRehydrateStorage`는 `localStorage`에서 복원한 모든 파일 기반 아티팩트 경로를 한 번에 재등록한다(서버 재시작 대응).
  - `src/lib/claude/artifact-url.ts`의 `fetchArtifactBytes(filePath)`는 `/api/artifacts/raw`를 먼저 시도하고 실패 시 `/api/files/raw`로 폴백한다. Docx/Xlsx/Pptx 변환기 모두 이 헬퍼로 바이트를 받는다.
  - Export 다운로드 경로(`artifact-export.ts`의 `downloadBinaryFile`)도 동일한 순서로 시도한다.
- 뷰어 종속성 (오피스 파일 미리보기)
  - `mammoth` — DOCX → HTML 변환. 동적 import로 최초 DOCX 열람 시에만 번들링된다.
  - `xlsx` (SheetJS) — XLSX → HTML 테이블. 동적 import.
  - `jszip` — PPTX 해제 및 OOXML 접근. 동적 import.
- 보안 제약
  - 레지스트리는 메모리에 저장되며 서버 재시작 시 비워진다(하이드레이션 경로에서 재등록).
  - 레지스트리 등록 경로라도 파일이 현재 존재하지 않거나 50MB를 넘으면 `/api/artifacts/raw`가 각각 `404`/`413`을 반환한다.
  - `resolveSafe`의 denied-segment 목록(`.env`, `.git`, `.claude`, 자격 증명 등)은 Claude가 직접 Write하지 않는 한 레지스트리에 들어갈 일이 없으므로 본 경로에서는 별도 재검사를 수행하지 않는다.
- 구현: `src/app/api/artifacts/register/route.ts`, `src/app/api/artifacts/raw/route.ts`, `src/lib/claude/artifact-registry.ts`, `src/lib/claude/artifact-url.ts`, `src/components/panels/preview/docx-preview.tsx`, `src/components/panels/preview/xlsx-preview.tsx`, `src/components/panels/preview/pptx-preview.tsx`, `src/components/panels/preview/pdf-preview.tsx`(`srcOverride` 프롭).

### FR-1007: 구현

- `src/lib/claude/artifact-extractor.ts` — 정규식 기반 추출기 + `classifyByPath`/`isBinaryKind`/`titleFromPath`.
- `src/lib/claude/artifact-from-tool.ts` — Write/Edit/MultiEdit 도구 호출로부터 아티팩트 레코드 생성·갱신.
- `src/lib/claude/artifact-export.ts` — 인라인 텍스트 복사/다운로드, PDF 인쇄, Word, PNG, 파일 기반 Original 다운로드 헬퍼.
- `src/lib/claude/artifact-registry.ts` — 서버 측 인-프로세스 아티팩트 경로 레지스트리.
- `src/lib/claude/artifact-url.ts` — `/api/artifacts/raw` → `/api/files/raw` 폴백 fetch 헬퍼.
- `src/app/api/artifacts/register/route.ts`, `src/app/api/artifacts/raw/route.ts` — 아티팩트 레지스트리 REST 엔드포인트.
- `src/stores/use-artifact-store.ts` — zustand 스토어 (`persist` v2, `ingestToolUse`, `findByFilePath`, 하이드레이션 재등록).
- `src/components/modals/artifacts-modal.tsx` — 갤러리 다이얼로그 (Preview/Source 토글, 파일 기반 fallback 카드, 10종 종류 배지).
- `src/components/panels/preview/docx-preview.tsx` / `xlsx-preview.tsx` / `pptx-preview.tsx` — 오피스 파일 뷰어.
- `src/components/panels/preview/pdf-preview.tsx` — `srcOverride` 프롭으로 아티팩트 URL 지원.
- `src/stores/use-preview-store.ts` — `PreviewType`/`detectPreviewType` 확장 (docx/xlsx/pptx 포함).
- `src/components/panels/preview/preview-router.tsx` — 확장된 타입에 대한 라우팅.
- `src/components/panels/claude/claude-chat-panel.tsx` — 트리거 버튼 및 배지.
- `src/hooks/use-global-shortcuts.ts` — `Cmd/Ctrl + Shift + A` 토글 단축키.
- `src/stores/use-claude-store.ts` — assistant 이벤트에서 `ingestToolUse` 호출, 세션 로드 시 추출기 호출, `result` 시점에 자동 팝업 플러시.

---

## 3.11 설치 및 데스크톱 런처 (FR-1100)

### FR-1101: 원라인 인스톨러 — 데스크톱 바로가기 생성

- macOS / Linux의 `scripts/install/install.sh`와 Windows의 `scripts/install/install.ps1`은 빌드 단계 이후 사용자 데스크톱에 **ClaudeGUI 바로가기**를 자동 생성해야 한다.
- 인스톨러는 `--no-desktop-icon` (bash) 또는 `-NoDesktopIcon` (PowerShell)로 이 단계를 건너뛸 수 있어야 한다. 환경변수 `CLAUDEGUI_NO_DESKTOP_ICON=1`로도 동일하게 동작한다.
- 인스톨러는 `<repo>/public/branding/claudegui.svg|.ico|claudegui-{128,256,512}.png`를 사용자 아이콘 디렉토리로 복사해야 한다.
  - macOS / Linux: `~/.claudegui/icons/`
  - Windows: `%LOCALAPPDATA%\ClaudeGUI\icons\`
- 바로가기 생성 형태는 OS별로 다음과 같다.

| OS | 파일 | 더블클릭 동작 | 아이콘 처리 |
|----|------|-------------|----------|
| macOS | `~/Desktop/ClaudeGUI.app` (경량 `.app` 번들) | `open -a Terminal`로 launcher 스크립트를 실행하는 Terminal 창을 열어줌 | `Contents/Resources/AppIcon.icns`에 마스코트 아이콘 — favicon과 동일한 캐릭터 |
| Linux | `~/Desktop/ClaudeGUI.desktop` | `x-terminal-emulator` → `gnome-terminal` → `konsole` → `xterm` 폴백 체인에서 launcher 실행 | `Icon=` 필드에 절대경로 SVG 지정. GNOME 환경에서는 `gio set ... metadata::trusted true` 설정 |
| Windows | `%USERPROFILE%\Desktop\ClaudeGUI.lnk` | `WScript.Shell.CreateShortcut`로 생성된 PowerShell 콘솔 창 | `IconLocation`에 `claudegui.ico,0` 지정 |

- macOS `.app` 번들은 로컬에서 인스톨러가 직접 생성하므로 Gatekeeper 격리(quarantine) 속성이 붙지 않아 서명 없이도 즉시 실행 가능하다. 기존 `.command` 방식 대비 마스코트 아이콘이 Finder/Dock에 표시된다.

### FR-1102: 런처 스크립트 동작

- 런처 스크립트는 다음 위치에 설치된다.
  - macOS / Linux: `~/.claudegui/bin/claudegui-launcher.sh`
  - Windows: `%LOCALAPPDATA%\ClaudeGUI\bin\claudegui-launcher.ps1`
- 실행 시 다음 순서로 동작해야 한다.
  1. 콘솔 창 상단에 ClaudeGUI 배너(URL, 로그 파일 경로, 종료 안내)를 출력한다.
  2. `cd $INSTALL_DIR` 후 `NODE_ENV=production`, `PORT=${CLAUDEGUI_PORT:-${PORT:-3000}}`을 export한다.
  3. **백그라운드 잡(폴러)**을 분리해 0.5초 간격으로 최대 30초간 `http://localhost:$PORT`에 HEAD 요청을 보낸다.
  4. 폴러가 200/3xx 응답을 받으면 즉시 OS의 기본 브라우저로 해당 URL을 연다.
     - macOS: `open`
     - Linux: `xdg-open`
     - Windows: `Start-Process`
  5. **포어그라운드**에서 `node server.js`를 실행하고, 표준 출력 / 에러를 동시에 콘솔과 로그 파일에 기록한다(`tee` / `Tee-Object`).
  6. 사용자가 콘솔 창을 닫거나 `Ctrl+C`를 누르면 SIGHUP/SIGINT가 자식 프로세스로 전파되어 `node server.js`가 종료된다 (창 종료 = 서버 종료).
- 로그 파일 경로:
  - macOS / Linux: `~/.claudegui/logs/launcher.log` (append)
  - Windows: `%USERPROFILE%\.claudegui\logs\launcher.log` (append)

### FR-1103: 브랜드 아이콘 자산과 favicon 통합

- 단일 SVG 소스(`public/branding/claudegui.svg`)가 모든 아이콘 래스터의 source of truth이다.
- 빌드 스크립트(`scripts/build-icons.mjs`, macOS 전용)는 `qlmanage` + `sips`로 16/32/48/64/128/180/256/512 PNG를 생성하고, Vista+ 호환 PNG-in-ICO 형식으로 6개 사이즈를 묶은 `claudegui.ico`를 생성한다.
- `src/app/icon.svg`와 `src/app/apple-icon.png`(180×180)은 Next.js App Router 파일 기반 메타데이터로 자동 노출되며, 별도 `<link rel="icon">` 선언 없이 `localhost:3000` 접속 시 favicon으로 표시된다.
- Tauri 데스크톱 앱 아이콘도 동일한 SVG 소스에서 생성된다: `installer/tauri/src-tauri/icons/`에 `32x32.png`, `128x128.png`, `128x128@2x.png`(256×256), `icon.ico`, `icon.icns`(`iconutil`로 생성)를 출력한다.
- 데스크톱 바로가기, Tauri 네이티브 앱, 브라우저 favicon이 모두 **동일한 마스코트**를 사용해 시각적 일관성을 유지한다.
- 구현: `public/branding/claudegui.svg`, `scripts/build-icons.mjs`, `src/app/icon.svg`, `src/app/apple-icon.png`, `installer/tauri/src-tauri/icons/`, `scripts/install/install.sh`, `scripts/install/install.ps1`.

---

## 3.12 스마트 프롬프트 인텐트 감지 (FR-1200)

사용자의 채팅 입력에서 콘텐츠 생성 의도를 자동으로 감지하고, 최적화된 시스템 프롬프트를 주입하여 생성 품질을 높인다.

### FR-1201: 슬라이드 생성 의도 감지

- 사용자 입력에서 슬라이드/프레젠테이션 관련 키워드(슬라이드, 프레젠테이션, PPT, 발표자료, presentation, slides 등)를 감지한다.
- 감지는 클라이언트 측에서 수행하여 지연 없이 즉시 반응한다.
- 구현: `src/lib/claude/intent-detector.ts`.

### FR-1202: 슬라이드 설정 다이얼로그

- 슬라이드 의도가 감지되면 생성 전 확인 다이얼로그를 표시한다.
- 수집 항목:
  - **용도**: 사내 보고, 학회 발표, 수업 자료, 투자 제안, 기타(직접 입력)
  - **텍스트 크기**: 작게 / 보통 / 크게
  - **컬러톤**: Deep Navy, Corporate Blue, Warm, Minimal, Dark, Forest
  - **추가 요청**: 자유 텍스트 (선택)
- "기본 설정으로 생성" 버튼으로 기본값 적용 가능.
- 취소 시 원래 입력이 텍스트 영역에 복원된다.
- 구현: `src/components/panels/claude/slide-preferences-dialog.tsx`.

### FR-1203: 서버 측 프롬프트 주입

- 클라이언트는 WebSocket 메시지에 `intent` 메타데이터를 포함하여 전송한다.
- 서버는 `intent.type`에 따라 레지스트리에서 프롬프트 템플릿을 조회하고, 사용자 프롬프트 앞에 디자인 가이드라인을 주입한다.
- 주입된 시스템 프롬프트는 사용자 UI에 표시되지 않는다 (사용자는 원본 메시지만 확인).
- 슬라이드 템플릿에 포함되는 가이드라인:
  - 시각적 일관성 (컬러 팔레트, 폰트)
  - Z-pattern 레이아웃, 60/40 비주얼/텍스트 비율
  - 다양한 시각 요소 (아이콘, 차트, 다이어그램)
  - Action Title 스타일
- 구현: `server-handlers/prompt-templates/slides.mjs`, `server-handlers/prompt-templates/registry.mjs`.

### FR-1204: 인텐트 레지스트리 확장성

- 인텐트 레지스트리는 `{ type: () => import('./template.mjs') }` 패턴으로 구성된다.
- 새로운 콘텐츠 유형(보고서, 다이어그램 등)을 레지스트리에 엔트리만 추가하면 지원 가능하다.
- 구현: `server-handlers/prompt-templates/registry.mjs`, `src/types/intent.ts`.

---

## 3.13 원격 접근 (FR-1300)

서버의 바인딩 주소를 `127.0.0.1`(로컬 전용)에서 `0.0.0.0`(모든 인터페이스)으로 전환하여, 같은 네트워크의 다른 기기에서 ClaudeGUI에 접속할 수 있도록 한다.

### FR-1300: 원격 접근 토글

- 사용자는 헤더의 Globe 아이콘 버튼을 클릭하여 원격 접근 설정 모달을 열 수 있다.
- 모달에서 원격 접근 ON/OFF 토글 스위치를 제공한다.
- 원격 접근 활성화 시 서버 바인딩 주소가 `0.0.0.0`으로 변경된다.
- 비활성화 시 `127.0.0.1`로 복귀한다.
- 설정 변경 후 "적용 및 재시작" 버튼으로 서버를 in-process 재시작한다.

### FR-1301: 토큰 인증

- 원격 접근 활성화 시 UUID v4 토큰이 자동 생성된다.
- 원격 클라이언트는 `Authorization: Bearer <token>` 헤더 또는 `?token=<token>` URL 파라미터로 인증한다.
- localhost(`127.0.0.1`, `::1`) 요청은 토큰 검증이 면제된다.
- 토큰 복사 버튼과 재생성 버튼을 모달에서 제공한다.

### FR-1302: 서버 설정 영속화

- 설정은 `~/.claudegui/server-config.json`에 저장된다.
- 설정 스키마: `{ "remoteAccess": boolean, "remoteAccessToken": string|null }`.
- 서버 시작 시 설정 파일을 읽어 바인딩 주소와 토큰을 결정한다.
- `HOST` 환경변수가 명시된 경우 설정 파일보다 우선한다.

### FR-1303: 네트워크 정보 표시

- 원격 접근 모달에서 현재 LAN IP 목록을 표시한다 (`os.networkInterfaces()`).
- 상태바에 원격 접근 상태를 표시한다 (활성 시 "Remote (IP)" 텍스트).
- 헤더의 Globe 아이콘이 활성 상태일 때 녹색으로 표시된다.

### FR-1304: 서버 관리 API

- `GET /api/server/status` — 서버 상태(hostname, port, remoteAccess, hasToken, localIPs, uptime) 반환.
- `GET /api/server/config` — 현재 설정 반환.
- `PUT /api/server/config` — 설정 저장 (remoteAccess, remoteAccessToken).
- `POST /api/server/restart` — 서버 in-process 재시작 트리거.
- 모든 관리 API는 localhost에서만 접근 가능하다.

### FR-1305: Tauri 데스크탑 앱 통합

- Tauri 런처는 시작 시 `~/.claudegui/server-config.json`을 읽어 HOST 환경변수를 결정한다.
- Tauri IPC `restart_server` 커맨드로 sidecar 프로세스 재시작을 지원한다.
- 웹 UI에서 `isTauri()` 감지를 통해 적절한 재시작 경로를 선택한다.
- 구현: `installer/tauri/src-tauri/src/main.rs`, `src/lib/runtime.ts`.

---

## MCP 서버 통합 (FR-1400)

### FR-1400: MCP 서버 설정 관리

- 사용자는 프로젝트별로 MCP(Model Context Protocol) 서버를 추가·편집·삭제할 수 있다.
- 지원하는 MCP 서버 타입: stdio (로컬 명령), SSE (Server-Sent Events), HTTP (Streamable HTTP).
- 설정은 `.claude/settings.json`의 `mcpServers` 필드에 프로젝트 단위로 저장된다.
- 각 서버는 이름(고유 키), 활성/비활성 토글, 설명, 타입별 설정(command/args/env 또는 url/headers)을 가진다.

### FR-1401: MCP 서버 설정 UI

- 헤더에 Blocks 아이콘 버튼으로 MCP 서버 관리 모달을 열 수 있다. 활성 서버가 있을 때 아이콘이 파란색으로 표시된다.
- 커맨드 팔레트(Cmd+K)에 "MCP: Manage Servers", "MCP: Refresh Status" 항목이 제공된다.
- 관리 모달에서 서버 목록을 표시하며, 각 항목에 상태 도트(green/yellow/red), 타입 배지, 활성화 토글, 편집·삭제 버튼이 있다.
- "Quick Add" 드롭다운으로 자주 사용되는 MCP 서버(Filesystem, GitHub, Brave Search, Slack, PostgreSQL)를 프리셋으로 빠르게 추가할 수 있다.
- 구현: `src/components/modals/mcp-servers-modal.tsx`, `src/stores/use-mcp-store.ts`.

### FR-1402: MCP 서버 백엔드 연동

- `claude-handler.mjs`의 `runQuery()`는 쿼리 시작 시 `.claude/settings.json`에서 활성화된 MCP 서버를 로드하여 Agent SDK의 `queryOptions.mcpServers`에 전달한다.
- MCP 서버의 도구 호출은 기존 `canUseTool` 권한 게이트를 통해 처리되므로, 별도의 권한 로직 없이 기존 허용/거부 모달이 동작한다.
- `GET /api/mcp` — 현재 프로젝트의 MCP 서버 설정 반환.
- `PUT /api/mcp` — MCP 서버 설정 업데이트 (기존 settings와 merge).
- `GET /api/mcp/status` — 활성 SDK 세션의 MCP 서버 연결 상태 반환.

### FR-1403: MCP 서버 상태 표시

- 상태바에 활성 MCP 서버 수와 집계 상태(green: 전체 connected, yellow: 일부 pending, red: 실패 있음)가 표시된다. 클릭 시 관리 모달이 열린다.
- 관리 모달 내 서버 목록에서 각 서버의 실시간 연결 상태가 색상 도트로 표시된다 (connected/pending/failed/needs-auth/unknown).
- 구현: `src/components/layout/status-bar.tsx`, `src/components/layout/header.tsx`.

---

## 3.15 멀티 브라우저 독립 프로젝트 (FR-1500)

### FR-1500: 멀티 브라우저 독립 프로젝트 컨텍스트

- 각 브라우저 탭은 독립적인 프로젝트를 열고 작업할 수 있다. 한 탭에서 프로젝트를 변경해도 다른 탭에 영향을 주지 않는다.
- 클라이언트는 탭별 UUID `browserId`를 `sessionStorage`에 생성·저장한다. 탭 복제 시 새로운 `browserId`가 부여된다.
- 모든 HTTP 요청에 `X-Browser-Id` 헤더를, WebSocket 연결에 `?browserId=` 쿼리 파라미터를 포함한다.
- 서버의 `BrowserSessionRegistry`가 `browserId → { root, lastSeen }` 매핑을 관리한다.
- 파일 와처는 프로젝트 루트 단위로 refCount 기반 공유된다. 동일 프로젝트를 여는 복수 탭이 하나의 와처를 공유한다.
- `project-changed` WebSocket 이벤트는 해당 `browserId`의 탭에만 전송된다.
- 터미널 및 Claude 핸들러는 탭별 프로젝트 루트를 작업 디렉토리로 사용한다.
- `browserId`가 누락된 요청은 기존 글로벌 싱글톤으로 폴백하여 하위 호환성을 유지한다.
- 연결 해제 후 30분이 경과한 세션은 자동으로 GC된다 (터미널 세션 레지스트리와 동일 패턴).
- 구현: `src/lib/project/browser-session-registry.mjs`, `server.js`, `server-handlers/files-handler.mjs`, `server-handlers/claude-handler.mjs`, `server-handlers/terminal-handler.mjs`.

### FR-1501: 멀티 브라우저 Claude 채팅 동시 실행

- 복수의 브라우저(또는 탭)에서 동시에 Claude 채팅 쿼리를 실행할 수 있어야 한다.
- 각 브라우저의 쿼리는 독립적인 Agent SDK 프로세스를 spawn하여 처리된다. 한 브라우저의 쿼리가 다른 브라우저의 쿼리를 블로킹하지 않는다.
- 세션 디스크 영속화를 비활성화(`persistSession: false`)하여 동일 프로젝트에서 여러 CLI 프로세스 간의 세션 파일 잠금 충돌을 방지한다. 세션 이어쓰기(`resume`)는 서버 프로세스 생애주기 내에서만 동작한다.
- 활성 Query 인스턴스는 `browserId` 기준으로 추적되어 MCP 서버 상태 조회(`getMcpServerStatus`)가 브라우저별로 올바른 Query에서 데이터를 가져온다.
- 구현: `server-handlers/claude-handler.mjs`, `src/app/api/mcp/status/route.ts`.

---

## 3.16 로컬 개발 런타임 모드 (FR-1600)

### FR-1600: 단일 런처 스크립트의 런타임 선택

`scripts/dev.sh`(macOS/Linux)와 `scripts/dev.ps1`(Windows)는 동일한 코드 베이스를 **네 가지 런타임** 중 하나로 기동할 수 있어야 한다. 기본값은 `--native`(호스트 직접 실행)이며, 나머지는 명시 플래그로 선택한다.

| 플래그 | 런타임 | 기동 방식 | HMR | 대상 환경 |
|--------|--------|----------|-----|----------|
| `--native` (기본) | 호스트 Node.js | `node server.js` | ✅ Next.js dev | 개발자 로컬 |
| `--docker` | 단일 컨테이너 | `docker run … claudegui:dev` | ✅ 바인드 마운트 + 폴링 | Docker Engine/Desktop |
| `--compose` | docker-compose 스택 | `docker compose up dev` | ✅ 네임드 볼륨 + 바인드 마운트 | Docker Compose v2 |
| `--k8s` | 로컬 K8S 클러스터 | `kubectl apply -k k8s/local/` + `port-forward` | ✅ hostPath + 폴링 | kind / minikube / k3d / Docker Desktop K8S |

**공통 요구사항**:

- 포그라운드/백그라운드 모두 지원해야 한다. `-b`/`--background`가 모든 런타임에서 같은 의미를 가진다.
- `--stop`/`--status`/`--tail`/`--restart` 라이프사이클 커맨드는 **마지막으로 시작된 런타임을 기억**하여 플래그 없이도 올바른 백엔드를 대상으로 동작해야 한다 (`$CLAUDEGUI_STATE_DIR/runtime`에 기록).
- 호스트 포트 정책은 런타임과 무관하며 **스마트 기본값**을 갖는다 (`--port-policy smart`). 포트 점유 프로세스가 발견되면 다음 세 가지 신호 중 하나라도 일치할 때만 "우리 것"으로 판정하여 정리(kill)하고, 그 외에는 남의 서비스로 간주해 **다음 빈 포트로 시프트**한다:
  1. 점유 프로세스 PID가 `$CLAUDEGUI_PID_FILE`의 기록 값과 일치 (native / k8s port-forward)
  2. 점유 프로세스가 `node ... server.js`이고 그 cwd가 저장소 루트와 동일 (native foreground 레거시)
  3. `docker ps`에서 점유 포트를 바인딩 중인 컨테이너 이름이 `claudegui-dev` 또는 compose 프로젝트(`claudegui_dev_1` 등)와 매칭 (docker / compose)

  명시 플래그로 정책을 강제할 수 있다:
  - `--kill-port` (=`--reclaim-port`, `--port-policy kill`) — 항상 kill 후 재바인딩
  - `--next-free-port` (=`--no-kill-port`, `--port-policy shift`) — 절대 kill하지 않고 항상 시프트
- `--docker`/`--compose`/`--k8s`는 필요한 이미지(`claudegui:dev`)를 자동으로 빌드해야 하며, `--k8s`는 로컬 클러스터(kind/minikube/k3d)에 이미지 로드까지 수행해야 한다.
- 컨테이너화된 런타임에서 `--clean`/`--install`/`--check`/`--lint`/`--test`/`--build`를 지정하면 **경고 후 무시**한다(호스트가 아닌 컨테이너 내부에서 수행해야 하므로). 사용자에게 `docker compose exec dev npm run lint` 형태의 대안을 안내한다.

**HMR 유지 방법**:

- Docker/Compose: 저장소를 `/app`에 바인드 마운트하고, `node_modules`·`.next`는 **네임드 볼륨**으로 덮어써서 호스트-컨테이너 간 네이티브 바인딩(@parcel/watcher, node-pty) 충돌을 방지한다.
- Docker Desktop(macOS/Windows)에서는 바인드 마운트 상의 inotify 전파가 불안정하므로 `WATCHPACK_POLLING=1`/`CHOKIDAR_USEPOLLING=1`을 기본 활성화한다. 네이티브 Linux에서는 무해한 no-op이다.
- K8S: `hostPath` 볼륨으로 호스트 저장소를 파드에 마운트하고 단일 replica + `Recreate` 전략을 강제한다 (이중 마운트 레이스 방지).

**라이프사이클 위임**:

| 런타임 | start | stop | status | logs |
|--------|-------|------|--------|------|
| native | `node server.js`(fore) / `nohup+setsid`(bg) | SIGTERM → SIGKILL | PID 파일 + `ps` | tail `-F` log file |
| docker | `docker run --rm` (+`-d` bg) | `docker stop` + `rm` | `docker ps --filter name=…` | `docker logs -f` |
| compose | `docker compose up`(fore) / `-d`(bg) | `docker compose down` | `docker compose ps dev` | `docker compose logs -f dev` |
| k8s | `kubectl apply -k` + `port-forward` | `kubectl delete -k` + PID | `kubectl get deploy/svc/pod` | `kubectl logs -f deploy/claudegui` |

**구현**: `scripts/dev.sh` §runtime helpers, §runtime dispatch. `docker-compose.yml` (서비스: `dev`, 프로파일 `prod`). `k8s/local/` (`namespace`, `configmap`, `deployment`, `service`, `kustomization`). `Dockerfile` `dev` 스테이지.

**비고**: `--k8s`는 개발용 로컬 클러스터 전용이다. 원격/프로덕션 배포는 FR-1300(원격 접근)과 ADR-018(Tauri 네이티브 인스톨러) 범위이며 본 요구사항에서 제외된다.
