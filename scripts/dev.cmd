@echo off
setlocal
rem Run GitDesk in dev mode (hot reload) with a clean environment.
set "ELECTRON_RUN_AS_NODE="
set "electron_run_as_node="
cd /d "%~dp0.."
if not exist "node_modules\electron\dist\electron.exe" (
  echo First run: installing dependencies, please wait...
  call npm install || goto :eof
)
call npm run dev
endlocal
