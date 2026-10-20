// TEMP [dbg-vog] A/B probe: does launching an external program work from a process
// spawned by the harness shell at all, and specifically via Electron's shell APIs?
const electron = require('electron')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

const OUT = path.join(__dirname, 'probe-out.log')
const log = m => fs.appendFileSync(OUT, `[dbg-vog] ${m}\n`, 'utf8')

const { app, shell, BrowserWindow } = electron
app.setPath('userData', path.join(__dirname, 'userData'))

// Mirror the real app's window creation as closely as possible.
const win = new BrowserWindow({
  width: 400,
  height: 300,
  show: false,
  webPreferences: { sandbox: false }
})

app
  .whenReady()
  .then(async () => {
    log(`ready electron=${process.versions.electron} ELECTRON_RUN_AS_NODE=${JSON.stringify(process.env.ELECTRON_RUN_AS_NODE)}`)
    const url = 'https://github.com/mockcomic/Game-Engine'

    const r1 = await shell.openExternal(url).catch(e => `REJECT ${e}`)
    log(`1. shell.openExternal -> ${JSON.stringify(r1)} (typeof ${typeof r1})`)

    setTimeout(() => {
      execFile('cmd.exe', ['/c', 'start', '""', url], (err, stdout, stderr) => {
        log(`2. cmd /c start -> err=${err ? err.message : 'none'} out=${stdout.trim()} err2=${stderr.trim()}`)
        setTimeout(() => app.exit(0), 4000)
      })
    }, 2000)
  })
  .catch(err => {
    log(`whenReady rejected: ${err && err.stack ? err.stack : err}`)
    app.exit(1)
  })
