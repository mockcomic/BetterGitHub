# Hyperframes Composition Brief: Aspen (re-themed 2026-10-30; brief body kept as authored for the GitDesk original)

## Objective

A 20-second, launch-style brag film for **GitDesk** — a GitHub Desktop–style git client with a built-in AI commit-message agent that runs against any OpenAI-compatible endpoint. `/brag` owns the product angle, source material, storyboard, tone, format, audio selection and delivery expectations; Hyperframes owns composition structure, exact animation timing and mechanics, runtime choices, lint rules and the render workflow.

## Output

- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080 @ 30fps
- Duration: 20 seconds (root `data-duration="20"`)

## Source Material

- Project root: `C:\Users\KH-PC\Documents\GitHub\BetterGitHub` (read the code — no live URL, no screenshots exist)
- Primary files read: `README.md`, `PRODUCT.md`, `DESIGN.md`, `src/renderer/src/styles.css` (token blocks), `src/renderer/src/components/{TitleBar,Header,ChangesSidebar,Celebration,Toasts}.tsx`, `src/renderer/src/store.ts`, `src/main/ai/commit-agent.ts`, `resources/gitdesk-icon.svg`
- Product name: **GitDesk**
- Strongest claim: the agent writes the commit message, and the user owns the endpoint, the diff and the trust boundary (OpenAI · OpenRouter · Ollama · LM Studio; no GitHub account required; MIT, local-first).
- Key UI / visual moments to recreate (labels verified in source):
  - The app mark: one punched card — card stock `#e9e2cf`, printed-ink keyline `#0b1120`, 45° corner cut top-right, semicircular timing notch on the top edge, three holes on a 128-unit grid, the head-commit hole inked `#0969da`, the other two knocked out to alpha.
  - The dark desk (`#0d1117` / panels `#161b22` / hairlines `#30363d`): title band with mark + `GitDesk` wordmark; command strip with repo picker, branch picker `main`, ahead/behind badges, filter field (`Ctrl K`), ⟳ and Fetch / Pull / Push; changes list with `Select all` + `Stage all` / `Unstage all` / `Discard all` / `Stash`, file rows with per-file checkboxes and status badges; diff pane with `@@` hunk wash, add/delete washes and word-level marks.
  - The CommitBox: `Summary (required)`, `Description`, the scope line `4 of 5 files · +62 −8`, the violet `✨ Generate` button (which becomes `Cancel` with a spinner while running), the blue `Commit to main` button, and the commit button's real confetti burst (green, blue, amber, agent violet).
  - The success toast, in the app's own format: `Committed 4a91f2c — Handle rename entries in porcelain v2 output` with an `Undo` action.
  - The trust-boundary insert, from `commit-agent.ts`: the diff wrapped in a request-random `<diff-TOKEN>` tag (render `<diff-7f3a9>`), so diff content cannot forge the boundary.
- Copy that must appear verbatim (the app's own strings): `Summary (required)` · `Description` · `✨ Generate` · `Cancel` · `Commit to main` · `Undo` · `Select all` · `Stage all` · `Unstage all` · `Discard all` · `Stash` · `Filter files by path`
- Grounded facts allowed on screen, from the project: `OpenAI · OpenRouter · Ollama · LM Studio`, `No GitHub account required`, `MIT · free · open source`, "built from a reverse-engineering study of GitHub Desktop 3.6.7's shipped artifact".
- **Stand-ins, invented deliberately:** repo `gitdesk`, branch `main`, SHA `4a91f2c`, the file paths, `+62 −8`, `<diff-7f3a9>` and both commit strings are plausible fictional UI content. No API key, hostname, real username or personal data may reach the frame.

## Creative Direction

- Tone preset: **polished**
- Creative direction: quiet premium developer-tool film — punched-card motif, one blue, restrained motion, one dry punchline.
- Interpretation: few scenes, long holds, precise eased motion, no bounce or jitter. Energy comes from cuts and the UI's own life. Copy stays sentence-case and plain, in the app's register.
- Angle: the app's own mark says it — *a commit is a hole punched permanently into the record* — so the film is card, holes, one blue dot, ending on the app doing the writing.
- Hook (0–3.2s): "Stop writing commit messages." slams in and holds ~2.4s while the mark assembles and the third hole punches blue.
- Outro / punchline: end card → three dry truth lines → **Your diff. Your model. Your machine.**
- Avoid: generic SaaS language ("streamline your workflow"); abstract filler visuals that could belong to any video; a redrawn logo (use the real SVG geometry); an invented dashboard; UI tilted in 3D; a small window lost in an empty canvas.

## Visual Identity

- Background: `#0b1120` (printed ink, film ground + end card); product surface `#0d1117`, panels `#161b22`, inset `#010409`, hairlines `#30363d`
- Text: `#e6edf3`, muted `#7d8590`
- Accent: `#2f81f7` on dark / commit blue `#0969da` (used the way the app uses one blue: the verb, the focus, the inked hole); agent violet `#8250df`/`#a371f7` only on the agent; add `#12261f`/`#3fb950`, delete `#2d1214`/`#f85149`, hunk `#16263c`; card stock `#e9e2cf`
- Display font: **Inter** at 600/700 — the bundled stand-in for the project's system-UI stack (no gradient, no shadow on the wordmark, per DESIGN.md)
- Body / UI font: **Inter**; mono: **JetBrains Mono** for paths, diff content, the `<diff-7f3a9>` tag and the char counter
- Visual references from the project: `resources/gitdesk-icon.svg` geometry (corner cut 168 legs, notch r36, holes r52 at x=128/256/384, y=280 on 512 canvas, keyline stroke 8), the Primer-dark token palette in `styles.css`, the `Celebration.tsx` confetti particle recipe (14 bits, upper hemisphere, green/blue/amber/violet)

## Storyboard

Contract: `brag-output/brag-plan.md`. Scene summary and slot timing (root-local, sums to 20.0s):

1. `hook` — 0.0 → 3.4 — headline "Stop writing commit messages." + punched-card mark assembling; the blue hole punches at `1.09`.
2. `desk` — 3.4 → 8.4 — the dark window on ink; 5 file rows arrive on the beat grid (4.39 / 4.91 / 5.34 / 6.00 / 6.56) and the full list holds ≥1.8s; diff hunk paints; slow push toward the CommitBox; caption `GitHub Desktop's workflow, rebuilt from the shipped artifact.`
3. `agent` — 8.4 → 13.2 — CommitBox close-up: cursor clicks `✨ Generate` on the `8.74` strong cue → `Cancel` + spinner + one violet shimmer → Summary types itself (`Handle rename entries in porcelain v2 output`, counter under 50) → Description types; micro-insert `<diff-7f3a9>` / *your diff can't forge the boundary.*
4. `commit` — 13.2 → 15.2 — punch-in on the action row; click at the `13.64` strong cue → button pops, real confetti burst, toast `Committed 4a91f2c — …` with `Undo`.
5. `endcard` — 15.2 → 20.0 — mark lands on ink, wordmark wipes in beside it, three truth lines, then the punchline **Your diff. Your model. Your machine.** at the `17.47` strong cue, holding ≥2.4s under a music fade.

Product UI is rebuilt at ≥1.6x its in-app scale; nothing readable under ~26px at 1080p.

## Audio

- Audio role: low, clean support bed under a UI-driven edit; SFX score visible actions only.
- Audio arc: bed runs from 0 at modest gain; a single punch on the hook; two quiet list accents under the desk; click + human keystroke rhythm through the Generate beat (bed sits back slightly); pop-and-sparkle commit; one deep resonant hit into the end card, fading to near-quiet.
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (already copied), `data-volume="0.3"`, short fade-in, fade-out across the last ~0.9s onto the end card.
- Music cue guidance: **bundled preset** — `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (copied to `assets/music/cues/`); tempo ≈ 109.96 BPM; beat grid and strong cues listed in the plan. Three strong-cue locks: Generate click ≈ `8.74s`, Commit click ≈ `13.64s`, end-card punchline ≈ `17.47s` (±0.15s). Sequential file rows ride `4.39 → 6.56`; because those are ~0.5s apart and the rows are readable text, reveal them fast and **hold the complete list** rather than reading each row at speed.
- Audio-reactive treatment: subtle. Per-frame RMS extraction is **not** used in this run — this HyperFrames install ships no audio-reactive extraction helper (`hyperframes-creative` is not present in this skill pack), so the breathing is authored on the music's own 0.5455s beat period instead: the mark's blue hole glow and the window's shadow/presence may pulse very slightly on that period. No waveform bars, no strobing, no text scale that hurts readability. If extraction becomes available later, this is the place to swap it in.
- Audio-coupled moments: the hook's punch; file rows landing (first + last only); the Generate click; one key tick per ~0.2s of typing (randomized across `keyboard/keypress-*.wav`); the commit pop + confetti; the end-card hit.
- SFX selection guidance: coherent card-paper + interface palette, low/medium HF risk only (polished tone), each cue caused by something on screen, peaks landing on the frame they belong to (check with `npx hyperframes audio <file> --json`); rotate takes so the same click isn't heard twice; volume 0.35–0.75, and never loud enough to mask the keystrokes. Selection guidance file used: `<skill-dir>/assets/sfx/sfx-analysis.md`.
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density and volume once the animation exists.
- Audio files: music + cue preset copied to `assets/`; Hyperframes copies its chosen SFX under `assets/sfx/…`.

## Hyperframes Instructions

Use the current Hyperframes conventions (root `index.html` + one scene per file under `compositions/`, `class="clip"` + `data-start`/`data-duration` on every timed element, one paused timeline per composition registered as `window.__timelines[id]`, `fromTo` not `from`, no CSS transform where GSAP transforms, no timers/random/fetch, scene styles scoped inside `<template>` with the root styled as `#root`).

Requirements:

- Show at least one real UI moment from the project (scenes 2–4 are the product, not a poster about it).
- Keep every line readable: fast in, then hold (short label ≥0.8s settled; sentence ≈0.3s/word).
- Stay inside 15–25 seconds; keep content inside the 90% action-safe box and key text inside 80% title-safe.
- Include the planned music + SFX layer; put the bed on a low `data-track-index` (10) and give each overlapping SFX its own ascending index.
- Treat the cue metadata as optional hints; readability and the product story win.
- Mark beat-locked tweens (`// beat-locked: 8.74`) and beat-grid sequences (`// beat-grid: …`) in the scene scripts.
- Use local assets only; keep creation and rendering local (no publish).
- Run `npx hyperframes check --json` before render — that is `/brag`'s single gate.
- Every factual claim on screen must be traceable to the project; stand-in UI content is labelled as such above and must not smuggle in invented capabilities.

## Addendum

The Desk slot (3.4s → 8.4s, track 2) is now filled by the registry item `ui-3d-reveal`
(compositions/ui-3d-reveal.html) re-skinned with GitDesk's own UI and tokens; timing map
otherwise unchanged. Full details in brag-plan.md.
