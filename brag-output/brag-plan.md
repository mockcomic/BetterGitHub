# Brag Plan: GitDesk

## What is this app?

GitDesk is a GitHub Desktop–style git client (Electron + React + TypeScript, Windows-first) with a built-in AI commit-message agent that talks to *any* OpenAI-compatible endpoint — OpenAI, OpenRouter, Ollama, LM Studio — rebuilt from a reverse-engineering study of GitHub Desktop 3.6.7's shipped artifact.

## The angle

The one claim worth bragging about: **the agent writes your commit message, and you own the endpoint, the diff, and the trust boundary.** No vendor lock-in, no GitHub account, no cloud dependency you didn't choose. The product already has a built-in metaphor to hang the film on — its own app mark: *a commit is a hole punched permanently into a record*, so the mark IS a punched card (card stock `#e9e2cf`, printed ink `#0b1120`, three holes on a strict 128-unit grid, and commit blue `#0969da` used exactly once, as the inked head-commit hole). The whole film is that motif: card, holes, one blue dot.

Structure: imperative hook → the working desk → the ✨ Generate beat (the differentiator) → commit + confetti payoff → end card with the truth lines.

## Hook (first 2-3 seconds)

On near-black ink (`#0b1120`), the line **"Stop writing commit messages."** slams in at display scale — fast in (0.35s), then a full ~2.4s hold. The punched-card mark assembles beside it: keyline strokes draw themselves, the corner cut and timing notch read, two holes knock out to the background, and the third hole *punches* and fills commit blue exactly on the period. The blue dot is the only color in the frame.

## Key moments (the middle)

- **The desk, working.** Dark theme (`#0d1117`): title-bar wordmark, command strip with repo + branch picker and ahead/behind badges, changes sidebar with porcelain-v2 file rows (M / D / ? badges, per-file checkboxes) arriving one by one, and the diff pane with Primer's green/red washes and a `@@` hunk header.
- **✨ Generate.** A cursor clicks the violet `✨ Generate` button; the button becomes `Cancel` with a spinner; then the Summary field **types itself** — `Handle rename entries in porcelain v2 output` (44 chars, under the 50-char guard) — followed by a Description line. This is the product doing its thing, not describing its thing.
- **The trust boundary, made visible.** A micro-insert: the diff wrapped in a randomized `<diff-7f3a9>` tag, with the line *"your diff can't forge the boundary."* One invented-looking, genuinely-shipped detail nobody else has.
- **Commit + celebration.** Click `Commit to main`; the button pops and sheds the real confetti burst (green, blue, amber, a touch of agent violet), and the success toast lands: `Committed 4a91f2c — Handle rename entries in porcelain v2 output` with an **Undo** action.

## Outro / punchline

Cut to the punched-card end card on ink. Wordmark **GitDesk**, then three dry truth lines, then the landing blow:

> **Your diff. Your model. Your machine.**

Small footer: `MIT · free · open source`. Beat of silence as the blue hole holds.

## User flow worth showing

Entry → key action → result, straight from the app:

1. Repo open, changed files listed in the sidebar (porcelain-v2 statuses, checkboxes define the commit).
2. Check the files, click **✨ Generate** → spinner/`Cancel` → Summary and Description type themselves in.
3. Click **Commit to main** → button pops, confetti fires, toast with **Undo** appears.

Centerpiece scenes show this flow; the end card is the only marketing frame.

## Tone

- Preset: `polished`
- Creative direction: quiet premium developer-tool film — punched-card motif, one blue, restrained motion, one dry punchline.
- Interpretation: fewer scenes, longer holds, confident restraint. Motion is precise (short, eased, no bounce); the energy comes from cuts and the UI's own life, not from jitter. Copy stays in the app's own register: plain, direct, sentence-case.

## Format: landscape — 1920x1080

## Duration: 20 seconds (scenes sum to 20.0s)

## Visual identity (from the project)

- Background: `#0d1117` (Primer-dark desk) / `#0b1120` (brand "printed ink" for the film ground and end card); panels `#161b22`; hairlines `#30363d`
- Text: `#e6edf3`, muted `#7d8590`
- Accent (the only blue, used as the app uses it): `#2f81f7` on dark / brand commit blue `#0969da`
- Supporting state colors, from the real token set: add `#12261f` wash + `#3fb950` text; delete `#2d1214` wash + `#f85149` text; hunk `#16263c`; agent violet `#8250df`/`#a371f7` (the one decorative accent, and only on the agent); card stock `#e9e2cf` for the mark
- Display font: system UI stack — `-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif` at 600/700 (DESIGN.md keeps the wordmark type-only: no gradient, no shadow)
- Body / UI font: same stack at 13px-equivalent scale for the recreated window; mono `Cascadia Code`/`Consolas` for paths, the `<diff-…>` tag, and diff content
- Strongest visual element to reference: the punched-card mark (45° corner cut top-right, semicircular timing notch, three holes on the 128 grid, exactly one hole inked blue)

**Stand-ins:** every filename, repo name (`gitdesk`), branch (`main`), SHA (`4a91f2c`) and commit string on screen is an invented plausible stand-in — no real user data, no API key, no endpoint hostname. State this in the brief so nothing secret reaches the frame.

## Share copy (draft)

GitDesk: a GitHub Desktop-style git client whose AI commit agent writes the message and runs on whatever endpoint you already trust — OpenAI, OpenRouter, or Ollama on your own box. Your diff, your model, your machine.

## Audio direction

- Role: low, clean support bed under a UI-driven edit; SFX score the real gestures.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady and clean — the preset's pick for `polished`/`cinematic`).
- Music treatment: start at 0 at modest volume (~0.30); let it sit under everything, duck under the typing beat, short fade-out over the last ~0.8s onto the end card.
- Music cue guidance: bundled preset read — tempo ≈ 110 BPM, beat grid `0.56, 1.09, 1.64, 2.19, 2.73, 3.27, 3.82, 4.39, 4.91, 5.34, 6.00, 6.56, 7.09, 7.64, 8.19, 8.74, …, 13.11, 13.64, …, 17.47, 18.56, …`. Lock at most three major moments: the ✨ Generate click ≈ `8.74s`, the Commit click ≈ `13.11–13.64s`, the end card ≈ `17.47s`. Sidebar rows may ride the `4.39 → 6.56` grid, but that is ~0.5s apart — reveal them fast and **hold the full list ≥1.8s** rather than asking anyone to read each row at speed.
- Audio-reactive treatment: subtle — music RMS may breathe the mark's blue hole glow and the window's shadow/presence. No waveform bars, no strobing.
- SFX posture: moderate but restrained, motion-matched to actual UI events (2–4 interaction sounds plus a payoff hit). Nothing aggressive; nothing cartoonish.
- Audio-coupled moments: the punch of the blue hole (hook), file rows landing (accent first + last only), the Generate click, one randomized keypress per typed character (thinned out), the commit pop + confetti sparkle, one deep resonant hit on the end card.
- Restraint rule: audio must never compete with the copy — no riser stacks, no double-ding, no whoosh on every cut, and the music is never loud enough to mask the keystrokes.

## Storyboard

### Scene 1 — Hook: the punch — 3.2s (0.0 → 3.2)

Ink ground `#0b1120`, subtle vignette. The line **"Stop writing commit messages."** enters fast (0.35s, scale+blur settle) and holds ~2.4s fully settled. The GitDesk punched-card mark assembles at the right of the type: keyline strokes draw in, corner cut and notch read, two holes knock out, the third punches and fills commit blue — landing with the period. One tiny caption line beneath, small and muted: `git desk · with an agent`.
Sequential/interaction: mark assembles in 4 fast beats (card → keyline → two knockouts → blue punch); text is a single slam + hold.
Audio intent: authority and cleanliness; a single physical "punch" gives the claim weight.
Audio-coupled idea: punch impact on the blue hole; optional very soft card-paper place on the card body.
Music: bed already running, low.
Transition mood: soft crossfade with a hard 6-frame white-flash-free cut → Scene 2

### Scene 2 — The desk — 5.0s (3.2 → 8.2)

Recreate the GitDesk window in dark theme, floating on the ink ground with its real shadow: title bar (mark + wordmark), command strip (`gitdesk` ▾, `main` ▾, ahead/behind badges, filter field, ⟳ Fetch / Pull / Push), left changes sidebar, right diff pane. Content: 5 changed-file rows arrive one by one (checkbox + status badge + path, mono): `M src/main/git/porcelain.ts`, `M src/main/git/status.ts`, `? tests/porcelain.test.ts`, `M src/renderer/src/styles.css`, `D src/renderer/src/legacy.css`. Then the diff pane paints: `@@ -41,6 +41,11 @@` hunk in blue wash, green add lines, red delete line, word-level highlight on one modified line. Camera: window settles 0.94 → 1.00 then a slow 4s push toward the sidebar/CommitBox. Caption tick bottom-left: `GitHub Desktop's workflow, rebuilt from the shipped artifact.`
Sequential/interaction: yes — 5 file rows one by one (~0.16s apart), then the diff lines wipe in; hold the complete list ≥1.8s before the push-in continues.
Audio intent: competence, density of real state, "this thing is alive".
Audio-coupled idea: soft accents on the first and last row only; diff lines land quietly on the beat grid.
Music: bed steady.
Transition mood: clean slide/zoom into the CommitBox (the push-in continues across the cut) → Scene 3

### Scene 3 — ✨ Generate — 6.0s (8.2 → 14.2)

Close-up on the CommitBox: empty `Summary (required)` and `Description` fields, file checkbox list above. A cursor arrives and clicks the violet **✨ Generate** button (violet `#8250df` — the one decorative accent). The button flips to **Cancel** with a spinner for ~0.9s; a violet shimmer sweeps the field once. Then the Summary types itself character by character: `Handle rename entries in porcelain v2 output`, with the char counter climbing and staying green (44/50). Then the Description types a shorter line: `Reworked the status parser to carry old and new paths.` During the spinner, a small mono insert reads `<diff-7f3a9>` with the caption *your diff can't forge the boundary.*
Sequential/interaction: yes — hover, click, spinner, typed summary, typed description. The typing is the centerpiece; make it real keystroke rhythm (slightly irregular), not a wipe.
Audio intent: the payoff of the promise made in Scene 1 — effortless, a little magical but mechanical.
Audio-coupled idea: click on Generate; randomized `keyboard/keypress-*.wav` per typed character (thinned to ~1 per 2–3 chars if dense); a soft violet "settle" when generation completes.
Music: bed dips slightly under the typing; the Generate click lands on the ≈`8.74s` strong cue.
Transition mood: hard cut on the commit click → Scene 4

### Scene 4 — Commit, confetti, end card — 5.8s (14.2 → 20.0)

Beat A (≈1.8s): the blue **Commit to main** button is clicked → it pops, the real confetti burst fires (green `#3fb950`, blue `#2f81f7`, amber `#d4a72c`, violet `#a371f7`), and the success toast slides in bottom-right: `Committed 4a91f2c — Handle rename entries in porcelain v2 output` with a blue **Undo** action. Beat B (≈4.0s): cut to the ink end card — the punched-card mark, wordmark **GitDesk**, and three dry lines stacked: `OpenAI · OpenRouter · Ollama · LM Studio` / `No GitHub account required` / `MIT · free · open source`, then the landing blow in larger type: **Your diff. Your model. Your machine.** The blue hole holds, glowing faintly, as the bed fades.
Sequential/interaction: yes — click → pop → confetti → toast, then three lines in, then the punchline; punchline holds ≥2.2s.
Audio intent: reward, then confidence. One deep resonant hit on the end card; the last second is nearly quiet.
Audio-coupled idea: commit pop + light sparkle for confetti; bell/impact hit on the end card at ≈`17.47s`; music fade aligned to it.
Music: fade out over the final ~0.8s.
Transition mood: none (final).

**Music mood for this video:** polished, steady, understated (vol-12).
**Audio summary:** one clean low bed; a single punch on the hook, two quiet list accents, a click plus human keystroke rhythm through the Generate beat, a pop-and-sparkle commit, and one deep hit into an end card that fades to near-silence.

---

## As built (differs from the plan above where noted)

- 5 scene hosts instead of 4: hook 0-3.4, desk 3.4-8.4, agent 8.4-13.2, commit 13.2-16.2, endcard 16.2-20.0. Total unchanged: 20.0s.
- Beat locks held exactly: Generate click 8.74, commit click 13.64, end-card punchline 17.47. File rows ride 4.39 / 4.91 / 5.34 / 6.00 (four rows, not five, so the full list reads and then holds ~1.9s).
- Audio-reactive: no per-frame RMS helper ships with this HyperFrames install, so the mark's glow breathes on the track's own 0.5455s beat period instead. Documented in the brief.
- Commit message shortened to `Fix rename handling` / `Renames carry a second path.` so every line clears check's reading-time floor; scope line reads `3 of 4 files · +62 -8`.
- Fonts: bundled Inter + JetBrains Mono (the app's runtime stack is system-UI/Consolas, which video rendering resolves nondeterministically).
- Stand-ins unchanged: repo gitdesk, branch main, SHA 4a91f2c, invented file paths and diff text; no API key, hostname or personal data on screen.

## Addendum (2026-10-24, evening): the Desk beat is now the registry scene `ui-3d-reveal`

- Installed with `npx hyperframes add ui-3d-reveal` and mounted in place of the hand-built desk scene at **3.4s → 8.4s, track 2** — the slot, the total (20.0s) and every downstream lock are untouched: rows still land on 4.39 / 4.91 / 5.34 / 6.00, Generate on 8.74, the commit click on 13.64, the punchline on 17.47.
- Every placeholder is gone. The five-petal Figma logo (intro and outro), the layers/props panels, the base64 HeyGen artboard, the `Nothing great is made alone.` tagline and the `figma.com/design` pill are replaced by GitDesk's own window: real strings, Primer-dark tokens (`#0d1117` / `#161b22` / `#30363d` / `#e6edf3` / `#8d959f`), commit blue `#1f6feb`, agent violet `#8250df`, Inter + JetBrains Mono.
- Its perspective mechanics are kept — 2800px stage, `preserve-3d` wrapper, the blue-lit depth face — but inverted into an entrance instead of an exit: the window swings in from `z: -2200` at `rotationY: -34deg` and straightens flat on the 4.49 beat, assembles on the music's grid, then breathes ±5deg while the camera drifts into the commit box.
- All readable text raised to the 28px check floor; the tiny `Ctrl K` hint and the Stage/Unstage/Discard/Stash cluster were dropped rather than shrunk, and the diff lines shortened so none clip.
- Audio: the stale fifth-row hit re-timed onto the fourth row (6.00) and two keypress ticks removed, so the keypress type stays at 10 instances. One new hit — `impactSoft_medium_000` at 4.486 (measured peak +0.004s) — marks the window landing flat.


## Addendum (2026-10-30, night): Aspen re-brand pass

The film was re-themed with the Aspen identity: hook mark re-cut to the
ComfyUI aspen-leaf (the leaf grows from its stem, veins draw as the commit
graph, the gold node sprouts on the 1.09 beat where the blue hole used to
punch); the registry `ui-3d-reveal` desk scene replaced by a hand-built
`desk.html` in Aspen's green-ink palette (rows still land on 4.39 / 4.91 /
5.34 / 6.00); agent/commit/endcard recolored from printed-ink/commit-blue to
#0b1512 / #0d1b16 grounds with aspen green + the single gold; confetti
palette swapped to green/gold/cream/violet. Timing, audio and every
beat-lock are unchanged from the 2026-10-24 build.
