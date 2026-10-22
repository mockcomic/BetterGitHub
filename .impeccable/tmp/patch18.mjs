import { readFileSync, writeFileSync } from 'node:fs'
const f = 'src/renderer/src/App.tsx'
let s = readFileSync(f, 'utf8')
const before = s
s = s.replace(
  /style=\{\s*\{\s*transform: `translateX\(\$\{indicator\?\.x \?\? 0\}px\)`,\s*width: `\$\{indicator\?\.w \?\? 0\}px`\s*\} as CSSProperties\s*\}/,
  "style={\n          {\n            '--tab-x': `${indicator?.x ?? 0}px`,\n            '--tab-w': `${indicator?.w ?? 0}px`\n          } as CSSProperties\n        }"
)
if (s === before) console.log('App.tsx chip style NOT rewritten')
else console.log('App.tsx chip style rewritten')
writeFileSync(f, s)
const g = 'src/renderer/src/styles.css'
let c = readFileSync(g, 'utf8')
c = c.replace(/\n\s*::view-transition-old\(root\),\n\s*::view-transition-new\(root\) \{\n\s*animation-name: scrim-in;\n\s*\}\n/, '\n')
writeFileSync(g, c)
