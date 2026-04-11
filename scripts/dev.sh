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
KILL_PORT=0
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

SERVER OPTIONS:
  --host <addr>        Bind host (default: 127.0.0.1, env: HOST)
  --port <n>           Bind port (default: 3000, env: PORT)
  --project <path>     Initial PROJECT_ROOT (absolute, ~ expansion supported)
  --kill-port          Kill any process currently bound to --port before start

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
    --host)         HOST_OPT="$2"; shift 2 ;;
    --port)         PORT_OPT="$2"; shift 2 ;;
    --project)      PROJECT_OPT="$2"; shift 2 ;;
    --kill-port)    KILL_PORT=1; shift ;;
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

# ----- preconditions --------------------------------------------------------
command -v node >/dev/null 2>&1 || die "node is not on PATH"
NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  die "Node.js >= 20 required (found v$(node -v))"
fi
command -v npm >/dev/null 2>&1 || die "npm is not on PATH"

# ----- standalone lifecycle commands (no prep, no launch) ------------------
if [ "$DO_STATUS" -eq 1 ]; then
  cmd_status
  exit $?
fi

if [ "$DO_STOP" -eq 1 ] && [ "$DO_RESTART" -eq 0 ]; then
  cmd_stop
  exit 0
fi

if [ "$DO_TAIL" -eq 1 ] && [ "$BACKGROUND" -eq 0 ] && [ "$DO_RESTART" -eq 0 ]; then
  cmd_tail_standalone
fi

# --restart: stop first, then fall through to start (BACKGROUND already set)
if [ "$DO_RESTART" -eq 1 ]; then
  cmd_stop || true
fi

# Guard: a running instance blocks a new background launch
if [ "$BACKGROUND" -eq 1 ]; then
  EXISTING_PID=$(read_pid)
  if is_alive "$EXISTING_PID"; then
    die "already running (pid $EXISTING_PID). Use --stop, --restart, or --status."
  fi
  [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
fi

# Warn on incompatible combinations
if [ "$BACKGROUND" -eq 1 ] && [ "$INSPECT_BRK" -eq 1 ]; then
  warn "--inspect-brk with --background: debugger will wait silently for attach"
fi

# ----- kill port ------------------------------------------------------------
if [ "$KILL_PORT" -eq 1 ]; then
  if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti tcp:"$PORT_OPT" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
      warn "killing existing process on port $PORT_OPT: $PIDS"
      # shellcheck disable=SC2086
      kill -TERM $PIDS 2>/dev/null || true
      sleep 0.5
      # shellcheck disable=SC2086
      kill -KILL $PIDS 2>/dev/null || true
    fi
  else
    warn "lsof not available, cannot --kill-port"
  fi
fi

# ----- clean ----------------------------------------------------------------
if [ "$DO_CLEAN" -eq 1 ]; then
  step "cleaning build artifacts"
  rm -rf .next tsconfig.tsbuildinfo node_modules/.cache playwright-report test-results
  ok "cleaned .next, tsconfig.tsbuildinfo, node_modules/.cache, playwright-report, test-results"
  DO_INSTALL=1
fi

# ----- install --------------------------------------------------------------
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

# ----- checks + tests -------------------------------------------------------
[ "$DO_CHECK" -eq 1 ] && { step "type-check"; npm run type-check; ok "type-check passed"; }
[ "$DO_LINT"  -eq 1 ] && { step "lint";       npm run lint;       ok "lint passed"; }
[ "$DO_TEST"  -eq 1 ] && { step "unit tests"; npm test;           ok "unit tests passed"; }

# ----- build ----------------------------------------------------------------
if [ "$DO_BUILD" -eq 1 ]; then
  step "next build"
  npm run build
  ok "build complete"
fi

# ----- env setup ------------------------------------------------------------
if [ "$MODE" = "prod" ]; then
  export NODE_ENV=production
  [ -d .next ] || die ".next/ not found — production mode requires a build. Re-run with --build."
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
