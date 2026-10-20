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

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.electron_run_as_node

const args = process.argv.slice(2)
const child = spawn(process.execPath, [cli, ...args], {
  stdio: 'inherit',
  env
})
child.on('exit', code => {
  process.exit(code ?? 0)
})
