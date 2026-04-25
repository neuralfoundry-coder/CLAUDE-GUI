# 6. Deployment and Operations

> English mirror of [`docs/architecture/06-deployment.md`](../../architecture/06-deployment.md).

## 6.1 Local Development Environment

### Prerequisites

| Tool | Minimum version | Installation |
|------|-----------------|--------------|
| Node.js | 20.0–24.x (LTS 22 recommended) | https://nodejs.org/ or nvm |
| npm | 10.0+ | Included with Node.js |
| Claude CLI | latest | `npm install -g @anthropic-ai/claude-code` |
| Python 3 | 3.8+ | For the node-pty native build |
| C++ build tools | — | OS-specific (see below) |

**Build tools per OS**:
- macOS: `xcode-select --install`
- Windows: Visual Studio Build Tools + `npm install -g windows-build-tools`
- Linux: `sudo apt install build-essential python3`

### Install and run

```bash
# 1. Clone the repo
git clone https://github.com/<org>/ClaudeGUI.git
cd ClaudeGUI

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# edit .env.local

# 4. Start the dev server (custom server.js)
node server.js
# or via npm script
npm run dev
```

### Environment variables

```bash
# .env.local

# server
HOST=127.0.0.1
PORT=3000

# project root (filesystem sandbox scope)
PROJECT_ROOT=/Users/dev/myproject

# Claude authentication (one of the two)
ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_AUTH_TOKEN=...

# logging
LOG_LEVEL=info  # debug | info | warn | error

# dev mode
NODE_ENV=development
```

### Dev scripts

```json
// package.json
{
  "scripts": {
    "dev": "node server.js",
    "run:local": "bash scripts/dev.sh",
    "run:clean": "bash scripts/dev.sh --clean --build",
    "run:debug": "bash scripts/dev.sh --verbose --trace",
    "build": "next build",
    "start": "NODE_ENV=production node server.js",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "test:e2e": "playwright test"
  }
}
```

### Local launcher script — `scripts/dev.sh` (v0.3)

Instead of invoking `node server.js` directly, this launcher bundles clean / install / type-check / lint / test / build / run into a **single script**. The default is **foreground** execution; adding `--background` detaches the process, creates a pid file plus a log file, and exposes lifecycle commands `--stop` / `--restart` / `--status` / `--tail`. All server-side logs are filtered **per module** with color coding.

**Files**:
- `scripts/dev.sh` — bash launcher for macOS / Linux
- `scripts/dev.ps1` — PowerShell counterpart for Windows
- `src/lib/debug.mjs` — module filter + color mapping + optional stack traces (`server.js` and `server-handlers/*.mjs` consume it via `createDebug('<module>')`)

**Debug module tags** (`CLAUDEGUI_DEBUG`):

| Module | Source | Output |
|--------|--------|--------|
| `server` | `server.js` | Boot, shutdown, upgrade errors |
| `project` | `src/lib/project/project-context.mjs` | Runtime root swap, listener notifications, state file persistence |
| `files` | `server-handlers/files-handler.mjs` | `@parcel/watcher` subscription create/restart, file events, client connect/disconnect |
| `terminal` | `server-handlers/terminal-handler.mjs` | node-pty spawn/exit, WS lifecycle |
| `claude` | `server-handlers/claude-handler.mjs` | Agent SDK query start/result/error, permission requests |

Each module is auto-assigned a distinct ANSI color. Log lines are formatted as `HH:MM:SS.mmm LEVEL [module] message`. Adding `--trace` prints a short stack snippet with every `.trace(...)` call and boots Node with `--trace-warnings --stack-trace-limit=100`.

**Option categories**:

| Category | Options |
|----------|---------|
| Preparation | `--clean` `--install` `--check` `--lint` `--test` `--build` `--all-checks` |
| Run mode | `--dev` (default) `--prod` (NODE_ENV=production, requires a build) |
| Runtime (FR-1600) | `--native` (default) `--docker` `--compose` `--k8s` |
| Server | `--host <addr>` `--port <n>` `--project <path>` `--port-policy <smart\|kill\|shift>` (default: smart) `--kill-port` (=policy kill) `--next-free-port` (=policy shift) |
| Debug | `--debug <list>` `--verbose` `--trace` `--log-level <lvl>` `--inspect` `--inspect-brk` `--log-file <path>` `--log-truncate` `--no-color` |
| Background / lifecycle | `--background` / `-b` `--stop` `--restart` `--status` `--tail` `--pid-file <path>` `--force-kill` |
| Convenience | `--open` `-h` / `--help` |

**Port policy (smart default)**: when the port is busy, the script does **not** kill unconditionally. It first decides whether the holder is an instance we spawned previously. If yes, reclaim (kill → rebind); if it's a foreign service (e.g. a dev server the user started separately), **shift to the next free port**. Classification signals:

1. The holder PID equals the value recorded in `$CLAUDEGUI_PID_FILE` (native / k8s port-forward).
2. The holder command line is `node ... server.js` and its cwd equals the repository root (native leftovers).
3. A `docker ps` entry binding the port has a name matching `claudegui-dev` or the compose project pattern (docker / compose).

To force the old "always kill" behavior use `--kill-port` (= `--port-policy kill`); to forbid killing entirely use `--next-free-port` (= `--port-policy shift`).

**Runtime flags** (FR-1600): see [§6.3](#63-container-runtimes-docker--compose--k8s) for details.

**State paths** (overridable via environment variables):

| Path | Default | Env var |
|------|---------|---------|
| State directory | `~/.claudegui` | `CLAUDEGUI_STATE_DIR` |
| PID file | `~/.claudegui/claudegui.pid` | `CLAUDEGUI_PID_FILE` |
| Default log file | `~/.claudegui/logs/claudegui.log` | `CLAUDEGUI_LOG_DIR` |

**Examples**:

```bash
# --- Foreground (default) ---
./scripts/dev.sh                                   # fast dev boot
./scripts/dev.sh --clean --build                   # full rebuild then run
./scripts/dev.sh --prod --port 8080                # production mode
./scripts/dev.sh --all-checks --prod --verbose     # type-check + lint + test + build + prod + all debug
./scripts/dev.sh --debug files,claude,project      # filter to specific modules
./scripts/dev.sh --verbose --trace                 # all modules + stack traces
./scripts/dev.sh --inspect --debug claude          # Node inspector + Claude filter
./scripts/dev.sh --project ~/code/myproj --open    # set initial project + open browser
./scripts/dev.sh --log-file /tmp/gui.log           # tee terminal + file

# --- Background (detached) ---
./scripts/dev.sh --background --verbose            # detach + auto log file
./scripts/dev.sh --background --tail               # detach then follow the log
./scripts/dev.sh --background --log-file /tmp/gui.log --log-truncate

# --- Lifecycle ---
./scripts/dev.sh --status                          # pid, pidfile, uptime, listen ports
./scripts/dev.sh --tail                            # follow the existing log (server keeps running)
./scripts/dev.sh --stop                            # SIGTERM → 5s → SIGKILL
./scripts/dev.sh --stop --force-kill               # immediate SIGKILL
./scripts/dev.sh --restart --debug '*'             # stop + relaunch in background
./scripts/dev.sh --help                            # full option reference
```

**Foreground vs. background behavior**:

| Aspect | Foreground (default) | Background (`--background`) |
|--------|---------------------|------------------------------|
| How Node runs | `exec node server.js` replaces the shell (Ctrl+C to stop) | `nohup` + `setsid` detach |
| PID file | not written | `~/.claudegui/claudegui.pid` |
| Log file | only when `--log-file` is passed (then tee) | auto-created; stdout/stderr redirected |
| Stop | Ctrl+C (SIGINT) | `--stop` (SIGTERM → optional SIGKILL) |
| Status query | none (shell is the session) | `--status` |
| Restart | manual | `--restart` (stop + background start) |
| Double-launch protection | none (only port conflict) | pid-file guard, `already running` error |

**Log file format**: in background mode the log file is opened in append mode (`--log-truncate` overwrites). Each boot writes the following header so restart history is separable:

```
========================================================
 ClaudeGUI dev start @ 2026-04-11 13:57:50
 host=127.0.0.1 port=3471 project=(cwd) debug=files,project
========================================================
13:57:51 INFO [server]  ClaudeGUI ready on http://127.0.0.1:3471 (mode=dev)
13:57:52 LOG  [files]   client connected, total= 1
13:57:52 INFO [files]   starting watcher on /.../project-a
...
```

**Windows**: `scripts/dev.ps1` provides the same feature set with PowerShell switch naming (`-Background`, `-Stop`, `-Restart`, `-Status`, `-Tail`, etc.). See `.\scripts\dev.ps1 -Help`.

**Relationship to the CLAUDE.md mandatory workflow**: this launcher packages the "after-change" steps (type-check, lint, test, build) into a single invocation, so local iteration can gate the server boot on `--all-checks --build` in the same way CI would.

---

## 6.2 Production Build

### Build process

```bash
# 1. Install dependencies (production)
npm ci

# 2. Next.js production build
npm run build

# 3. Start the production server
NODE_ENV=production node server.js
```

### Build artifacts

```
.next/                    # Next.js build output
├── server/               # server-side bundle
├── static/               # static assets
└── standalone/           # (when in standalone mode)

node_modules/             # production dependencies
server.js                 # custom server entrypoint
package.json
```

### Notes

- **Do not** use `next dev` or `next start` — always use `node server.js`.
- `node-pty` requires a native build even in production.
- If you set `output: 'standalone'`, re-evaluate the integration with server.js.

---

## 6.3 Container Runtimes (Docker / Compose / K8s)

The local launcher script (`scripts/dev.sh`) supports **three containerized runtimes** in addition to native, per FR-1600. The selected runtime is recorded in `$CLAUDEGUI_STATE_DIR/runtime`, so `--stop` / `--status` / `--tail` / `--restart` automatically target the correct backend.

| Flag | Launch command | Stop | Logs |
|------|----------------|------|------|
| `--docker` | `docker run … claudegui:dev` (bind mount + named volumes) | `docker stop && docker rm` | `docker logs -f` |
| `--compose` | `docker compose up [-d] dev` (prod via `--profile prod`) | `docker compose down` | `docker compose logs -f` |
| `--k8s` | `kubectl apply -k k8s/local/` + `kubectl port-forward` | `kubectl delete -k` + PF termination | `kubectl logs -f deploy/claudegui` |

All containerized runtimes **preserve HMR** by bind-mounting the repo at `/app`, while overlaying `node_modules` and `.next` with named volumes to prevent host↔container native-binding conflicts (@parcel/watcher, node-pty). To work around unreliable inotify propagation on Docker Desktop (macOS / Windows), `WATCHPACK_POLLING=1` and `CHOKIDAR_USEPOLLING=1` are enabled by default.

### 6.3.0 Dockerfile multi-stage layout

```
Dockerfile
├── dev      → node:20-bookworm + build-essential, expects bind mount, install-on-boot
├── builder  → npm ci + next build
└── runner   → node:20-bookworm-slim + runtime artifacts only, non-root user (prod)
```

### 6.3.1 Single container (`--docker`)

```bash
# Manual
docker build --target dev -t claudegui:dev .
docker run --rm -it --name claudegui-dev \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD":/app:cached \
  -v claudegui_node_modules:/app/node_modules \
  -v claudegui_next_cache:/app/.next \
  -e NODE_ENV=development \
  claudegui:dev

# Via dev.sh (recommended)
./scripts/dev.sh --docker
./scripts/dev.sh --docker --background --tail
./scripts/dev.sh --docker --stop
```

### 6.3.2 Docker Compose (`--compose`)

`docker-compose.yml` services:
- `dev` (default) — HMR dev mode
- `prod` (`profile: prod`) — production image

```bash
# Manual
docker compose up                  # dev
docker compose --profile prod up   # prod

# Via dev.sh
./scripts/dev.sh --compose
./scripts/dev.sh --compose --background
./scripts/dev.sh --compose --prod
./scripts/dev.sh --compose --stop
```

Environment substitutions: `CLAUDEGUI_HOST_PORT` (default 3000), `CLAUDEGUI_DEBUG`, `LOG_LEVEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`.

### 6.3.3 Local Kubernetes (`--k8s`)

`k8s/local/` manifests (Kustomize):

| File | Role |
|------|------|
| `namespace.yaml` | `claudegui-dev` namespace |
| `configmap.yaml` | `LOG_LEVEL`, `CLAUDEGUI_DEBUG` |
| `deployment.yaml` | `claudegui:dev` pod + `hostPath` source mount + single replica + `Recreate` strategy |
| `service.yaml` | NodePort 30030 → 3000 |
| `kustomization.yaml` | Entry point |

```bash
# Manual
docker build --target dev -t claudegui:dev .
kind load docker-image claudegui:dev       # kind
# minikube image load claudegui:dev        # minikube
# k3d image import claudegui:dev -c <c>    # k3d
kubectl kustomize k8s/local/ \
  | sed "s|__REPO_ROOT__|$PWD|g" \
  | kubectl apply -f -
kubectl -n claudegui-dev port-forward svc/claudegui 3000:3000

# Via dev.sh (build + load + kustomize + port-forward all at once)
./scripts/dev.sh --k8s
./scripts/dev.sh --k8s --background
./scripts/dev.sh --k8s --stop
```

**Limitations**:
- Local clusters only. `hostPath` exposes the developer's laptop path to the pod, so remote clusters cannot use these manifests.
- Single replica + `Recreate` strategy is enforced to prevent a double-bind race on the host path. Production-grade deployment (ReplicaSet, rolling updates) is out of scope here.

### 6.3.4 (Reference) Legacy prod Docker deployment

### Dockerfile (multi-stage)

```dockerfile
# Stage 1: Builder
FROM node:20-bookworm AS builder

# node-pty build dependencies
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.js ./

EXPOSE 3000

CMD ["node", "server.js"]
```

### Run

```bash
# build the image
docker build -t claudegui:latest .

# run the container (mount the project volume)
docker run -d \
  --name claudegui \
  -p 127.0.0.1:3000:3000 \
  -v /Users/dev/myproject:/workspace:rw \
  -e PROJECT_ROOT=/workspace \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  claudegui:latest
```

### Installing the Claude CLI inside Docker

```dockerfile
RUN npm install -g @anthropic-ai/claude-code
```

---

## 6.4 Directory Structure

### Full project layout

```
ClaudeGUI/
├── CLAUDE.md                      # Claude Code conventions (Korean)
├── CLAUDE-EN.md                   # English mirror
├── README.md                      # Project intro (Korean)
├── README-EN.md                   # English mirror
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── .env.example
├── server.js                      # custom server entrypoint
├── Dockerfile
│
├── docs/                          # project documentation
│   ├── research/                  # initial planning documents
│   ├── srs/                       # requirements (Korean)
│   ├── architecture/              # architecture design (Korean)
│   └── en/                        # English mirrors
│       ├── srs/
│       └── architecture/
│
├── public/                        # static assets
│   ├── reveal-host.html           # reveal.js iframe host
│   ├── monaco/                    # Monaco local bundle (fallback)
│   └── icons/
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── files/
│   │       │   ├── route.ts       # GET, DELETE
│   │       │   ├── read/route.ts  # GET
│   │       │   ├── write/route.ts # POST
│   │       │   ├── stat/route.ts  # GET
│   │       │   ├── mkdir/route.ts # POST
│   │       │   └── rename/route.ts # POST
│   │       ├── sessions/
│   │       │   ├── route.ts       # GET, POST
│   │       │   └── [id]/route.ts  # GET, DELETE
│   │       └── git/
│   │           └── status/route.ts
│   │
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives
│   │   ├── layout/
│   │   │   ├── app-shell.tsx
│   │   │   ├── header.tsx
│   │   │   └── status-bar.tsx
│   │   ├── panels/
│   │   │   ├── file-explorer/
│   │   │   ├── editor/
│   │   │   ├── terminal/
│   │   │   └── preview/
│   │   ├── command-palette/
│   │   └── modals/
│   │       └── permission-request-modal.tsx
│   │
│   ├── hooks/
│   │   ├── use-websocket.ts
│   │   ├── use-debounce.ts
│   │   └── use-keyboard-shortcut.ts
│   │
│   ├── stores/
│   │   ├── use-layout-store.ts
│   │   ├── use-editor-store.ts
│   │   ├── use-terminal-store.ts
│   │   ├── use-claude-store.ts
│   │   └── use-preview-store.ts
│   │
│   ├── lib/
│   │   ├── websocket/
│   │   │   ├── reconnecting-ws.ts
│   │   │   ├── terminal-client.ts
│   │   │   ├── claude-client.ts
│   │   │   └── files-client.ts
│   │   ├── fs/                    # server-only
│   │   │   ├── resolve-safe.ts
│   │   │   ├── file-operations.ts
│   │   │   └── watcher.ts
│   │   ├── claude/                # server-only
│   │   │   ├── session-manager.ts
│   │   │   ├── query-handler.ts
│   │   │   ├── permission-interceptor.ts
│   │   │   └── stream-parser.ts
│   │   ├── pty/                   # server-only
│   │   │   ├── session-manager.ts
│   │   │   └── pty-bridge.ts
│   │   └── utils/
│   │
│   ├── types/
│   │   ├── claude.ts
│   │   ├── files.ts
│   │   └── websocket.ts
│   │
│   └── styles/                    # global styles (minimal)
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 6.5 Monitoring and Logging

### Logging strategy

- **Library**: `pino` (fast, structured)
- **Log levels**: `debug`, `info`, `warn`, `error`
- **Output**: stdout (container-friendly)

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});
```

### Logging rules

| Event | Level | Fields |
|-------|-------|--------|
| HTTP request | info | method, path, status, duration |
| File operation | info | operation type, path (inside sandbox), size |
| Claude query start | info | requestId, sessionId (no prompt body) |
| Claude query finish | info | requestId, cost, tokens, duration |
| Permission request | info | tool, approved/denied |
| Path sandbox violation | warn | requested path (sanitized) |
| WebSocket connect | info | endpoint, origin |
| Error | error | stack trace (dev mode only) |

### Must NOT log

- ❌ Prompt bodies
- ❌ File contents
- ❌ API keys
- ❌ Full environment variables
- ❌ Personally identifiable information

### Optional external monitoring

Production-only tools to consider:

- **Sentry**: error tracking (must filter sensitive fields)
- **Prometheus + Grafana**: system metrics
- **OpenTelemetry**: distributed tracing (track WebSocket events)

---

## 6.6 CI/CD Pipeline

### GitHub Actions example

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
```

### Pipeline stages

1. **Lint**: ESLint + Prettier checks
2. **Type check**: TypeScript strict-mode compile
3. **Unit tests**: Vitest run with coverage reports
4. **Integration tests**: run the server and hit APIs
5. **E2E tests**: Playwright covers the primary scenarios
6. **Build**: Next.js production build
7. **Docker build**: multi-arch image (amd64, arm64)
8. **Release**: create a GitHub Release on tag push

---

## 6.7 Operations Checklist

### Initial deployment

- [ ] `.env.local` configured (API key, PROJECT_ROOT)
- [ ] `node --version` is 20 or later
- [ ] `claude --version` confirms CLI installation
- [ ] `npm ci && npm run build` succeeds
- [ ] `node server.js` boots
- [ ] Browser can reach `http://localhost:3000`
- [ ] Test an `ls` command in the terminal panel
- [ ] Project tree renders in the file explorer
- [ ] A simple query to Claude round-trips

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error: Cannot find module 'node-pty'` | Native build failed | `npm rebuild node-pty` or install build tools |
| WebSocket connection fails | server.js not running | Use `node server.js` instead of `next dev` |
| Monaco fails to load | CDN blocked | Enable a local-bundle fallback |
| File change events missing | `@parcel/watcher` native binary failed to load | `npm rebuild @parcel/watcher`, then restart on Node.js 22 LTS |
| `files` handler spams `EMFILE: too many open files, watch` (legacy chokidar 5) | chokidar 4+ removed native fsevents and falls back to `fs.watch` on macOS, burning one FD per directory and blowing past the 256-per-process default soft limit | **Resolved (ADR-024)**: file watching switched to `@parcel/watcher`, which uses a single native OS handle per root. See `server-handlers/files-handler.mjs` → `loadWatcher` calling `mod.subscribe(root, cb, { ignore: WATCHER_IGNORE_GLOBS })`. |
| Path sandbox 403 | `PROJECT_ROOT` misconfigured | Double-check the env var |
| `claude` command not found | Not on `PATH` | `npm install -g @anthropic-ai/claude-code` |
| Desktop icon double-click closes immediately | Launcher script lost the +x bit | `chmod +x ~/.claudegui/bin/claudegui-launcher.sh` |
| macOS Gatekeeper blocks the `.command` | First-launch security prompt | Right-click → Open in Finder (one time) |
| Browser doesn't open automatically | 30-s polling timeout / `xdg-open` missing | Open `http://localhost:3000` manually; on Linux install `xdg-utils` |

---

## 6.8 Desktop launcher (FR-1100, ADR-022)

### Overview

After the build step the one-line installer drops a **ClaudeGUI shortcut on the user's desktop**. Double-clicking it opens a fresh console window, boots `node server.js` in production mode, and a background poller launches the OS default browser as soon as `localhost:3000` responds. Closing the console window stops the server with it (close window = stop server).

This path **complements rather than replaces** the Tauri `.dmg`/`.msi` native installer from ADR-018. It exists so that source-install users (`curl | bash`, `iwr | iex`) get the same "double-click to start" experience.

### File layout

| Path | Purpose |
|------|---------|
| `public/branding/claudegui.svg` | Single source of truth — mascot SVG |
| `public/branding/claudegui-{16,32,48,64,128,180,256,512}.png` | Pre-rendered PNGs (qlmanage rasterization) |
| `public/branding/claudegui.ico` | Vista+ PNG-in-ICO container (six sizes: 16/32/48/64/128/256) |
| `src/app/icon.svg` | Next.js App Router auto-served favicon |
| `src/app/apple-icon.png` | iOS home-screen icon (180×180) |
| `scripts/build-icons.mjs` | macOS-only asset regeneration script |
| `installer/tauri/src-tauri/icons/` | Tauri desktop app icons (32x32, 128x128, @2x, .icns, .ico) |
| `scripts/install/install.sh` | macOS / Linux installer (`install_desktop_launcher` function) |
| `scripts/install/install.ps1` | Windows installer (`Install-DesktopLauncher` function) |

### User-system locations

| File | macOS / Linux | Windows |
|------|---------------|---------|
| Icon directory | `~/.claudegui/icons/` | `%LOCALAPPDATA%\ClaudeGUI\icons\` |
| Launcher script | `~/.claudegui/bin/claudegui-launcher.sh` | `%LOCALAPPDATA%\ClaudeGUI\bin\claudegui-launcher.ps1` |
| Desktop shortcut | `~/Desktop/ClaudeGUI.app` (mac) / `.desktop` (linux) | `%USERPROFILE%\Desktop\ClaudeGUI.lnk` |
| Launcher log | `~/.claudegui/logs/launcher.log` (append) | `%USERPROFILE%\.claudegui\logs\launcher.log` (append) |

### Launcher flow

```
[ user double-clicks ]
        │
        ▼
[ console window opens ] ──┐
        │                  │
        ▼                  │
[ banner printed ]         │ macOS:   .app bundle → open -a Terminal → bash
[ env exported ]           │ Linux:   .desktop → x-terminal-emulator → bash
        │                  │ Windows: .lnk     → powershell.exe
        ▼
   ┌──────────────────────────────┐
   │ background poller (60×500ms) │ ── 200/3xx ──> [ open / xdg-open / Start-Process ]
   └──────────────────────────────┘
        │
        ▼ (in parallel)
[ node server.js (foreground) ]
        │
   stdout/stderr ─tee─> [ console window ] + [ launcher.log ]
        │
        ▼
[ user closes the window / Ctrl+C ]
        │
   SIGHUP/SIGINT propagates
        │
        ▼
[ node server.js exits ]
```

### Trade-offs

- **macOS uses a lightweight `.app` bundle to display the mascot icon.** The bundle consists of a minimal `Info.plist`, a shell-script executable, and `AppIcon.icns`. Since it is created locally by the installer (not downloaded), it does not carry a Gatekeeper quarantine attribute and runs without code signing. The same mascot character shown as the favicon appears in Finder and the Dock.
- **Closing the window stops the server.** No background daemonization, no system-tray icon. This keeps lifecycle management explicit and prevents zombie processes when users forget to stop the server. If you need long-running execution use ADR-018 (Tauri native app) or `scripts/dev.sh --background`.
- **30-second polling timeout.** Cold-start `next start` is well under 30 seconds in practice; if it isn't, the launcher prints a manual-open hint and lets the user finish the session themselves.
- **Tee real-time behaviour.** Both bash `tee` and PowerShell `Tee-Object` are line-buffered, so the user sees logs as they happen. We did not force `node`'s stdout to line-buffered (no measurable issue today).

### Regenerating assets

After editing the SVG mascot (`public/branding/claudegui.svg`), regenerate every raster, the ICO, and the favicon on macOS:

```bash
node scripts/build-icons.mjs
```

The script uses `qlmanage` (SVG rendering), `sips` (exact-square resize), an in-script PNG-in-ICO packer, and `iconutil` (macOS `.icns` generation). It also generates Tauri desktop app icons (`installer/tauri/src-tauri/icons/`) from the same SVG source, ensuring the desktop app and favicon share the same mascot character. It does not run on Windows or Linux and exits with an error there — the committed artifacts are the canonical outputs.
