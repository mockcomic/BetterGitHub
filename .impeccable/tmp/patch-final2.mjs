import { readFileSync, writeFileSync } from 'node:fs'
const run = (file, pairs) => {
  let s = readFileSync(file, 'utf8')
  const eol = s.includes('\r\n') ? '\r\n' : '\n'
  const E = x => x.replace(/\r?\n/g, eol)
  const missed = []
  for (const [f0, r0] of pairs) {
    const f = E(f0), r = E(r0)
    const i = s.indexOf(f)
    if (i === -1) { missed.push(f.slice(0, 60).replace(/\r?\n/g, '\\n')); continue }
    s = s.slice(0, i) + r + s.slice(i + f.length)
  }
  writeFileSync(file, s)
  console.log(`${file}: ` + (missed.length ? 'MISSED\n  ' + missed.join('\n  ') : 'clean'))
}
run('src/renderer/src/styles.css', [
  [`/* GitHub Desktop names a file by its letter, never by a colored rail: the
   letter already says what changed, so the row needs no second signal. */`,
   `/* GitHub Desktop names a file by its status symbol, never by a colored rail:
   the symbol already says what changed, so the row needs no second signal. */`],
  [`scale, the desk swap crossfades, a running operation spins, and a commit or`,
   `scale, the desk swap fades the incoming pane in, a running operation spins, and a commit or`]
])
run('DESIGN.md', [
  [`the row turns solid accent blue and its content inverts to white — a state that survives losing its color, because the file's letter and the row's weight do the naming.`,
   `the row turns solid accent blue and its content inverts to white — a state that survives losing its color, because the file's status symbol and the row's weight do the naming.`],
  [`it never replaces it (selection is solid accent *plus* the file's letter and the row's weight; conflicts are still labelled).`,
   `it never replaces it (selection is solid accent *plus* the file's status symbol and the row's weight; conflicts are still labelled).`],
  [`14px for row-level marks, 11px for status letters.`,
   `14px for row-level marks, 11px for the status symbols.`],
  [`Git state is the protagonist: status letters, GitHub's own diff washes`,
   `Git state is the protagonist: status symbols, GitHub's own diff washes`],
  [`content to \`--on-accent\` — including its status letters and chips —`,
   `content to \`--on-accent\` — including its status symbols and chips —`]
])
