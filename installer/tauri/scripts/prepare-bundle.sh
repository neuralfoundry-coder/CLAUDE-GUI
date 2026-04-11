#!/usr/bin/env bash
# Invoked by Tauri before build (see tauri.conf.json -> build.beforeBuildCommand).
# Collects all runtime assets that the Tauri bundler will embed as resources.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STAGE="$ROOT/installer/tauri/src-tauri/resources"
FRONT="$ROOT/installer/tauri/dist"

rm -rf "$STAGE" "$FRONT"
mkdir -p "$STAGE" "$FRONT"

echo "[prepare-bundle] Building Next.js production bundle"
(cd "$ROOT" && npm run build)

echo "[prepare-bundle] Copying runtime assets"
cp -R "$ROOT/.next" "$STAGE/.next"
cp -R "$ROOT/public" "$STAGE/public"
cp -R "$ROOT/server-handlers" "$STAGE/server-handlers"
cp "$ROOT/server.js" "$STAGE/server.js"
cp "$ROOT/package.json" "$STAGE/package.json"
cp "$ROOT/package-lock.json" "$STAGE/package-lock.json"
cp -R "$ROOT/scripts/installer-runtime" "$STAGE/installer-runtime"

# Install production dependencies into the staged directory so node_modules
# is bundled with the correct native builds for the bundled Node ABI.
echo "[prepare-bundle] npm ci --omit=dev in staged area"
(cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund)

# Tauri expects a "frontend dist" directory. We use a placeholder because the
# real frontend is served by the embedded Next.js server at runtime.
printf '<!doctype html><title>ClaudeGUI</title>' > "$FRONT/index.html"

echo "[prepare-bundle] Done"
