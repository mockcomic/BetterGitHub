# Surface brief: GitDesk main window (`src/renderer/src/App.tsx`)

**Mode:** Operate. **Build path:** code-led (no image generation in this harness; ambition lives in this contract and is audited in behavior).

## Direction contract

THESIS: Keep the command desk the app already ships — a strip, a desk switch, and a queue | work area | commit tray sandwich — and render it in GitHub Desktop's own component family, so the tool reads as a sibling of the app it was studied from. It refuses the tinted per-desk wayfinding the previous world used (a hue per desk washing rails, badges and scrollbars) in favour of GitHub's single accent doing all interaction work.

OWN-WORLD: Primer, played straight. Light: white canvas, `#f6f8fa` chrome (strip, queue, tray, toolbars, status bar), `#d0d7de` hairlines with `#eaeef2` inside tables, ink `#1f2328` / `#656d76`. Dark: `#0d1117` canvas, `#161b22` chrome, `#30363d` hairlines, ink `#e6edf3` / `#7d8590`. One blue — `#0969da` / `#1f6feb` — for links, focus rings, the active tab, selected rows (solid accent, white label, GitHub Desktop's own list selection) and the commit verb. Green `#1a7f37`/`#238636` belongs to additions, staged badges, checkboxes and success only. Red `#cf222e` is deletions, conflicts and destructive verbs; amber `#9a6700` soft warnings; purple `#8250df` is the AI agent alone. Controls: 6px radius, 1px `rgba(31,35,40,0.15)` border, `0 1px 0 rgba(31,35,40,0.04)`; overlays 12px radius with Primer's two-layer shadow (`0 12px 28px rgba(140,149,159,0.3), 0 2px 4px rgba(140,149,159,0.1)`) and no blur behind them. Diff rows take GitHub's blob washes with tinted gutters (`#dafbe1`/`#e6ffec`, `#ffebe9`/`#ffd7d5`, `#ddf4ff`/`#b6e3ff`) and GitHub's dark syntax palette in both themes. System UI stack for prose, Cascadia/Consolas mono for repository-verbatim text.

STORY: Unchanged — where you are (strip + active tab), what changed (queue), exactly what ships (tray scope line `N of M · +A −D`), then Commit or Generate. The git facts, not the chrome, carry the color.

FIRST VIEWPORT: Unchanged composition, GitHub Desktop materials: full-width strip (repository ▾, branch ▾, mono `branch ⇄ origin · ↑n ↓m`, centered filter with its `Ctrl K` chip, refresh/Fetch/Pull/Push/GitHub), the desk switch as a segmented control row beneath it, then queue (340px) | diff with its sticky path header | 300px commit tray whose full-width blue verb is the loudest control on the desk, and the `#f6f8fa` status bar.

FORM: The category standard, played straight — the canon path, taken by the user's own words ("more like GitHub Desktop"); the craft bar is GitHub Desktop itself, with GitHub.com's Primer as its system source. No concept roll ran: a user-pinned direction beats the roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Scope boundaries

Untouched: layout and composition (per the user's answer), dialog/toast/empty-state structure, `src/main/*` logic, the typed IPC contract, porcelain parsing, the AI agent pipeline, all behavior. No new fonts, icons, or hosted webfonts (the CSP allows none), no third-party animation library.

This round's scope, stated by the user: styling and animation only. Motion is reduced to GitHub Desktop's register — instant color feedback, short fades for floated layers, the spinner, and the commit/push confetti; the sliding tab indicator's travel, directional view-transition travel, row stagger, hover-lift and icon rotation are removed. `--field`, `--tint`, `--tint-row` and the per-desk hue machinery leave with the world that used them.

Open: whether the AI verb should stay filled purple or drop to a purple-bordered default button once the commit verb's contrast is measured against it.
