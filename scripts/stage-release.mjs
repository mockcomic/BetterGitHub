/**
 * Puts electron-builder output in release/ at the repo root.
 *
 * The Windows NSIS target has to launch the installer it just wrote in
 * order to extract the uninstaller. That process exits immediately when
 * the executable is inside this repository, so the build is staged in the
 * system temp directory and the finished files are moved into release/.
 *
 * makensis resolves its own scratch space through GetTempPath (TMP/TEMP),
 * which silently falls back to C:\WINDOWS\TEMP under tokens whose user
 * environment did not flow through — and a non-writable fallback is the
 * "Error writing temporary file. Make sure your temp folder is valid."
 * dialog. The builder child is therefore handed a pinned TMP/TEMP inside
 * the staging dir, created fresh for this run, so the build never trusts
 * inherited temp variables no matter how dist is launched.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { cp, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const releaseDir = join(root, 'release')
const stageDir = join(tmpdir(), 'aspen-release-stage')
const stageTmp = join(stageDir, 'tmp')
const builder = join(root, 'node_modules', 'electron-builder', 'cli.js')

if (!existsSync(builder)) {
  console.error('electron-builder is not installed — run `npm install` first.')
  process.exit(1)
}

await rm(stageDir, { recursive: true, force: true })
await mkdir(stageTmp, { recursive: true })

const code = await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [builder, `--config.directories.output=${stageDir}`, ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      cwd: root,
      env: { ...process.env, TMP: stageTmp, TEMP: stageTmp, TMPDIR: stageTmp }
    }
  )
  child.on('error', reject)
  child.on('exit', resolve)
})

if (code !== 0) {
  process.exit(code ?? 1)
}

await rm(stageTmp, { recursive: true, force: true })
await rm(releaseDir, { recursive: true, force: true })
await cp(stageDir, releaseDir, { recursive: true })
await rm(stageDir, { recursive: true, force: true })
console.log(`Wrote distributables to ${releaseDir}`)
