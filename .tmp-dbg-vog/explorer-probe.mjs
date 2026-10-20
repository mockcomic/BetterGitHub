// TEMP [dbg-vog] Does a GUI-process launch from this process tree fail the same
// way it does inside the running app? Run twice: polluted (default) and clean.
import { execFile } from 'child_process'

const clean = process.argv.includes('--clean')
if (clean) {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('ELECTRON_') || k.startsWith('DSH_')) delete process.env[k]
  }
}
const url = 'https://github.com/mockcomic/BetterGitHub'
execFile('explorer.exe', [url], (err, stdout, stderr) => {
  const code = err ? `${err.code} ${err.signal} ${err.message}` : 'ok'
  console.log(`[dbg-vog] mode=${clean ? 'clean' : 'polluted'} explorer.exe -> ${code}`)
  process.exit(0)
})
