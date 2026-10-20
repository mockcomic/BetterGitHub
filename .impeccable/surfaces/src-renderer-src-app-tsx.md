---
version: 1
slug: "src-renderer-src-app-tsx"
primary_target: "src/renderer/src/App.tsx"
related_targets: ["src/renderer/src/components/Header.tsx","src/renderer/src/components/ChangesSidebar.tsx","src/renderer/src/components/DiffView.tsx","src/renderer/src/components/HistoryView.tsx","src/renderer/src/store.ts"]
---

# Surface brief: GitDesk main window (`src/renderer/src/App.tsx`)

**Mode:** Operate. **Build path:** code-led (no image generation this round; ambition lives in this contract and is audited in behavior).

## Direction contract

THESIS: One typed control surface governs everything below it — a command strip (repo ▾ · branch ▾ · filter) over a segmented Review/History/Conflicts/Stash switch and a single contextual work area; it refuses the incumbent's fixed 400px sidebar-plus-panes rut.

OWN-WORLD: The Quiet Workbench, untouched: matte canvas/panel/header surfaces, 1px hairline borders, Commit Green reserved for the commit verb, Beacon Blue for interaction/focus/busy, mono (Cascadia/Consolas) for machine truth (paths, branch names, ahead/behind counts, scope line), one Float shadow for overlays only, 4–16px spacing, 10.5px floor, light/dark twins via `html[data-theme]`.

STORY: The visitor sees where they are (strip route readout in mono), what changed (queue), and exactly what will ship (tray scope line `N of M · +A −D`), then commits or ✨ Generates with one keystroke reachable from the strip; conflicts interrupt via the badge-count segment.

FIRST VIEWPORT: Full-width command strip row (repo picker, branch picker with mono ahead/behind, filter field, sync/settings/theme controls right); beneath it the 4-tab segmented switch; then the Review work area in three zones — file queue (left), diff canvas with sticky file title (center, dominant), docked commit tray (right, ~300px, compose + scope line + Commit full-width); status bar bottom with busy spinner. Signature move: the strip's mono branch ⇄ origin readout, doubling as the filter's host.

FORM: The Command Desk, one of three structures dealt by seed c6b51cf4 (surface/operate); locked on the decision board (optionId `command-desk`).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Scope boundaries

Untouched: dialogs, toasts, empty/onboarding visuals, `src/main/*`, typed IPC contract (no new channels without need), porcelain parsing, AI agent pipeline. No new fonts, icons, palette, or animation beyond the existing busy spinner.

Open (build-time): final strip-focus chord; Stash as segment (default) vs section.
