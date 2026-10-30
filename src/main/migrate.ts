import { existsSync } from 'fs'
import { copyFile, mkdir, readdir } from 'fs/promises'
import { dirname, join } from 'path'
import { app } from 'electron'

/**
 * One-time relocation from the GitDesk identity to Aspen.
 *
 * Renaming `productName` moves Electron's default userData location (on
 * Linux ~/.config/GitDesk → ~/.config/Aspen, on Windows %APPDATA%\\GitDesk →
 * %APPDATA%\\Aspen). Everything the user owns lives under that directory —
 * settings, the repository list, account metadata and their encrypted token
 * sidecars, the crash log, the git-broker queue — so the first Aspen launch
 * copies the legacy directory forward, file by file, and only then does
 * anything read settings. Files that are also renamed (gitdesk-settings.json
 * → aspen-settings.json, gitdesk-accounts.json → aspen-accounts.json) are
 * mapped during the copy, so a settings read never sees the old names.
 *
 * The copy is non-destructive on purpose: the legacy directory is left in
 * place so a user who rolls back to GitDesk still has their data, and a
 * half-finished migration is idempotent (existing files are skipped).
 *
 * Not migrated, deliberately: the appId `com.kh.gitdesk` and the Windows
 * App User Model ID — they are update/signing compatibility identifiers and
 * the installed package (whose name is what the updater matches) keeps them.
 */

/** Copy every file under `from` into the current userData, mapping the
 *  renamed files. Returns the number of files brought forward. */
export async function migrateFromGitDesk(): Promise<number> {
  const to = app.getPath('userData')
  const legacy = join(dirname(to), 'GitDesk')
  if (legacy === to || !existsSync(legacy)) return 0

  const RENAMED: Record<string, string> = {
    'gitdesk-settings.json': 'aspen-settings.json',
    'gitdesk-accounts.json': 'aspen-accounts.json',
    'gitdesk-crash.log': 'aspen-crash.log'
  }

  let copied = 0
  await mkdir(to, { recursive: true })
  const entries: string[] = [legacy]
  while (entries.length > 0) {
    const dir = entries.pop() as string
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const src = join(dir, entry.name)
      const rel = src.slice(legacy.length + 1)
      const dstName = RENAMED[rel] ?? rel
      const dst = join(to, dstName)
      if (entry.isDirectory()) {
        entries.push(src)
        continue
      }
      if (existsSync(dst)) continue
      await mkdir(dirname(dst), { recursive: true })
      await copyFile(src, dst)
      copied++
    }
  }
  return copied
}
