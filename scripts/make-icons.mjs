/**
 * Generates the GitDesk icon set from the single design source of truth,
 * `resources/gitdesk-icon.svg`.
 *
 *   npm run icons
 *
 * The geometry is redrawn here (see MARK below — keep the two in step) and
 * rasterized with signed-distance fields at supersampled coverage, so the
 * build needs no image library, no Chromium and no network: `node` alone
 * produces PNG, ICO and the macOS source. The tape is an exact-primitives
 * composition — a rounded box for the deck, a convex band with two rounded
 * corners and a straight chamfer at the leaving edge, rounded-square
 * sprockets, circle punches — which an SDF covers better than any bitmap
 * scaler would.
 *
 * The color model, like the SVG: deck ink everywhere the tile is; a band of
 * card stock paper over it; every sprocket and empty hole printed in deck
 * ink (the record was never anywhere else); and commit blue in exactly one
 * place, the head-commit hole at the leading edge. The tile is opaque —
 * on tape, nothing knocks out.
 *
 * Outputs (all under resources/icons/):
 *   png/{size}x{size}.png   — 16…1024, also the linux.icon directory
 *   gitdesk.ico             — 16…256, for win.icon and the runtime window icon
 *   gitdesk.png             — 1024, for mac.icon (electron-builder builds the icns)
 */
import { mkdirSync, writeFileSync } from 'fs'
import { deflateSync } from 'zlib'
import { join } from 'path'
import { fileURLToPath } from 'url'

const root = fileURLToPath(new URL('..', import.meta.url))
const iconDir = join(root, 'resources', 'icons')
const pngDir = join(iconDir, 'png')

const PNG_SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Mirror of resources/gitdesk-icon.svg, in that file's 512-unit space. */
const MARK = {
  canvas: 512,
  tileRadius: 64,
  paper: '#e9e2cf',
  ink: '#0b1120',
  accent: '#0969da',
  /** The paper tape: the clockwise-on-screen convex quad below; the r 20
   *  left corners live at arc centers (84,188) and (84,340), and the right
   *  edge is the 45-unit chamfer (464,168)→(412,360) — the tape leaving
   *  the printer. Prints clip to this shape. */
  band: {
    verts: [
      [64, 168],
      [464, 168],
      [412, 360],
      [64, 360]
    ],
    rounds: [
      { cx: 84, cy: 188, r: 20 },
      { cx: 84, cy: 340, r: 20 }
    ]
  },
  /** Sprockets: 16-unit squares, rx 3, on 52-unit centers. The top row
   *  carries seven (y = 192, x = 100…412); the bottom six (y = 348,
   *  x = 100…360) — the seventh would fall off the chamfer. */
  sprockets: {
    half: 8,
    radius: 3,
    rows: [
      { y: 192, xs: [100, 152, 204, 256, 308, 360, 412] },
      { y: 348, xs: [100, 152, 204, 256, 308, 360] }
    ]
  },
  /** The data row on a 104-unit pitch: two empty holes and, at the leading
   *  edge, the head commit. r = 26 keeps the holes readable discs at the
   *  16 px cut, where the sprocket rows fuse into track lines instead. */
  holes: { x: [148, 252, 356], y: 264, radius: 26 },
  /** The right-most hole is not an empty print — it is punched and inked. */
  headIndex: 2
}

const CRC_TABLE = buildCrcTable()

/* ------------------------------------------------------------------ geometry */

/** Signed distance to the deck tile (rounded square), negative inside. */
function distanceToTile(x, y) {
  const half = MARK.canvas / 2
  const r = MARK.tileRadius
  const qx = Math.abs(x - half) - (half - r)
  const qy = Math.abs(y - half) - (half - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** Convex-band containment: clockwise-on-screen quad, interior to the
 *  cross-product left of every directed edge. */
function insideBand(x, y) {
  const v = MARK.band.verts
  for (let i = 0; i < v.length; i++) {
    const [vx, vy] = v[i]
    const [nx, ny] = v[(i + 1) % v.length]
    if ((nx - vx) * (y - vy) - (ny - vy) * (x - vx) <= 0) return false
  }
  return true
}

/** Signed distance to the paper tape. Inside, the distance is the nearest
 *  edge half-plane; outside, the nearest real edge segment or corner arc —
 *  exact for a convex shape with rounded convex corners. */
function distanceToBand(x, y) {
  const { verts, rounds } = MARK.band
  if (insideBand(x, y)) {
    let nearest = Infinity
    for (let i = 0; i < verts.length; i++) {
      const [vx, vy] = verts[i]
      const [nx, ny] = verts[(i + 1) % verts.length]
      nearest = Math.min(
        nearest,
        ((nx - vx) * (y - vy) - (ny - vy) * (x - vx)) / Math.hypot(nx - vx, ny - vy)
      )
    }
    return -nearest
  }
  let nearest = Infinity
  for (let i = 0; i < verts.length; i++) {
    nearest = Math.min(nearest, distanceToSegment(x, y, verts[i], verts[(i + 1) % verts.length]))
  }
  for (const { cx, cy, r } of rounds) {
    nearest = Math.min(nearest, Math.hypot(x - cx, y - cy) - r)
  }
  return nearest
}

function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const abx = bx - ax
  const aby = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby)))
  return Math.hypot(x - (ax + t * abx), y - (ay + t * aby))
}

/** Distance to a sprocket: an rx-3 square of half-extent 8. */
function distanceToSprocket(x, y, cx, cy) {
  const h = MARK.sprockets.half - MARK.sprockets.radius
  const qx = Math.abs(x - cx) - h
  const qy = Math.abs(y - cy) - h
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - MARK.sprockets.radius
}

function distanceToHole(x, y, index) {
  return Math.hypot(x - MARK.holes.x[index], y - MARK.holes.y) - MARK.holes.radius
}

/** Distance fields the rasterizer needs at one sample point. */
function sampleDistances(x, y) {
  const prints = []
  for (const row of MARK.sprockets.rows) {
    for (const cx of row.xs) prints.push(distanceToSprocket(x, y, cx, row.y))
  }
  for (let i = 0; i < MARK.holes.x.length; i++) {
    if (i !== MARK.headIndex) prints.push(distanceToHole(x, y, i))
  }
  return {
    tile: distanceToTile(x, y),
    band: distanceToBand(x, y),
    prints,
    head: distanceToHole(x, y, MARK.headIndex)
  }
}

/* ----------------------------------------------------------------- rasterize */

/**
 * Coverage-per-sample anti-aliasing: each target pixel averages
 * samples × samples analytic coverages, which keeps the 16 px cut as crisp as
 * the 1024 px sheet without a resampler anywhere in the loop.
 */
function rasterize(size, samples) {
  const buffer = new Uint8Array(size * size * 4)
  const paper = parseHex(MARK.paper)
  const ink = parseHex(MARK.ink)
  const accent = parseHex(MARK.accent)
  const scale = MARK.canvas / size
  // One target pixel of edge falloff, expressed in 512-space.
  const softness = scale

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let tileCoverage = 0
      let paperCoverage = 0
      let printCoverage = 0
      let headCoverage = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) * scale
          const y = (py + (sy + 0.5) / samples) * scale
          const { tile, band, prints, head } = sampleDistances(x, y)
          const onTile = coverage(tile, softness)
          if (onTile === 0) continue
          // The tape lies on the deck; the record's prints lie on the tape.
          const onBand = coverage(band, softness) * onTile
          // The empty prints are a disjoint union of sprockets and empty
          // holes; product coverage keeps AA honest where rims near-touch.
          let punched = 1
          for (const d of prints) punched *= 1 - coverage(d, softness)
          tileCoverage += onTile
          paperCoverage += onBand
          printCoverage += (1 - punched) * onBand
          headCoverage += coverage(head, softness) * onBand
        }
      }
      const samplesTotal = samples * samples
      const aTile = tileCoverage / samplesTotal
      // Every layer sits on the deck: un-premultiply by the tile's coverage
      // so the shared edges stay one alpha value.
      const aPaper = aTile === 0 ? 0 : paperCoverage / samplesTotal / aTile
      const aPrint = aTile === 0 ? 0 : printCoverage / samplesTotal / aTile
      const aHead = aTile === 0 ? 0 : headCoverage / samplesTotal / aTile
      let [r, g, b] = ink
      r = blend(r, paper[0], aPaper)
      g = blend(g, paper[1], aPaper)
      b = blend(b, paper[2], aPaper)
      r = blend(r, ink[0], aPrint)
      g = blend(g, ink[1], aPrint)
      b = blend(b, ink[2], aPrint)
      r = blend(r, accent[0], aHead)
      g = blend(g, accent[1], aHead)
      b = blend(b, accent[2], aHead)
      const at = (py * size + px) * 4
      buffer[at] = r
      buffer[at + 1] = g
      buffer[at + 2] = b
      buffer[at + 3] = Math.round(aTile * 255)
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
writeFileSync(join(iconDir, 'gitdesk.ico'), ico)
writeFileSync(join(iconDir, 'gitdesk.png'), pngs.get(1024))
console.log(`resources/icons/gitdesk.ico (${ico.byteLength} bytes, ${ICO_SIZES.join('/')} px)`)
console.log('resources/icons/gitdesk.png (1024 px, mac.icon source)')
