#!/bin/sh
# Run Aspen in dev mode (hot reload) with a clean environment.
# macOS/Linux counterpart of scripts/dev.cmd.
set -e
cd "$(dirname "$0")/.."
unset ELECTRON_RUN_AS_NODE electron_run_as_node
if [ ! -d node_modules/electron ]; then
  echo "First run: installing dependencies, please wait..."
  npm install
fi
exec npm run dev
