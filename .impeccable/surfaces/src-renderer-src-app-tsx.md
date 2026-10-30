---
version: 1
slug: "src-renderer-src-app-tsx"
primary_target: "src/renderer/src/App.tsx"
related_targets: ["src/renderer/src/components/Header.tsx","src/renderer/src/components/ChangesSidebar.tsx","src/renderer/src/components/DiffView.tsx","src/renderer/src/components/HistoryView.tsx","src/renderer/src/components/Celebration.tsx","src/renderer/src/components/Dialogs.tsx","src/renderer/src/components/RepoManagerDialog.tsx","src/renderer/src/components/Toasts.tsx","src/renderer/src/styles.css","src/renderer/src/view-transition.ts","src/renderer/src/store.ts"]
---

# Surface brief: Aspen main window (`src/renderer/src/App.tsx`)

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
Should the AI verb stay filled purple, or drop to a purple-bordered default button once the commit verb was measured against it? — RESOLVED: it stays a filled button, and its face is now #8250df in BOTH themes (a white label on the dark #a371f7 measured 3.35:1 and failed AA), with #a371f7 kept only for the agent's readout text and spinner. The commit verb's blue carries the same white label at 5.19:1 (light) / 4.63:1 (dark), so the two verbs read at equal weight and the desk still has exactly one purple object.

## Newcomer pass (progressive disclosure)

The strip and desk keep their composition; what changes is *when* complexity appears:

- **Strip:** Fetch / ↓ Pull / ↑ Push collapse into one context-aware **Sync split button** (behind → Pull, ahead/no-upstream → Push, else Fetch origin) whose caret menu always lists all three with their accelerators; `GitHub`, `Open in ▾` and `Add remote…` fold into a `⋯` overflow popover (the remote form expands inline). The push arm-ring moves with the Push verb. The "no upstream" mono hint retires — the route readout's tooltip says it whole.
- **Desk switch:** Review and History are permanent; Conflicts appears when anything waits (or an operation is mid-flight) and Stash when a stash exists; the desk falls back to Review when the tab under it retires.
- **Queue:** staged/unstaged badges render only once the staging area holds something (`progressive.ts`); a one-time three-step coach banner (workflow-banner hunk wash) rides above the list until the first commit, dismissible, gated by Preferences ▸ "Show tips for getting started" (`hintsEnabled`, main-process setting).
- **Tray:** the Push verb renders when it can act; a muted hint line appears under the scope line while a pre-first-commit user has nothing checked. ✨ Generate on an unconfigured agent opens Preferences with a pointer note instead of firing a doomed request.
- **First run:** entry verbs gain captions, and the four-step story appears under them with the same counter pills. Copy pass retires "worktree"/"no upstream" phrasing in visible prose.

Motion register untouched; no new tokens (hunk wash, counter pills, muted text only). Rules live in `src/renderer/src/progressive.ts` (unit-tested in `tests/progressive.test.ts`); dismissal flags ride in renderer localStorage (`gitdesk.hints.*`) like the layout widths.
