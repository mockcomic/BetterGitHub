@echo off
setlocal
rem Run Aspen (production build) with a clean environment, immune to
rem ELECTRON_RUN_AS_NODE inherited from VS Code/Cursor/harness shells.
set "ELECTRON_RUN_AS_NODE="
set "electron_run_as_node="
cd /d "%~dp0.."
if not exist "node_modules\electron\dist\electron.exe" (
  echo First run: installing dependencies, please wait...
  call npm install || goto :eof
)
if not exist "out\main\index.js" call npm run build
start "" "node_modules\electron\dist\electron.exe" "."
endlocal
