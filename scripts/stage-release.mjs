/**
 * Puts electron-builder output in release/ at the repo root.
 *
 * The Windows NSIS target has to launch the installer it just wrote in
 * order to extract the uninstaller. That process exits immediately when
 * the executable is inside this repository, so the build is staged in the
 * system temp directory and the finished files are moved into release/.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { cp, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const releaseDir = join(root, 'release')
const stageDir = join(tmpdir(), 'aspen-release-stage')
const builder = join(root, 'node_modules', 'electron-builder', 'cli.js')

if (!existsSync(builder)) {
  console.error('electron-builder is not installed — run `npm install` first.')
  process.exit(1)
}

await rm(stageDir, { recursive: true, force: true })
await mkdir(stageDir, { recursive: true })

const code = await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [builder, `--config.directories.output=${stageDir}`, ...process.argv.slice(2)],
    { stdio: 'inherit', cwd: root }
  )
  child.on('error', reject)
  child.on('exit', resolve)
})

if (code !== 0) {
  process.exit(code ?? 1)
}

await rm(releaseDir, { recursive: true, force: true })
await cp(stageDir, releaseDir, { recursive: true })
await rm(stageDir, { recursive: true, force: true })
console.log(`Wrote distributables to ${releaseDir}`)
