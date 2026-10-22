/**
 * Generates the GitDesk icon set from the single design source of truth,
 * `resources/gitdesk-icon.svg`.
 *
 *   npm run icons
 *
 * The geometry is redrawn here (see MARK below — keep the two in step) and
 * rasterized with signed-distance fields at supersampled coverage, so the
 * build needs no image library, no Chromium and no network: `node` alone
 * produces PNG, ICO and the macOS source. The shapes are exact primitives
 * (one rounded box, one trunk segment, one cubic branch, four commit circles),
 * which an SDF covers better than any bitmap scaler would.
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
  cornerRadius: 112,
  tile: '#0b1120',
  accent: '#4493f8',
  stroke: 38,
  nodeRadius: 50,
  trunk: { x: 187, top: 128, bottom: 384 },
  // [p0, c1, c2, p3] of the branch that leaves the middle commit.
  branch: [
    [187, 256],
    [187, 190],
    [235, 152],
    [322, 152]
  ],
  nodes: [
    [187, 128],
    [187, 256],
    [187, 384],
    [322, 152]
  ]
}

const CRC_TABLE = buildCrcTable()

/* ------------------------------------------------------------------ geometry */

/**
 * Signed distance to the mark's ink, in 512-space: negative inside.
 * The glyph is a union of the two strokes (capsules) and the four commit
 * circles; the tile is a rounded box, kept separate so it can clip the glyph
 * and carry its own edge softness.
 */
function distanceToGlyph(x, y, branch) {
  const half = MARK.stroke / 2
  let d = distanceToSegment(x, y, MARK.trunk.x, MARK.trunk.top, MARK.trunk.x, MARK.trunk.bottom)
  for (let i = 0; i < branch.length - 1; i++) {
    const [ax, ay] = branch[i]
    const [bx, by] = branch[i + 1]
    const next = distanceToSegment(x, y, ax, ay, bx, by)
    if (next < d) d = next
  }
  d -= half
  for (const [cx, cy] of MARK.nodes) {
    const circle = Math.hypot(x - cx, y - cy) - MARK.nodeRadius
    if (circle < d) d = circle
  }
  return d
}

function distanceToTile(x, y) {
  const half = MARK.canvas / 2
  const r = MARK.cornerRadius
  const qx = Math.abs(x - half) - (half - r)
  const qy = Math.abs(y - half) - (half - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const lengthSq = vx * vx + vy * vy
  let t = lengthSq === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / lengthSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
}

/** Cubic → polyline, so branch distance is a min over a few segments. */
function flattenCubic([p0, c1, c2, p3], steps) {
  const points = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    points.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]
    ])
  }
  return points
}

/* ----------------------------------------------------------------- rasterize */

/**
 * Coverage-per-sample anti-aliasing: each target pixel averages
 * samples × samples analytic coverages, which keeps the 16 px cut as crisp as
 * the 1024 px sheet without a resampler anywhere in the loop.
 */
function rasterize(size, samples, branch) {
  const buffer = new Uint8Array(size * size * 4)
  const tile = parseHex(MARK.tile)
  const accent = parseHex(MARK.accent)
  const scale = MARK.canvas / size
  // One target pixel of edge falloff, expressed in 512-space.
  const softness = scale

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let tileCoverage = 0
      let inkCoverage = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) * scale
          const y = (py + (sy + 0.5) / samples) * scale
          const onTile = coverage(distanceToTile(x, y), softness)
          if (onTile === 0) continue
          tileCoverage += onTile
          inkCoverage += onTile * coverage(distanceToGlyph(x, y, branch), softness)
        }
      }
      const samplesTotal = samples * samples
      const aTile = tileCoverage / samplesTotal
      // The ink sits on the tile: un-premultiply by the tile's coverage so the
      // shared edge stays one alpha value.
      const aInk = aTile === 0 ? 0 : inkCoverage / samplesTotal / aTile
      const at = (py * size + px) * 4
      buffer[at] = blend(tile[0], accent[0], aInk)
      buffer[at + 1] = blend(tile[1], accent[1], aInk)
      buffer[at + 2] = blend(tile[2], accent[2], aInk)
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

// The branch polyline is derived once; the hot loop only walks it.
const branch = flattenCubic(MARK.branch, 24)
const samplesFor = size => (size <= 128 ? 4 : size <= 256 ? 3 : 2)

const pngs = new Map()
for (const size of PNG_SIZES) {
  const png = encodePng(size, rasterize(size, samplesFor(size), branch))
  pngs.set(size, png)
  writeFileSync(join(pngDir, `${size}x${size}.png`), png)
  console.log(`resources/icons/png/${size}x${size}.png (${png.byteLength} bytes)`)
}

const ico = buildIco(ICO_SIZES.map(size => ({ size, png: pngs.get(size) })))
writeFileSync(join(iconDir, 'gitdesk.ico'), ico)
writeFileSync(join(iconDir, 'gitdesk.png'), pngs.get(1024))
console.log(`resources/icons/gitdesk.ico (${ico.byteLength} bytes, ${ICO_SIZES.join('/')} px)`)
console.log('resources/icons/gitdesk.png (1024 px, mac.icon source)')
