/**
 * The theme registry — the single source of truth for named palettes.
 *
 * Each id maps to one `html[data-theme='<id>']` block in
 * renderer/src/styles.css, which must define the complete token roster
 * (tests/themes.test.ts guards that contract). The base — 'light' or
 * 'dark' — is mirrored onto `html[data-theme-base]` so every palette
 * inherits the Primer block of its base for anything not overridden.
 *
 * `frame` carries the window-chrome half of each palette (the two
 * surfaces Electron paints natively: the content background and the
 * win32 caption strip). Those three values must stay equal to the
 * palette's --bg / --bg-header / --text in styles.css; the lockstep is
 * what keeps the OS-drawn chrome from ever reading as an off-theme box
 * (see the same note on framePalette's successor here and in DESIGN.md).
 */

export type ThemeBase = 'light' | 'dark'

/** A theme id with the automatic mode folded in. */
export type ThemeId = 'system' | ResolvedThemeId

/** A theme id that has been resolved to an actual palette. */
export type ResolvedThemeId =
  | 'light'
  | 'dark'
  | 'gruvbox-dark'
  | 'gruvbox-light'
  | 'nord'
  | 'one-dark'
  | 'one-light'
  | 'everforest-dark'
  | 'everforest-light'
  | 'dracula'
  | 'solarized-dark'
  | 'solarized-light'
  | 'tokyo-night'
  | 'catppuccin-mocha'

export interface ThemeFrame {
  /** The work ground (== the palette's --bg). */
  readonly ground: string
  /** The panel chrome / caption strip (== the palette's --bg-header). */
  readonly frame: string
  /** The caption button glyphs (== the palette's --text). */
  readonly symbols: string
}

export interface ThemeDescriptor {
  readonly id: ThemeId
  /** The label shown in the Preferences dropdown. */
  readonly label: string
  /** The palette family this theme inherits from. 'system' resolves
   *  this through the OS at runtime and never uses the stored value. */
  readonly base: ThemeBase | 'auto'
  /** Native window-chrome colors. Resolved by id at paint time. */
  readonly frame: ThemeFrame
}

interface Palette {
  readonly label: string
  readonly base: ThemeBase
  readonly frame: ThemeFrame
}

const PALETTES: Record<ResolvedThemeId, Palette> = {
  // Primer, unchanged — the app's normative palettes.
  light: {
    label: 'Light',
    base: 'light',
    frame: { ground: '#ffffff', frame: '#f6f8fa', symbols: '#1f2328' }
  },
  dark: {
    label: 'Dark',
    base: 'dark',
    frame: { ground: '#0d1117', frame: '#161b22', symbols: '#e6edf3' }
  },
  'gruvbox-dark': {
    label: 'Gruvbox Dark',
    base: 'dark',
    frame: { ground: '#1d2021', frame: '#282828', symbols: '#ebdbb2' }
  },
  'gruvbox-light': {
    label: 'Gruvbox Light',
    base: 'light',
    frame: { ground: '#fbf1c7', frame: '#ebdbb2', symbols: '#3c3836' }
  },
  nord: {
    label: 'Nord',
    base: 'dark',
    frame: { ground: '#2e3440', frame: '#3b4252', symbols: '#d8dee9' }
  },
  'one-dark': {
    label: 'One Dark (Atom)',
    base: 'dark',
    frame: { ground: '#282c34', frame: '#21252b', symbols: '#abb2bf' }
  },
  'one-light': {
    label: 'One Light (Atom)',
    base: 'light',
    frame: { ground: '#fafafa', frame: '#f0f0f1', symbols: '#383a42' }
  },
  'everforest-dark': {
    label: 'Everforest Dark',
    base: 'dark',
    frame: { ground: '#2f383e', frame: '#343f44', symbols: '#d3c6aa' }
  },
  'everforest-light': {
    label: 'Everforest Light',
    base: 'light',
    frame: { ground: '#f5f2e3', frame: '#e6e2d0', symbols: '#5c6a72' }
  },
  dracula: {
    label: 'Dracula',
    base: 'dark',
    frame: { ground: '#282a36', frame: '#21222c', symbols: '#f8f8f2' }
  },
  'solarized-dark': {
    label: 'Solarized Dark',
    base: 'dark',
    frame: { ground: '#002b36', frame: '#073642', symbols: '#93a1a1' }
  },
  'solarized-light': {
    label: 'Solarized Light',
    base: 'light',
    frame: { ground: '#fdf6e3', frame: '#eee8d5', symbols: '#586e75' }
  },
  'tokyo-night': {
    label: 'Tokyo Night',
    base: 'dark',
    frame: { ground: '#1a1b26', frame: '#16161e', symbols: '#a9b1d6' }
  },
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha',
    base: 'dark',
    frame: { ground: '#1e1e2e', frame: '#181825', symbols: '#cdd6f4' }
  }
}

/** The dropdown order: automatic, then the light family, then dark. */
export const THEME_ENTRIES: ReadonlyArray<{
  readonly id: ThemeId
  readonly label: string
  readonly group: 'auto' | 'light' | 'dark'
}> = [
  { id: 'system', label: 'System default', group: 'auto' },
  ...orderFor('light'),
  ...orderFor('dark')
]

function orderFor(base: ThemeBase): Array<{
  id: ThemeId
  label: string
  group: 'light' | 'dark'
}> {
  return (Object.keys(PALETTES) as ResolvedThemeId[])
    .filter(id => PALETTES[id].base === base)
    .map(id => ({ id, label: PALETTES[id].label, group: base }))
}

const ALL_IDS: readonly string[] = ['system', ...Object.keys(PALETTES)]

/** Guard for ids arriving from disk or the renderer — settings files are
 *  user-editable and the IPC layer is untyped JSON at its edges. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && ALL_IDS.includes(value)
}

export function themeLabel(id: ThemeId): string {
  return id === 'system' ? 'System default' : PALETTES[id].label
}

/** The light/dark family a setting resolves to. Callers pass the OS
 *  preference (matchMedia in the renderer, nativeTheme in main) — it is
 *  only consulted for 'system'. */
export function themeBase(id: ThemeId, prefersDark: boolean): ThemeBase {
  if (id !== 'system') return PALETTES[id].base
  return prefersDark ? 'dark' : 'light'
}

/** Resolve a setting to the concrete palette id whose CSS block applies. */
export function resolveThemeId(id: ThemeId, prefersDark: boolean): ResolvedThemeId {
  return id === 'system' ? (prefersDark ? 'dark' : 'light') : id
}

/** The window-chrome colors for a theme (resolved through the OS for
 *  'system'). Matches the same palette's --bg / --bg-header / --text. */
export function themeFrame(id: ThemeId, prefersDark: boolean): ThemeFrame {
  return PALETTES[resolveThemeId(id, prefersDark)].frame
}
