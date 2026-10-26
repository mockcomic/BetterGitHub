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

- **Repository manager** — add local repos, clone from URL or **from your
  GitHub/GitLab account** (sign in, browse and search your repositories, pick
  one and clone; folder name and destination suggested by main), recent list,
  remove from the app.
- **Hosted accounts** — sign in with **GitHub** (browser device flow or
  personal access token) and **GitLab** (OAuth PKCE for gitlab.com, token for
  self-hosted instances too); the Clone dialog grows a tab per account
  listing every repository you own, collaborate on, or see through an
  organization. Tokens are stored encrypted (Electron `safeStorage`) and
  never enter the renderer.
- **Branch picker** — filter, switch, create, rename and delete branches;
  remote-tracking branches listed separately and checked out as tracking
  branches; delete on the remote too.
- **Changes list** — porcelain-v2 status (new / modified / deleted / renamed /
  conflicted), per-file checkboxes that define the commit, staged/unstaged
  badges, one-click discard, discard-all, select-all, and a right-click menu
  (open file, show in Explorer, copy path/name, discard, plus a deep **Ignore
  ▸** submenu: the exact file, a name or `*.ext` anywhere, the containing or
  root folder, folder-direct `*`, `*.ext` limited to 1/2/3/any subfolder
  levels, or all untracked files at once — all appended to `.gitignore`).
- **Auto-refresh** — a debounced recursive watcher pushes working-tree changes
  to the UI (toggle in Preferences).
- **Merge-conflict handling** — a banner for an in-progress merge / rebase /
  cherry-pick / revert with conflict count and **Continue** / **Abort**;
  per-file *ours / theirs / done* resolution buttons.
- **Stash** — stash all changes (including untracked), and apply / pop / drop
  entries from the sidebar.
- **Diff viewer** — unified **or split** view, line wrap toggle, word-level
  highlighting of what actually changed inside a modified line, syntax
  highlighting (Prism), a large-diff guard, distinct binary / error / empty
  states, and synthesized add-diffs for untracked files.
- **Media previews** — selecting an image, video, or audio change shows it in
  the pane instead of the binary notice (Chromium playback, up to 128 MB);
  history previews read the exact committed blob, not the working tree.
- **Commit** — summary + description (two `-m` paragraphs), restricted to the
  selected files via `git commit --only`; commit-message drafts are persisted
  per repository; **Undo** and **Edit latest commit…** (amend) with a
  tip-moved guard so you never undo somebody else's commit.
- **✨ AI commit messages** — generate title + description from the selected
  files' diff via any OpenAI-compatible endpoint (OpenAI, OpenRouter,
  Ollama, LM Studio…). Cancelable; confirms before replacing text you typed;
  API key stored encrypted via Electron `safeStorage`.
- **History** — searchable commit log (message + author filters) with paging,
  per-commit changed files and diffs, and commit actions: copy SHA, create
  branch from commit, cherry-pick, revert, open on GitHub.
- **Sync** — fetch / pull / push with ahead-behind badges and in-button
  spinners; first push sets upstream on `origin`. Remotes authenticate through
  your system git credential helper (Git Credential Manager) — and when it
  declines, GitDesk silently reruns the command once with the signed-in
  account's token for that host (never in the command line or `.git/config`).
  Add an `origin` from the header when a repo has none.
- **Git identity** — warns and blocks the commit until `user.name` /
  `user.email` are set, with inline fields that write the repo-local config.
- **GitHub web links** — repo, branch, commit and compare URLs derived from
  the `origin` remote (hidden rather than guessed when it isn't mappable).
- **Menus & shortcuts** — Ctrl+Enter commit, Ctrl+Shift+X/Z stage/unstage all,
  Ctrl+Shift+S stash, Ctrl+Shift+M edit latest commit, Ctrl+Shift+F/P/U
  fetch/pull/push, Ctrl+Shift+G view on GitHub, Ctrl+R refresh,
  Ctrl+, preferences, plus a History menu for commit operations and an About
  dialog.
- Toasts with actions (e.g. **Undo** after a commit) and manual dismiss.
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
npm run dist       # build an installer for the current platform
npm run dist:win   # Windows installer + portable executable
npm run dist:mac   # macOS DMG + ZIP
npm run dist:linux # Linux AppImage + DEB
```

Run the platform-specific distribution command on the target operating system.
`npm run dist:all` requests all three targets when the build environment supports
cross-platform packaging.

Then, on first run, open **Preferences** (File menu or the link on the empty
screen) and set the AI **Base URL**, **Model**, and **API key**, and press
*Test connection*.

## Running inside an agent / command sandbox (Windows)

Agent CLIs and CI runners often execute commands in a **sandboxed shell**:
on Windows the whole process tree (dev server, Electron, and the `git`
children GitDesk spawns) then runs at *Low process integrity*, with write
access narrowed to a few folders and RPC/named-pipe service calls blocked.
Git can still read the repository — status, diffs and history look fine —
but the first command that writes into `.git` (stage, commit, stash…) dies
with `fatal: Unable to create '…\.git\index.lock': Permission denied`
even though the repository itself is healthy. (GitHub Desktop never hits
this; it is always launched normally at Medium integrity.)

Two mitigations ship with GitDesk:

- **Actionable errors** — `src/main/git/sandbox.ts` recognizes the
  blocked `.git` write signature and replaces the raw `exit 128` fatal
  with an explanation that names both fixes below.
- **File-queue git broker** — `scripts/git-broker.mjs`. Register it once
  from a *normal* (non-sandboxed) shell:

  ```
  npm run git-broker:install     # = node scripts/git-broker.mjs --install-task
  npm run git-broker:status
  npm run git-broker:uninstall
  ```

  The Task Scheduler logon task keeps a tiny broker alive at normal
  integrity. It never talks to the app: the app drops a request JSON into
  `<queue>/requests` (inside the app's profile; override with the
  `GITDESK_BROKER_DIR` env var or `--queue <dir>`) and polls the matching
  response. The broker executes the queued git command with the same
  environment hygiene as the direct path and writes the result back. File
  I/O is deliberate — RPC/pipe based brokers are unreachable from inside
  the sandbox, while plain files cross the boundary reliably. `execGit`
  automatically reruns sandbox-blocked commands through the broker, so
  staging/committing keeps working in the UI and nobody notices.

Outside the sandbox nothing changes: commands run directly and the broker
is simply never consulted.

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

## Signing in to GitHub/GitLab

Open **Clone a repository → Accounts** (or Preferences → Accounts).

- **GitHub — browser sign-in (device flow).** The same dance `gh` and GitHub
  Desktop do: GitDesk shows a short code, you type it at
  github.com/login/device, and GitDesk picks up the token when you approve.
  No localhost port, no password on this machine, and the token never
  expires until you sign out.
- **GitLab — browser sign-in (OAuth + PKCE).** The browser opens your
  instance's authorize page; GitDesk catches the redirect on a one-shot
  server at `http://127.0.0.1:8765/callback`. PKCE means no client secret
  travels. Access tokens expire after GitLab's two hours — GitDesk refreshes
  them silently.
- **Token sign-in — works for everything.** A GitHub classic PAT with the
  `repo` scope (or a fine-grained token with repository contents: read), or
  a GitLab PAT with `read_api` + `read_user`. Fill in the optional instance
  URL to sign a **GitHub Enterprise** or **self-hosted GitLab** server; that
  is the only way to use a server whose OAuth app you cannot register from
  the app. The token is validated against `/user` before anything is stored,
  then kept encrypted next to the settings file.

Browser sign-in needs an OAuth application you register once and paste into
**Preferences → Accounts → Browser sign-in apps** (GitHub: an OAuth App with
*Enable Device Flow* ticked; GitLab: an application, confidential **off**,
redirect URI exactly `http://127.0.0.1:8765/callback`, scope `api`). The ids
are public, so they ship empty: without them the browser buttons stay hidden
and the token path works everywhere.

Once signed in, the Clone dialog gets one tab per account listing your
repositories (owner, visibility, last push) with GitLab-side/loaded-item
filtering and paging. Clones, fetches, pulls and pushes still prefer your
system credential helper; your account token is the automatic one-shot
fallback that host rejects without — so a token-only private-repo setup
works end to end, and an existing Git Credential Manager setup is untouched.

## Project layout

```
src/shared/      models + typed IPC channel map (shared by all three sides)
src/main/        Electron main process
  git/           exec wrapper, porcelain-v2 parser, status/diff/staging/
                 commit/branches/log/sync/stash/ignore/workflow/github-url
  watcher.ts     debounced recursive working-tree watcher (watch-filter.ts
                 holds the pure ignore logic)
  ai/            commit-agent (system prompt, tags, parser, fetch call)
  providers/     GitHub & GitLab REST clients (pure mappers), device flow /
                 PKCE sign-in, token refresh, client-id config
  accounts.ts    signed-account store (encrypted per-account token sidecars)
  settings.ts    JSON settings + safeStorage-encrypted API key
  windows.ts/menu.ts/ipc.ts  window, app menu, typed handle() registrar
src/preload/     contextBridge surface (window.gitdesk)
src/renderer/    React UI: Header, ChangesSidebar (+CommitBox, stash panel),
                 DiffView (unified/split, word-diff), HistoryView, Dialogs,
                 AccountsUi (sign-in panel, account rows, remote-repo pane),
                 ContextMenu, Toasts, AppStore (store.ts)
tests/           Vitest suites: porcelain / diff parsers, stash & log parsing,
                 github URLs, watcher filter, word-diff, provider mappers,
                 git auth-retry classifier, plus an integration suite that
                 drives the real `git` binary in a temp repo
```

## Support

GitDesk is free and open source. If it saves you time, consider supporting
Kurtis Hight and continued work on the project:

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&style=for-the-badge)](https://www.paypal.com/paypalme/kurtishight)

👉 **https://www.paypal.com/paypalme/kurtishight**

The same link is available in the app under **Help → Donate via PayPal**, or
in the **Help → About GitDesk → Support the development** section.

## License

MIT
