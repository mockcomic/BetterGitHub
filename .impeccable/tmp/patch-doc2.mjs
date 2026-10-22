import { readFileSync, writeFileSync } from 'node:fs'
const FILE = 'DESIGN.md'
let doc = readFileSync(FILE, 'utf8')
const missed = []
const pairs = [
  [`  diff-row-add:
    backgroundColor: "{colors.add-wash}"
    gutterBackgroundColor: "{colors.add-gutter}"
    textColor: "{colors.success-green}"`, `  diff-row-add:
    backgroundColor: "{colors.add-wash}"
    gutterBackgroundColor: "{colors.add-gutter}"
    lineTextColor: "{colors.success-green}"`],
  [`  diff-row-del:
    backgroundColor: "{colors.del-wash}"
    gutterBackgroundColor: "{colors.del-gutter}"
    textColor: "{colors.alarm-red}"`, `  diff-row-del:
    backgroundColor: "{colors.del-wash}"
    gutterBackgroundColor: "{colors.del-gutter}"
    lineTextColor: "{colors.alarm-red}"`]
]
for (const [find, repl] of pairs) {
  const i = doc.indexOf(find)
  if (i === -1) { missed.push(find.slice(0, 40).replace(/\n/g, '\\n')); continue }
  doc = doc.slice(0, i) + repl + doc.slice(i + find.length)
}
writeFileSync(FILE, doc)
console.log(missed.length ? 'MISSED:\n' + missed.join('\n') : 'component entries fixed')
