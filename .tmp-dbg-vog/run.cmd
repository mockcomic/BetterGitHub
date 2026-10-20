@echo off
set ELECTRON_RUN_AS_NODE=
cd /d C:\Users\KH-PC\Documents\GitHub\BetterGitHub
start "" node_modules\electron\dist\electron.exe . --user-data-dir=C:\Users\KH-PC\Documents\GitHub\BetterGitHub\.userdata --remote-debugging-port=9223
