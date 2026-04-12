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
ICON_DIR="$HOME/.claudegui/icons"
LAUNCHER_SCRIPT="$HOME/.claudegui/bin/claudegui-launcher.sh"
NO_DESKTOP_ICON=0

YES=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --no-desktop-icon) NO_DESKTOP_ICON=1 ;;
    --help|-h)
      cat <<EOF
ClaudeGUI installer
  --yes              Non-interactive; assume yes to all prompts
  --dry-run          Print actions without executing
  --no-desktop-icon  Skip creating the desktop shortcut
  --help             Show this help
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

# --- Desktop launcher (FR-1100) -----------------------------------------
install_desktop_launcher() {
  local desktop_dir
  if command -v xdg-user-dir >/dev/null 2>&1; then
    desktop_dir=$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")
  else
    desktop_dir="$HOME/Desktop"
  fi

  if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$ICON_DIR" "$(dirname "$LAUNCHER_SCRIPT")" "$desktop_dir"
  fi

  # Copy icon assets from the freshly checked-out repo.
  for f in claudegui.svg claudegui-512.png claudegui-256.png claudegui-128.png claudegui.ico; do
    if [ -f "$INSTALL_DIR/public/branding/$f" ]; then
      run cp "$INSTALL_DIR/public/branding/$f" "$ICON_DIR/$f"
    fi
  done

  # Copy .icns for macOS .app bundle (generated by build-icons.mjs).
  if [ -f "$INSTALL_DIR/installer/tauri/src-tauri/icons/icon.icns" ]; then
    run cp "$INSTALL_DIR/installer/tauri/src-tauri/icons/icon.icns" "$ICON_DIR/icon.icns"
  fi

  # Write the launcher script (starts server, polls, opens browser, terminates on close).
  if [ "$DRY_RUN" -eq 0 ]; then
    cat > "$LAUNCHER_SCRIPT" <<LAUNCHER_BODY
#!/usr/bin/env bash
# ClaudeGUI desktop launcher
# Boots the production server, opens the default browser when ready,
# and terminates the server when this window closes.
set -eu
set -o pipefail

INSTALL_DIR="$INSTALL_DIR"
PORT="\${CLAUDEGUI_PORT:-\${PORT:-3000}}"
URL="http://localhost:\${PORT}"
LOG_DIR="\$HOME/.claudegui/logs"
mkdir -p "\$LOG_DIR"
LOG_FILE="\$LOG_DIR/launcher.log"

open_url() {
  case "\$(uname -s)" in
    Darwin) open "\$1" 2>/dev/null || true ;;
    Linux)  command -v xdg-open >/dev/null 2>&1 && xdg-open "\$1" >/dev/null 2>&1 || true ;;
  esac
}

cat <<BANNER

  ╭─────────────────────────────────────────────╮
  │   ClaudeGUI                                  │
  │   url   : \$URL
  │   log   : \$LOG_FILE
  │   stop  : close this window or press Ctrl+C  │
  ╰─────────────────────────────────────────────╯

BANNER

cd "\$INSTALL_DIR"
export NODE_ENV=production
export PORT

# Background opener: poll for readiness, then open default browser.
(
  for _ in \$(seq 1 60); do
    if curl -sfI "\$URL" -o /dev/null 2>/dev/null; then
      printf '\n[claudegui] server ready — opening %s\n\n' "\$URL"
      open_url "\$URL"
      exit 0
    fi
    sleep 0.5
  done
  printf '\n[claudegui] server did not become ready within 30s — open %s manually.\n' "\$URL"
) &

# Foreground server: log to file AND this terminal so the user sees activity.
node server.js 2>&1 | tee -a "\$LOG_FILE"
LAUNCHER_BODY
    chmod +x "$LAUNCHER_SCRIPT"
  fi
  log "Launcher script: $LAUNCHER_SCRIPT"

  case "$OS" in
    macos)
      local app_dir="$desktop_dir/ClaudeGUI.app"
      if [ "$DRY_RUN" -eq 0 ]; then
        rm -rf "$app_dir"
        mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources"

        # Info.plist
        cat > "$app_dir/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>ClaudeGUI</string>
  <key>CFBundleDisplayName</key>
  <string>ClaudeGUI</string>
  <key>CFBundleIdentifier</key>
  <string>com.claudegui.launcher</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>ClaudeGUI</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
</dict>
</plist>
PLIST

        # Executable — open Terminal.app with the launcher script
        cat > "$app_dir/Contents/MacOS/ClaudeGUI" <<EXEC
#!/usr/bin/env bash
# Opens a Terminal window running the ClaudeGUI launcher script.
open -a Terminal "$LAUNCHER_SCRIPT"
EXEC
        chmod +x "$app_dir/Contents/MacOS/ClaudeGUI"

        # Icon — copy .icns from icon cache
        if [ -f "$ICON_DIR/icon.icns" ]; then
          cp "$ICON_DIR/icon.icns" "$app_dir/Contents/Resources/AppIcon.icns"
        fi

        # Remove legacy .command if present
        rm -f "$desktop_dir/ClaudeGUI.command"
      fi
      log "Desktop app: $app_dir"
      ;;
    linux)
      local desktop_file="$desktop_dir/ClaudeGUI.desktop"
      if [ "$DRY_RUN" -eq 0 ]; then
        cat > "$desktop_file" <<DESKTOP
[Desktop Entry]
Type=Application
Name=ClaudeGUI
Comment=Web-based IDE wrapping Claude CLI
Exec=bash -c "x-terminal-emulator -e bash '$LAUNCHER_SCRIPT' || gnome-terminal -- bash '$LAUNCHER_SCRIPT' || konsole -e bash '$LAUNCHER_SCRIPT' || xterm -e bash '$LAUNCHER_SCRIPT'"
Icon=$ICON_DIR/claudegui.svg
Terminal=false
Categories=Development;IDE;
StartupNotify=true
DESKTOP
        chmod +x "$desktop_file"
        # GNOME 3.36+ requires the file to be marked trusted via this metadata.
        if command -v gio >/dev/null 2>&1; then
          gio set "$desktop_file" metadata::trusted true 2>/dev/null || true
        fi
      fi
      log "Desktop shortcut: $desktop_file"
      ;;
  esac
}

if [ "$NO_DESKTOP_ICON" -eq 1 ]; then
  log "Skipping desktop launcher (--no-desktop-icon)."
else
  install_desktop_launcher
fi

log "Install complete."
log "Run:  claudegui               # start on port 3000 (CLI)"
log "Run:  claudegui --project /path/to/project   # pre-select a project"
log "GUI:  double-click the ClaudeGUI shortcut on your Desktop"
