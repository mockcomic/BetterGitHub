---
name: GitDesk
description: A workbench with a color life of its own — matte panels, hairline borders, git state as protagonist, and one named hue per duty.
colors:
  canvas: "#fbfcfe"
  panel: "#f2f5fa"
  header-surface: "#eaeef6"
  hover-surface: "#e3e9f3"
  selected-surface: "#daf4e4"
  hairline: "#ccd5e3"
  ink: "#1c2433"
  ink-muted: "#5f6b80"
  commit-green: "#1a7f37"
  commit-green-hover: "#21883a"
  beacon-blue: "#0969da"
  alarm-red: "#cf222e"
  caution-amber: "#9a6700"
  shelf-teal: "#0b6f7a"
  agent-violet: "#6639ba"
  add-wash: "#dafbe1"
  del-wash: "#ffebe9"
  hunk-wash: "#ddf4ff"
  scrim: "rgba(31, 35, 40, 0.42)"
  tint: "11%"
  tint-row: "8%"
  field-wash: "16%"
typography:
  display:
    fontFamily: "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 700
  headline:
    fontFamily: "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  title:
    fontFamily: "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  body:
    fontFamily: "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
  code:
    fontFamily: "'Cascadia Code', 'Consolas', 'SFMono-Regular', Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  xxs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
motion:
  instant: "90ms"
  fast: "140ms"
  layer: "200ms"
  slide: "220ms"
  arrive: "cubic-bezier(0.16, 1, 0.3, 1)"
  exit: "cubic-bezier(0.4, 0, 1, 1)"
  spectacle: "900ms"
components:
  button-primary:
    backgroundColor: "{colors.commit-green}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  button-primary-hover:
    backgroundColor: "{colors.commit-green-hover}"
  button-primary-destructive:
    backgroundColor: "{colors.alarm-red}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  button-ai:
    backgroundColor: "color-mix(agent-violet 10%, panel)"
    textColor: "{colors.agent-violet}"
  button-default:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  button-default-hover:
    backgroundColor: "{colors.hover-surface}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.beacon-blue}"
    padding: "2px 4px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  badge:
    backgroundColor: "{colors.header-surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "1px 6px"
  toast:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  dialog:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
---

# Design System: GitDesk

## Overview

**Creative North Star: "The Quiet Workbench"**

GitDesk presents itself as a well-lit workbench: everything the interface is made of — panels, headers, rails, status bars — is matte and deliberately unremarkable, so that the things permitted to speak loudly are the facts of the repository. A file's status letter, a green add-row in a diff, the ahead/behind count, the commit button. The system's restraint is not absence of personality; it is personality expressed as discipline. Depth comes from hairline borders, tonal surface shifts, and a single glow family reserved for things that are active *right now*. Color is not decoration either: each desk view owns a hue that says where you are sitting, and every other chromatic value names a git or task state.

Motion is the honest machine signal, and it is now continuous rather than occasional: controls answer the cursor, the desk switch slides its indicator to the active view, panes travel in the direction you were heading, floated layers arrive instead of blink in, and state changes (new rows, changed counts, an arriving conflict, a running operation) flag themselves. Tiers run 90/140/200/220 ms; the commit/push success celebration remains the one authored spectacle. Elevation is a single soft ambient shadow reserved strictly for things floating above the app, plus one glow language for interactive-active and view-active state.

The type system is a two-voice arrangement: the platform-native UI stack (Segoe UI on Windows) for human text, and a programmer's monospace (Cascadia Code) for machine truth — file paths, diffs, commit bodies, shortcut keys. Wherever monospace appears, it signals "this text is verbatim from your repository, do not paraphrase it." The system ships fully paired light and dark themes through one CSS custom-property contract; every token has a counterpart in the other theme. Dark is the primary composition — a low-chroma indigo-ink ground the hues read as signal light on — and light is composed independently on a cool porcelain ground at a higher color dosage, not an inversion.

**Key Characteristics:**
- Matte tonal surfaces separated by 1px hairline borders; chromatic color always names a duty (a git state, a task state, or a desk view).
- Git state is the protagonist: status glyphs, diff washes, badges, and the Commit button carry the meaning the interface is actually about.
- Multi-hue wayfinding: Review wears Commit Green, History Beacon Blue, Conflicts Alarm Red, Stash Shelf Teal; the AI agent is Agent Violet everywhere.
- One drop shadow (floating layers only) plus one glow language (focus rings, hover rings, the active-view indicator).
- Machine truth in monospace, human text in the system stack — the split is meaningful, never stylistic.
- Compact, instrument-panel density: 13px base, 4–16px spacing scale, a command strip over a 340px queue, dominant main pane, and a docked 300px commit tray.
- Light and dark themes are first-class equals driven by `html[data-theme]` custom properties, with per-theme color-dosage tokens (`--tint`, `--tint-row`, `--field`).

## Colors

The palette is GitHub-lineage in its semantic voices and extended with two named roles — Shelf Teal and Agent Violet — so that a parked stash and the AI agent are not forced into borrowed colors. Grounds are tinted (≤4% chroma): dark sits on low-chroma indigo ink, light on cool porcelain. The frontmatter carries the light theme as normative; the dark theme's counterparts are listed per token.

### Primary
- **Commit Green** (#1a7f37; dark `#3fb950`): the color of the verb. The commit button, staged confirmations, addition text, success toasts, active popover items, and the Review desk. Its rarity is its authority.
- **Commit Green Hover** (#21883a; dark `#4ecb5c`): the only hover shift Commit Green is allowed.

### Secondary
- **Beacon Blue** (#0969da; dark `#4493f8`): the voice of links, focus rings, busy states, renames, informational accents, and the History desk. Everything clickable that isn't committing.

### Tertiary
- **Alarm Red** (#cf222e; dark `#f85149`): deletions, conflicts, destructive affordances (discard turning red on hover, destructive confirmations), error banners, and the Conflicts desk.
- **Caution Amber** (#9a6700; dark `#d4a72c`): pre-commit warnings — an overlong summary, risky diffs, modified-file glyphs — never brand, never decoration.
- **Shelf Teal** (#0b6f7a; dark `#39c5cf`): stashed work only — parked, neither a working-tree change nor a commit. The Stash desk wears it.
- **Agent Violet** (#6639ba; dark `#a371f7`): the AI commit agent — its button, its hover ring, its busy readout. The one hue kept away from everything mechanical, so the different machine in the room is recognizable at a glance.

### Neutral
- **Canvas** (#fbfcfe; dark `#0b1120`): main-pane background and floating-layer faces.
- **Panel** (#f2f5fa; dark `#121a2b`): the working rail, sidebar, toolbars, gutter cells.
- **Header Surface** (#eaeef6; dark `#172033`): window header, sticky table title bars, status bar, default badges.
- **Hover Surface** (#e3e9f3; dark `#1c2740`): the background of any row or button under the cursor.
- **Selected Surface** (#daf4e4; dark `#12332a`): the Review desk's green selection; other desks take a wash of their own hue (`--view-selected`).
- **Hairline** (#ccd5e3; dark `#2a3652`): every 1px border and separator at rest; active boundaries use `--view-edge`.
- **Ink** (#1c2433; dark `#e8edf6`) / **Ink Muted** (#5f6b80; dark `#94a3bf`): primary and secondary text throughout.
- **Syntax palette** (GitHub's dark syntax colors, identical in both themes so a diff never re-lights): keyword/boolean #ff7b72, string #a5d6ff, comment #8b949e, function #d2a8ff, number/constant #79c0ff, entity #ffa657 — machine colors quoting the repository's contents, exempt from the state-hue roster because they name language tokens, not git state.
- **Diff washes** — **Add Wash** (#dafbe1; dark `#12261e`), **Del Wash** (#ffebe9; dark `#25171c`), **Hunk Wash** (#ddf4ff; dark `#12233a`): full-row backgrounds in the diff table, each paired with its semantic text color.
- **Scrim** (rgba(31, 35, 40, 0.42); dark `rgba(1, 4, 9, 0.6)`): the dialog overlay, and the only place `backdrop-filter` is allowed (4px blur).
- **Color dosage** — `--tint` (11% light / 8% dark) for chrome washes, `--tint-row` (8% / 6%) for row hovers, `--field` (16% / 12%) for the empty-pane field of light. The whiter light ground needs the larger dose for both themes to read the same way.

### View hues
`.app[data-view='…']` names one hue per desk — `--view-accent` with derived `--view-wash`, `--view-edge`, `--view-selected`, and `--view-glow` — and that hue colors the command-strip wash, the queue/tray rails, the switch indicator, selection washes, count badges, the diff title underline, and the scrollbars. Review → Commit Green, History → Beacon Blue, Conflicts → Alarm Red, Stash → Shelf Teal, no-repository → Beacon Blue. The hue says *where you are*, never what git thinks.

### Named Rules
**The Green-Belongs-to-Commit Rule.** Commit Green appears only on the commit action and its confirmations (staged badges, add-row text, success toasts). A generic primary button that does not commit must not wear it — and a confirmation that *destroys* work wears Alarm Red instead, so green never promises what it will not do.

**The Amber-Never-Shouts Rule.** Caution Amber is reserved for soft warnings that permit the user to continue. Anything that blocks or failed uses Alarm Red. Amber is never a brand or highlight color.

**The Named-Hues-Do-Jobs Rule.** Every chromatic value answers to a named role: the five semantic git/task voices, the two view-independent roles (Shelf Teal, Agent Violet), or the active desk's hue. A color with no role — no git state, no task state, no view identity — does not ship. Hue supplements state; it never replaces it (selection is wash + rail + weight, conflicts are still labelled, the active tab is still bolder).

## Typography

**Display Font:** System UI stack (`-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`) — the platform's own face; on Windows this is Segoe UI.
**Body Font:** Same system stack at 13px.
**Label/Mono Font:** Programmer's mono (`'Cascadia Code', 'Consolas', 'SFMono-Regular', Menlo, monospace`) at 12px.

**Icon glyphs** (the system's only pictograms, drawn from the platform's own characters, not an icon set): 14px for row-level quiet glyphs (discard ×, status marks), 16px for header icon buttons.

**Character:** Workbench utilitarian — small, dense, and confident. The human voice (system UI) is quiet and never displays more than once per screen; the machine voice (mono) carries the repository's verbatim truth. The pairing is functional, not decorative: switch fonts only when switching between "explaining" and "quoting the repo."

### Hierarchy
- **Display** (700, 30px): the empty-state/onboarding headline (`h1`), once per app lifetime screen at most. Solid ink — the wordmark never wears a gradient.
- **Headline** (700, 15px): dialog titles (`h2`).
- **Title** (600, 13px): file names in the changes list, section labels inside commit summaries, picker values, popover active items.
- **Body** (400, 13px): the app-wide default; diff content inherits mono at 12px/1.55 instead.
- **Label** (400, 11–12.5px, often Ink Muted): hints, timestamps, badges (10.5px), status bar (11.5px), uppercase section eyebrows at 10.5px with 0.04em letter-spacing, tinted 55% toward the view hue so an eyebrow names its desk.

### Named Rules
**The Two-Voice Rule.** System UI for prose the app wrote; monospace for text your repository wrote (paths, diffs, commit messages, `code` chips). Never blend them in one element.

**The 10.5px Floor.** No UI text renders below 10.5px; the density lives in spacing and truncation, not in shrinking type.

## Layout

The window is a fixed vertical sandwich: a ~44 px command strip on top, a ~38 px desk-switch rail beneath it, a flexible `.body` work area in the middle, and an 18-ish px status bar at the bottom. The command strip carries, left to right: repository picker, branch picker, the mono route readout (`branch ⇄ origin · ↑n ↓m` — silent when there is nothing to say), the contextual filter centered with its `Ctrl K` chip riding inside its right edge, and the sync controls (refresh, Fetch, Pull, Push, GitHub). The strip, the queue rail, the tray rail, and the status bar are all washed and edged with the active view's hue; the rest of the chrome stays neutral so the tint reads as location, not decoration. The body splits into three zones — a 340px **queue column** (the queue for the active view), a flexible **main pane** (diff, history, or stash detail) that owns `min-width: 0` so long paths ellipsize instead of breaking the rail, and a docked 300px **commit tray** (compose fields, scope line, full-width commit verb) that replaces itself with conflict guidance in the Conflicts view. History mirrors the pattern with a 280px commit-files column.

The spatial model is rails and rows, not cards: panes separate with 1px borders (hairline at rest, `--view-edge` where the view owns the boundary) and tonal steps (canvas → panel → header-surface); internal padding runs on the 4/6/8/10/12/16px scale, rows are 5px vertical, toolbars 6px, commit box 10px. Sticky-in-scroll elements (changes toolbar, diff title, commit-files head, truncation notice) pin within their pane and keep the header/panel background so content scrolls beneath them.

There is one deliberate responsive concession: below 1160px the queue and tray narrow to 290/260px, and below 980px (or the 1040-class windows it targets) the three zones stack vertically — queue on top (max-height 38%), work area, tray (max-height 46%) — because the desk must survive a daily-driver window that is not always wide. Everything else adapts by truncation (ellipsis, `min-width: 0`, `word-break`) and `max-width: min(92vw, 640px)` / `max-height: 88vh` caps on dialogs, plus `max-height: 480px` scroll caps on popovers.

## Elevation & Depth

Flat by default. Every structural boundary is a 1px border or a tonal surface shift; nothing is lifted to imply grouping. Two depth vocabularies exist and neither is decorative: one ambient shadow for things floating above the app, and one glow language for things that are active right now.

### Shadow Vocabulary
- **Float** (`0 8px 24px rgba(31, 35, 40, 0.16)` light; `rgba(1, 4, 9, 0.6)` dark): the only drop shadow in the system. Used by popovers, dialogs, toasts, and context menus. Its dark-theme deepening keeps the same geometry.
- **Glow** (`--focus-ring`, `--glow-hover`, `--view-glow`): the ring/halo family — a 3px color-mixed focus ring on inputs and buttons, a 1px hover shadow on lifted controls, and the active-view halo on the switch indicator and its badges. Glow marks state that is true at this instant; it never sits on a resting surface.
- **Scrim** (`--scrim`, plus 4px `backdrop-filter` blur): the full-viewport dialog overlay. The blur is the only blur in the app — the desk behind a dialog is present but silent.

### Named Rules
**The One Shadow And One Glow Rule.** One drop-shadow token, four consumers (popover, dialog, toast, context menu). Glow — rings and halos — is a separate language reserved for interactive-active and view-active state: focus, hover, the active tab and its badge, an avatar under the cursor. If it's in the document flow at rest, it gets a hairline border, not a shadow and not a glow.

**The Flat-By-Default Rule.** Surfaces are flat at rest; depth is reserved for state (floating layers, active things) and never for decoration. Hover-lift is the implemented expression: a 1 px raise with a faint shadow on `.btn`/`.icon-btn` hover, and a press that returns the control while scaling it to 0.97 — an interaction response, not rest-state elevation.

## Shapes

Gently softened rectangles throughout: 4px for `code` chips and inner menu items, 6px for all controls (buttons, inputs, selects, textarea, tabs, the sliding switch indicator), 8px for floating layers and inline banners, 10px reserved for the dialog shell (the most "app-modal" object gets the largest radius). Badges are true pills (`border-radius: 999px` with 1px × 6px padding); avatars are perfect circles. Scrollbar thumbs are 10px-wide rounded pills tinted 32% with the view hue (55% on hover) on a transparent track. Borders are 1px and near-always visible; separators inside menus are 1px Hairline rules with 4px margins. There are no notches, cutouts, or custom clip-paths — the silhouette language is "rounded rectangle, softly."

## Motion

Four tiers, all on transform/opacity/box-shadow/background-position only: `--motion-instant` 90 ms (cursor answers: color, lift, focus ring), `--motion-fast` 140 ms (rows, rails, small reveals), `--motion-layer` 200 ms (floated layers, hue crossfades), `--motion-slide` 220 ms (the switch indicator travelling, a desk view moving). Arrival curve `cubic-bezier(0.16, 1, 0.3, 1)`, exits on `cubic-bezier(0.4, 0, 1, 1)`. The 900 ms commit/push celebration stays the only spectacle; count pops run 240 ms and the conflict-badge arrival 420 ms, both once.

What moves: the switch indicator slides and re-tints between desks (measured from the DOM in `App.tsx`); desk swaps run through the View Transitions API (`withViewTransition` in `src/renderer/src/view-transition.ts`), travelling forward or backward per `html[data-nav-dir]`, with the keyed `.pane-enter` entrance as the no-API fallback; rows grow a status-hued left rail on hover/select; the commit verb lights a sheen across its face on hover; dialogs scrim-blur in; a conflicted badge announces itself once; the busy item carries a travelling hairline under its text. `prefers-reduced-motion: reduce` drops all travel and scale (and skips view transitions entirely), keeping fades, color state, and the spinners.

### Named Rules
**The Motion-Tiers Rule.** Four tiers, 90/140/200/220 ms, and the 900 ms celebration as the single long moment. Every motion must acknowledge an event — hover, press, arrival, state change, a view swap, a running operation. Looping motion stays reserved for spinners and the busy sheen. Each animation ships its `prefers-reduced-motion` path.

## Components

### Buttons
- **Shape:** Gently curved rectangles (6px), quiet 1px bordered defaults; label + optional glyph with 6px gap.
- **Primary (`.btn.primary`):** Commit Green with a lit top face (`linear-gradient` over the token), white text, border darkened via `color-mix(primary 70%, black)`; hover lifts 1 px, brightens, rings at 24% primary, and sweeps a sheen across the face (`background-position`, 220 ms) — no `overflow: clip`, so the celebration's confetti can still fly free. Pressed: returns to rest and scales to 0.97. Padding 5px × 12px; the commit button stretches full-width, centered.
- **Primary, destructive (`.btn.primary.destructive`):** same face in Alarm Red — the verb of a confirmation that throws work away (Discard, Delete, Drop, Abort).
- **Primary, disabled:** keeps a solid face dimmed by hue (40% green over panel), not by opacity, so the label holds its contrast.
- **Default (`.btn`):** Panel background, Hairline border, Ink text; hover shifts background to Hover Surface; disabled at 0.55 opacity.
- **AI (`.btn.ai`):** Agent Violet label on a 10% violet wash with a 42%-mixed border; hover deepens the wash and rings at 18% violet. The agent's button is the only violet thing in the tray.
- **Hover / Focus:** Hover raises the button 1 px with a faint ambient shadow alongside the color shift, all on 90 ms ease-out; keyboard focus gets the Beacon Blue 3px ring (`--focus-ring`) on buttons and inputs; pointer clicks never draw the ring.
- **Quiet variants:** `.mini` (accent-blue text, underline on hover, 12px), `.link` (button-styled accent link), `.icon-btn` (16px muted glyph button, lifts on hover).

### Badges & Status Glyphs
- **Style:** Pill badges (999px) at 10.5px; desk-switch badges take the view hue (`--view-wash` face, `--view-edge` border, `--view-accent` text), default badges stay Header Surface with muted text.
- **Status:** A 14px-wide monospace-ish letter column at the row head codes file state — new/deleted/conflicted/renamed/modified in the semantic palette (modified uses Amber as its only glyph color). Staged badges carry Commit Green text with a 45%-mixed border over a 12% wash and are clickable; unstaged are static.

### List Rows (files, commits, stashes, popovers, recent repos)
- **Style:** 5px × 10px padding, transparent bottom hairline, hover to a view-tinted Hover Surface, selected to the view's own wash (`--view-selected`; green on the Review desk). A selected or hovered file row grows a 2px left rail in its **status** hue (add/delete/conflict/rename/caution), not the view's — the row tells you what changed in it while the desk tells you where you are. Commit rows lead with a 24px circular avatar in 25%-tinted Beacon Blue, inset-ringed 35% and haloing on hover; file rows foreground the bold basename with the directory muted ahead of it. Hover-revealed actions (discard ×, branch actions) fade in from `opacity: 0`, and the discard × turns 90° as it goes red — a decision, not a decoration. Rows arrive with a capped 16ms stagger (six steps).

### Popovers & Menus
- **Style:** Canvas face, Hairline border, 8px radius, Float shadow, 4px padding; items are 7px × 10px with 6px radius, hover to a view-tinted Hover Surface, active item turns Commit Green 600-weight, danger items Alarm Red. Headers are uppercase 10.5px eyebrows; separators and inline filters allowed. Max height 480px with scroll; positioned 4px below their trigger.

### Desk Switch
- **Style:** Four ghost tabs (Review / History / Conflicts / Stash) riding on the switch rail — no borders at rest, Ink Muted labels — with one sliding indicator underneath the active tab: `--tab-x`/`--tab-w` measured from the DOM, tinted with the active view's hue (`--view-wash` face, `--view-edge` border, `--view-glow` halo) and travelling on `--motion-slide`. The active label is Ink at 600 weight, so hue is never the only signal. Non-active tabs take a faint view wash on hover. Count badges are 10.5px mono pills in the view hue; the Conflicts badge (and the tab's own label) turns Alarm Red only while conflicts exist, announcing itself once with a 420 ms arrival. Arrow keys cycle the switch; full ARIA tablist semantics with the work area as its tabpanel.

### Commit Tray (signature)
- **Style:** Docked 300px panel with a view-edged left hairline, a 45% view-hue inner rail, and a panel background washed 1× `--tint` at its top; 10px padding, 8px gaps: summary input, description textarea, then the **scope line** — mono, muted, `N of M files · +A −D` with the add count in add-green and the delete count in delete-red (git truth colored as git truth); then Generate (Agent Violet) and the full-width Commit Green commit verb. With nothing selected the tray says `0 of N · +0 −0` and the commit button is disabled: the verb that owns Green never promises what it will not do.

### Route Readout & Ctrl K Chip
- **Style:** The strip's signature mono readout `branch ⇄ origin`, the arrow tinted Beacon Blue, trailing `↑n ↓m` counts as git reports them; it renders nothing when it has nothing to say. The filter input carries a `Ctrl K` chip — mono 10.5px muted text in a Panel-background hairline pill — visible only while the field is empty and unfocused.

### Inputs & Fields
- **Style:** Canvas background, 1px Hairline border, 6px radius, 5px × 8px padding, full-width. Focus removes the outline and replaces it with a Beacon Blue border plus the 3px `--focus-ring`. Labels are 600-weight 13px with 11.5px muted hints beneath; fields stack at 12px gaps. Staging checkboxes take `accent-color: Commit Green` — checking a file is committing it.

### Dialogs
- **Style:** Canvas face, Hairline border, 10px radius, Float shadow, scrim behind (4px blur, the only blur in the app); capped at `min(92vw, 640px)` × 88vh. One documented wide variant exists for data-dense lists — the repository manager hub caps at `min(92vw, 720px)`; new dialogs must ask before going wide. Anatomy: head (12×16px, 15px bold title, ghost close, washed with the view hue and edged `--view-edge`), scrollable body (14×16px), foot of right-aligned buttons at 8px gaps — destructive confirmations paint their verb with `.btn.primary.destructive`.

### Toasts
- **Style:** Floating cards (8px radius, Float shadow, Hairline border) with a 4px severity stripe on the left edge — Alarm Red (error), Commit Green (success), Beacon Blue (info) — and a faint horizontal wash of the same hue fading by 42% across the card, so severity reads in peripheral vision. Stacked bottom-right above the status bar, max 420px, body text selectable, optional action row and quiet ×-close.

### Diff Table (signature)
- **Style:** Full-width collapsed monospace table at 12px/1.55; sticky Header-Surface title bar with the file path in mono, washed with the view hue and underlined `--view-edge`. The table fades in as one layer when a file changes (`--motion-fast`). Line-number gutters are 44px Panel cells with right-aligned muted digits; sign column 16px. Add/Del/Hunk rows take their semantic washes full-width; word-level highlights use 30%-mixed add/del tints at 2px radius, deletions struck through at 60% del-color. Split mode halves the pane at `calc(50% - 48px)` with an empty-side ghost at 0.55 opacity. Prism syntax colors ride GitHub's dark syntax palette in both themes. An empty work pane carries a quiet field of its view's light (`--field`) — readiness, not breakage.

### Status Bar & Busy Indicator
- **Style:** 3px × 10px Header-Surface strip washed with the view hue and edged `--view-edge` on top, 11.5px muted text items at 14px gaps. A busy item turns Beacon Blue, grows an 8px spinning ring (0.8s linear) and carries a 1px sheen travelling its width (1.2s) — the app's looping motion, reserved for "the machine is thinking"; the AI's own busy readout answers in Agent Violet so the two kinds of waiting look different.

## Do's and Don'ts

### Do:
- **Do** route every new surface through the `html[data-theme]` custom-property contract and the `.app[data-view]` hue contract; both themes must receive the same roles, and a new view must name a hue with a role.
- **Do** express structure with 1px borders and tonal steps (canvas → panel → header-surface) before reaching for any shadow, and reserve glow for focus, hover, and active-view state.
- **Do** reserve Commit Green for commit-and-confirmation semantics, Beacon Blue for interaction/focus/busy semantics, Alarm Red for destructive confirmations, Shelf Teal for stashed work, and Agent Violet for the agent.
- **Do** set repository-verbatim text (paths, diffs, commit messages, shortcut keys) in the mono stack, and UI prose in the system stack.
- **Do** use the Float shadow only for dismissible floating layers, and give new overlays 8–10px radius + 4px inner item radius like its siblings.
- **Do** express selection with a wash plus a status rail (and weight on the switch tab), never hue alone; state must survive someone seeing no color.
- **Do** truncate with ellipsis at `min-width: 0` rather than wrapping paths or breaking the 340px queue column.

### Don't:
- **Don't** introduce chromatic color that answers to no role: not a git state, not a task state, not the active desk. The palette is exhausted at Green/Blue/Red/Amber/Teal/Violet plus the three diff washes and the per-view hue.
- **Don't** add a second drop-shadow token, shadow an in-flow panel, or glow a resting surface; borders do that work, and blur belongs only to the dialog scrim.
- **Don't** display type larger than 30px or text smaller than 10.5px; density comes from the 4–16px spacing scale.
- **Don't** use Caution Amber for blockers/errors and Alarm Red for soft warnings — the severity ladder is fixed.
- **Don't** put package-UI webfonts or icon libraries on the product; the incumbent system uses the platform's own faces and glyph characters.
- **Don't** animate for decoration: every motion must acknowledge an event (hover, press, arrival of a layer/row/number, tab swap, running operation, success) and stay in the 90/140/200/220 ms tiers except the one authored commit/push celebration; looping motion is reserved for spinners and the busy sheen. Every animation needs a `prefers-reduced-motion` path that keeps fades and color state while dropping travel and scale.
- **Don't** use gradient text on headings, metrics, or the wordmark — the color story is told by washes, rails, and rings, not by painting type with gradients.
