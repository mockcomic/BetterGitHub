/**
 * Generates the Aspen icon set from the single design source of truth,
 * `resources/aspen-icon.svg`.
 *
 *   npm run icons
 *
 * The geometry is redrawn here (see MARK below — keep the two in step) and
 * rasterized with signed-distance fields at supersampled coverage, so the
 * build needs no image library, no Chromium and no network: `node` alone
 * produces PNG, ICO and the macOS source. The mark is exact-primitives
 * apart from the leaf silhouette: a closed polygon shared with the SVG as
 * data (resources/logo-aspen/leaf-path.json), capsules for the veins, and
 * circles for the commits — which an SDF covers better than any bitmap
 * scaler would.
 *
 * The color model, like the SVG: a flat deep-forest-green leaf with its
 * petiole; the commit graph knocked out of it in warm white; golden yellow
 * in exactly one place, the right-hand commit. At 32 px and below the pass
 * switches to the simplified cut (heavier veins, larger nodes) so the graph
 * survives at taskbar and tray size.
 *
 * Outputs (all under resources/icons/):
 *   png/{size}x{size}.png   — 16…1024, also the linux.icon directory
 *   aspen.ico               — 16…256, for win.icon and the runtime window icon
 *   aspen.png               — 1024, for mac.icon (electron-builder builds the icns)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { deflateSync } from 'zlib'
import { join } from 'path'
import { fileURLToPath } from 'url'

const root = fileURLToPath(new URL('..', import.meta.url))
const iconDir = join(root, 'resources', 'icons')
const pngDir = join(iconDir, 'png')

const PNG_SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Mirror of resources/aspen-icon.svg, in that file's 512-unit space. */
const MARK = {
  canvas: 512,
  leaf: '#215c4a',
  vein: '#fbf7ea',
  accent: '#e3ac38',
  /** The leaf silhouette as [x, y] pairs: traced from the selected ComfyUI
   *  render (provenance in resources/logo-aspen/GENERATION.md) and
   *  simplified to straight segments. Loaded from the shared path file so
   *  the SVG and this rasterizer can never drift apart. */
  leafPath: JSON.parse(
    readFileSync(join(root, 'resources', 'logo-aspen', 'leaf-path.json'), 'utf8')
  ),
  /** The petiole: a 24-unit-wide bar under the leaf, rounded r 12 at both
   *  ends (the top end hides inside the leaf, so it reads as one shape). */
  stem: { x: 256, top: 444, bottom: 484, halfWidth: 12, radius: 12 },
  /** The commit graph, full weight (SVG parity): r 17 capsules — a trunk
   *  from just under the tip to the base, forking at forkY into one commit
   *  on each side — with r 40 commit discs. */
  graph: {
    trunkX: 256,
    topY: 148,
    bottomY: 428,
    forkY: 322,
    span: 118,
    rise: 66,
    veinWidth: 34,
    nodeRadius: 40
  },
  /** The small-size cut: same topology, heavier strokes, so the graph
   *  survives the 16 px and 24 px tiles instead of merging into a blob. */
  graphSmall: {
    trunkX: 256,
    topY: 150,
    bottomY: 420,
    forkY: 328,
    span: 108,
    rise: 60,
    veinWidth: 46,
    nodeRadius: 48
  }
}

const CRC_TABLE = buildCrcTable()

/* ------------------------------------------------------------------ geometry */

function pointInPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const abx = bx - ax
  const aby = by - ay
  const l2 = abx * abx + aby * aby
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / l2))
  return Math.hypot(x - (ax + t * abx), y - (ay + t * aby))
}

/** Signed distance to the leaf polygon: negative inside, nearest edge
 *  distance outside. Exact for any closed non-self-intersecting polygon. */
function distanceToLeaf(x, y, poly) {
  let nearest = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    nearest = Math.min(nearest, distanceToSegment(x, y, poly[j], poly[i]))
  }
  return pointInPolygon(x, y, poly) ? -nearest : nearest
}

/** Signed distance to the petiole (rounded box). */
function distanceToStem(x, y) {
  const { x: cx, top, bottom, halfWidth, radius } = MARK.stem
  const half = (bottom - top) / 2
  const r = Math.min(radius, half, halfWidth)
  const qx = Math.abs(x - cx) - (halfWidth - r)
  const qy = Math.abs(y - (top + bottom) / 2) - (half - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** The three capsule axes of the commit graph. */
function graphAxes(g) {
  return [
    { a: [g.trunkX, g.topY], b: [g.trunkX, g.bottomY] },
    { a: [g.trunkX, g.forkY], b: [g.trunkX - g.span, g.forkY - g.rise] },
    { a: [g.trunkX, g.forkY], b: [g.trunkX + g.span, g.forkY - g.rise] }
  ]
}

/** The three commit discs; the right-hand one carries the single accent. */
function nodeCenters(g) {
  return [
    { x: g.trunkX, y: g.topY, accent: false },
    { x: g.trunkX - g.span, y: g.forkY - g.rise, accent: false },
    { x: g.trunkX + g.span, y: g.forkY - g.rise, accent: true }
  ]
}

/* ----------------------------------------------------------------- rasterize */

/**
 * Coverage-per-sample anti-aliasing: each target pixel averages
 * samples × samples analytic coverages, which keeps the 16 px cut as crisp as
 * the 1024 px sheet without a resampler anywhere in the loop.
 */
function rasterize(size, samples) {
  const buffer = new Uint8Array(size * size * 4)
  const leaf = parseHex(MARK.leaf)
  const vein = parseHex(MARK.vein)
  const accent = parseHex(MARK.accent)
  const scale = MARK.canvas / size
  // One target pixel of edge falloff, expressed in 512-space.
  const softness = scale
  const g = size <= 32 ? MARK.graphSmall : MARK.graph
  const poly = MARK.leafPath
  const axes = graphAxes(g).map(({ a, b }) => ({ a, b, half: g.veinWidth / 2 }))
  const nodes = nodeCenters(g).map(n => ({ ...n, r: g.nodeRadius }))

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let leafCoverage = 0
      let veinCoverage = 0
      let accentCoverage = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) * scale
          const y = (py + (sy + 0.5) / samples) * scale
          const onLeaf = Math.max(
            coverage(distanceToLeaf(x, y, poly), softness),
            coverage(distanceToStem(x, y), softness)
          )
          if (onLeaf === 0) continue
          let onVein = 0
          for (const { a, b, half } of axes) {
            onVein = Math.max(onVein, coverage(distanceToSegment(x, y, a, b) - half, softness))
          }
          for (const n of nodes) {
            const c = coverage(Math.hypot(x - n.x, y - n.y) - n.r, softness)
            if (n.accent) accentCoverage += c * onLeaf
            else onVein = Math.max(onVein, c)
          }
          leafCoverage += onLeaf
          veinCoverage += onVein * onLeaf
        }
      }
      const samplesTotal = samples * samples
      const aLeaf = leafCoverage / samplesTotal
      // Every layer sits on the leaf: un-premultiply by the leaf's coverage
      // so the shared edges stay one alpha value.
      const aVein = aLeaf === 0 ? 0 : veinCoverage / samplesTotal / aLeaf
      const aAccent = aLeaf === 0 ? 0 : accentCoverage / samplesTotal / aLeaf
      let [r, g2, b] = leaf
      r = blend(r, vein[0], aVein)
      g2 = blend(g2, vein[1], aVein)
      b = blend(b, vein[2], aVein)
      r = blend(r, accent[0], aAccent)
      g2 = blend(g2, accent[1], aAccent)
      b = blend(b, accent[2], aAccent)
      const at = (py * size + px) * 4
      buffer[at] = r
      buffer[at + 1] = g2
      buffer[at + 2] = b
      buffer[at + 3] = Math.round(aLeaf * 255)
    }
  }
  return buffer
}

/** Distance-to-coverage, saturated by a smoothstep so the rim stays even. */
function coverage(distance, softness) {
  let t = 0.5 - distance / softness
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return t * t * (3 - 2 * t)
}

function blend(base, over, amount) {
  return Math.round(base + (over - base) * amount)
}

function parseHex(value) {
  const digits = value.replace('#', '')
  return [0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16))
}

/* ------------------------------------------------------------------ encoders */

/** Minimal 8-bit RGBA PNG: signature + IHDR + one zlib IDAT + IEND. */
function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // filter method
  ihdr[12] = 0 // no interlace

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter 0 (None) on every scanline
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.byteLength, 0)
  head.write(type, 4, 'ascii')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0)
  return Buffer.concat([head, data, tail])
}

function buildCrcTable() {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
}

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * ICO container with PNG image entries: ICONDIR + ICONDIRENTRY[] + payloads.
 * A 256 px entry stores its dimension as 0, which readers read as 256.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(entries.length * 16)
  let offset = header.byteLength + directory.byteLength
  const payloads = []
  entries.forEach((entry, index) => {
    const at = index * 16
    const dimension = entry.size >= 256 ? 0 : entry.size
    directory.writeUInt8(dimension, at) // width
    directory.writeUInt8(dimension, at + 1) // height
    directory.writeUInt8(0, at + 2) // palette count
    directory.writeUInt8(0, at + 3) // reserved
    directory.writeUInt16LE(1, at + 4) // color planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32LE(entry.png.byteLength, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.png.byteLength
    payloads.push(entry.png)
  })

  return Buffer.concat([header, directory, ...payloads])
}

/* ---------------------------------------------------------------------- run */

mkdirSync(pngDir, { recursive: true })

const samplesFor = size => (size <= 128 ? 4 : size <= 256 ? 3 : 2)

const pngs = new Map()
for (const size of PNG_SIZES) {
  const png = encodePng(size, rasterize(size, samplesFor(size)))
  pngs.set(size, png)
  writeFileSync(join(pngDir, `${size}x${size}.png`), png)
  console.log(`resources/icons/png/${size}x${size}.png (${png.byteLength} bytes)`)
}

const ico = buildIco(ICO_SIZES.map(size => ({ size, png: pngs.get(size) })))
writeFileSync(join(iconDir, 'aspen.ico'), ico)
writeFileSync(join(iconDir, 'aspen.png'), pngs.get(1024))
writeFileSync(
  join(iconDir, 'aspen.ico.json'),
  JSON.stringify(
    {
      prompt:
        'Origin: AI-generated source, vectorized. The Aspen app mark: one flat aspen leaf (deep forest green #215c4a) whose veins are a git commit graph knocked out in warm white (#fbf7ea), with a single golden-yellow accent (#e3ac38) on the right-hand node. Source render: ComfyUI Qwen Image 2.1, KSampler euler/simple 28 steps cfg 3.5, seed 13337 — provenance in resources/logo-aspen/GENERATION.md. Leaf outline traced with potrace and simplified to straight segments (resources/logo-aspen/leaf-path.json); veins and nodes are exact primitives. Regenerate with `npm run icons`.',
      createdAt: '2026-10-30T00:00:00.000Z'
    },
    null,
    2
  ) + '\n',
  'utf8'
)
console.log(`resources/icons/aspen.ico (${ico.byteLength} bytes, ${ICO_SIZES.join('/')} px)`)
console.log('resources/icons/aspen.png (1024 px, mac.icon source)')
