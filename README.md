# GitDesk

A GitHub Desktop–style git client built with Electron + React + TypeScript,
featuring an integrated **AI commit-message agent** (any OpenAI-compatible
API).

Built from a reverse-engineering study of GitHub Desktop 3.6.7's shipped
Electron artifact (typed IPC contract, porcelain-v2 status parsing, per-verb
git modules, and the AI commit-message flow: fixed system prompt →
randomized `<diff-TOKEN>` trust boundary → strict JSON `{title, description}`
parsing → cancellable request).

## Features

- **Repository manager** — add local repos, clone from URL, recent list.
- **Branch picker** — filter, switch, create branches.
- **Changes list** — porcelain-v2 status (new / modified / deleted / renamed /
  conflicted), per-file checkboxes that define the commit, staged/unstaged
  badges, one-click discard.
- **Diff viewer** — unified diff with line numbers and syntax highlighting
  (Prism), synthesized add-diffs for untracked files.
- **Commit** — summary + description (two `-m` paragraphs), restricted to the
  selected files via `git commit --only`.
- **✨ AI commit messages** — generate title + description from the selected
  files' diff via any OpenAI-compatible endpoint (OpenAI, OpenRouter,
  Ollama, LM Studio…). Cancelable; confirms before replacing text you typed;
  API key stored encrypted via Electron `safeStorage`.
- **History** — commit log with per-commit changed files and diffs.
- **Sync** — fetch / pull / push with ahead-behind badges; first push sets
  upstream on `origin`. Remotes authenticate through your system git
  credential helper (Git Credential Manager).
- **Menus & shortcuts** — Ctrl+Enter commit, Ctrl+Shift+X stage all,
  Ctrl+Shift+F/P/U fetch/pull/push, Ctrl+, preferences.
- Light / dark / system theme.

## Requirements

- Windows (works on macOS/Linux with minor menu tweaks)
- [Node.js](https://nodejs.org) 20+
- `git` on `PATH` (any recent version; Git Credential Manager recommended)
- An AI endpoint: an OpenAI (or compatible) API key, or a local server such
  as `http://localhost:11434/v1` (Ollama).

## Run

```powershell
npm install
npm run dev        # develop with hot reload
npm test           # unit tests (Vitest)
npm run typecheck  # tsc for main+preload and renderer
npm run build      # production bundles into out/
```

Then, on first run, open **Preferences** (File menu or the link on the empty
screen) and set the AI **Base URL**, **Model**, and **API key**, and press
*Test connection*.

## How the AI agent works

1. You check the files you're committing and press **✨ Generate**.
2. Main process builds the diff of the selected files vs `HEAD`
   (untracked files are read and rendered as add-diffs).
3. The model receives a fixed system prompt (≤50-char title, optional
   description, JSON-only response, no lockfile chatter, no AI attribution)
   plus your optional custom rules, and the diff wrapped in a request-random
   `<diff-TOKEN>…</diff-TOKEN>` tag so diff content cannot forge the trust
   boundary.
4. The response is fence-tolerantly parsed into `{ title, description }` and
   validated strictly; a typed message triggers a replace confirmation first.
5. The request is cancellable (the button turns into **Cancel**).

## Project layout

```
src/shared/      models + typed IPC channel map (shared by all three sides)
src/main/        Electron main process
  git/           exec wrapper, porcelain-v2 parser, status/diff/staging/
                 commit/branches/log/sync modules
  ai/            commit-agent (system prompt, tags, parser, fetch call)
  settings.ts    JSON settings + safeStorage-encrypted API key
  windows.ts/menu.ts/ipc.ts  window, app menu, typed handle() registrar
src/preload/     contextBridge surface (window.gitdesk)
src/renderer/    React UI: Header, ChangesSidebar (+CommitBox), DiffView,
                 HistoryView, Dialogs, Toasts, AppStore (store.ts)
tests/           Vitest suites for the porcelain parser and the AI agent
```

## License

MIT
