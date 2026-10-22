import { readFileSync, writeFileSync } from 'fs'

const FILE = 'src/renderer/src/styles.css'
export function apply(pairs) {
  let css = readFileSync(FILE, 'utf8')
  const eol = css.includes('\r\n') ? '\r\n' : '\n'
  const eolize = s => s.replace(/\r?\n/g, eol)
  const missed = []
  for (const [rawFind, rawRepl, mode] of pairs) {
    const find = eolize(rawFind)
    const repl = eolize(rawRepl)
    const first = css.indexOf(find)
    if (first === -1) {
      missed.push(rawFind.slice(0, 60).replace(/\n/g, '\\n'))
      continue
    }
    if (mode !== 'all' && css.indexOf(find, first + 1) !== -1) {
      missed.push('AMBIGUOUS: ' + rawFind.slice(0, 60).replace(/\n/g, '\\n'))
      continue
    }
    css =
      mode === 'all'
        ? css.split(find).join(repl)
        : css.slice(0, first) + repl + css.slice(first + find.length)
  }
  writeFileSync(FILE, css)
  console.log(missed.length ? 'MISSED:\n' + missed.join('\n') : 'all applied')
}
