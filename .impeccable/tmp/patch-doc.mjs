import { readFileSync, writeFileSync } from 'node:fs'

const FILE = 'DESIGN.md'
const eol = '\n'
let doc = readFileSync(FILE, 'utf8')
const missed = []
const eolize = s => s.replace(/\r?\n/g, eol)

const pairs = [
  // Frontmatter: the tokens the shipped CSS now carries.
  [
    `  word-add: "rgba(128, 191, 132, 0.3)"
  word-del: "rgba(255, 129, 130, 0.3)"
  scroll-thumb: "rgba(110, 118, 129, 0.4)"
  syntax-keyword: "#ff7b72"
  syntax-string: "#a5d6ff"
  syntax-comment: "#8b949e"
  syntax-function: "#d2a8ff"
  syntax-constant: "#79c0ff"
  syntax-entity: "#ffa657"`,
    `  word-add: "rgba(128, 191, 132, 0.3)"
  word-del: "rgba(255, 129, 130, 0.3)"
  word-del-strike: "rgba(255, 129, 130, 0.6)"
  scroll-thumb: "rgba(110, 118, 129, 0.4)"
  on-accent-chip: "rgba(255, 255, 255, 0.1)"
  on-accent-chip-border: "rgba(255, 255, 255, 0.45)"
  chip-face: "#ffffff"
  selected-hover: "#0860ca"
  ai-face: "#8250df"
  ai-face-hover: "#6639ba"
  syntax-keyword: "#cf222e"
  syntax-string: "#0a3069"
  syntax-comment: "#6e7781"
  syntax-function: "#8250df"
  syntax-constant: "#0550ae"
  syntax-entity: "#953800"
  syntax-keyword-dark: "#ff7b72"
  syntax-string-dark: "#a5d6ff"
  syntax-comment-dark: "#8b949e"
  syntax-function-dark: "#d2a8ff"
  syntax-constant-dark: "#79c0ff"
  syntax-entity-dark: "#ffa657"`
  ],
  // The agent's face is one value in both themes; the lighter violet is text.
  [
    `- The AI agent is the one self-expressive thing on the desk: a solid \`#8250df\` button, purple nowhere else.`,
    `- The AI agent is the one self-expressive thing on the desk: a solid \`#8250df\` button in both themes, purple nowhere else.`
  ],
  [
    `- **Success Green** (#1a7f37; dark \`#3fb950\`): additions, staged checkboxes and badges, and success banners. It is never a generic "primary" color.`,
    `- **Success Green** (#1a7f37; dark \`#3fb950\`): additions, staged checkboxes and badges, success banners, and the ring the commit button throws when a commit lands. It is never a generic "primary" color.`
  ],
  [
    `- **Agent Violet** (#8250df; dark \`#a371f7\`): the AI agent's Generate button and its spinner alone. The one accent GitHub itself lets be decorative.`,
    `- **Agent Violet** (#8250df; dark \`#a371f7\`): the AI agent alone. The button's face stays \`#8250df\` in both themes — a white label on \`#a371f7\` measures 3.35:1 and fails — while \`#a371f7\` is reserved for the agent's readout text and spinner. The one accent GitHub itself lets be decorative.`
  ],
  // Word marks name their token; the syntax palette re-lights per theme.
  [
    `- **Word-level marks** — \`--word-add\` rgba(128, 191, 132, 0.3), \`--word-del\` rgba(255, 129, 130, 0.3) struck at 0.6: Primer's own translucent pair, identical in both themes.`,
    `- **Word-level marks** — \`--word-add\` rgba(128, 191, 132, 0.3), \`--word-del\` rgba(255, 129, 130, 0.3), struck in \`--word-del-strike\` rgba(255, 129, 130, 0.6): Primer's own translucent pair, identical in both themes.`
  ],
  [
    `- **Syntax palette** (GitHub's dark syntax colors, identical in both themes so a diff never re-lights): keyword/boolean #ff7b72, string #a5d6ff, comment #8b949e, function #d2a8ff, number/constant #79c0ff, entity #ffa657 — exempt from the role roster because they name language tokens, not git state.`,
    `- **Syntax palette** — GitHub's own, re-lit per theme exactly as the real blob view does, held in \`--syntax-*\` tokens: light keyword #cf222e, string #0a3069, comment #6e7781, function #8250df, constant #0550ae, entity #953800; dark #ff7b72, #a5d6ff, #8b949e, #d2a8ff, #79c0ff, #ffa657. Exempt from the role roster because they name language tokens, not git state.`
  ],
  // Motion: the swap is a keyed fade, and entrances carry a hair of scale.
  [
    `Floated layers fade in with a hair of scale; the desk swap is a crossfade; a running operation gets a spinner; and a commit or push that lands gets confetti.`,
    `Floated layers fade in with a hair of scale; the desk swap fades the incoming pane in; a running operation gets a spinner; and a commit or push that lands gets confetti.`
  ],
  [
    `Three tiers on color and opacity only — \`--motion-instant\` 90ms (cursor answers: background, border, text color), \`--motion-fast\` 140ms (floated-layer fades, the desk-swap crossfade, the diff fade-in), \`--motion-layer\` 200ms (dialog and toast entrances).`,
    `Three tiers, on color and opacity plus a hair of scale on entrances — \`--motion-instant\` 90ms (cursor answers: background, border, text color), \`--motion-fast\` 140ms (floated-layer fades, the desk-swap fade, the diff fade-in), \`--motion-layer\` 200ms (dialog and toast entrances).`
  ],
  // Buttons ship their press state.
  [
    `- **AI (\`.btn.ai\`):** solid Agent Violet with a white label; hover deepens to \`#6639ba\`. The only purple object on the desk.`,
    `- **AI (\`.btn.ai\`):** solid \`#8250df\` with a white label and a text-presented sparkle (a gold emoji would be a color with no role); hover deepens to \`#6639ba\`. The only purple object on the desk.`
  ],
  // The status column is a symbol column, and the doc must say so.
  [
    `What is left to speak loudly is the repository: a status letter, a green add-row, the ahead/behind count, the diff.`,
    `What is left to speak loudly is the repository: a status symbol, a green add-row, the ahead/behind count, the diff.`
  ],
  [
    `- **Status:** a 14px letter column at the row head codes file state (new/deleted/conflicted/renamed/modified) in the semantic palette, modified in amber. Staged badges carry green text and are clickable; unstaged are static. On a selected row the letters invert to white and stay legible, because the glyph is a letter.`,
    `- **Status:** a 14px symbol column at the row head codes file state (new, deleted, conflicted, renamed, modified) in the semantic palette, modified in amber. Staged badges carry green text and are clickable; unstaged are static. On a selected row the symbols invert to white and stay legible, because the mark is a distinct shape and the file's own git status is one keystroke away.`
  ],
  [
    `muted secondaries at 0.82 white (0.8 in dark), chips at \`--on-accent-chip\`, and a deeper accent on hover.`,
    `muted secondaries at 0.82 white (0.8 in dark), chips at \`--on-accent-chip\` with a \`--on-accent-chip-border\` ring, and on hover a deeper accent — \`#0860ca\` in light, and \`#1f6feb\` held in dark, where Primer's lighter dark-hover blue would drop white text under AA.`
  ],
  [
    `- **Style:** counter pills at 10.5px mono — canvas face, \`--btn-border\` ring, muted ink — turning accent-tinted inside the active tab and del-washed for the Conflicts count.`,
    `- **Style:** counter pills at 10.5px mono — \`--chip-face\` (canvas in light, \`#21262d\` in dark), \`--btn-border\` ring, muted ink — turning accent-tinted inside the active tab and del-washed for the Conflicts count.`
  ],
  // The hunk row now tints its gutter, and syntax names its tokens.
  [
    `add and del rows tint **both** the row and its gutter (\`--add-bg\`/\`--add-gutter\`, \`--del-bg\`/\`--del-gutter\`), while the hunk row tints its ground (\`--hunk-bg\`) and sets its content in accent (\`--hunk-text\`) — GitHub's blob view, not a generic table. Word-level highlights use \`--word-add\`/\`--word-del\` at 2px radius, deletions struck at 0.6. Split mode halves the pane at \`calc(50% - 48px)\` with an empty-side ghost at 0.55 opacity. Prism syntax colors ride GitHub's dark syntax palette in both themes. An empty pane is plain canvas with centered guidance — no wash, no illustration.`,
    `add, del and hunk rows tint **both** the row and its gutter (\`--add-bg\`/\`--add-gutter\`, \`--del-bg\`/\`--del-gutter\`, \`--hunk-bg\`/\`--hunk-gutter\`) with the line number in the matching state color; the hunk row's content sets in \`--hunk-text\` — GitHub's blob view, not a generic table. Word-level highlights use \`--word-add\`/\`--word-del\` at 2px radius, deletions struck in \`--word-del-strike\`. Split mode halves the pane at \`calc(50% - 48px)\` with an empty-side ghost at 0.55 opacity. Prism syntax colors read the \`--syntax-*\` tokens, so code re-lights with the theme. An empty pane is plain canvas with centered guidance and an ink heading — no wash, no illustration.`
  ]
]

for (const [rawFind, rawRepl] of pairs) {
  const find = eolize(rawFind)
  const repl = eolize(rawRepl)
  const i = doc.indexOf(find)
  if (i === -1) {
    missed.push(find.slice(0, 70).replace(/\n/g, '\\n'))
    continue
  }
  if (doc.indexOf(find, i + 1) !== -1) {
    missed.push('AMBIGUOUS: ' + find.slice(0, 70).replace(/\n/g, '\\n'))
    continue
  }
  doc = doc.slice(0, i) + repl + doc.slice(i + find.length)
}
writeFileSync(FILE, doc)
console.log(missed.length ? 'MISSED:\n' + missed.join('\n') : 'DESIGN.md reconciled')
