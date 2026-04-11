#!/usr/bin/env bash
# Fetches a bundled Node.js runtime for the current target triple and places
# the binary where tauri.conf.json expects it.
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-20.17.0}"
TARGET="${1:-}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/binaries"
mkdir -p "$OUT_DIR"

if [ -z "$TARGET" ]; then
  case "$(uname -sm)" in
    "Darwin arm64") TARGET="aarch64-apple-darwin" ;;
    "Darwin x86_64") TARGET="x86_64-apple-darwin" ;;
    "Linux x86_64") TARGET="x86_64-unknown-linux-gnu" ;;
    *) echo "Unsupported host. Pass target explicitly." >&2; exit 1 ;;
  esac
fi

case "$TARGET" in
  aarch64-apple-darwin)
    url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.gz"
    extract="node-v${NODE_VERSION}-darwin-arm64/bin/node"
    dest="$OUT_DIR/node-aarch64-apple-darwin"
    ;;
  x86_64-apple-darwin)
    url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.gz"
    extract="node-v${NODE_VERSION}-darwin-x64/bin/node"
    dest="$OUT_DIR/node-x86_64-apple-darwin"
    ;;
  x86_64-pc-windows-msvc)
    url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
    extract="node-v${NODE_VERSION}-win-x64/node.exe"
    dest="$OUT_DIR/node-x86_64-pc-windows-msvc.exe"
    ;;
  *)
    echo "Unsupported target: $TARGET" >&2; exit 1 ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading Node.js $NODE_VERSION for $TARGET"
curl -fsSL "$url" -o "$tmp/node.archive"
case "$url" in
  *.tar.gz) tar -xzf "$tmp/node.archive" -C "$tmp" ;;
  *.zip) (cd "$tmp" && unzip -q node.archive) ;;
esac

cp "$tmp/$extract" "$dest"
chmod +x "$dest"
echo "Wrote $dest"
