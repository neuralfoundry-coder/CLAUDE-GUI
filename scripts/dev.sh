#!/usr/bin/env bash
# =============================================================================
# ClaudeGUI local launch script
# -----------------------------------------------------------------------------
# Immediate local run with optional clean / install / check / build, foreground
# debug logs filtered per module + optional stack traces. Safe to re-run.
#
# Usage:
#   ./scripts/dev.sh                             # dev mode on default port
#   ./scripts/dev.sh --clean --build             # clean + production build
#   ./scripts/dev.sh --prod --port 8080          # prod server on :8080
#   ./scripts/dev.sh --debug files,claude --trace
#   ./scripts/dev.sh --all-checks --verbose
#   ./scripts/dev.sh --inspect --debug claude
#
# Run `./scripts/dev.sh --help` for the full list.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ----- defaults -------------------------------------------------------------
MODE="dev"                    # dev | prod
DO_CLEAN=0
DO_INSTALL=0
DO_BUILD=0
DO_CHECK=0
DO_LINT=0
DO_TEST=0
# Port conflict policy:
#   smart = detect ownership. Reclaim (kill) only if the holder is our own
#           previous instance (PID file match, or `node server.js` with
#           cwd==$ROOT, or our docker/compose container). For foreign
#           services, shift to the next free port instead of killing
#           someone else's process. DEFAULT.
#   kill  = force-kill whatever holds the port (old behavior).
#   shift = never kill; always increment to the next free port.
# Flip with --kill-port / --next-free-port / --port-policy <name>.
PORT_POLICY="smart"
OPEN_BROWSER=0
NO_COLOR_FLAG=0
INSPECT=0
INSPECT_BRK=0
TRACE=0
VERBOSE=0
LOG_FILE=""
DEBUG_MODULES=""
PORT_OPT="${PORT:-3000}"
HOST_OPT="${HOST:-127.0.0.1}"
PROJECT_OPT="${PROJECT_ROOT:-}"
LOG_LEVEL_OPT="${LOG_LEVEL:-info}"

# Background / lifecycle
BACKGROUND=0
DO_STOP=0
DO_STATUS=0
DO_RESTART=0
DO_TAIL=0
FORCE_KILL=0
LOG_APPEND=1
STATE_DIR="${CLAUDEGUI_STATE_DIR:-$HOME/.claudegui}"
PID_FILE="${CLAUDEGUI_PID_FILE:-$STATE_DIR/claudegui.pid}"
DEFAULT_LOG_DIR="${CLAUDEGUI_LOG_DIR:-$STATE_DIR/logs}"
DEFAULT_LOG_FILE="$DEFAULT_LOG_DIR/claudegui.log"
RUNTIME_STATE_FILE="$STATE_DIR/runtime"

# Runtime: native (default) | docker | compose | k8s
RUNTIME=""                        # empty = not specified; resolves to native
DOCKER_CONTAINER_NAME="${CLAUDEGUI_DOCKER_CONTAINER:-claudegui-dev}"
DOCKER_IMAGE_TAG="${CLAUDEGUI_DOCKER_IMAGE:-claudegui:dev}"
COMPOSE_PROJECT_NAME="${CLAUDEGUI_COMPOSE_PROJECT:-claudegui}"
K8S_NAMESPACE="${CLAUDEGUI_K8S_NAMESPACE:-claudegui-dev}"
K8S_DIR="$ROOT/k8s/local"

show_help() {
cat <<'EOF'
ClaudeGUI local launch script

USAGE:
  scripts/dev.sh [options]

PREPARATION:
  --clean              Remove .next/, node_modules/.cache/, tsconfig.tsbuildinfo,
                       playwright-report/, test-results/  (implies --install)
  --install            Run `npm install` before starting
  --check              Run `npm run type-check`
  --lint               Run `npm run lint`
  --test               Run `npm test` (Vitest)
  --build              Run `npm run build` (required for --prod)
  --all-checks         Shortcut for --check --lint --test

RUN MODE:
  --dev                Development mode (default, Next.js HMR active)
  --prod               Production mode (NODE_ENV=production, implies --build)

RUNTIME (pick one; native if omitted):
  --native             Run `node server.js` on the host (default). No
                       containers. Fastest iteration, uses host Node/npm.
  --docker             Run via `docker run` against the `dev` stage of
                       Dockerfile. Source tree is bind-mounted; HMR works.
                       Image is built on demand (claudegui:dev). --stop removes
                       the container.
  --compose            Run via `docker compose up` (docker-compose.yml). Uses
                       the `dev` service with HMR. Background mode adds -d.
                       --stop runs `docker compose down`.
  --k8s                Apply k8s/local/ to the current kubectl context and
                       `kubectl port-forward` to the host. Pod uses the
                       claudegui:dev image (built + loaded on demand for
                       kind/minikube/k3d). --stop deletes the kustomization.
                       Only intended for local clusters (kind / minikube /
                       k3d / Docker Desktop).

SERVER OPTIONS:
  --host <addr>        Bind host (default: 127.0.0.1, env: HOST)
  --port <n>           Bind port (default: 3000, env: PORT)
  --project <path>     Initial PROJECT_ROOT (absolute, ~ expansion supported)
  --port-policy <p>    Port conflict policy (default: smart):
                         smart  Detect who holds the port. Reclaim only if
                                it's our own previous instance; shift to
                                the next free port for foreign services.
                         kill   Always kill the holder and rebind. Alias:
                                --kill-port / --reclaim-port.
                         shift  Never kill. Always pick the next free port.
                                Alias: --next-free-port / --no-kill-port.
  --kill-port          Shortcut for --port-policy kill. Use only when you
                       know the port holder is disposable.
  --next-free-port     Shortcut for --port-policy shift. Use when you want
                       multiple dev servers running side by side.

DEBUG OPTIONS:
  --debug <modules>    Comma-separated module filter. Available modules:
                         server    server.js boot/shutdown
                         project   ProjectContext hot-swap + persistence
                         files     files-handler watcher + broadcasts
                         terminal  terminal-handler PTY lifecycle
                         claude    claude-handler queries + permissions
                       Use '*' or 'all' for every module.
                       Each module gets a distinct color.
  --verbose            Equivalent to `--debug '*'`
  --trace              Print short stack trace with every .trace() call and
                       pass --trace-warnings --stack-trace-limit=100 to Node
  --log-level <lvl>    LOG_LEVEL env var (debug|info|warn|error, default: info)
  --inspect            Enable Node inspector (--inspect, port 9229)
  --inspect-brk        Enable Node inspector and break on first line
  --log-file <path>    Tee stdout/stderr to a file in addition to foreground
  --no-color           Disable ANSI colors (also respected by NO_COLOR env var)

BACKGROUND / LIFECYCLE:
  -b, --background     Run detached (nohup). Auto-creates a log file if
                       --log-file is not given (default:
                       ~/.claudegui/logs/claudegui.log). Writes pid to
                       ~/.claudegui/claudegui.pid.
  --stop               Send SIGTERM to the tracked background process and
                       exit. Use --force-kill to SIGKILL immediately.
  --restart            Stop the running instance (if any) and start fresh in
                       background mode.
  --status             Show background instance state (pid, port, log, uptime)
                       and exit. Exit 0 if running, 1 if not.
  --tail               Follow the log file with `tail -F`. Alone: tail the
                       existing log. Combined with --background: tail after
                       starting (Ctrl+C stops tailing; server keeps running).
  --pid-file <path>    Override pid file path (default: ~/.claudegui/claudegui.pid)
  --log-file <path>    Foreground: tee stdout/stderr to this file.
                       Background: write stdout/stderr to this file.
  --log-truncate       Truncate the log file on start instead of appending
  --force-kill         With --stop / --restart: send SIGKILL immediately

CONVENIENCE:
  --open               Open http://host:port/ in the default browser after boot
  -h, --help           Show this help and exit

EXAMPLES:
  # Fastest boot, foreground HMR (default)
  scripts/dev.sh

  # Clean rebuild + full checks, then run in production mode with verbose debug
  scripts/dev.sh --clean --all-checks --prod --verbose

  # Debug a specific WebSocket channel while working locally
  scripts/dev.sh --debug files,project --trace

  # Background daemon with auto log file
  scripts/dev.sh --background --verbose

  # Background + immediately tail the log
  scripts/dev.sh --background --tail --debug files,claude

  # Stop, check status, restart
  scripts/dev.sh --stop
  scripts/dev.sh --status
  scripts/dev.sh --restart --debug '*'

  # Tail a running instance from another terminal
  scripts/dev.sh --tail

  # Attach a debugger to the Claude stream handler
  scripts/dev.sh --inspect --debug claude --trace

  # Pick an initial project and auto-open the browser
  scripts/dev.sh --project ~/code/myproj --open

ENV VARS (respected when not overridden by flags):
  HOST  PORT  PROJECT_ROOT  LOG_LEVEL  NO_COLOR
  CLAUDEGUI_DEBUG  CLAUDEGUI_TRACE
  CLAUDEGUI_STATE_DIR  CLAUDEGUI_PID_FILE  CLAUDEGUI_LOG_DIR
EOF
}

# ----- argument parsing -----------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --clean)        DO_CLEAN=1; shift ;;
    --install)      DO_INSTALL=1; shift ;;
    --check)        DO_CHECK=1; shift ;;
    --lint)         DO_LINT=1; shift ;;
    --test)         DO_TEST=1; shift ;;
    --build)        DO_BUILD=1; shift ;;
    --all-checks)   DO_CHECK=1; DO_LINT=1; DO_TEST=1; shift ;;
    --dev)          MODE="dev"; shift ;;
    --prod)         MODE="prod"; DO_BUILD=1; shift ;;
    --native)       RUNTIME="native"; shift ;;
    --docker)       RUNTIME="docker"; shift ;;
    --compose)      RUNTIME="compose"; shift ;;
    --k8s)          RUNTIME="k8s"; shift ;;
    --host)         HOST_OPT="$2"; shift 2 ;;
    --port)         PORT_OPT="$2"; shift 2 ;;
    --project)      PROJECT_OPT="$2"; shift 2 ;;
    --kill-port|--reclaim-port)      PORT_POLICY="kill"; shift ;;
    --next-free-port|--no-kill-port) PORT_POLICY="shift"; shift ;;
    --port-policy)
      case "$2" in
        smart|kill|shift) PORT_POLICY="$2" ;;
        *) die "--port-policy expects smart|kill|shift, got: $2" ;;
      esac
      shift 2
      ;;
    --debug)        DEBUG_MODULES="$2"; shift 2 ;;
    --verbose)      VERBOSE=1; shift ;;
    --trace)        TRACE=1; shift ;;
    --log-level)    LOG_LEVEL_OPT="$2"; shift 2 ;;
    --inspect)      INSPECT=1; shift ;;
    --inspect-brk)  INSPECT_BRK=1; shift ;;
    --log-file)     LOG_FILE="$2"; shift 2 ;;
    --log-truncate) LOG_APPEND=0; shift ;;
    --no-color)     NO_COLOR_FLAG=1; shift ;;
    --open)         OPEN_BROWSER=1; shift ;;
    -b|--background) BACKGROUND=1; shift ;;
    --stop)         DO_STOP=1; shift ;;
    --restart)      DO_RESTART=1; BACKGROUND=1; shift ;;
    --status)       DO_STATUS=1; shift ;;
    --tail)         DO_TAIL=1; shift ;;
    --pid-file)     PID_FILE="$2"; shift 2 ;;
    --force-kill)   FORCE_KILL=1; shift ;;
    -h|--help)      show_help; exit 0 ;;
    --)             shift; break ;;
    -*)             echo "Unknown option: $1" >&2; show_help; exit 2 ;;
    *)              echo "Unexpected argument: $1" >&2; show_help; exit 2 ;;
  esac
done

[ "$VERBOSE" -eq 1 ] && [ -z "$DEBUG_MODULES" ] && DEBUG_MODULES="*"

# ----- logging helpers ------------------------------------------------------
if [ "$NO_COLOR_FLAG" -eq 1 ] || [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then
  C_CYAN=""; C_YELLOW=""; C_RED=""; C_GREEN=""; C_DIM=""; C_BOLD=""; C_RESET=""
else
  C_CYAN="\033[36m"; C_YELLOW="\033[33m"; C_RED="\033[31m"; C_GREEN="\033[32m"
  C_DIM="\033[90m"; C_BOLD="\033[1m"; C_RESET="\033[0m"
fi

step()  { printf '%b[dev]%b %s\n' "$C_CYAN" "$C_RESET" "$*"; }
ok()    { printf '%b[dev]%b %b✓%b %s\n' "$C_CYAN" "$C_RESET" "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '%b[dev]%b %b!%b %s\n' "$C_CYAN" "$C_RESET" "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()   { printf '%b[dev]%b %b✗%b %s\n' "$C_CYAN" "$C_RESET" "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

# ----- lifecycle helpers ----------------------------------------------------
read_pid() {
  [ -f "$PID_FILE" ] || { echo ""; return; }
  local pid
  pid=$(cat "$PID_FILE" 2>/dev/null | tr -d '[:space:]')
  echo "${pid:-}"
}

is_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

resolve_log_file() {
  # If user passed --log-file, honor it. Otherwise default when backgrounding.
  if [ -n "$LOG_FILE" ]; then
    return
  fi
  if [ "$BACKGROUND" -eq 1 ]; then
    LOG_FILE="$DEFAULT_LOG_FILE"
  fi
}

proc_uptime_seconds() {
  local pid="$1"
  if command -v ps >/dev/null 2>&1; then
    ps -o etimes= -p "$pid" 2>/dev/null | tr -d '[:space:]'
  fi
}

format_duration() {
  local sec="${1:-0}"
  if [ -z "$sec" ] || ! [[ "$sec" =~ ^[0-9]+$ ]]; then
    echo "?"
    return
  fi
  local d=$((sec / 86400)) h=$(((sec % 86400) / 3600)) m=$(((sec % 3600) / 60)) s=$((sec % 60))
  if [ $d -gt 0 ]; then printf '%dd %02dh%02dm' "$d" "$h" "$m"
  elif [ $h -gt 0 ]; then printf '%dh %02dm%02ds' "$h" "$m" "$s"
  elif [ $m -gt 0 ]; then printf '%dm %02ds' "$m" "$s"
  else printf '%ds' "$s"
  fi
}

cmd_status() {
  local pid
  pid=$(read_pid)
  if is_alive "$pid"; then
    ok "running"
    printf '  %bpid     %b %s\n' "$C_DIM" "$C_RESET" "$pid"
    printf '  %bpidfile %b %s\n' "$C_DIM" "$C_RESET" "$PID_FILE"
    if [ -f "$LOG_FILE" ] || [ -f "$DEFAULT_LOG_FILE" ]; then
      printf '  %blog     %b %s\n' "$C_DIM" "$C_RESET" "${LOG_FILE:-$DEFAULT_LOG_FILE}"
    fi
    local up
    up=$(proc_uptime_seconds "$pid")
    if [ -n "$up" ]; then
      printf '  %buptime  %b %s\n' "$C_DIM" "$C_RESET" "$(format_duration "$up")"
    fi
    if command -v lsof >/dev/null 2>&1; then
      local ports
      ports=$(lsof -an -p "$pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | tr '\n' ' ')
      if [ -n "$ports" ]; then
        printf '  %blisten  %b %s\n' "$C_DIM" "$C_RESET" "$ports"
      fi
    fi
    return 0
  fi
  if [ -f "$PID_FILE" ]; then
    warn "not running (stale pid file at $PID_FILE)"
    rm -f "$PID_FILE"
  else
    step "not running"
  fi
  return 1
}

cmd_stop() {
  local pid
  pid=$(read_pid)
  if ! is_alive "$pid"; then
    warn "no running instance (pid file: $PID_FILE)"
    [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    return 0
  fi
  if [ "$FORCE_KILL" -eq 1 ]; then
    step "killing pid $pid (SIGKILL)"
    kill -KILL "$pid" 2>/dev/null || true
  else
    step "stopping pid $pid (SIGTERM)"
    kill -TERM "$pid" 2>/dev/null || true
    local i
    for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do
      is_alive "$pid" || break
      sleep 0.3
    done
    if is_alive "$pid"; then
      warn "still alive after 5s, escalating to SIGKILL"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"
  ok "stopped"
}

cmd_tail_standalone() {
  local target="${LOG_FILE:-$DEFAULT_LOG_FILE}"
  if [ ! -f "$target" ]; then
    die "log file not found: $target"
  fi
  step "tailing $target (Ctrl+C to stop)"
  exec tail -n 100 -F "$target"
}

find_our_native_instances() {
  # Print one PID per line for any `node server.js` process whose cwd is $ROOT.
  # Matches by process identity rather than port, so orphans on any bound port
  # — or instances with a missing/stale PID file — are still detected.
  command -v ps >/dev/null 2>&1 || return 0

  local self_pid="$$"
  local pids
  pids="$(ps -ax -o pid=,command= 2>/dev/null \
    | awk '/server\.js/ && /node/ {print $1}' || true)"
  [ -z "$pids" ] && return 0

  local pid cwd
  for pid in $pids; do
    [ -z "$pid" ] && continue
    [ "$pid" = "$self_pid" ] && continue

    cwd=""
    if [ -r "/proc/$pid/cwd" ]; then
      cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || echo '')"
    elif command -v lsof >/dev/null 2>&1; then
      cwd="$(lsof -a -d cwd -p "$pid" -Fn 2>/dev/null \
        | awk '/^n/ { sub(/^n/, ""); print; exit }' || true)"
    fi

    if [ -n "$cwd" ] && [ "$cwd" = "$ROOT" ]; then
      printf '%s\n' "$pid"
    fi
  done
}

cleanup_native_instances() {
  # Stop every native ClaudeGUI instance of THIS repo before we start a new one.
  # Combines two signals so we don't miss anything:
  #   1. process-name + cwd match (find_our_native_instances)
  #   2. the PID recorded in $PID_FILE (covers hosts where cwd lookup fails,
  #      e.g. macOS without lsof permissions)
  local pids tracked all
  pids="$(find_our_native_instances || true)"
  tracked="$(read_pid)"
  if [ -n "$tracked" ] && ! is_alive "$tracked"; then
    tracked=""
  fi
  all="$(printf '%s\n%s\n' "$pids" "${tracked:-}" \
    | awk 'NF && !seen[$0]++' || true)"

  if [ -z "$all" ]; then
    [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    return 0
  fi

  local count
  count=$(printf '%s\n' "$all" | wc -l | tr -d '[:space:]')
  step "found $count existing ClaudeGUI instance(s) of this repo — cleaning up"

  local pid cmd
  for pid in $all; do
    is_alive "$pid" || continue
    cmd="$(ps -p "$pid" -o command= 2>/dev/null | head -c 80 | tr -d '\n' || true)"
    step "  pid $pid: SIGTERM (${cmd:-?})"
    kill -TERM "$pid" 2>/dev/null || true
  done

  local i still_alive
  for i in 1 2 3 4 5 6 7 8 9 10; do
    still_alive=0
    for pid in $all; do
      is_alive "$pid" && still_alive=1
    done
    [ "$still_alive" -eq 0 ] && break
    sleep 0.3
  done

  for pid in $all; do
    if is_alive "$pid"; then
      warn "pid $pid still alive after 3s, escalating to SIGKILL"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done

  [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
  ok "cleaned up existing instance(s)"
}

# ----- runtime helpers ------------------------------------------------------
read_runtime_state() {
  [ -f "$RUNTIME_STATE_FILE" ] || { echo ""; return; }
  cat "$RUNTIME_STATE_FILE" 2>/dev/null | tr -d '[:space:]'
}

write_runtime_state() {
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$1" > "$RUNTIME_STATE_FILE"
}

clear_runtime_state() {
  rm -f "$RUNTIME_STATE_FILE"
}

resolve_runtime() {
  # Explicit flag wins. Otherwise, for lifecycle-only commands (--stop/--status/
  # --tail/--restart), fall back to the runtime recorded on last launch so the
  # caller doesn't have to remember which backend is live. Default: native.
  if [ -n "$RUNTIME" ]; then
    return
  fi
  if [ "$DO_STOP" -eq 1 ] || [ "$DO_STATUS" -eq 1 ] || [ "$DO_TAIL" -eq 1 ] || [ "$DO_RESTART" -eq 1 ]; then
    local recorded
    recorded="$(read_runtime_state)"
    if [ -n "$recorded" ]; then
      RUNTIME="$recorded"
      return
    fi
  fi
  RUNTIME="native"
}

docker_cli() {
  command -v docker >/dev/null 2>&1 || die "docker is not on PATH"
  docker "$@"
}

compose_cli() {
  command -v docker >/dev/null 2>&1 || die "docker is not on PATH"
  # Prefer the v2 plugin (`docker compose`); fall back to legacy v1 binary.
  if docker compose version >/dev/null 2>&1; then
    docker compose -p "$COMPOSE_PROJECT_NAME" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -p "$COMPOSE_PROJECT_NAME" "$@"
  else
    die "neither 'docker compose' nor 'docker-compose' available"
  fi
}

kubectl_cli() {
  command -v kubectl >/dev/null 2>&1 || die "kubectl is not on PATH"
  kubectl "$@"
}

is_port_holder_ours() {
  # Return 0 if $1 (a PID listening on the target port) is an instance we
  # spawned previously, 1 otherwise. Used by --port-policy smart to decide
  # between reclaim (our own leftover) and shift (foreign service).
  local holder_pid="$1"
  [ -n "$holder_pid" ] || return 1

  # Signal 1 — tracked PID file for native/k8s port-forward matches exactly.
  local tracked_pid
  tracked_pid="$(read_pid)"
  if [ -n "$tracked_pid" ] && [ "$tracked_pid" = "$holder_pid" ]; then
    return 0
  fi

  # Signal 2 — a native `node server.js` process whose cwd is this repo.
  local holder_cmd
  holder_cmd="$(ps -p "$holder_pid" -o command= 2>/dev/null || true)"
  case "$holder_cmd" in
    *node*server.js*)
      local holder_cwd=""
      if [ -r "/proc/$holder_pid/cwd" ]; then
        holder_cwd="$(readlink "/proc/$holder_pid/cwd" 2>/dev/null || echo '')"
      elif command -v lsof >/dev/null 2>&1; then
        holder_cwd="$(lsof -a -d cwd -p "$holder_pid" -Fn 2>/dev/null \
          | awk '/^n/ { sub(/^n/, ""); print; exit }')"
      fi
      if [ -n "$holder_cwd" ] && [ "$holder_cwd" = "$ROOT" ]; then
        return 0
      fi
      ;;
  esac

  # Signal 3 — a docker container of ours currently binds this host port.
  # The host PID will be a docker-proxy or vpnkit helper (never matches our
  # tracked PID file), so we ask docker directly.
  if command -v docker >/dev/null 2>&1; then
    local bound
    bound="$(docker ps --format '{{.Names}}|{{.Ports}}' 2>/dev/null || true)"
    if [ -n "$bound" ]; then
      # Match "<name>|...:<PORT>->..." where name is our dev container or
      # a compose-project-owned service.
      if printf '%s\n' "$bound" \
        | grep -E "^(${DOCKER_CONTAINER_NAME}|${COMPOSE_PROJECT_NAME}[-_][a-z0-9]+[-_][0-9]+|${COMPOSE_PROJECT_NAME}-dev-[0-9]+)\|.*:${PORT_OPT}->" \
        >/dev/null; then
        return 0
      fi
    fi
  fi

  return 1
}

runtime_status() {
  case "$RUNTIME" in
    native) cmd_status; return $? ;;
    docker)
      if command -v docker >/dev/null 2>&1 && \
         docker ps --filter "name=^${DOCKER_CONTAINER_NAME}$" --format '{{.ID}}' 2>/dev/null | grep -q .; then
        ok "running (docker)"
        printf '  %bcontainer%b %s\n' "$C_DIM" "$C_RESET" "$DOCKER_CONTAINER_NAME"
        docker ps --filter "name=^${DOCKER_CONTAINER_NAME}$" \
          --format '  image:    {{.Image}}\n  ports:    {{.Ports}}\n  status:   {{.Status}}'
        return 0
      fi
      step "not running (docker)"
      return 1
      ;;
    compose)
      if command -v docker >/dev/null 2>&1 && \
         compose_cli ps -q dev 2>/dev/null | grep -q .; then
        ok "running (compose)"
        compose_cli ps
        return 0
      fi
      step "not running (compose)"
      return 1
      ;;
    k8s)
      if command -v kubectl >/dev/null 2>&1 && \
         kubectl_cli -n "$K8S_NAMESPACE" get deploy claudegui >/dev/null 2>&1; then
        ok "running (k8s)"
        kubectl_cli -n "$K8S_NAMESPACE" get deploy,svc,pod
        return 0
      fi
      step "not running (k8s)"
      return 1
      ;;
  esac
}

runtime_stop() {
  case "$RUNTIME" in
    native) cmd_stop ;;
    docker)
      if command -v docker >/dev/null 2>&1 && \
         docker ps -a --filter "name=^${DOCKER_CONTAINER_NAME}$" --format '{{.ID}}' 2>/dev/null | grep -q .; then
        step "stopping docker container $DOCKER_CONTAINER_NAME"
        if [ "$FORCE_KILL" -eq 1 ]; then
          docker kill "$DOCKER_CONTAINER_NAME" >/dev/null 2>&1 || true
        else
          docker stop -t 10 "$DOCKER_CONTAINER_NAME" >/dev/null 2>&1 || true
        fi
        docker rm -f "$DOCKER_CONTAINER_NAME" >/dev/null 2>&1 || true
        ok "stopped"
      else
        warn "no docker container named $DOCKER_CONTAINER_NAME"
      fi
      clear_runtime_state
      ;;
    compose)
      if command -v docker >/dev/null 2>&1; then
        step "docker compose down"
        compose_cli down --remove-orphans || true
        ok "stopped"
      fi
      clear_runtime_state
      ;;
    k8s)
      if command -v kubectl >/dev/null 2>&1; then
        step "kubectl delete -k $K8S_DIR"
        # Clean up any port-forward we started
        if [ -f "$PID_FILE" ]; then
          local pf_pid
          pf_pid="$(read_pid)"
          if is_alive "$pf_pid"; then
            kill -TERM "$pf_pid" 2>/dev/null || true
          fi
          rm -f "$PID_FILE"
        fi
        kubectl_cli delete -k "$K8S_DIR" --ignore-not-found=true || true
        ok "stopped"
      fi
      clear_runtime_state
      ;;
  esac
}

k8s_load_image_into_cluster() {
  # Best-effort: detect kind/minikube/k3d from the current context and push
  # the locally-built image into the cluster. Docker Desktop Kubernetes shares
  # the host docker daemon, so no load is required.
  local ctx
  ctx="$(kubectl_cli config current-context 2>/dev/null || echo '')"
  case "$ctx" in
    kind-*)
      if command -v kind >/dev/null 2>&1; then
        step "loading $DOCKER_IMAGE_TAG into kind cluster ($ctx)"
        kind load docker-image "$DOCKER_IMAGE_TAG" --name "${ctx#kind-}" || \
          warn "kind load failed — image may already be present"
      else
        warn "kind CLI not found; skipping image load (assume preloaded)"
      fi
      ;;
    minikube|minikube-*)
      if command -v minikube >/dev/null 2>&1; then
        step "loading $DOCKER_IMAGE_TAG into minikube"
        minikube image load "$DOCKER_IMAGE_TAG" || \
          warn "minikube image load failed — image may already be present"
      else
        warn "minikube CLI not found; skipping image load"
      fi
      ;;
    k3d-*)
      if command -v k3d >/dev/null 2>&1; then
        step "importing $DOCKER_IMAGE_TAG into k3d cluster"
        k3d image import "$DOCKER_IMAGE_TAG" -c "${ctx#k3d-}" || \
          warn "k3d image import failed — image may already be present"
      else
        warn "k3d CLI not found; skipping image load"
      fi
      ;;
    docker-desktop|docker-for-desktop|rancher-desktop)
      # Shares host docker daemon — nothing to do.
      ;;
    *)
      warn "unrecognized kube context '$ctx'; assuming image is already reachable"
      ;;
  esac
}

# ----- preconditions --------------------------------------------------------
# Resolve runtime early so we can gate node/npm checks to native launches.
resolve_runtime

if [ "$RUNTIME" = "native" ]; then
command -v node >/dev/null 2>&1 || die "node is not on PATH"
NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  die "Node.js >= 20 required (found v$(node -v))"
fi

# Next.js 15 SWC binaries are incompatible with Node >= 23. If detected,
# auto-switch to a Homebrew node@22 if available.
if [ "${NODE_MAJOR:-0}" -ge 23 ]; then
  NODE22=""
  for candidate in /opt/homebrew/opt/node@22/bin /usr/local/opt/node@22/bin; do
    if [ -x "$candidate/node" ]; then
      NODE22="$candidate"
      break
    fi
  done
  if [ -n "$NODE22" ]; then
    warn "Node $NODE_MAJOR detected — Next.js 15 requires <=22. Switching to $NODE22/node"
    export PATH="$NODE22:$PATH"
    NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
  else
    die "Node $NODE_MAJOR is incompatible with Next.js 15 SWC. Install Node 22: brew install node@22"
  fi
fi

command -v npm >/dev/null 2>&1 || die "npm is not on PATH"
else
  # Non-native: require the relevant runtime CLI. Node/npm are container-side.
  case "$RUNTIME" in
    docker)   command -v docker >/dev/null 2>&1 || die "docker is not on PATH" ;;
    compose)  command -v docker >/dev/null 2>&1 || die "docker is not on PATH" ;;
    k8s)      command -v kubectl >/dev/null 2>&1 || die "kubectl is not on PATH"
              command -v docker  >/dev/null 2>&1 || die "docker is not on PATH (required to build claudegui:dev)"
              ;;
    *)        die "unknown runtime: $RUNTIME" ;;
  esac
fi

# ----- standalone lifecycle commands (no prep, no launch) ------------------
if [ "$DO_STATUS" -eq 1 ]; then
  runtime_status
  exit $?
fi

if [ "$DO_STOP" -eq 1 ] && [ "$DO_RESTART" -eq 0 ]; then
  runtime_stop
  exit 0
fi

if [ "$DO_TAIL" -eq 1 ] && [ "$BACKGROUND" -eq 0 ] && [ "$DO_RESTART" -eq 0 ]; then
  case "$RUNTIME" in
    native)  cmd_tail_standalone ;;
    docker)  exec docker logs -f --tail 100 "$DOCKER_CONTAINER_NAME" ;;
    compose) compose_cli logs -f --tail 100 dev; exit 0 ;;
    k8s)     kubectl_cli -n "$K8S_NAMESPACE" logs -f --tail=100 deploy/claudegui; exit 0 ;;
  esac
fi

# --restart: stop first, then fall through to start (BACKGROUND already set)
if [ "$DO_RESTART" -eq 1 ]; then
  runtime_stop || true
fi

# Guard: clean up any existing native instance(s) of THIS repo before launching
# a new one. We match by process name + cwd (rather than port) so orphans on
# other ports — or instances whose PID file went missing — are also reclaimed,
# guaranteeing a clean start. --restart already ran runtime_stop above; calling
# again is idempotent and also catches anything it missed.
if [ "$RUNTIME" = "native" ]; then
  cleanup_native_instances
fi

# Warn on incompatible combinations
if [ "$BACKGROUND" -eq 1 ] && [ "$INSPECT_BRK" -eq 1 ]; then
  warn "--inspect-brk with --background: debugger will wait silently for attach"
fi

# ----- resolve port (host-side) ---------------------------------------------
# Policy (see PORT_POLICY):
#   smart (default) — detect whether the port holder is our own previous
#                     instance. If yes, reclaim (kill) it. If it's a foreign
#                     service, shift to the next free port so we don't kill
#                     someone else's dev server.
#   kill            — always kill whatever holds the port.
#   shift           — always leave the holder alone and pick the next free port.
# Applies to all runtimes; the host port is the same whether node runs
# natively or through docker/compose/k8s.
shift_to_next_free_port() {
  while lsof -ti tcp:"$PORT_OPT" >/dev/null 2>&1; do
    local next=$((PORT_OPT + 1))
    warn "port $PORT_OPT is in use, trying $next"
    PORT_OPT=$next
  done
}

reclaim_port() {
  local pids="$1"
  warn "reclaiming port $PORT_OPT from pid(s): $pids"
  # shellcheck disable=SC2086
  kill -TERM $pids 2>/dev/null || true
  sleep 0.5
  # shellcheck disable=SC2086
  kill -KILL $pids 2>/dev/null || true
  sleep 0.3
}

if command -v lsof >/dev/null 2>&1; then
  HOLDER_PIDS="$(lsof -ti tcp:"$PORT_OPT" 2>/dev/null || true)"
  if [ -n "$HOLDER_PIDS" ]; then
    case "$PORT_POLICY" in
      kill)
        reclaim_port "$HOLDER_PIDS"
        ;;
      shift)
        shift_to_next_free_port
        ;;
      smart)
        # Evaluate ownership against the first (usually only) holder PID.
        HOLDER_HEAD="$(printf '%s\n' "$HOLDER_PIDS" | head -n1)"
        if is_port_holder_ours "$HOLDER_HEAD"; then
          step "port $PORT_OPT is held by our previous instance (pid $HOLDER_HEAD) — reclaiming"
          reclaim_port "$HOLDER_PIDS"
        else
          HOLDER_DESC="$(ps -p "$HOLDER_HEAD" -o command= 2>/dev/null | head -c 80 || echo '?')"
          warn "port $PORT_OPT is held by a foreign process (pid $HOLDER_HEAD: $HOLDER_DESC) — shifting"
          shift_to_next_free_port
        fi
        ;;
    esac
  fi
else
  warn "lsof not available, cannot check for existing process on port $PORT_OPT"
fi
export PORT="$PORT_OPT"

# ----- host-side prep (native runtime only) ---------------------------------
# Clean/install/check/lint/test/build run inside the container for docker/
# compose/k8s. When those runtimes are selected, warn once if the user passed
# host-targeted prep flags so they can drop them or switch to --native.
if [ "$RUNTIME" != "native" ]; then
  if [ "$DO_CLEAN$DO_INSTALL$DO_CHECK$DO_LINT$DO_TEST$DO_BUILD" != "000000" ]; then
    warn "--clean/--install/--check/--lint/--test/--build run on the host and are skipped for runtime=$RUNTIME"
    warn "Run them with --native, or exec into the container (e.g. 'docker compose exec dev npm run lint')"
  fi
else
  # ----- clean --------------------------------------------------------------
  if [ "$DO_CLEAN" -eq 1 ]; then
    step "cleaning build artifacts"
    rm -rf .next tsconfig.tsbuildinfo node_modules/.cache playwright-report test-results
    ok "cleaned .next, tsconfig.tsbuildinfo, node_modules/.cache, playwright-report, test-results"
    DO_INSTALL=1
  fi

  # ----- install ------------------------------------------------------------
  if [ "$DO_INSTALL" -eq 1 ] || [ ! -d node_modules ]; then
    step "npm install"
    npm install --no-audit --no-fund
    ok "dependencies installed"
  elif [ -f package-lock.json ] && [ -f node_modules/.package-lock.json ]; then
    if [ package-lock.json -nt node_modules/.package-lock.json ]; then
      warn "package-lock.json is newer than node_modules — re-running npm install"
      npm install --no-audit --no-fund
    fi
  fi

  # ----- checks + tests -----------------------------------------------------
  [ "$DO_CHECK" -eq 1 ] && { step "type-check"; npm run type-check; ok "type-check passed"; }
  [ "$DO_LINT"  -eq 1 ] && { step "lint";       npm run lint;       ok "lint passed"; }
  [ "$DO_TEST"  -eq 1 ] && { step "unit tests"; npm test;           ok "unit tests passed"; }

  # ----- build --------------------------------------------------------------
  if [ "$DO_BUILD" -eq 1 ]; then
    step "next build"
    npm run build
    ok "build complete"
  fi
fi

# ----- env setup ------------------------------------------------------------
if [ "$MODE" = "prod" ]; then
  export NODE_ENV=production
  # Native prod needs a host build; container runtimes build inside the image.
  if [ "$RUNTIME" = "native" ]; then
    [ -d .next ] || die ".next/ not found — production mode requires a build. Re-run with --build."
  fi
else
  export NODE_ENV=development
fi

export HOST="$HOST_OPT"
export PORT="$PORT_OPT"
export LOG_LEVEL="$LOG_LEVEL_OPT"

if [ -n "$PROJECT_OPT" ]; then
  case "$PROJECT_OPT" in
    "~/"*) PROJECT_OPT="$HOME/${PROJECT_OPT#~/}" ;;
    "~")   PROJECT_OPT="$HOME" ;;
  esac
  if [ ! -d "$PROJECT_OPT" ]; then
    die "project path not found or not a directory: $PROJECT_OPT"
  fi
  PROJECT_OPT="$(cd "$PROJECT_OPT" && pwd)"
  export PROJECT_ROOT="$PROJECT_OPT"
fi

if [ -n "$DEBUG_MODULES" ]; then
  export CLAUDEGUI_DEBUG="$DEBUG_MODULES"
fi
if [ "$TRACE" -eq 1 ]; then
  export CLAUDEGUI_TRACE=1
fi
if [ "$NO_COLOR_FLAG" -eq 1 ]; then
  export NO_COLOR=1
fi

NODE_OPTS_EXTRA=""
if [ "$TRACE" -eq 1 ]; then
  NODE_OPTS_EXTRA="$NODE_OPTS_EXTRA --trace-warnings --stack-trace-limit=100"
fi
if [ "$INSPECT_BRK" -eq 1 ]; then
  NODE_OPTS_EXTRA="$NODE_OPTS_EXTRA --inspect-brk"
elif [ "$INSPECT" -eq 1 ]; then
  NODE_OPTS_EXTRA="$NODE_OPTS_EXTRA --inspect"
fi
if [ -n "$NODE_OPTS_EXTRA" ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:-}${NODE_OPTIONS:+ }$NODE_OPTS_EXTRA"
fi

# ----- resolve log file + summary ------------------------------------------
resolve_log_file

INSPECT_STATE="off"
[ "$INSPECT" -eq 1 ] && INSPECT_STATE="on (9229)"
[ "$INSPECT_BRK" -eq 1 ] && INSPECT_STATE="break (9229)"

RUN_MODE_LABEL="foreground"
[ "$BACKGROUND" -eq 1 ] && RUN_MODE_LABEL="background (detached)"

step "launching ClaudeGUI"
printf '  %brun     %b %s\n' "$C_DIM" "$C_RESET" "$RUN_MODE_LABEL"
printf '  %bmode    %b %s\n' "$C_DIM" "$C_RESET" "$MODE"
printf '  %bhost    %b %s\n' "$C_DIM" "$C_RESET" "$HOST_OPT"
printf '  %bport    %b %s\n' "$C_DIM" "$C_RESET" "$PORT_OPT"
printf '  %bproject %b %s\n' "$C_DIM" "$C_RESET" "${PROJECT_ROOT:-(server cwd)}"
printf '  %bdebug   %b %s\n' "$C_DIM" "$C_RESET" "${DEBUG_MODULES:-off}"
printf '  %btrace   %b %s\n' "$C_DIM" "$C_RESET" "$([ "$TRACE" -eq 1 ] && echo on || echo off)"
printf '  %binspect %b %s\n' "$C_DIM" "$C_RESET" "$INSPECT_STATE"
printf '  %bloglvl  %b %s\n' "$C_DIM" "$C_RESET" "$LOG_LEVEL_OPT"
printf '  %blogfile %b %s\n' "$C_DIM" "$C_RESET" "${LOG_FILE:-(foreground only)}"
if [ "$BACKGROUND" -eq 1 ]; then
  printf '  %bpidfile %b %s\n' "$C_DIM" "$C_RESET" "$PID_FILE"
fi

printf '  %bruntime %b %s\n' "$C_DIM" "$C_RESET" "$RUNTIME"

# ----- post-boot browser open (background launcher) -----------------------
if [ "$OPEN_BROWSER" -eq 1 ]; then
  (
    URL="http://$HOST_OPT:$PORT_OPT"
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      if curl -sS -o /dev/null "$URL/api/health" 2>/dev/null; then
        case "$(uname -s)" in
          Darwin) open "$URL" ;;
          Linux)  xdg-open "$URL" >/dev/null 2>&1 || true ;;
        esac
        break
      fi
      sleep 0.5
    done
  ) &
fi

# ----- runtime dispatch (docker / compose / k8s) ---------------------------
# For non-native runtimes, everything from here to EOF is handled in its own
# branch and the script exits. Native launch continues below.
if [ "$RUNTIME" = "docker" ]; then
  # Build the dev image if missing.
  if ! docker_cli image inspect "$DOCKER_IMAGE_TAG" >/dev/null 2>&1; then
    step "building $DOCKER_IMAGE_TAG (dev target)"
    docker_cli build --target dev -t "$DOCKER_IMAGE_TAG" "$ROOT"
    ok "image built"
  fi

  # Remove any prior container so port re-bind is clean.
  if docker_cli ps -a --filter "name=^${DOCKER_CONTAINER_NAME}$" --format '{{.ID}}' | grep -q .; then
    step "removing stale container $DOCKER_CONTAINER_NAME"
    docker_cli rm -f "$DOCKER_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi

  write_runtime_state docker

  DOCKER_RUN_ARGS=(
    --name "$DOCKER_CONTAINER_NAME"
    --init
    --rm
    -p "${HOST_OPT}:${PORT_OPT}:3000"
    -v "${ROOT}:/app:cached"
    -v "claudegui_node_modules:/app/node_modules"
    -v "claudegui_next_cache:/app/.next"
    -e "NODE_ENV=${NODE_ENV}"
    -e "HOST=0.0.0.0"
    -e "PORT=3000"
    -e "LOG_LEVEL=${LOG_LEVEL_OPT}"
    -e "CLAUDEGUI_DEBUG=${DEBUG_MODULES}"
    -e "CLAUDEGUI_TRACE=${CLAUDEGUI_TRACE:-}"
  )
  [ -n "${PROJECT_ROOT:-}" ]        && DOCKER_RUN_ARGS+=(-e "PROJECT_ROOT=${PROJECT_ROOT}")
  [ -n "${ANTHROPIC_API_KEY:-}" ]   && DOCKER_RUN_ARGS+=(-e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}")
  [ -n "${ANTHROPIC_AUTH_TOKEN:-}" ]&& DOCKER_RUN_ARGS+=(-e "ANTHROPIC_AUTH_TOKEN=${ANTHROPIC_AUTH_TOKEN}")

  if [ "$BACKGROUND" -eq 1 ]; then
    step "starting detached container $DOCKER_CONTAINER_NAME"
    docker_cli run -d "${DOCKER_RUN_ARGS[@]}" "$DOCKER_IMAGE_TAG" >/dev/null
    ok "started"
    printf '  %burl     %b %s\n' "$C_DIM" "$C_RESET" "http://$HOST_OPT:$PORT_OPT"
    printf '  %blogs    %b %s --tail\n' "$C_DIM" "$C_RESET" "$0"
    if [ "$DO_TAIL" -eq 1 ]; then
      exec docker logs -f --tail 50 "$DOCKER_CONTAINER_NAME"
    fi
    exit 0
  else
    step "docker run (foreground, Ctrl+C stops)"
    DOCKER_ATTACH_FLAGS="-i"
    [ -t 0 ] && [ -t 1 ] && DOCKER_ATTACH_FLAGS="-it"
    exec docker run $DOCKER_ATTACH_FLAGS "${DOCKER_RUN_ARGS[@]}" "$DOCKER_IMAGE_TAG"
  fi
fi

if [ "$RUNTIME" = "compose" ]; then
  write_runtime_state compose

  # Pass host env into compose substitutions.
  export CLAUDEGUI_HOST_PORT="$PORT_OPT"
  export LOG_LEVEL="$LOG_LEVEL_OPT"
  export CLAUDEGUI_DEBUG="${DEBUG_MODULES:-}"
  [ "$TRACE" -eq 1 ] && export CLAUDEGUI_TRACE=1

  if [ "$MODE" = "prod" ]; then
    SERVICE="prod"
    COMPOSE_UP_ARGS=(--profile prod up --build)
  else
    SERVICE="dev"
    COMPOSE_UP_ARGS=(up --build)
  fi

  if [ "$BACKGROUND" -eq 1 ]; then
    step "docker compose up -d ($SERVICE)"
    compose_cli "${COMPOSE_UP_ARGS[@]}" -d "$SERVICE"
    ok "started"
    printf '  %burl     %b %s\n' "$C_DIM" "$C_RESET" "http://$HOST_OPT:$PORT_OPT"
    printf '  %blogs    %b %s --tail\n' "$C_DIM" "$C_RESET" "$0"
    if [ "$DO_TAIL" -eq 1 ]; then
      compose_cli logs -f --tail 50 "$SERVICE"
    fi
    exit 0
  else
    step "docker compose up ($SERVICE, Ctrl+C stops)"
    exec docker compose -p "$COMPOSE_PROJECT_NAME" "${COMPOSE_UP_ARGS[@]}" "$SERVICE"
  fi
fi

if [ "$RUNTIME" = "k8s" ]; then
  # 1. Build dev image.
  step "building $DOCKER_IMAGE_TAG (dev target)"
  docker_cli build --target dev -t "$DOCKER_IMAGE_TAG" "$ROOT"

  # 2. Load into local cluster (best effort).
  k8s_load_image_into_cluster

  # 3. Render kustomization with host repo root substituted and apply.
  step "applying $K8S_DIR to $(kubectl_cli config current-context 2>/dev/null || echo '?')"
  kubectl_cli kustomize "$K8S_DIR" \
    | sed "s|__REPO_ROOT__|${ROOT}|g" \
    | kubectl_cli apply -f -

  # 4. Wait for rollout.
  step "waiting for deployment rollout"
  kubectl_cli -n "$K8S_NAMESPACE" rollout status deploy/claudegui --timeout=120s || \
    warn "rollout did not complete in 120s — continuing anyway"

  write_runtime_state k8s

  # 5. Port-forward from host.
  if [ "$BACKGROUND" -eq 1 ]; then
    resolve_log_file
    mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$PID_FILE")"
    step "port-forwarding ${HOST_OPT}:${PORT_OPT} → svc/claudegui:3000 (detached)"
    # shellcheck disable=SC2086
    nohup kubectl -n "$K8S_NAMESPACE" port-forward \
      --address "$HOST_OPT" svc/claudegui "${PORT_OPT}:3000" \
      >>"$LOG_FILE" 2>&1 < /dev/null &
    PF_PID=$!
    echo "$PF_PID" > "$PID_FILE"
    disown "$PF_PID" 2>/dev/null || true
    sleep 0.8
    if ! is_alive "$PF_PID"; then
      rm -f "$PID_FILE"
      die "port-forward died immediately — check $LOG_FILE"
    fi
    ok "started"
    printf '  %bpid     %b %s (port-forward)\n' "$C_DIM" "$C_RESET" "$PF_PID"
    printf '  %burl     %b %s\n' "$C_DIM" "$C_RESET" "http://$HOST_OPT:$PORT_OPT"
    printf '  %blogfile %b %s\n' "$C_DIM" "$C_RESET" "$LOG_FILE"
    if [ "$DO_TAIL" -eq 1 ]; then
      exec kubectl -n "$K8S_NAMESPACE" logs -f --tail=50 deploy/claudegui
    fi
    exit 0
  else
    step "port-forwarding ${HOST_OPT}:${PORT_OPT} → svc/claudegui:3000 (Ctrl+C stops)"
    exec kubectl -n "$K8S_NAMESPACE" port-forward \
      --address "$HOST_OPT" svc/claudegui "${PORT_OPT}:3000"
  fi
fi

# Everything below is native-runtime only.
write_runtime_state native

# ----- background run -------------------------------------------------------
if [ "$BACKGROUND" -eq 1 ]; then
  mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$PID_FILE")"

  if [ "$LOG_APPEND" -eq 0 ]; then
    : > "$LOG_FILE"
    step "truncated $LOG_FILE"
  fi

  # Write a header so concatenated logs stay readable across restarts.
  {
    printf '\n========================================================\n'
    printf ' ClaudeGUI %s start @ %s\n' "$MODE" "$(date '+%Y-%m-%d %H:%M:%S')"
    printf ' host=%s port=%s project=%s debug=%s\n' \
      "$HOST_OPT" "$PORT_OPT" "${PROJECT_ROOT:-(cwd)}" "${DEBUG_MODULES:-off}"
    printf '========================================================\n'
  } >> "$LOG_FILE"

  # setsid (Linux) cleanly detaches from controlling terminal; on macOS we
  # rely on nohup + stdin redirect to achieve the same effect.
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup node server.js >>"$LOG_FILE" 2>&1 < /dev/null &
  else
    nohup node server.js >>"$LOG_FILE" 2>&1 < /dev/null &
  fi
  BG_PID=$!
  echo "$BG_PID" > "$PID_FILE"
  disown "$BG_PID" 2>/dev/null || true

  # Give the process a beat and verify it didn't die immediately
  sleep 0.6
  if ! is_alive "$BG_PID"; then
    rm -f "$PID_FILE"
    die "process died immediately — check $LOG_FILE"
  fi

  # Health-check loop (not fatal; we still report success after timeout)
  URL="http://$HOST_OPT:$PORT_OPT/api/health"
  HEALTH_OK=0
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if curl -sS -o /dev/null "$URL" 2>/dev/null; then
      HEALTH_OK=1
      break
    fi
    sleep 0.5
  done

  if [ "$HEALTH_OK" -eq 1 ]; then
    ok "started (healthy)"
  else
    warn "started but health check timed out — check $LOG_FILE"
  fi

  printf '  %bpid     %b %s\n' "$C_DIM" "$C_RESET" "$BG_PID"
  printf '  %bpidfile %b %s\n' "$C_DIM" "$C_RESET" "$PID_FILE"
  printf '  %blogfile %b %s\n' "$C_DIM" "$C_RESET" "$LOG_FILE"
  printf '  %burl     %b %s\n' "$C_DIM" "$C_RESET" "http://$HOST_OPT:$PORT_OPT"
  printf '\n'
  printf '  %bstop:%b    %s --stop\n' "$C_DIM" "$C_RESET" "$0"
  printf '  %brestart:%b %s --restart [options]\n' "$C_DIM" "$C_RESET" "$0"
  printf '  %bstatus:%b  %s --status\n' "$C_DIM" "$C_RESET" "$0"
  printf '  %btail:%b    %s --tail\n' "$C_DIM" "$C_RESET" "$0"

  if [ "$DO_TAIL" -eq 1 ]; then
    printf '\n'
    step "following $LOG_FILE (Ctrl+C stops tailing; server keeps running)"
    exec tail -n 20 -F "$LOG_FILE"
  fi
  exit 0
fi

# ----- foreground run (default) --------------------------------------------
if [ -n "$LOG_FILE" ]; then
  mkdir -p "$(dirname "$LOG_FILE")"
  if [ "$LOG_APPEND" -eq 0 ]; then
    : > "$LOG_FILE"
  fi
  step "foreground + log file: $LOG_FILE"
  # Use `tee -a` so foreground + file stay in sync.
  set +e
  node server.js 2>&1 | tee -a "$LOG_FILE"
  EC=$?
  exit $EC
else
  exec node server.js
fi
