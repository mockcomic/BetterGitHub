---
version: 1
slug: "resources-gitdesk-icon-svg"
primary_target: "resources/gitdesk-icon.svg"
related_targets: ["scripts/make-icons.mjs","src/renderer/src/components/TitleBar.tsx","src/main/windows.ts","package.json","src/renderer/src/styles.css"]
---

# Surface brief: GitDesk app mark (`resources/gitdesk-icon.svg`)

**Mode:** Persuade (identity). **Build path:** code-led (no image generation this harness).

## Direction contract

THESIS: A commit is a hole punched permanently into a record — the mark IS that record: an IBM punched card, the audience's own founding artifact. It refuses the category-default commit-graph glyph (the incumbent's rut, GitHub Desktop's too) and the terminal-chevron cliché every dev tool reaches for.

OWN-WORLD: Punched-card artifact in two-value purity. Card-stock paper `#e9e2cf` is the tile; deep ink `#0b1120` is a printed keyline only (one outline, no fills); commit blue `#0969da` appears exactly once, as the head-commit hole punched and inked. Two further holes in the same row are pure alpha knockouts — the desktop ground shows through the record. Hard edges, zero gray, zero gradients. The identity marks: oversized 45° corner cut at the top right (the branch leaving the deck), a semicircular timing notch on the top edge, three holes on a strict 128-unit module grid at the row's center.

STORY: At one glance the visitor holds a physical, machine-readable truth: holes either are or are not punched — git truth, no magic. History is empty holes; exactly one carries the app's blue: the head commit, the current work, the one that acts. Nothing decodes git literally; the object carries it.

FIRST VIEWPORT: The icon at its sizes IS the viewport. 16px (title bar, small taskbar): paper square with a clearly readable corner cut and the three-hole row (two voids, one blue) — the silhouette survives alone. 48–1024px: the printed keyline, notch, and exact grid geometry come forward. The inverted form (ink card, paper keyline and nodes) must read the same silhouette with no new geometry — the Inversion-state raise; it is verified as a render, shipped only if the product later needs a dark-ground asset.

FORM: Replacement brand world chosen from the direction roll — assigned candidate 5 of seven grounded systems spanning interface type, drafting standards, paper ephemera, mechanical signage, computing artifacts, and optics. Seed key f2f9efa2. Raises carried and named on the chosen card: Monofrequency commitment (one ink, once), Sectional reveal (knockout alpha), Two-value purity, Impression weight (oversized cuts, flat masses), Meaningful grid (128-unit module), Inversion state (HyperCard).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Scope boundaries

Preserved: the asset pipeline (single SVG source of truth → `scripts/make-icons.mjs` SDF rasterizer → `resources/icons/` PNG 16–1024, `gitdesk.ico`, `gitdesk.png`), the consumption points (`BrowserWindow.icon` in `src/main/windows.ts`, `build.*.icon` in `package.json`, `TitleBar.tsx` import), file names, and the flat/no-gradient discipline DESIGN.md keeps. The user granted full freedom on concept, hues, and effects, and pinned no anchors. The old mark's PRODUCT.md brand-commitment paragraph is replaced with the new mark's description at finish. The rasterizer's color model extends from two flat colors to three (paper, keyline ink, single accent) plus true alpha knockouts — SDF CSG, same dependency-free pipeline.
