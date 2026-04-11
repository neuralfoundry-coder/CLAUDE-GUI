#!/usr/bin/env bash
# ClaudeGUI one-line installer for macOS / Linux.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/neuralfoundry-coder/CLAUDE-GUI/main/scripts/install/install.sh | bash
#   curl -fsSL ... | bash -s -- --yes        (non-interactive)
#   curl -fsSL ... | bash -s -- --dry-run    (inspect plan only)

set -euo pipefail

REPO_URL="${CLAUDEGUI_REPO:-https://github.com/neuralfoundry-coder/CLAUDE-GUI.git}"
INSTALL_DIR="${CLAUDEGUI_HOME:-$HOME/.claudegui/app}"
LAUNCHER="$HOME/.local/bin/claudegui"
BRANCH="${CLAUDEGUI_BRANCH:-main}"

YES=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      cat <<EOF
ClaudeGUI installer
  --yes       Non-interactive; assume yes to all prompts
  --dry-run   Print actions without executing
  --help      Show this help
EOF
      exit 0
      ;;
  esac
done

log() { printf '\033[36m[claudegui]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[claudegui]\033[0m %s\n' "$*" >&2; }
err() { printf '\033[31m[claudegui]\033[0m %s\n' "$*" >&2; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '\033[90m+ %s\033[0m\n' "$*"
  else
    "$@"
  fi
}

confirm() {
  if [ "$YES" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; then return 0; fi
  local prompt="$1"
  printf '%s [y/N] ' "$prompt"
  read -r reply < /dev/tty || reply=""
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

detect_os() {
  case "$(uname -s)" in
    Darwin) echo macos ;;
    Linux) echo linux ;;
    *) echo unsupported ;;
  esac
}

OS=$(detect_os)
if [ "$OS" = "unsupported" ]; then
  err "Unsupported OS: $(uname -s). Use the Windows installer or Docker."
  exit 1
fi

log "OS: $OS"
log "Install dir: $INSTALL_DIR"
log "Launcher: $LAUNCHER"

# --- Node.js ------------------------------------------------------------
need_node=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)
  if [ "${NODE_MAJOR:-0}" -ge 20 ]; then
    need_node=0
    log "Node.js $(node -v) detected"
  fi
fi

if [ "$need_node" -eq 1 ]; then
  warn "Node.js 20+ not found."
  if confirm "Install Node 20 via nvm?"; then
    run curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    # shellcheck disable=SC1090
    export NVM_DIR="$HOME/.nvm"
    if [ "$DRY_RUN" -eq 0 ] && [ -s "$NVM_DIR/nvm.sh" ]; then
      . "$NVM_DIR/nvm.sh"
      nvm install 20
      nvm use 20
    fi
  else
    err "Node.js is required. Aborting."
    exit 1
  fi
fi

# --- Build toolchain hint ------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
  warn "python3 not found — node-pty build may fail."
  case "$OS" in
    macos) warn "Install with: xcode-select --install" ;;
    linux) warn "Install with: sudo apt install build-essential python3" ;;
  esac
fi

# --- Clone / update ------------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating existing checkout at $INSTALL_DIR"
  run git -C "$INSTALL_DIR" fetch --depth=1 origin "$BRANCH"
  run git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  if [ -e "$INSTALL_DIR" ]; then
    err "$INSTALL_DIR exists and is not a git repo. Move or delete it first."
    exit 1
  fi
  log "Cloning $REPO_URL → $INSTALL_DIR"
  run git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

# --- npm install + build -------------------------------------------------
log "Installing dependencies (this may take a few minutes)"
run bash -c "cd '$INSTALL_DIR' && npm ci --no-audit --no-fund"

log "Building production bundle"
run bash -c "cd '$INSTALL_DIR' && npm run build"

# --- Claude CLI ----------------------------------------------------------
if ! command -v claude >/dev/null 2>&1; then
  warn "Claude CLI not found on PATH."
  if confirm "Install @anthropic-ai/claude-code globally via npm?"; then
    if npm config get prefix 2>/dev/null | grep -q "^/usr"; then
      warn "npm global prefix is a system path — sudo may be required."
      run sudo npm install -g @anthropic-ai/claude-code
    else
      run npm install -g @anthropic-ai/claude-code
    fi
  else
    warn "Skipping Claude CLI install. Install manually with: npm install -g @anthropic-ai/claude-code"
  fi
else
  log "Claude CLI detected: $(command -v claude)"
fi

# --- Launcher ------------------------------------------------------------
mkdir -p "$(dirname "$LAUNCHER")"
if [ "$DRY_RUN" -eq 0 ]; then
  cat > "$LAUNCHER" <<LAUNCHER_EOF
#!/usr/bin/env bash
# ClaudeGUI launcher
set -eu
export NODE_ENV=production
export PORT="\${PORT:-3000}"
if [ "\${1:-}" = "--project" ]; then
  export PROJECT_ROOT="\$2"
  shift 2
fi
cd "$INSTALL_DIR"
exec node server.js "\$@"
LAUNCHER_EOF
  chmod +x "$LAUNCHER"
fi
log "Launcher installed at $LAUNCHER"

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *)
    warn "$HOME/.local/bin is not on PATH. Add this to your shell rc:"
    warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

log "Install complete."
log "Run:  claudegui               # start on port 3000"
log "Run:  claudegui --project /path/to/project   # pre-select a project"
