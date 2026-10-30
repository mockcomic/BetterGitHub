---
name: Aspen
description: GitHub Desktop's own component family — neutral chrome, hairline borders, one blue for interaction, and git state as the only loud thing on screen.
colors:
  canvas: "#ffffff"
  panel: "#f6f8fa"
  header-surface: "#f6f8fa"
  inset: "#eaeef2"
  hover-surface: "rgba(208, 215, 222, 0.32)"
  selected-surface: "#0969da"
  hairline: "#d0d7de"
  hairline-subtle: "#eaeef2"
  control-border: "rgba(31, 35, 40, 0.15)"
  ink: "#1f2328"
  ink-muted: "#656d76"
  accent-blue: "#0969da"
  accent-hover: "#0860ca"
  accent-active: "#0550ae"
  commit-blue: "#0969da"
  commit-blue-hover: "#0860ca"
  success-green: "#1a7f37"
  alarm-red: "#cf222e"
  alarm-red-hover: "#a40e26"
  caution-amber: "#9a6700"
  agent-violet: "#8250df"
  agent-violet-hover: "#6639ba"
  add-wash: "#dafbe1"
  add-gutter: "#e6ffec"
  del-wash: "#ffebe9"
  del-gutter: "#ffd7d5"
  hunk-wash: "#ddf4ff"
  hunk-gutter: "#b6e3ff"
  on-accent: "#ffffff"
  disabled-face: "#eff2f5"
  disabled-ink: "#8c959f"
  scrim: "rgba(31, 35, 40, 0.5)"
  word-add: "rgba(128, 191, 132, 0.3)"
  word-del: "rgba(255, 129, 130, 0.3)"
  word-del-strike: "rgba(255, 129, 130, 0.6)"
  scroll-thumb: "rgba(110, 118, 129, 0.4)"
  on-accent-chip: "rgba(255, 255, 255, 0.1)"
  on-accent-chip-border: "rgba(255, 255, 255, 0.45)"
  chip-face: "#ffffff"
  selected-hover: "#0860ca"
  ai-face: "#8250df"
  ai-face-hover: "#6639ba"
  syntax-keyword: "#cf222e"
  syntax-string: "#0a3069"
  syntax-comment: "#6e7781"
  syntax-function: "#8250df"
  syntax-constant: "#0550ae"
  syntax-entity: "#953800"
  syntax-keyword-dark: "#ff7b72"
  syntax-string-dark: "#a5d6ff"
  syntax-comment-dark: "#8b949e"
  syntax-function-dark: "#d2a8ff"
  syntax-constant-dark: "#79c0ff"
  syntax-entity-dark: "#ffa657"
  # App mark only — brand-asset colors, not UI roles (see Colors ▸ Brand Mark).
  aspen-green: "#215c4a"
  aspen-vein: "#fbf7ea"
  aspen-gold: "#e3ac38"
typography:
  display:
    fontFamily: "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 600
  headline:
    fontFamily: "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
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
  eyebrow:
    fontFamily: "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
  code:
    fontFamily: "'Cascadia Code', 'Consolas', 'SFMono-Regular', Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.55
  glyph:
    fontSize: "16px"
    fontWeight: 400
rounded:
  xxs: "2px"
  xs: "4px"
  sm: "6px"
  overlay: "12px"
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
  arrive: "cubic-bezier(0.16, 1, 0.3, 1)"
  spectacle: "900ms"
components:
  button-default:
    backgroundColor: "{colors.panel}"
    border: "1px solid {colors.control-border}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
    shadow: "0 1px 0 rgba(31, 35, 40, 0.04)"
  button-default-hover:
    backgroundColor: "#f3f4f6"
  button-default-disabled:
    backgroundColor: "{colors.disabled-face}"
    textColor: "{colors.disabled-ink}"
  button-primary:
    backgroundColor: "{colors.commit-blue}"
    border: "1px solid {colors.control-border}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
    shadow: "0 1px 0 rgba(31, 35, 40, 0.04)"
  button-primary-hover:
    backgroundColor: "{colors.commit-blue-hover}"
  button-primary-destructive:
    backgroundColor: "{colors.alarm-red}"
    textColor: "{colors.on-accent}"
  button-ai:
    backgroundColor: "{colors.agent-violet}"
    textColor: "{colors.on-accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent-blue}"
    padding: "2px 4px"
  icon-button-hover:
    backgroundColor: "{colors.hover-surface}"
  segmented-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  segmented-tab-active:
    backgroundColor: "{colors.canvas}"
    border: "1px solid color-mix(accent 40%, transparent)"
    textColor: "{colors.accent-blue}"
  input:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  counter-badge:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.control-border}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "2px 6px"
    fontSize: "10.5px"
  list-row:
    padding: "5px 10px"
  list-row-hover:
    backgroundColor: "{colors.hover-surface}"
  list-row-selected:
    backgroundColor: "{colors.selected-surface}"
    textColor: "{colors.on-accent}"
  popover:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.overlay}"
    shadow: "0 12px 28px rgba(140, 149, 159, 0.3), 0 2px 4px rgba(140, 149, 159, 0.1)"
    padding: "4px"
  dialog:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.overlay}"
    headBackgroundColor: "{colors.panel}"
  toast-banner:
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  diff-row-add:
    backgroundColor: "{colors.add-wash}"
    gutterBackgroundColor: "{colors.add-gutter}"
    lineTextColor: "{colors.success-green}"
  diff-row-del:
    backgroundColor: "{colors.del-wash}"
    gutterBackgroundColor: "{colors.del-gutter}"
    lineTextColor: "{colors.alarm-red}"
  diff-row-hunk:
    backgroundColor: "{colors.hunk-wash}"
    gutterBackgroundColor: "{colors.hunk-gutter}"
    textColor: "{colors.accent-blue}"
---

# Design System: Aspen

## Overview

**North Star: "GitHub Desktop, played straight."** Aspen is a clone of a specific tool, so it borrows that tool's face rather than inventing one: the chrome is Primer's — GitHub's own design system — and every color in the interface is GitHub's color for that job. The strip, the queue, the commit tray and the status bar are all the same `#f6f8fa` chrome; the work surface is canvas-white; every boundary is a 1px `#d0d7de` hairline. One blue (`#0969da`, dark `#1f6feb`) does all interaction work — links, focus rings, the active tab, the selected row, the commit verb. Green belongs to additions and success only, red to deletions and destructive verbs, amber to warnings you can continue past, and purple to the AI agent alone. What is left to speak loudly is the repository: a status symbol, a green add-row, the ahead/behind count, the diff.

The discipline is not imitation for its own sake. A clone earns trust by being legible in the same grammar as its reference: the same quiet ground, the same 6px controls, the same blue that means "this is the app's action." The personality of Aspen is that it gets out of git's way — and where it departs, it departs in GitHub's own vocabulary (the agent's purple is Primer's `done` accent, not an invention).

Motion is GitHub Desktop's register: nearly silent. Controls answer with color, never position — no lift, no travelling indicator, no staggered rows. The two completing verbs are the sole exception, and they move on state, never on place: Commit and Push press on a hair of scale and throw one short arm ring in their own hue the instant they flip from cannot to can — checking the first file arms Commit; a landed commit arms Push, the baton pass of the compose → commit → push story. Floated layers fade in with a hair of scale; the desk swap fades the incoming pane in; a running operation gets a spinner; and a commit or push that lands gets confetti. Everything else is already where it belongs.

The type system is a two-voice arrangement: the platform-native UI stack (Segoe UI on Windows — the same family GitHub Desktop ships) for human text at 13px, and a programmer's monospace (Cascadia Code) for machine truth — paths, diffs, commit messages, `code` chips, counts. Wherever mono appears, it says "this text is verbatim from your repository." Light and dark are first-class equals through one custom-property contract; dark is Primer's `#0d1117` desk, not an inversion of the light one.

**Key Characteristics:**
- Neutral chrome with tonal steps (canvas → panel → inset) separated by 1px hairlines; chromatic color always names a GitHub role.
- One accent, not a per-view palette: the desk you are on is stated by the active tab and the panel content, never by tinting the window.
- Git state is the protagonist: status symbols, GitHub's own diff washes and tinted gutters, counter pills, and the full-width blue commit verb.
- Selection is GitHub's: the row turns solid accent blue and its content inverts to white — a state that survives losing its color, because the file's status symbol and the row's weight do the naming.
- Buttons are Primer's: subtle face, 15%-ink hairline, a 1px lift shadow, 6px radius, and a color-only hover.
- Machine truth in monospace, human text in the system stack; 13px base, 4–16px spacing, 340px queue | dominant main pane | 300px commit tray — the two panels are drag-resizable from 220px to 480/420px and the chosen widths persist.
- The AI agent is the one self-expressive thing on the desk: a solid `#8250df` button in both themes, purple nowhere else.

## Colors

The palette is Primer's, quoted rather than paraphrased. The frontmatter carries the light theme as normative; every token's dark counterpart is listed below. Grounds are neutral, not tinted — the app has no wash, so the state colors are the only chromatic events on screen.

Two attributes drive the skin: `html[data-theme-base]` selects the Primer light or dark block below (every theme inherits its family for anything not redefined), and `html[data-theme]` names the active palette. Beyond the Primer `light`/`dark` (and `system`, which resolves them through the OS), the registry in `src/shared/themes.ts` carries named community palettes — Gruvbox, Nord, Atom One, Everforest, Dracula, Solarized, Tokyo Night, Catppuccin Mocha. Each is a complete re-ink, never a partial tint: same roster, same roles, the theme's own state colors as low-alpha washes, and the three frame colors main paints (window background and win32 caption) equal to the block's Canvas / Panel / Ink. The roster parity and lockstep are machine-checked in `tests/themes.test.ts`, so a theme can never leave a lone foreign token on the desk. Named themes may tint their ground — that is the point of them — but each palette still keeps exactly one accent doing navigation and one green/red pair doing diff state.

### Primary
- **Commit Blue / Accent** (#0969da; dark `#1f6feb` emphasis, `#2f81f7` on text): the commit button's face, the selected row's ground, links, focus rings, the active tab's label and chip border, the route arrow, and the busy spinner. Hover is `#0860ca` (dark `#388bfd`), active `#0550ae`.
- **Success Green** (#1a7f37; dark `#3fb950`): additions, staged checkboxes and badges, success banners, and the ring the commit button throws when a commit lands. It is never a generic "primary" color.

### Secondary
- **Alarm Red** (#cf222e; dark `#f85149`, destructive face `#da3633`): deletions, conflicts, error banners, and a confirmation that throws work away.
- **Caution Amber** (#9a6700; dark `#d4a72c`): soft warnings you can continue past — an overlong summary, risky diffs, the modified-file glyph. Never brand, never highlight.
- **Agent Violet** (#8250df; dark `#a371f7`): the AI agent alone. The button's face stays `#8250df` in both themes — a white label on `#a371f7` measures 3.35:1 and fails — while `#a371f7` is reserved for the agent's readout text and spinner. The one accent GitHub itself lets be decorative.

### Neutral
- **Canvas** (#ffffff; dark `#0d1117`): the work surface — main pane, popover and dialog faces, input fields, floating cards.
- **Panel** (#f6f8fa; dark `#161b22`): all chrome — command strip, queue column, commit tray, sticky table titles, status bar, default button faces.
- **Inset** (#eaeef2; dark `#010409`): wells and avatar discs.
- **Hover Surface** (rgba(208, 215, 222, 0.32); dark `rgba(177, 186, 196, 0.12)`): any row, tab, or icon button under the cursor. It is an alpha so it works on either ground.
- **Selected Surface** (#0969da; dark `#1f6feb`): the whole row of anything selected, with `--on-accent` white content and `rgba(255, 255, 255, 0.82)` secondary content (0.8 in dark).
- **Hairline** (#d0d7de; dark `#30363d`) and **Hairline Subtle** (#eaeef2; dark `#21262d`): every 1px border; the subtle step is for lines inside a table or card.
- **Control Border** (rgba(31, 35, 40, 0.15); dark `rgba(240, 246, 252, 0.1)`): the outline every bordered button wears, so button chrome stays identical across themes.
- **Ink** (#1f2328; dark `#e6edf3`) / **Ink Muted** (#656d76; dark `#7d8590`).
- **Disabled** (#eff2f5 face, #8c959f ink; dark `#31363e` / `#7d8590`): a disabled commit keeps a solid face rather than an opacity wash, so the label never goes translucent.
- **Diff washes and gutters** — Add `#dafbe1` on gutter `#e6ffec` (dark `#12261f` / `#0f2d16`), Del `#ffebe9` on gutter `#ffd7d5` (dark `#2d1214` / `#3d1a1c`), Hunk `#ddf4ff` on gutter `#b6e3ff` (dark `#16263c` / `#1b3050`). Unchanged line-number cells stay on the panel ground beneath the gutter's own hairline, exactly as GitHub Desktop's gutter column is drawn.
- **Word-level marks** — `--word-add` rgba(128, 191, 132, 0.3), `--word-del` rgba(255, 129, 130, 0.3), struck in `--word-del-strike` rgba(255, 129, 130, 0.6): Primer's own translucent pair, identical in both themes.
- **Syntax palette** — GitHub's own, re-lit per theme exactly as the real blob view does, held in `--syntax-*` tokens: light keyword #cf222e, string #0a3069, comment #6e7781, function #8250df, constant #0550ae, entity #953800; dark #ff7b72, #a5d6ff, #8b949e, #d2a8ff, #79c0ff, #ffa657. Exempt from the role roster because they name language tokens, not git state.
- **Scrim** (rgba(31, 35, 40, 0.5); dark `rgba(1, 4, 9, 0.68)`): the dialog overlay. No blur — GitHub Desktop dims and stays sharp.
- **Scrollbar** (rgba(110, 118, 129, 0.4), 0.7 on hover): a neutral pill thumb on a transparent track; it never takes a hue.

### Brand Mark (mark-only colors)
- **Aspen Green** (#215c4a): the app mark's leaf only — never a desk surface, panel, well, or text ground.
- **Aspen Gold** (#e3ac38): the app mark's single accent node only — fills that never take a UI role (the desk's interactive accent stays Commit Blue).

The mark's gold node is the brand's single accent, under a different contract than the desk's blue: exactly one node, once. These asset colors answer to the brand, not to UI roles; they appear nowhere else, and no UI surface borrows them.

### Named Rules
**The One Blue Rule.** One accent does all interaction: `#0969da` / `#1f6feb`. A desk, a panel, or a section never gets its own hue — the window does not change color when you change tabs, because GitHub Desktop's does not. What changes is which tab is lifted and which row is solid blue.

**The Green-Belongs-to-Additions Rule.** Green means "this was added, staged, or completed." It paints add-row text and gutters, the staging checkbox (`accent-color` green, because checking a file *is* committing it), the staged badge, and success banners. A generic button is blue; a button that destroys is red.

**The Purple-Belongs-to-the-Agent Rule.** `#8250df` appears on the Generate button and the agent's spinner and nowhere else, so the different machine in the room is recognizable at a glance.

**The Amber-Never-Shouts Rule.** Amber is for warnings you can continue past. Anything blocking or failed is red.

**The Named-Colors-Do-Jobs Rule.** Every chromatic value answers to one of the roles above. A color with no role — no state, no interaction, no agent — does not ship. Hue supplements state; it never replaces it (selection is solid accent *plus* the file's status symbol and the row's weight; conflicts are still labelled). The app mark's Aspen Green and Aspen Gold answer to the brand, not to UI roles — they are exempt from this roster and appear only on the mark, never on the desk.

## Typography

**Display Font:** System UI stack (`-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`) — the platform's own face, the same family GitHub Desktop ships.
**Body Font:** The same stack at 13px, weight 400; buttons and active tabs 500–600; file basenames and section titles 600.
**Label/Mono Font:** Programmer's mono (`'Cascadia Code', 'Consolas', 'SFMono-Regular', Menlo, monospace`) at 12px/1.55.

**Icon glyphs** (the system's only pictograms, drawn from platform characters, not an icon set): 16px for header icon buttons, 14px for row-level marks, 11px for the status symbols.

**Character:** GitHub's own — small, dense, matter-of-fact. Type never performs: the largest thing on screen is a 22px empty-state heading, and the loudest control is a button, not a headline.

### Hierarchy
- **Display** (600, 22px): the empty-state/onboarding heading, once per screen at most.
- **Headline** (600, 14px): dialog titles and the commit-detail subject line.
- **Title** (600, 13px): file basenames, picker values, active popover items.
- **Body** (400, 13px): the app-wide default; diff content takes mono 12px/1.55 instead.
- **Small** (400, 12.5px): banner and toast copy.
- **Label** (400, 11.5px): hints, timestamps, status bar, field hints.
- **Eyebrow** (600, 10.5px): uppercase section labels at 0.04em letter-spacing, mono counters, `code` chips, badge text.
- **Code** (400, 12px mono): everything quoted from the repository.

### Named Rules
**The Two-Voice Rule.** System UI for prose the app wrote; monospace for text your repository wrote (paths, diffs, commit messages, `code` chips, ahead/behind counts). Never blend them in one element.

**The 10.5px Floor.** No UI text renders below 10.5px; density comes from spacing and truncation, not from shrinking type.

## Layout

The window is a fixed vertical sandwich: a ~44px command strip on top, a ~38px desk-switch rail beneath it, a flexible `.body` work area in the middle, and an ~18px status bar at the bottom. The strip carries, left to right: repository picker, branch picker, the mono route readout (`branch ⇄ origin · ↑n ↓m`, silent when it has nothing to say), the contextual filter centered with its `Ctrl K` chip riding inside its right edge, and the sync controls (refresh, Fetch, Pull, Push, GitHub). The body splits into three zones — a 340px default **queue column**, a flexible **main pane** (diff, history, or stash detail) with `min-width: 0` so long paths ellipsize instead of breaking the rail, and a docked 300px default **commit tray** (compose fields, scope line, Generate, full-width commit verb) that swaps itself for conflict guidance in the Conflicts view. History mirrors the pattern with a 280px commit-files column. The two docked panels are drag-resizable between 220px and 480/420px by hairline dividers (`role="separator"`) at their inner edges — grip appears on hover/focus/drag only, the boundary stays a plain hairline at rest — arrow keys move the divider, double-click or Home returns the pane to its responsive default, and dragged widths persist (`aspen.layout.queueWidth` / `aspen.layout.trayWidth`). The divider itself claims no layout width: it is a 5px strip pulled back by negative margins.

Panels are separated, not decorated: strip, queue, tray and status bar share one chrome tone and are held apart by 1px `--border` hairlines; the main pane is canvas-white. Sticky-in-scroll elements (changes toolbar, diff title, commit-files head) keep their panel background so content scrolls beneath them.

One deliberate responsive concession: below 1160px the queue and tray narrow to 290/260px, and below 980px the three zones stack vertically — queue on top (max-height 38%), work area, tray (max-height 46%) — because the desk must survive a daily-driver window that is not always wide. The dividers retire when stacked, and they are hairline-thin at every width so the three zones stay separated by the same 1px `--border` language as everywhere else. A width the user dragged takes precedence over these breakpoint defaults — explicit intent beats a guess. Everything else adapts by truncation and by `max-width: min(92vw, 640px)` / `max-height: 88vh` caps on dialogs and `max-height: 480px` scroll caps on popovers.

## Elevation & Depth

Flat by default, in fill and in height. Every structural boundary is a 1px border or a tonal step between canvas and panel; no in-flow surface is lifted, and no surface is painted with a gradient.

### Shadow Vocabulary
- **Float** (`0 12px 28px rgba(140, 149, 159, 0.3), 0 2px 4px rgba(140, 149, 159, 0.1)`; dark `0 12px 28px rgba(1, 4, 9, 0.6), 0 2px 4px rgba(1, 4, 9, 0.4)`): Primer's overlay shadow, carried by popovers, context menus, and dialogs. Two layers, always together.
- **Rest lift** (`0 1px 0 rgba(31, 35, 40, 0.04)`; `0 0 transparent` in dark): the 1px shadow every bordered button and the active tab chip carries at rest. It is GitHub's, it never grows on hover, and it is the only shadow on an in-flow control.
- **Focus ring** (`0 0 0 3px rgba(9, 105, 218, 0.3)`; dark `rgba(31, 111, 235, 0.4)`): the halo for keyboard state, appearing only on `:focus-visible`, always with the border taken to the accent. Ring-shaped glows in this system always name state — the celebration pop's green ring and the verbs' arm ring are its event-bound cousins — never decoration.
- **Scrim** (`rgba(31, 35, 40, 0.5)`; dark `rgba(1, 4, 9, 0.68)`): the dialog overlay, unblurred.

### Named Rules
**The Two-Shadows-Only Rule.** One float shadow for things above the document, one 1px rest lift for bordered controls, one focus ring for keyboard state. Nothing else casts. Blur appears nowhere.

**The Flat-By-Default Rule.** Every fill is one solid color. No gradients, no lit top faces, no falling light, no washes that fade to the base — including the busy state, which is a spinner, not a travelling sheen. Depth is state (floating layers, focus), never decoration.

## Shapes

Gently softened rectangles on GitHub's scale: 2px for word-level diff marks, 4px for `code` chips and inline menu-item niceties, 6px for every control and card (buttons, inputs, tabs, the active tab chip, toasts, banners, table containers), 12px reserved for things that float above the app (popovers, context menus, dialogs). Counter badges are true pills (`999px`), avatars are circles. Borders are 1px and nearly always visible; menu separators are 1px hairlines with 4px margins. No notches, cutouts, or clip-paths — the silhouette language is "rounded rectangle, GitHub's radius."

## Motion

Three tiers, on color and opacity plus a hair of scale on entrances — `--motion-instant` 90ms (cursor answers: background, border, text color), `--motion-fast` 140ms (floated-layer fades, the desk-swap fade, the diff fade-in), `--motion-layer` 200ms (dialog and toast entrances). Arrival curve `cubic-bezier(0.16, 1, 0.3, 1)`; everything else is `ease-out`. The commit/push celebration (a 500ms button pop, a 680ms confetti flight, dismissed after 900ms) is the single long moment; its counterpart on the same two verbs is the 400ms arm ring, fired once when the button becomes able to act.

What moves: buttons change face color on hover and press without moving a pixel, except the two completing verbs — `.btn.commit` and `.btn.push` press on a `scale(0.97)` hair of commitment and bloom one arm ring (`btn-arm`, 400ms, the verb's own face color at 55%, spreading to 9px and fading) when the repository makes them true; icon buttons gain a hover ground; rows change ground; the active tab's chip appears at its new position (opacity only — it jumps, it does not travel); popovers, menus, dialogs, and toasts fade in at `scale(0.98)`; the desk swap is one keyed `.pane-enter` fade on the queue and the main pane — the strip, tab rail, tray, and status bar are the same faces in every desk, so they are never snapshotted or faded; the busy item grows a spinner; a landed commit or push throws confetti. Nothing staggers in, nothing lifts, nothing rotates, and no number pops. `prefers-reduced-motion: reduce` drops the scale from the entrances, the arm bloom, and the verb press — keeping every fade, the ring, and the spinner, so state feedback stays legible.

### Named Rules
**The Motion-Tiers Rule.** 90/140/200ms, the one 400ms arm ring, and the one 900ms celebration. Every motion acknowledges an event — hover, press, arrival of a layer, a swap, a running operation, a verb becoming possible, a success. Looping motion is reserved for spinners. Each animation ships its `prefers-reduced-motion` path.

**The Nothing-Travel Rule.** No element translates as feedback. A hover changes color; a selection changes ground; a tab change changes which chip is lit. The two completing verbs may scale on press and ring on state — a hair of commitment, never a journey. If a proposed animation moves something along an axis, it is the old world talking.

## Components

### Buttons
- **Shape:** 6px radius, 1px `--btn-border` outline, `0 1px 0 rgba(31,35,40,0.04)` at rest, label + optional glyph at a 6px gap, padding 5px × 12px.
- **Default (`.btn`):** Panel face, Ink label; hover `#f3f4f6`, active `#ebecf0` (dark `#292e33` / `#21262d`); disabled takes the Primer disabled face and ink, never an opacity fade.
- **Primary (`.btn.primary`):** Commit Blue face with a white label — the app's one loud action, and the commit button stretches full-width and centered. Hover `#0860ca`, active `#0550ae`. No `overflow: clip`, so the celebration's confetti flies free.
- **Primary, destructive (`.btn.primary.destructive`):** the same face in Alarm Red (`#da3633` dark) for confirmations that throw work away — Discard, Delete, Drop, Abort.
- **AI (`.btn.ai`):** solid `#8250df` with a white label and a text-presented sparkle (a gold emoji would be a color with no role); hover deepens to `#6639ba`. The only purple object on the desk.
- **Hover / focus:** hover changes color alone. Keyboard focus removes the outline and draws the accent border plus the 3px ring; pointer clicks never draw it.
- **The completing verbs (`.btn.commit`, `.btn.push`):** press answers with a `scale(0.97)` hair of commitment (the only controls in the app that move), and the instant git makes one able to act — first file checked, ahead count turned nonzero — it blooms one 400ms arm ring in its own face color (`btn-arm`, `useJustArmed`). Never on first paint, never on its own schedule.
- **Quiet variants:** `.mini` and `.link` (accent-blue text, underline on hover), `.icon-btn` (transparent, 16px glyph, hover takes `--bg-hover`).
- **Sync split (`.sync-split`):** one verb button joined to its caret at 8px — outer corners 6px, shared seam one hairline. The verb carries the sync hue it shows (`.pull` amber, `.push` green, plain for fetch); the caret face matches and dims its glyph to 0.8 of the verb's foreground. Click runs the context-aware verb; the caret menu (`Ctrl+Shift+F/P/U` chips) always offers all three.

### Badges & Status Glyphs
- **Style:** counter pills at 10.5px mono — `--chip-face` (canvas in light, `#21262d` in dark), `--btn-border` ring, muted ink — turning accent-tinted inside the active tab and del-washed for the Conflicts count. Badges invert to `--on-accent-chip` on a selected row.
- **Status:** a 14px symbol column at the row head codes file state (new, deleted, conflicted, renamed, modified) in the semantic palette, modified in amber. Staged badges carry green text and are clickable; unstaged are static. **The badges appear only once the staging area actually holds something** — while nothing is staged every row would wear an identical "unstaged" chip, so until then the include-checkbox is the row's only selection affordance (see `progressive.ts`). On a selected row the symbols invert to white and stay legible, because the mark is a distinct shape and the file's own git status is one keystroke away.

### List Rows (files, commits, stashes, hub rows)
- **Style:** 5px × 10px padding over a transparent bottom hairline (commit rows take 8px over a solid hairline, hub rows 7px over a 55%-alpha one); hover to `--bg-hover`; selected to solid `--bg-selected` with `--on-accent` content, muted secondaries at 0.82 white (0.8 in dark), chips at `--on-accent-chip` with a `--on-accent-chip-border` ring, and on hover a deeper accent — `#0860ca` in light, and `#1f6feb` held in dark, where Primer's lighter dark-hover blue would drop white text under AA. No left rails, no tinted washes, no arrival stagger. File rows lead with the checkbox, then the status symbol, then the bold basename with its directory muted ahead of it; commit rows lead with a 24px neutral avatar (inset disc, muted initials) and put the subject first. Hover-revealed actions fade in from `opacity: 0`; the discard × goes red, without turning its head.

### Desk Switch
- **Style:** Review and History are permanent; Conflicts joins the row the moment anything waits to be resolved (or an operation is mid-flight) and Stash the moment a stash exists — complexity arrives when it becomes relevant, and the desk falls back to Review when the tab under you retires. Tabs sit on a `--bg-panel` rail edged by a bottom hairline. Inactive tabs are ghost — transparent, muted label, hover ground; the active one is named by a lifted chip drawn under it (`--tab-x`/`--tab-w` measured in `App.tsx`): canvas face, accent-mixed border, the rest-lift shadow, and an accent 600-weight label, so state never depends on one channel. The chip's position changes with an opacity fade only. Full ARIA tablist semantics with the work area as its tabpanel; arrow keys cycle.

### Commit Tray (signature)
- **Style:** docked panel on `--bg-panel` — 300px default, drag-resizable like the queue — held off the main pane by a 1px hairline; 10px padding, 8px gaps: summary input, description textarea, then the **scope line** — mono, muted, `N of M files · +A −D`, add count in green and delete count in red (git truth colored as git truth) — then Generate (violet) and the full-width Commit Blue verb. With nothing selected the tray reads `0 of N · +0 −0` and the commit button takes its disabled face: the verb never promises what it will not do. Before this install's first commit, while nothing is checked, a single muted hint line sits under the scope line ("Tick a file in the list to include it in this commit."). The tray's **Push joins the desk when it can act** (ahead > 0, or a branch ready to publish) instead of sitting permanently disabled beside Commit.

### Celebration (signature)
- **Style:** when a commit or push actually lands, the button that did it pops on a 500ms arrival curve and sheds 14 confetti bits over 680ms, tinted only with state colors — success green twice, accent blue twice, amber, and a single touch of agent violet. It is the app's one long moment, bound to a verb that finished; nothing loops for decoration.

### Coaching & First-Run (newcomer pass)
- **Style:** guidance reuses the banner family, never a new one. The queue's one-time **coach banner** is a `workflow-banner` hunk wash — heading row with a quiet `.mini` Dismiss, then three steps led by 16px mono counter pills ringed in a 40% accent mix (`--hunk-text` digits, the accent's own family). The first-run desk carries the same pills inline under the two entry verbs, each verb captioned by a muted 11.5px small. Preferences states up front that the AI section is what powers ✨ Generate, and when Generate opens the dialog while unconfigured, the same banner family carries the pointer note.
- **Life cycle:** coaching is a rail, not a gate — retired forever by the first commit, dismissible, and switched off entirely by Preferences ▸ Behavior ▸ "Show tips for getting started" (`hintsEnabled`). The progressive rules themselves (Sync verb choice, staged-badge visibility) are honesty-neutral and not gated: they hide redundancy, never git state.

### Route Readout & Ctrl K Chip
- **Style:** the strip's mono readout `branch ⇄ origin` with the arrow in accent blue and trailing `↑n ↓m` counts as git reports them; it renders nothing when it has nothing to say. The filter carries a `Ctrl K` chip — 10.5px mono muted in a panel-background hairline pill — visible only while the field is empty and unfocused.

### Inputs & Fields
- **Style:** canvas background, 1px `--border`, 6px radius, 5px × 8px padding, full-width. Focus removes the outline and draws the accent border plus the ring. Labels are 600-weight 13px with 11.5px muted hints beneath, stacked at 12px gaps. Staging checkboxes take `accent-color: Success Green`; the hub's table checkboxes take the accent.

### Popovers & Menus
- **Style:** canvas face, hairline border, 12px radius, the two-layer Float shadow, 4px padding; items are 7px × 10px at 6px radius, hover to `--bg-hover`, active item accent-colored 600-weight, danger items red. Headers are 10.5px uppercase eyebrows; separators and inline filters allowed. Max height 480px with scroll, positioned 4px below the trigger, entering as a fade at `scale(0.98)`.

### Dialogs
- **Style:** canvas face, hairline border, 12px radius, Float shadow, unblurred scrim; capped at `min(92vw, 640px)` × 88vh, with one documented wide variant — the repository hub at `min(92vw, 720px)`. Anatomy: head on `--bg-panel` with a 14px/600 title, 12×16px padding and a ghost close; scrollable body at 14×16px; foot of right-aligned buttons at 8px gaps, destructive confirmations painting their verb `.btn.primary.destructive`.

### Toasts
- **Style:** floating banners, not striped cards: the whole card takes the state's subtle ground (`--del-bg`, `--add-bg`, `--hunk-bg`) with a 35%-mixed border of the same hue, and the label takes that hue's strong tone — never gray text on a colored field. 6px radius, Float shadow, 9px × 12px padding, hairline border in the neutral case. Stacked bottom-right above the status bar, max 420px, body selectable, optional action row and a quiet 14px ×-close.

### Diff Table (signature)
- **Style:** full-width collapsed monospace table at 12px/1.55; sticky `--bg-header` title bar carrying the path in mono over a 1px hairline, with Split / No wrap / Open as accent links. Unchanged line-number cells sit on the panel ground with muted digits; add, del and hunk rows tint **both** the row and its gutter (`--add-bg`/`--add-gutter`, `--del-bg`/`--del-gutter`, `--hunk-bg`/`--hunk-gutter`) with the line number in the matching state color; the hunk row's content sets in `--hunk-text` — GitHub's blob view, not a generic table. Word-level highlights use `--word-add`/`--word-del` at 2px radius, deletions struck in `--word-del-strike`. Split mode halves the pane at `calc(50% - 48px)` with an empty-side ghost at 0.55 opacity. Prism syntax colors read the `--syntax-*` tokens, so code re-lights with the theme. An empty pane is plain canvas with centered guidance and an ink heading — no wash, no illustration.

### Status Bar & Busy Indicator
- **Style:** ~18px `--bg-panel` strip under a 1px hairline, 11.5px muted items at 14px gaps. A busy item turns accent blue and grows an 8px spinning ring (0.8s linear) — the app's only looping motion, reserved for "the machine is thinking." The agent's own busy readout answers in violet, so the two kinds of waiting look different.

## Brand Mark

Aspen's identity asset is the app mark — **the Aspen Leaf** — at `resources/aspen-icon.svg`: one flat aspen leaf whose veins are a git commit graph, because branching history is how this project grows. It is the desktop's face everywhere the app appears — `BrowserWindow.icon` in `src/main/windows.ts`, the electron-builder icons in `package.json`, and at 16px leading the Windows title bar ahead of the type-only wordmark in `src/renderer/src/components/TitleBar.tsx`.

- **The object:** a broad, rounded aspen leaf with a pointed tip and a short petiole, deep forest green (`#215c4a`), its midrib and two lateral veins knocked out in warm white (`#fbf7ea`) as a commit graph — a trunk rising from the stem to the head commit just under the tip, forking below into one commit on each side — flat, geometric, generous negative space.
- **Palette roles:** Aspen Green is the leaf and its petiole; Warm White is the vein graph only; Aspen Gold (`#e3ac38`) appears exactly once, as the right-hand commit node. The accent is monofrequency on the mark — one node, once — where on the desk the blue does all interaction work.
- **Two-value purity:** flat fills, no gradient, no gray, no shadow, no stroke. The mark obeys the Flat-By-Default Rule and the no-gradient ban exactly as the UI does.
- **Transparency rule:** unlike the tile-based predecessor, the leaf knocks out to real alpha — everything outside the silhouette is transparent, so the mark sits on any taskbar, dock, or window chrome without a baked background.
- **Identity marks:** the leaf polygon (traced from the selected ComfyUI render, points in `resources/logo-aspen/leaf-path.json`), the petiole as a 24-unit bar y 444–484 with rounded r 12 ends, the graph as r 17 capsules — trunk (256,148)→(256,428), branches (256,322)→(138,256) and (256,322)→(374,256) — and r 40 commit discs at (256,148), (138,256) and (374,256), the last one gold, in 512-space. The silhouette must survive alone at 16px; at 32px and below the rasterizer swaps in the simplified cut (r 23 capsules, r 48 discs) so the one-trunk-two-branch read and the gold node never dissolve. Mark history: the commit-graph glyph (2026-10-22) gave way to the Punched Tape (2026-10-28); the Aspen Leaf replaced the tape by user decision on 2026-10-30, generated in ComfyUI (Qwen Image 2.1, seed 13337) and vectorized — provenance in `resources/logo-aspen/GENERATION.md`.

### Named Rules
**The One-Source Mark Rule.** The mark exists in exactly one hand-authored form — `resources/aspen-icon.svg`. `scripts/make-icons.mjs`, the dependency-free SDF rasterizer, mirrors its geometry through `MARK` constants and must stay in step; everything under `resources/icons/` (PNG 16–1024, `aspen.ico`, `aspen.png`) is build output, never an asset; the leaf polygon itself is shared data (`resources/logo-aspen/leaf-path.json`) that both the SVG and the rasterizer consume, so they cannot drift. Never hand-edit a raster: change the SVG (and the path JSON together), update the rasterizer's `MARK` constants to match, and regenerate with `npm run icons`.

## Do's and Don'ts

### Do:
- **Do** route every new surface through the `html[data-theme]` contract; both themes receive the same roles, and dark is composed on Primer's `#0d1117` ground, not inverted from light.
- **Do** express structure with 1px hairlines and the canvas → panel → inset tonal steps before reaching for any shadow.
- **Do** use the accent for interaction and selection, green for additions/staging/success, red for deletion and destruction, amber for warnings, violet for the agent — and nothing else.
- **Do** set repository-verbatim text (paths, diffs, commit messages, shortcut keys, counts) in the mono stack, and UI prose in the system stack.
- **Do** invert a selected row's content to `--on-accent` — including its status symbols and chips — and keep the non-color cues (symbol shape, weight) that make the state readable without color.
- **Do** keep hover, focus, and selection answers in color and ground alone, and keep the focus ring for `:focus-visible`.
- **Do** truncate with ellipsis at `min-width: 0` rather than wrapping paths or breaking the queue column's width (340px default).
- **Do** celebrate a landed commit or push with confetti, and nothing else.

### Don't:
- **Don't** tint the chrome per desk again: no view hues, no colored rails, no hue-tinted scrollbars or eyebrows. The window does not change color when the tab does.
- **Don't** introduce chromatic color that answers to no role; the roster is accent, success, danger, caution, agent, plus the diff washes and the syntax palette.
- **Don't** use green as a generic primary color — the commit verb is blue, and green is what it produces.
- **Don't** lift, scale, rotate, or slide a control for feedback; don't stagger rows, pop a number, or animate a sheen across a busy item.
- **Don't** add a third shadow, shadow an in-flow panel, or blur anything: the Float pair and the 1px rest lift are the whole vocabulary.
- **Don't** paint any surface or any heading with a gradient, and never bring back the busy hairline: a spinner is the machine-thinking signal.
- **Don't** display type larger than 22px or text smaller than 10.5px.
- **Don't** use caution amber for blockers or alarm red for soft warnings — the severity ladder is fixed.
- **Don't** add package UI webfonts or icon libraries; the CSP allows neither, and GitHub Desktop ships system faces.
