# Unpushed commits — the plan, and what was built

## The request

> there should be a way to see the commits in a list that haven't been pushed
> yet and the ability to undo the commit and bring the changes back into the
> review panel

Two halves. The second already worked and was simply invisible: Repository ▸
Undo latest commit, and an **Uncommit** button reachable only from a commit's
detail pane. The first did not exist at all — outgoing work was only ever a
*number*, the `↑2` on the Push verb, with no list behind it.

Three questions were asked and answered before writing code:

| question | answer |
| --- | --- |
| Where does the list live? | A filter pill in the History desk's filter bar — no new permanent desk tab |
| What state do the changes come back in? | Staged and ticked, message restored (the existing soft-reset semantics) |
| Which commits can be undone? | Any unpushed commit — the tip by guarded soft reset, an older one rebased out |

## The definition of "unpushed"

One honest definition, computed in the main process, three branch states:

| state | revisions walked | why |
| --- | --- | --- |
| upstream set, its remote ref present | `@{upstream}..HEAD` | literally git's own `ahead` count, so the list can never be a different length from the ↑ chip |
| upstream set, ref deleted on the server (`[gone]`) | `HEAD --not --remotes` | comparing against a stale last-fetched value would report "nothing to push" on a desk whose only verb is Publish |
| no upstream, or detached HEAD | `HEAD --not --remotes` | the commits no fetched remote branch carries — exactly what publishing sends. With no remote at all that is the whole history: true, not a bug |

One probe chooses between them (`src/main/git/log.ts`):

```
git rev-parse --verify --quiet --end-of-options @{upstream}
```

exit 0 → the range; exit 1 → the fallback. `--verify` resolves `@{upstream}`
only while the tracked ref still exists, so a deleted upstream, an unpublished
branch and a detached HEAD all arrive at the same exit code, and `--quiet`
keeps git's complaint off both streams. Same shape as the `[gone]` probe
already in `src/main/git/status.ts`.

Verified against real git before it was written down, including the one thing
that would have been wrong if guessed: the range is appended **raw**.
`--end-of-options` must not precede it, because git insists
`option '--not' must come before non-option arguments`.

## What was built

**Contract** — `src/shared/models.ts`
`LogQuery.unpushed?: 'off' | 'only' | 'mark'`; `CommitInfo.unpushed: boolean`.
`MenuAction` gains `'show-unpushed-commits'` (`src/shared/ipc.ts`). No new IPC
channel: the answer rides `getLog`, so the preload and the typed bridge are
untouched.

**Main** — `src/main/git/log.ts`
`unpushedRange()` resolves the range; `buildLogArgs(query, range)` appends it
last, after `-i --grep` / `--author`, and returns today's exact argv when no
range is given. `'only'` restricts the walk and marks every row (one extra
subprocess: the probe). `'mark'` leaves the walk whole and answers each row from
`outgoingShas()` — `rev-list --max-count=5000 <range>`. `'off'`, which is what
the repository hub's one-row log asks for, pays nothing.

**Words** — `src/renderer/src/progressive.ts`, `src/renderer/src/divergence.ts`
`unpushedStory(status, markedOnPage)` returns the pill's count, its tooltip, and
what the empty list says, for all four states (live upstream, unpublished,
deleted upstream, detached). `unpushedMarkTitle(status)` is the one phrasing of
a row's `↑` mark, shared by the list and the commit detail.

**Store** — `src/renderer/src/store.ts`
`logUnpushed` beside `logSearch`/`logAuthor`, reset with them on repo switch;
`setLogUnpushed`/`toggleLogUnpushed`/`showUnpushedCommits`, all through the
existing 250 ms `scheduleLogReload`. `loadLog` sends `unpushed: 'only' | 'mark'`.
`confirmUncommit` now takes the commit's own `unpushed` flag: the index-vs-`ahead`
arithmetic it used to reconstruct "was this pushed?" from a row's position is
gone, along with its "skip the check on a filtered list" caveat.
`LastCommitState.unpushed: true` — a commit Aspen just made is by construction
not on the remote. New `uncommit(commit)` takes the commit named by a row, so a
click on row five acts on row five; `uncommitSelectedCommit()` delegates to it.

**Components**
`HistoryQueue` (`components/ChangesSidebar.tsx`) gains the `Unpushed` chip in a
second filter row, a `UNPUSHED n` group label while it is on, an `↑` mark and a
hover-revealed **Uncommit** on each outgoing row, and honest empty states
(`Nothing to push`, with the reason: up to date, or behind and Pull goes first,
or already on the remote so Publish only creates the branch). `HistoryView`
shows the same mark in the commit meta line and splits the Uncommit tooltip by
state. `App.tsx` puts the outgoing count on the History tab. `menu.ts` adds
Repository ▸ **View unpushed commits** beside the push verbs — one definition,
so the native menu and the win32 title band both get it.

**Styles** — `src/renderer/src/styles.css`
`.history-toggles` + `.toggle-chip` (button face, control radius, pressed =
12% accent wash under a 45% accent ring — the staged badge's recipe in the
interaction hue), `.badge.div.mark { min-width: 0 }` (the `.gone` precedent: a
lone glyph claims no digit box), and `.commit-row .commit-row-actions` fading
0 → 1 on hover/`:focus-within` the way `.file-row:hover .discard` already does.
No new hue, no motion but color and opacity, nothing under 10.5px.

## Verified

`npm run typecheck` clean on both projects; `npm run test` green. New coverage:

- `tests/log-query.test.ts` — the range lands last, behind the search filters;
  the two-part no-upstream form stays raw with no `--end-of-options`; no range
  leaves the argv byte-identical to a plain log.
- `tests/progressive.test.ts` — the pill quotes git's `ahead`, says "up to date"
  only at 0/0, **does not claim a sync at 0 ahead / 6 behind**, counts marked
  rows where there is no ahead to quote, never reads as nothing-to-push on a
  deleted upstream, and admits when status is still loading.
- `tests/git-integration.test.ts` — `describe('unpushed log')` against a real
  `git` and a bare `origin`: the restricted walk returns exactly the two commits
  `status.ahead` claims, newest first; an unfiltered walk marks that same set and
  calls their ancestors pushed; a plain query marks nothing; after `push` the
  list is empty; a deleted tracked ref keeps the branch's commits listed rather
  than reporting an empty queue; a repository with no remote at all calls every
  commit outgoing.

Then the real renderer, driven over CDP (`ASPEN_CDP_PORT`, the app's own dev
hook) against a scratch repo with two unpushed commits: History tab badge `2`;
`Push ↑2`; pill `UNPUSHED (2)` with tooltip
`List only the 2 commits waiting to be pushed to origin/main`; `UNPUSHED 2` group
label; exactly the two newest rows wearing `↑` (aria-label
`Not pushed to origin/main`) and a row verb, older rows neither; pressing the
pill leaves those two rows and nothing else. On a pushed commit: no mark, no row
verb, and both the tooltip and the confirm dialog say the force-push sentence
the flag now decides.

One finding came only from the live run and is fixed above: the first draft
quoted `ahead === 0` as "up to date", which on the user's own repo — 6 commits
*behind* — was a small lie. The tooltip and empty hint now name the incoming
work.

## Deliberate deviations from the approved plan

1. **Tri-state flag instead of a boolean.** A boolean `unpushed` would have made
   every `getLog` pay two extra git subprocesses, including the repository hub's
   per-row one-commit log. `'off' | 'only' | 'mark'` keeps the badge and costs
   nothing where it is not shown.
2. **The context-menu item stayed available for pushed commits.** The plan read
   as if it would narrow to unpushed rows only; that would have silently removed
   a capability (uncommitting a pushed commit, warning about the force-push).
3. **The mark is named, not `aria-hidden`.** The divergence chips hide because a
   filled verb and a branch row's `aria-label` already say it in words; a commit
   row has neither, so the `↑` carries `role="img"` + the same phrase.
4. **Row verb calls `store.uncommit(c)`** rather than selecting then uncommitting
   the selection, to avoid depending on an async selection landing first.

## Known limits

- A branch owing the remote more than 5000 commits (typically a clone with no
  remote configured) gets no marks rather than half-truths: the count is dropped
  before it is wrong, and `Nothing to push` is still git's own `ahead` when there
  is a live upstream to count against.
- The *successful* undo run past the confirm dialog was observed everywhere
  except one place: driven from inside an agent sandbox, the app's git children
  run at Low integrity and cannot create `.git/index.lock`. The app said exactly
  that, rolled back, and left history intact — the failure path worked. Running
  `npm run dev` from a normal shell makes the write path available; the
  soft-reset and rebase-out mechanics themselves are covered by
  `tests/git-integration.test.ts`.
- No keyboard accelerator: Ctrl+Enter/X/Z/S/M/F/P/U/G are taken. The pill and the
  menu item are the entry points.

## Try it

Open a repository whose branch is ahead of its upstream, press the **History**
tab (it wears the count), press **Unpushed**, and hover a row.
