/**
 * Pure diff logic for the repository watch folder (src/main/repo-scan.ts).
 * Kept free of fs/electron imports so the reconciliation rules are unit
 * testable: given what the watch folder currently holds and what the settings
 * list remembers, decide what to add, drop, and forget-deny.
 */

/**
 * Case-fold + slash-normalize a path for comparisons. Windows and macOS
 * filesystems are case-insensitive by default, so 'GitHub/Aspen' and
 * 'github/aspen' must read as the same folder there; on Linux casing is part
 * of the path. Backslashes normalize to '/' on every platform (settings.json
 * is hand-editable and may carry either).
 */
export function pathKey(rawPath: string): string {
  let key = rawPath.replace(/\\/g, '/')
  while (key.length > 1 && key.endsWith('/')) key = key.slice(0, -1)
  if (process.platform !== 'linux') key = key.toLowerCase()
  return key
}

/** Parent directory key of a pathKey; '' for a root or a bare name. */
export function parentKey(key: string): string {
  const cut = key.lastIndexOf('/')
  if (cut <= 0) return ''
  return key.slice(0, cut)
}

export interface ScannedEntry {
  /** {@link pathKey} of the folder. */
  readonly key: string
  /** The real path, as it should be stored/removed. */
  readonly path: string
}

export interface ScanPlanInput {
  /** pathKey of the watched folder itself. */
  readonly folderKey: string
  /** Git repos found as direct children of the watched folder. */
  readonly candidates: ReadonlyArray<ScannedEntry>
  /** Every stored repository path (filtered to the folder here). */
  readonly stored: ReadonlyArray<ScannedEntry>
  /** Paths the user manually removed from under the watched folder. */
  readonly dismissed: ReadonlyArray<ScannedEntry>
}

export interface ScanPlan {
  /** Candidate paths to store (new since last pass). */
  readonly toAdd: ReadonlyArray<string>
  /** Stored paths to drop (folder gone, or no longer a git repo). */
  readonly toRemove: ReadonlyArray<string>
  /**
   * Dismissed paths to forget: their folder is gone, so a future folder with
   * that name is a genuinely new repository and should be picked up again.
   */
  readonly toUnDismiss: ReadonlyArray<string>
}

/**
 * Reconcile the stored list with the watch folder. Only entries that live
 * directly under the watched folder are managed — a repo stored from anywhere
 * else keeps the manual rules (it can go 'missing', never auto-dropped), and
 * a repo the user removed by hand stays removed while its folder is there.
 */
export function planScan(input: ScanPlanInput): ScanPlan {
  const candidateKeys = new Set(input.candidates.map(c => c.key))
  const storedKeys = new Set(input.stored.map(s => s.key))
  const dismissedKeys = new Set(input.dismissed.map(d => d.key))

  const toAdd: string[] = []
  for (const c of input.candidates) {
    if (!storedKeys.has(c.key) && !dismissedKeys.has(c.key)) toAdd.push(c.path)
  }

  const toRemove: string[] = []
  for (const s of input.stored) {
    if (parentKey(s.key) !== input.folderKey) continue
    if (!candidateKeys.has(s.key)) toRemove.push(s.path)
  }

  const toUnDismiss: string[] = []
  for (const d of input.dismissed) {
    if (parentKey(d.key) !== input.folderKey) continue
    if (!candidateKeys.has(d.key) && !storedKeys.has(d.key)) {
      toUnDismiss.push(d.path)
    }
  }

  return { toAdd, toRemove, toUnDismiss }
}
