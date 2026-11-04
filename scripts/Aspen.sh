#!/bin/sh
# Run Aspen (production build) with a clean environment, immune to
# ELECTRON_RUN_AS_NODE inherited from VS Code/Cursor/harness shells.
# macOS/Linux counterpart of scripts/Aspen.cmd.
set -e
cd "$(dirname "$0")/.."
unset ELECTRON_RUN_AS_NODE electron_run_as_node
if [ ! -d node_modules/electron ]; then
  echo "First run: installing dependencies, please wait..."
  npm install
fi
[ -f out/main/index.js ] || npm run build
exec node_modules/electron/dist/electron .
