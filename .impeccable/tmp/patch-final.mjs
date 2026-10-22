import { readFileSync, writeFileSync } from 'node:fs'

const run = (file, pairs) => {
  let s = readFileSync(file, 'utf8')
  const eol = s.includes('\r\n') ? '\r\n' : '\n'
  const E = x => x.replace(/\r?\n/g, eol)
  const missed = []
  for (const [f0, r0, mode] of pairs) {
    const f = E(f0), r = E(r0)
    const i = s.indexOf(f)
    if (i === -1) { missed.push(f.slice(0, 56).replace(/\r?\n/g, '\\n')); continue }
    if (mode !== 'all' && s.indexOf(f, i + 1) !== -1) { missed.push('AMBIG ' + f.slice(0, 40)); continue }
    s = mode === 'all' ? s.split(f).join(r) : s.slice(0, i) + r + s.slice(i + f.length)
  }
  writeFileSync(file, s)
  console.log(`${file}: ` + (missed.length ? 'MISSED\n  ' + missed.join('\n  ') : 'clean'))
}

run('src/renderer/src/styles.css', [
  // The status mark is a symbol, and the swap is a fade. Say what ships.
  [`   GitHub Desktop names a file by its letter, never by a colored rail: the
   letter already says what changed, so the row needs no second signal. */`,
   `   GitHub Desktop names a file by its status symbol, never by a colored rail:
   the symbol already says what changed, so the row needs no second signal. */`],
  [`   Desktop's lists do. State survives the inversion because the glyph is a
   letter, not a color. */`,
   `   Desktop's lists do. State survives the inversion because the mark is a
   distinct symbol, not a hue. */`],
  [`   push that lands throws confetti. Nothing lifts, travels, staggers or pops.`,
   `   push that lands throws confetti. Nothing lifts, travels, staggers or pops.`],
  [`  --ai-hover: #6639ba;\n`, ``, 'all'],
  [`  --ai-hover: #8250df;\n`, ``, 'all']
])

run('DESIGN.md', [
  [`(the file's letter and the row's weight)`, `(the file's status symbol and the row's weight)`],
  [`- **Glyph** (400, 11px): the file-status letters`, `- **Glyph** (400, 11px): the file-status symbols`],
  [`then the letter, then the bold basename`, `then the status symbol, then the bold basename`],
  [`(status letters`, `(status symbols`],
  [`(letter, weight)`, `(symbol shape, weight)`]
])
