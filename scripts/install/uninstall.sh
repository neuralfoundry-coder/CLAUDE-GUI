#!/usr/bin/env bash
# ClaudeGUI uninstaller for macOS / Linux.
set -euo pipefail

INSTALL_DIR="${CLAUDEGUI_HOME:-$HOME/.claudegui/app}"
LAUNCHER="$HOME/.local/bin/claudegui"
STATE_DIR="$HOME/.claudegui"

YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
  esac
done

confirm() {
  if [ "$YES" -eq 1 ]; then return 0; fi
  printf '%s [y/N] ' "$1"
  read -r reply < /dev/tty || reply=""
  case "$reply" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

DESKTOP_DIR="$HOME/Desktop"

echo "This will remove:"
echo "  $INSTALL_DIR"
echo "  $LAUNCHER"
echo "  $STATE_DIR/state.json"
echo "  $DESKTOP_DIR/ClaudeGUI.app (if present)"
echo "  $DESKTOP_DIR/ClaudeGUI.command (legacy, if present)"

confirm "Continue?" || exit 0

rm -rf "$INSTALL_DIR"
rm -f "$LAUNCHER"
rm -f "$STATE_DIR/state.json"
rm -rf "$DESKTOP_DIR/ClaudeGUI.app"
rm -f "$DESKTOP_DIR/ClaudeGUI.command"

echo "ClaudeGUI removed."
echo "Note: Claude CLI (@anthropic-ai/claude-code) is left installed."
