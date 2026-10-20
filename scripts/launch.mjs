/**
 * Launches electron-vite with ELECTRON_RUN_AS_NODE removed from the
 * environment. When this variable is inherited (e.g. from a shell inside an
 * Electron-based app), electron.exe runs as plain Node and the app crashes
 * immediately with "Cannot read properties of undefined (reading
 * 'requestSingleInstanceLock')".
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const cli = [
  join(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
].find(existsSync)

if (cli === undefined) {
  console.error('electron-vite is not installed — run `npm install` first.')
  process.exit(1)
}

const args = process.argv.slice(2)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.electron_run_as_node
delete env.ELECTRON_EXEC_PATH
delete env.electron_exec_path
// Cursor/VS Code shells can launch Electron with a restricted sandbox.
// electron-vite turns this into --no-sandbox for the development child.
if (args.includes('dev')) {
  env.NO_SANDBOX = '1'
  env.ELECTRON_CLI_ARGS = JSON.stringify([
    `--user-data-dir=${join(process.cwd(), '.userdata-dev')}`
  ])
}

const child = spawn(process.execPath, [cli, ...args], {
  stdio: 'inherit',
  env
})
child.on('error', error => {
  console.error(`Could not start electron-vite: ${error.message}`)
  process.exitCode = 1
})
child.on('exit', code => {
  process.exit(code ?? 0)
})
