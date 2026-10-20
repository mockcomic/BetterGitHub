---
name: GitDesk
description: A quiet workbench for git — matte panels, hairline borders, and git state as the only voice.
colors:
  canvas: "#ffffff"
  panel: "#f6f8fa"
  header-surface: "#f3f5f7"
  hover-surface: "#eef1f4"
  selected-surface: "#daf4e4"
  hairline: "#d0d7de"
  ink: "#1f2328"
  ink-muted: "#656d76"
  commit-green: "#1a7f37"
  commit-green-hover: "#21883a"
  beacon-blue: "#0969da"
  alarm-red: "#cf222e"
  caution-amber: "#d4a72c"
  add-wash: "#dafbe1"
  del-wash: "#ffebe9"
  hunk-wash: "#ddf4ff"
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
components:
  button-primary:
    backgroundColor: "{colors.commit-green}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  button-primary-hover:
    backgroundColor: "{colors.commit-green-hover}"
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

GitDesk presents itself as a well-lit workbench: everything the interface is made of — panels, headers, rails, status bars — is matte, neutral, and deliberately unremarkable, so that the only things permitted to speak are the facts of the repository. A file's status letter, a green add-row in a diff, the ahead/behind count, the commit button. The system's restraint is not absence of personality; it is personality expressed as discipline. Depth comes from hairline borders and tonal surface shifts, never decoration. Motion is reduced to the honest machine signals that exist (a spinner while git or the AI is working), and elevation is a single soft ambient shadow reserved strictly for things floating above the app.

The type system is a two-voice arrangement: the platform-native UI stack (Segoe UI on Windows) for human text, and a programmer's monospace (Cascadia Code) for machine truth — file paths, diffs, commit bodies, shortcut keys. Wherever monospace appears, it signals "this text is verbatim from your repository, do not paraphrase it." The system ships fully paired light and dark themes through one CSS custom-property contract; every token has a counterpart in the other theme, and the dark theme is not an afterthought but the same philosophy rendered in cast iron.

**Key Characteristics:**
- Matte tonal surfaces separated by 1px hairline borders; no decorative color anywhere.
- Git state is the only protagonist: status glyphs, diff washes, badges, and the Commit button carry all meaning.
- One shadow token, one use: floating layers only (popovers, dialogs, toasts, context menus).
- Machine truth in monospace, human text in the system stack — the split is meaningful, never stylistic.
- Compact, instrument-panel density: 13px base, 4–16px spacing scale, fixed 400px working rail.
- Light and dark themes are first-class equals driven by `html[data-theme]` custom properties.

## Colors

The palette is GitHub-lineage: near-neutral surfaces with four semantic voices, each named for what it means in a git client — Commit Green, Beacon Blue, Alarm Red, Caution Amber. The frontmatter carries the light theme as normative; the dark theme's counterparts are listed per token.

### Primary
- **Commit Green** (#1a7f37; dark `#2ea043`): the color of the verb. The commit button, staged confirmations, addition text, success toasts, active popover items. Its rarity is its authority.
- **Commit Green Hover** (#21883a; dark `#3fb950`): the only hover shift Commit Green is allowed.

### Secondary
- **Beacon Blue** (#0969da; dark `#4493f8`): the voice of links, focus rings, busy/AI-in-progress states, renames, and informational accents. Everything clickable that isn't committing.

### Tertiary
- **Alarm Red** (#cf222e; dark `#f85149`): deletions, conflicts, destructive affordances (discard turning red on hover), error banners.
- **Caution Amber** (#d4a72c; both themes): pre-commit warnings — an overlong summary, risky diffs — never brand, never decoration.

### Neutral
- **Canvas** (#ffffff; dark `#0d1117`): main-pane background and floating-layer faces.
- **Panel** (#f6f8fa; dark `#161b22`): the working rail, sidebar, toolbars, gutter cells.
- **Header Surface** (#f3f5f7; dark `#1c2128`): window header, sticky table title bars, status bar, default badges.
- **Hover Surface** (#eef1f4; dark `#21262d`): the background of any row or button under the cursor.
- **Selected Surface** (#daf4e4; dark `#123424`): a green-tinted selection — being chosen is still git work.
- **Hairline** (#d0d7de; dark `#30363d`): every 1px border, separator, and scrollbar thumb.
- **Ink** (#1f2328; dark `#e6edf3`) / **Ink Muted** (#656d76; dark `#8b949e`): primary and secondary text throughout.
- **Diff washes** — **Add Wash** (#dafbe1; dark `#12261e`), **Del Wash** (#ffebe9; dark `#25171c`), **Hunk Wash** (#ddf4ff; dark `#121d2e`): full-row backgrounds in the diff table, each paired with its semantic text color.

### Named Rules
**The Green-Belongs-to-Commit Rule.** Commit Green appears only on the commit action and its confirmations (staged badges, add-row text, success toasts). A generic primary button that does not commit must not wear it.

**The Amber-Never-Shouts Rule.** Caution Amber is reserved for soft warnings that permit the user to continue. Anything that blocks or failed uses Alarm Red. Amber is never a brand or highlight color.

**The No-Decoration-Rule.** Every pixel of chromatic color in the interface encodes git or task state. A color with no state meaning does not ship.

## Typography

**Display Font:** System UI stack (`-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`) — the platform's own face; on Windows this is Segoe UI.
**Body Font:** Same system stack at 13px.
**Label/Mono Font:** Programmer's mono (`'Cascadia Code', 'Consolas', 'SFMono-Regular', Menlo, monospace`) at 12px.

**Character:** Workbench utilitarian — small, dense, and confident. The human voice (system UI) is quiet and never displays more than once per screen; the machine voice (mono) carries the repository's verbatim truth. The pairing is functional, not decorative: switch fonts only when switching between "explaining" and "quoting the repo."

### Hierarchy
- **Display** (700, 30px): the empty-state/onboarding headline (`h1`), once per app lifetime screen at most.
- **Headline** (700, 15px): dialog titles (`h2`).
- **Title** (600, 13px): file names in the changes list, section labels inside commit summaries, picker values, popover active items.
- **Body** (400, 13px): the app-wide default; diff content inherits mono at 12px/1.55 instead.
- **Label** (400, 11–12.5px, often Ink Muted): hints, timestamps, badges (10.5px), status bar (11.5px), uppercase section eyebrows at 10.5px with 0.04em letter-spacing.

### Named Rules
**The Two-Voice Rule.** System UI for prose the app wrote; monospace for text your repository wrote (paths, diffs, commit bodies, `code` chips). Never blend them in one element.

**The 10.5px Floor.** No UI text renders below 10.5px; the density lives in spacing and truncation, not in shrinking type.

## Layout

The window is a fixed vertical sandwich: 33-ish px header rail on top, a flexible `.body` row in the middle, an 18-ish px status bar at the bottom. The body splits into a fixed 400px **working rail** (changes list + commit box, `flex: 0 0 400px`, right-hand hairline) and a flexible **main pane** (diff or history) that owns `min-width: 0` so long paths ellipsize instead of breaking the rail. History mirrors this with a 280px commit-files column.

The spatial model is rails and rows, not cards: panes separate with 1px hairline borders and tonal steps (canvas → panel → header-surface); internal padding runs on the 4/6/8/10/12/16px scale, rows are 5px vertical, toolbars 6px, commit box 10px. Sticky-in-scroll elements (changes toolbar, diff title, commit-files head, truncation notice) pin within their pane and keep the header/panel background so content scrolls beneath them.

There is no responsive reflow: this is one desktop window, sized by the OS. Adaptation is truncation (ellipsis, `min-width: 0`, `word-break`) and `max-width: min(92vw, 640px)` / `max-height: 88vh` caps on dialogs, plus `max-height: 480px` scroll caps on popovers.

## Elevation & Depth

Flat by default. Every structural boundary is a 1px hairline border or a tonal surface shift; nothing is lifted to imply grouping. Exactly one ambient shadow exists, and it belongs exclusively to the floating layer — the things that temporarily hover above the app and can be dismissed by clicking away.

### Shadow Vocabulary
- **Float** (`0 8px 24px rgba(31, 35, 40, 0.16)` light; `rgba(1, 4, 9, 0.6)` dark): the only shadow in the system. Used by popovers, dialogs, toasts, and context menus. Its dark-theme deepening keeps the same geometry.
- **Scrim** (`rgba(1, 4, 9, 0.55)`): the full-viewport dialog overlay beneath a floated dialog.

### Named Rules
**The One Shadow Rule.** One shadow token, four consumers (popover, dialog, toast, context menu). If it's in the document flow, it gets a hairline border, not a shadow.

**The Flat-By-Default Rule.** Surfaces are flat at rest; depth is reserved for state (floating layers) and never for decoration. *(Directional note: hover-lift on buttons/rows — a subtle shadow response on interaction — is an accepted evolution of this doctrine, not yet implemented.)*

## Shapes

Gently softened rectangles throughout: 4px for `code` chips and inner menu items, 6px for all controls (buttons, inputs, selects, textarea), 8px for floating layers and inline banners, 10px reserved for the dialog shell (the most "app-modal" object gets the largest radius). Badges are true pills (`border-radius: 999px` with 1px × 6px padding); avatars are perfect circles. Scrollbar thumbs are 10px-wide rounded pills in Hairline color on a transparent track. Borders are 1px and near-always visible; separators inside menus are 1px Hairline rules with 4px margins. There are no notches, cutouts, or custom clip-paths — the silhouette language is "rounded rectangle, softly."

## Components

### Buttons
- **Shape:** Gently curved rectangles (6px), quiet 1px bordered defaults; label + optional glyph with 6px gap.
- **Primary (`.btn.primary`):** Commit Green fill, white text, border darkened via `color-mix(primary 70%, black)`; hover deepens to the hover token. Padding 5px × 12px; the commit button stretches full-width, centered.
- **Default (`.btn`):** Panel background, Hairline border, Ink text; hover shifts background to Hover Surface; disabled at 0.55 opacity.
- **Hover / Focus:** Color shift only, no transition, no lift at instant response (hover-lift is the accepted direction). No visible focus ring on buttons; focus expression is concentrated on inputs.
- **Quiet variants:** `.mini` (accent-blue text, underline on hover, 12px), `.link` (button-styled accent link), `.icon-btn` (16px muted glyph button).

### Badges & Status Glyphs
- **Style:** Pill badges (999px) at 10.5px in Panel/Header background with Hairline border and muted text.
- **Status:** A 14px-wide monospace-ish letter column at the row head codes file state — new/deleted/conflicted/renamed/modified in the semantic palette (modified uses Amber #d4a72c as its only glyph color). Staged badges carry Commit Green text with a 45%-mixed border and are clickable; unstaged are static.

### List Rows (files, commits, stashes, popovers, recent repos)
- **Style:** 5px × 10px padding, transparent bottom hairline, hover→Hover Surface, selected→Selected Surface (green tint). Commit rows lead with a 24px circular avatar in 25%-tinted Beacon Blue; file rows foreground the bold basename with the directory muted ahead of it. Hover-revealed actions (discard ×, branch actions) fade in from `opacity: 0` — affordances appear only when invited.

### Popovers & Menus
- **Style:** Canvas face, Hairline border, 8px radius, Float shadow, 4px padding; items are 7px × 10px with 6px radius, hover to Hover Surface, active item turns Commit Green 600-weight, danger items Alarm Red. Headers are uppercase 10.5px eyebrows; separators and inline filters allowed. Max height 480px with scroll; positioned 4px below their trigger.

### Segmented Tabs
- **Style:** Two joined rectangles (Changes / History) — shared Hairline borders, outer corners 6px, active segment takes Header Surface background, Ink text, 600 weight, and a Beacon Blue border. The blue border is the only "active" signal.

### Inputs & Fields
- **Style:** Canvas background, 1px Hairline border, 6px radius, 5px × 8px padding, full-width. Focus removes the outline and replaces it with a Beacon Blue border plus a 3px ring at 25% accent via `color-mix`. Labels are 600-weight 13px with 11.5px muted hints beneath; fields stack at 12px gaps.

### Dialogs
- **Style:** Canvas face, Hairline border, 10px radius, Float shadow, scrim behind; capped at `min(92vw, 640px)` × 88vh. One documented wide variant exists for data-dense lists — the repository manager hub caps at `min(92vw, 720px)`; new dialogs must ask before going wide. Anatomy: head (12×16px, 15px bold title, ghost close), scrollable body (14×16px), foot of right-aligned buttons at 8px gaps. One 600-weight `.field-label` per field.

### Toasts
- **Style:** Floating cards (8px radius, Float shadow, Hairline border) with a 4px severity stripe on the left edge — Alarm Red (error), Commit Green (success), Beacon Blue (info). Stacked bottom-right above the status bar, max 420px, body text selectable, optional action row and quiet ×-close.

### Diff Table (signature)
- **Style:** Full-width collapsed monospace table at 12px/1.55; sticky Header-Surface title bar with the file path in mono. Line-number gutters are 44px Panel cells with right-aligned muted digits; sign column 16px. Add/Del/Hunk rows take their semantic washes full-width; word-level highlights use 30%-mixed add/del tints at 2px radius, deletions struck through at 60% del-color. Split mode halves the pane at `calc(50% - 48px)` with an empty-side ghost at 0.55 opacity. Prism syntax colors ride GitHub's dark syntax palette in both themes.

### Status Bar & Busy Indicator
- **Style:** 3px × 10px Header-Surface strip, 11.5px muted text items at 14px gaps. A busy item turns Beacon Blue and grows an 8px spinning ring (0.8s linear) — the app's only motion, reserved for "the machine is thinking."

## Do's and Don'ts

### Do:
- **Do** route every new surface through the `html[data-theme]` custom-property contract; both themes must receive the exact same roles (see the paired values in Colors).
- **Do** express structure with 1px Hairline borders and tonal steps (canvas → panel → header-surface) before reaching for any shadow.
- **Do** reserve Commit Green for commit-and-confirmation semantics and Beacon Blue for interaction/focus/busy semantics.
- **Do** set repository-verbatim text (paths, diffs, commit messages, shortcut keys) in the mono stack, and UI prose in the system stack.
- **Do** use the Float shadow only for dismissible floating layers, and give new overlays 8–10px radius + 4px inner item radius like its siblings.
- **Do** express selection with the green Selected Surface and never with a checkbox-only or border-only treatment in the file/commit lists.
- **Do** truncate with ellipsis at `min-width: 0` rather than wrapping paths or breaking the 400px rail.

### Don't:
- **Don't** introduce chromatic color that encodes no git or task state; the palette is exhausted at Green/Blue/Red/Amber plus the three diff washes.
- **Don't** add a second shadow token or shadow an in-flow panel; borders do that work.
- **Don't** display type larger than 30px or text smaller than 10.5px; density comes from the 4–16px spacing scale.
- **Don't** use Caution Amber for blockers/errors and Alarm Red for soft warnings — the severity ladder is fixed.
- **Don't** put package-UI webfonts or icon libraries on the product; the incumbent system uses the platform's own faces and glyph characters.
- **Don't** animate anything except the busy spinner until the hover-lift direction is actually implemented; instant state changes are the current grammar.
