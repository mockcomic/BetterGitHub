# Update signing

Aspen's self-updater fails closed: a release it cannot authenticate is
shown and openable, but **never downloaded or run**. This document is the
release-time ritual that makes a release authenticable.

## The pair

Every release should carry two extra assets next to the installers:

- `update-manifest.json` — `{ schema: 1, repo: "mockcomic/BetterGitHub",
  tag, generatedAt, nonce, assets: [{ name, sha256, size }] }`
- `update-manifest.json.sig` — base64 ed25519 signature over the manifest's
  **exact bytes** (the file as written, no reformatting).

The app verifies the signature against the public key bundled in the build
(`src/main/update-key.pub.pem`, imported via `?raw` so it is inlined into
`out/main`). The manifest's `sha256` per asset is the ONLY digest a download
may match: GitHub's own published `digest` is cross-checked, and the signed
manifest wins any contradiction (an in-place release refresh cannot slip
different bytes past a tag that still verifies).

## The key

- Public half: **committed** (`src/main/update-key.pub.pem`) and packaged.
- Private half: `~/.aspen/update-signing.key` (mode 0600; override with
  `ASPEN_SIGNING_KEY`). Never in the repo, never in a package, never in a
  release.
- Generate once per machine/keeper: `node scripts/update-keygen.mjs`
  (refuses to overwrite without `--force`; `--force` orphans every release
  signed with the old key, so re-sign forward, don't rotate casually).

## Release ritual

```bash
npm run dist:win
node scripts/sign-release.mjs vX.Y.Z release/Aspen-Setup.exe release/Aspen-portable.exe
# -> writes release/update-manifest.json + update-manifest.json.sig
#    (self-verifies against the committed public key; hard-fails without
#     the private key)
python3 scripts/publish-release.py mockcomic/BetterGitHub vX.Y.Z "Aspen X.Y.Z" notes.md \
    release/Aspen-Setup.exe release/Aspen-portable.exe \
    release/update-manifest.json release/update-manifest.json.sig
```

The signing step is NOT optional in practice: an unsigned release is
browse-only in-app by design — the fail-safe, not a bug. Never sign by hand
at release time; the script computes digests from the bytes on disk.

## What "fail closed" covers

| Release state                          | Shown | Release page | Auto-download |
|----------------------------------------|:-----:|:------------:|:-------------:|
| Pair present, signature verifies       |  yes  |     yes      | **on yes**    |
| No manifest files                      |  yes  |     yes      | never         |
| Only one of the two files (half pair)  |  yes  |     yes      | never         |
| Tampered / wrong-key / wrong-tag sig   |  yes  |     yes      | never         |
| Manifest fetch failed (offline/5xx)    |  yes  |     yes      | never         |
| No public key bundled in the build     |  yes  |     yes      | never         |

Additional gates on the download itself:

- Asset URLs are pinned to `github.com/mockcomic/BetterGitHub/releases/…`
  or `objects.githubusercontent.com`, https only, and a followed redirect
  must land back on those hosts — a 302 to a stranger or a plain-http drop
  aborts before the checksum.
- Bytes are capped **during** the transfer (512 MB), written to a `.part`
  and renamed only after the SHA-256 matches the manifest.
- `runInstaller` only ever spawns a path the module itself verified THIS
  session — a file found anywhere else on disk cannot reach the spawner.
- The renderer never steers the URL or the path: both are rebuilt from the
  sanitized release, and an unauthenticated release cannot even start a
  fetch (`downloadUpdate` throws before the first packet).
