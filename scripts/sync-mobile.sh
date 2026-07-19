#!/usr/bin/env bash
# The mobile PWA (docs/, served by GitHub Pages) reuses the desktop renderer.
# Run after changing frontend/render/*.js to keep the copies in sync.
set -euo pipefail
cd "$(dirname "$0")/.."
cp frontend/render/*.js docs/render/
echo "synced frontend/render -> docs/render"
