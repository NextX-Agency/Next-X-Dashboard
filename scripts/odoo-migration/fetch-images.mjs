// Downloads every product's ORIGINAL image once, byte-for-byte (no resize, no re-encode), into
// docs/odoo-migration/private/images/<uuid>.<ext> and records sha256, size and pixel dimensions.
//   node scripts/odoo-migration/fetch-images.mjs
// Re-running skips files whose hash already matches. Images are the shop's own public product photos.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'odoo-migration', 'private')
const items = JSON.parse(readFileSync(join(root, 'source', 'items.json'), 'utf8'))
const dir = join(root, 'images')
mkdirSync(dir, { recursive: true })

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }

// Read pixel dimensions from the header without decoding, so nothing is re-encoded.
function dimensions(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i < buf.length - 9; ) {
      if (buf[i] !== 0xff) { i++; continue }
      const m = buf[i + 1]
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const t = buf.toString('ascii', 12, 16)
    if (t === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)]
    if (t === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]
    if (t === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1] }
  }
  return [null, null]
}

const manifest = []
for (const item of items) {
  if (!item.image_url) { manifest.push({ id: item.id, name: item.name, status: 'NO_IMAGE_URL' }); continue }
  const res = await fetch(item.image_url)
  if (!res.ok) { manifest.push({ id: item.id, name: item.name, status: `HTTP_${res.status}`, url: item.image_url }); continue }
  const type = (res.headers.get('content-type') || '').split(';')[0]
  const buf = Buffer.from(await res.arrayBuffer())
  const ext = EXT[type] || 'bin'
  const file = `${item.id}.${ext}`
  const sha = createHash('sha256').update(buf).digest('hex')
  if (!existsSync(join(dir, file)) || createHash('sha256').update(readFileSync(join(dir, file))).digest('hex') !== sha) writeFileSync(join(dir, file), buf)
  const [w, h] = dimensions(buf)
  manifest.push({ id: item.id, name: item.name.trim(), file, type, bytes: buf.length, sha256: sha, width: w, height: h, status: 'OK' })
}
writeFileSync(join(root, 'images-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const ok = manifest.filter(m => m.status === 'OK')
console.log(`${ok.length}/${manifest.length} images downloaded; smallest side min/median:`,
  Math.min(...ok.map(m => Math.min(m.width, m.height))), ok.map(m => Math.min(m.width, m.height)).sort((a, b) => a - b)[Math.floor(ok.length / 2)])
for (const m of manifest.filter(m => m.status !== 'OK')) console.log('PROBLEM', m.status, m.name)
