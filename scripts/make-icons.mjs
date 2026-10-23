/**
 * Generates the GitDesk icon set from the single design source of truth,
 * `resources/gitdesk-icon.svg`.
 *
 *   npm run icons
 *
 * The geometry is redrawn here (see MARK below — keep the two in step) and
 * rasterized with signed-distance fields at supersampled coverage, so the
 * build needs no image library, no Chromium and no network: `node` alone
 * produces PNG, ICO and the macOS source. The card is a union-free CSG
 * composition of exact primitives — a rounded box, a straight 45° corner
 * cut, one edge notch and three circle holes — which an SDF covers better
 * than any bitmap scaler would.
 *
 * The color model, like the SVG: card-stock paper everywhere the card is;
 * a printed keyline in deep ink along every rim (outer edge, cut, notch,
 * hole rims), erased inside the two empty holes; and commit blue in exactly
 * one place, the head-commit hole. The empty holes are true alpha knockouts
 * — the desktop shows through the record.
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
  cornerRadius: 64,
  paper: '#e9e2cf',
  ink: '#0b1120',
  accent: '#0969da',
  keyline: 8,
  /** The 45° corner cut keeps the side x − y ≤ CUT_LEG (chord from
   *  (344, 0) to (512, 168) — legs of 168). */
  cutLeg: 344,
  /** Semicircular timing notch: circle at (256, 0), cut from the top edge. */
  notch: { cx: 256, cy: 0, radius: 36 },
  /** The hole row on a strict 128-unit module grid. r = 52 leaves a 24-unit
   *  paper gap between hole rims; with the keyline's 4-unit outer reach each
   *  ring reads 56 in radius, leaving a 16-unit bridge between visible rings
   *  (~1 px at 32 px) that AA softens rather than fuses outright. The holes
   *  stay readable discs at the 16 px cut. */
  holeRadius: 52,
  holes: { x: [128, 256, 384], y: 280 },
  /** The right-most hole is not knocked out — it is punched and inked. */
  headIndex: 2
}

const CRC_TABLE = buildCrcTable()

/* ------------------------------------------------------------------ geometry */

/** Signed distance to the card body (tile minus cut minus notch), negative
 *  inside. The empty holes are subtracted separately so the keyline can read
 *  their rims. */
function distanceToCardBody(x, y) {
  const half = MARK.canvas / 2
  const r = MARK.cornerRadius
  const qx = Math.abs(x - half) - (half - r)
  const qy = Math.abs(y - half) - (half - r)
  let d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  // Corner cut: keep the side x − y ≤ cutLeg.
  const cut = (x - y - MARK.cutLeg) / Math.SQRT2
  if (cut > d) d = cut
  // Timing notch: a punched half-circle on the top edge.
  const notch = Math.hypot(x - MARK.notch.cx, y - MARK.notch.cy) - MARK.notch.radius
  const knocked = -notch
  if (knocked > d) d = knocked
  return d
}

function distanceToHole(x, y, index) {
  return Math.hypot(x - MARK.holes.x[index], y - MARK.holes.y) - MARK.holeRadius
}

/** Distance fields the rasterizer needs at one sample point. */
function sampleDistances(x, y) {
  const body = distanceToCardBody(x, y)
  const holes = MARK.holes.x.map((_, i) => distanceToHole(x, y, i))
  // The card as printed: the body with the empty holes knocked out; the head
  // hole stays card material and only carries ink.
  let card = body
  let rim = body
  for (let i = 0; i < holes.length; i++) {
    if (i === MARK.headIndex) continue
    const knocked = -holes[i]
    if (knocked > card) card = knocked
    if (Math.abs(holes[i]) < Math.abs(rim)) rim = holes[i]
  }
  if (Math.abs(holes[MARK.headIndex]) < Math.abs(rim)) rim = holes[MARK.headIndex]
  return { card, rim, head: holes[MARK.headIndex] }
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
  const halfKey = MARK.keyline / 2

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cardCoverage = 0
      let keyCoverage = 0
      let accentCoverage = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) * scale
          const y = (py + (sy + 0.5) / samples) * scale
          const { card, rim, head } = sampleDistances(x, y)
          const onCard = coverage(card, softness)
          if (onCard === 0) continue
          cardCoverage += onCard
          // The printed keyline hugs every rim of the finished card; it is
          // punched away wherever the card itself is gone.
          keyCoverage += coverage(Math.abs(rim) - halfKey, softness) * onCard
          accentCoverage += coverage(head, softness) * onCard
        }
      }
      const samplesTotal = samples * samples
      const aCard = cardCoverage / samplesTotal
      // Every layer sits on the card: un-premultiply by the card's coverage
      // so the shared edges stay one alpha value.
      const aKey = aCard === 0 ? 0 : keyCoverage / samplesTotal / aCard
      const aInk = aCard === 0 ? 0 : accentCoverage / samplesTotal / aCard
      let [r, g, b] = paper
      r = blend(r, ink[0], aKey)
      g = blend(g, ink[1], aKey)
      b = blend(b, ink[2], aKey)
      r = blend(r, accent[0], aInk)
      g = blend(g, accent[1], aInk)
      b = blend(b, accent[2], aInk)
      const at = (py * size + px) * 4
      buffer[at] = r
      buffer[at + 1] = g
      buffer[at + 2] = b
      buffer[at + 3] = Math.round(aCard * 255)
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
