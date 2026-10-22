import { readFileSync, writeFileSync } from 'node:fs'
const FILE = '.impeccable/surfaces/src-renderer-src-app-tsx.md'
let s = readFileSync(FILE, 'utf8')
const find = 'whether the AI verb should stay filled purple or drop to a purple-bordered default button once the commit verb\u2019s contrast is measured against it.'
const repl = 'RESOLVED: the AI verb stays a filled button, and its face is #8250df in both themes (a white label on the dark #a371f7 measured 3.35:1 and failed AA), while #a371f7 stays the agent\u2019s readout text and spinner color. The commit verb\u2019s blue carries the same white label at 5.19:1 (light) / 4.63:1 (dark), so the two verbs sit at the same weight on the desk.'
if (s.includes(find)) { s = s.replace(find, repl); console.log('surface brief open question resolved') }
else { console.log('open-question line not found; leaving the brief as written') }
writeFileSync(FILE, s)
