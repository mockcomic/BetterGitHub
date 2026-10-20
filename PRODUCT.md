# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

KH, the author — a developer using GitDesk daily on Windows for their own repositories. The primary (and self-confirmed) audience is a power user who already understands git concepts (branches, staging, ahead/behind, upstream) and values speed: keyboard shortcuts, minimal ceremony, no onboarding hand-holding. A secondary audience exists only incidentally: the code is MIT-licensed and other developers may read or run it, but no dedicated newcomer experience has been designed.

## Product Purpose

GitDesk is a GitHub Desktop–style git client that makes everyday repository work — review changes, select files, commit, sync — fast and visual, with an integrated AI commit-message agent built in. It exists because the author wanted GitHub Desktop's workflow with an AI commit agent that talks to *their* chosen endpoint. Success means the author can handle daily git work without leaving the app or writing commit text by hand when they don't want to.

## Positioning

Primary claim: **an AI commit-message agent wired to any OpenAI-compatible endpoint** — OpenAI, OpenRouter, Ollama, LM Studio — with no vendor lock-in and no GitHub account required. The agent pipeline (fixed system prompt, randomized `<diff-TOKEN>` trust boundary, strict JSON parsing, cancellable requests, replace-confirmation before clobbering typed text) is the differentiating mechanism a neighboring git client could not copy without rebuilding the same trust and control story.

Supporting facts, not the primary claim: MIT-licensed and open source; local-first — git, credentials (via the system git credential helper), and settings stay on the machine; built from a reverse-engineering study of GitHub Desktop 3.6.7's shipped Electron artifact.

## Operating Context

Windows desktop, single Electron window. Daily rhythm: open the app against a recent repo, review changed files in the sidebar, check the files to include, generate or type the commit message, commit, then fetch/pull/push. Existing rituals it relies on: `git` on `PATH`, Git Credential Manager for remote auth, a running AI endpoint (cloud key or local server). Preferences (Base URL, Model, API key) are configured once via *Test connection*. System tray-free, keyboard-driven: Ctrl+Enter commit, Ctrl+Shift+X stage all, Ctrl+Shift+F/P/U fetch/pull/push, Ctrl+, preferences.

## Capabilities and Constraints

Confirmed functionality (from README and code): repository manager (add/clone/recents); branch picker (filter, switch, create); porcelain-v2 changes list with per-file checkboxes, staged/unstaged badges, one-click discard; unified diff viewer with Prism highlighting and synthesized add-diffs for untracked files; two-paragraph commits restricted to selected files via `git commit --only`; AI commit generation with cancel and typed-text replace confirmation; commit history with per-commit files/diffs; fetch/pull/push with ahead-behind badges and upstream set on first push; light/dark/system theme.

Technical constraints: Electron 44 + React 19 + TypeScript via electron-vite; three-process split with a typed IPC channel map (`src/shared/ipc.ts`) and a contextBridge surface (`window.gitdesk`); API key stored encrypted with Electron `safeStorage`; no bundler-visible network besides the AI endpoint (configured through Settings). Renderer cannot reach Node directly — anything new must go through the typed IPC contract.

Platform note: this is a desktop app built on web technology (Chromium rendering, CSS tokens). Recorded as `web` because the toolchain, styling, and QA workflow are web-shaped; its runtime is a single fixed desktop window, not a browser page, so browser-only patterns (responsive reflow to phone widths, URL routing) are not product requirements.

Undecided product facts (not invented here): whether non-Windows platforms are a real target (README says macOS/Linux need minor menu tweaks); whether a distribution/packaging story (installer, auto-update) exists; whether the name "GitDesk" is final or a working title.

## Brand Commitments

Name: GitDesk (package name `gitdesk`; repo folder "BetterGitHub"). Author: KH. License: MIT. Voice in existing UI copy is plain, direct, sentence-case ("Select a changed file", "Pick a file from the list to see what changed before committing.") — preserve that register. No logo, icon, or brand asset exists in the repo; none may be claimed. The GitHub-style token palette (light/dark themes mirroring GitHub's color system) is the incumbent look, and the user has explicitly ruled it **incidental and free to evolve** — GitHub Desktop fidelity was a study scaffold, not a binding identity.

## Evidence on Hand

- Real, working implementation: `src/main/git/*` (porcelain-v2 parser, per-verb git modules), `src/main/ai/commit-agent.ts`, typed IPC in [src/shared/ipc.ts](src/shared/ipc.ts), React renderer in [src/renderer/src](src/renderer/src), 901-line token stylesheet [src/renderer/src/styles.css](src/renderer/src/styles.css).
- Unit tests: [tests/porcelain.test.ts](tests/porcelain.test.ts), [tests/commit-agent.test.ts](tests/commit-agent.test.ts), [tests/diff-namestatus.test.ts](tests/diff-namestatus.test.ts) (Vitest).
- Descriptive [README.md](README.md) documenting features and the AI pipeline.
- Absences future work must not fabricate: no testimonials, no user metrics, no screenshots/assets, no pricing (it is free/MIT), no published releases or press, no privacy-policy page.

## Product Principles

1. **Own your AI** — every AI touchpoint must work against the user's chosen endpoint, remain cancellable, and never silently overwrite human work.
2. **Git truth, no magic** — the UI mirrors real git state (porcelain status, real diffs, `--only` semantics); never invent or hide state to look cleaner.
3. **Keyboard-first speed** — the daily user is the customer; optimize for repeat use, shortcuts, and low ceremony over guided flows.
4. **Local-first honesty** — credentials, settings, and repositories stay on the machine; anything leaving it (diffs to the AI endpoint) is explicit and explainable.
5. **Study-grade clarity** — the codebase doubles as a reverse-engineering reference; keep the typed IPC contract and module boundaries legible.

## Accessibility & Inclusion

No product-specific accessibility standard was established. Both light and dark themes exist with defined token pairs; future work should keep contrast and focus visibility at least on par with the incumbent GitHub-derived palette.
