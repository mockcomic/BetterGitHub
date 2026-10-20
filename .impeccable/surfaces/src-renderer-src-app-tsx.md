---
version: 1
slug: "src-renderer-src-app-tsx"
primary_target: "src/renderer/src/App.tsx"
related_targets: ["src/renderer/src/components/Header.tsx","src/renderer/src/components/ChangesSidebar.tsx","src/renderer/src/components/DiffView.tsx","src/renderer/src/components/HistoryView.tsx","src/renderer/src/components/Celebration.tsx","src/renderer/src/components/Dialogs.tsx","src/renderer/src/styles.css","src/renderer/src/view-transition.ts","src/renderer/src/store.ts"]
---

# Surface brief: GitDesk main window (`src/renderer/src/App.tsx`)

**Mode:** Operate. **Build path:** code-led (no image generation this round; ambition lives in this contract and is audited in behavior).

## Direction contract

THESIS: One typed control surface governs everything below it — a command strip (repo ▾ · branch ▾ · filter) over a segmented Review/History/Conflicts/Stash switch and a single contextual work area; it refuses the incumbent's fixed 400px sidebar-plus-panes rut.

OWN-WORLD: The Quiet Workbench, with a color life of its own: matte canvas/panel/header surfaces (tinted — indigo ink in dark, cool porcelain in light), 1px hairline borders at rest and `--view-edge` where the active desk owns the boundary; every hue answers to a named role — Commit Green (the verb, staged, Review), Beacon Blue (interaction/focus/busy, History), Alarm Red (deletion, conflicts, destructive confirmations, Conflicts), Caution Amber (soft warnings, modified glyphs), Shelf Teal (stashed work, Stash), Agent Violet (the AI agent alone); the active desk's `--view-accent` washes the strip, rails, switch indicator, selection, badges, diff title edge, and scrollbars, while git state keeps its own colors and is never carried by hue alone (selection = wash + status rail; the active tab is also bold). Mono (Cascadia/Consolas) stays machine truth; one Float shadow for overlays only, one glow language for focus/hover/active-view; blur only on the dialog scrim. Motion is four tiers — 90/140/200/220 ms on the arrival curve — for cursor answers, row/rail reveals, floating layers, and the sliding tab indicator plus directional View Transitions between desks; the 900 ms commit/push celebration stays the single spectacle and spinners/busy-sheen the only loops; `prefers-reduced-motion` drops travel and scale, keeps fades and color. 4–16px spacing, 10.5px floor, light/dark twins via `html[data-theme]` with per-theme dosage tokens (`--tint`, `--tint-row`, `--field`).

STORY: The visitor sees where they are (strip route readout in mono), what changed (queue), and exactly what will ship (tray scope line `N of M · +A −D`), then commits or ✨ Generates with one keystroke reachable from the strip; conflicts interrupt via the badge-count segment.

FIRST VIEWPORT: Full-width command strip row (repo picker, branch picker with mono ahead/behind, filter field, sync/settings/theme controls right); beneath it the 4-tab segmented switch; then the Review work area in three zones — file queue (left), diff canvas with sticky file title (center, dominant), docked commit tray (right, ~300px, compose + scope line + Commit full-width); status bar bottom with busy spinner. Signature move: the strip's mono branch ⇄ origin readout, doubling as the filter's host.

FORM: The Command Desk, one of three structures dealt by seed c6b51cf4 (surface/operate); locked on the decision board (optionId `command-desk`).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Scope boundaries

Untouched: dialog/toast/empty-state structure, `src/main/*` logic, typed IPC contract (no new channels without need), porcelain parsing, AI agent pipeline. No new fonts or icons, no hosted webfonts (the CSP allows none), no third-party animation library. The aesthetic overhaul round explicitly widened two boundaries — palette (view hues + Shelf Teal + Agent Violet) and motion (the four tiers, the sliding indicator, View Transitions) — under the Named-Hues-Do-Jobs, One Shadow And One Glow, and Motion-Tiers rules in DESIGN.md; behavior (IPC, git operations, store semantics) stays out of scope, with the sole intentional logic additions being `view-transition.ts`, the measured tab indicator, and the `tone: 'danger'` flag on destructive confirmations.

Open (build-time): final strip-focus chord; Stash as segment (default) vs section.
