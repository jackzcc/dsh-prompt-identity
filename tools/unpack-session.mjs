/**
 * Dev helper: decompress a multi-frame `session.v4.jsonl.zstd` into
 * `session.jsonl` beside this script.
 *
 * The log appends one zstd frame per record, and Node's zstd stream stops after
 * the first frame, so frames are located by magic bytes and decoded one by one.
 *
 *   node unpack-session.mjs <session.v4.jsonl.zstd>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const file = process.argv[2]
if (!file) throw new Error('usage: node unpack-session.mjs <session.v4.jsonl.zstd>')

const buf = readFileSync(file)
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const starts = []
for (let i = 0; i + 4 <= buf.length; i += 1) {
  if (buf.compare(magic, 0, 4, i, i + 4) === 0) starts.push(i)
}

const parts = []
let index = 0
while (index < starts.length) {
  let done = false
  for (let span = 1; span <= 4 && index + span <= starts.length && !done; span += 1) {
    const from = starts[index]
    const to = index + span < starts.length ? starts[index + span] : buf.length
    try {
      parts.push(zstdDecompressSync(buf.subarray(from, to)))
      index += span
      done = true
    } catch {
      /* try a wider span: the magic pattern appeared inside a payload */
    }
  }
  if (!done) index += 1
}

const text = Buffer.concat(parts).toString('utf8')
writeFileSync(new URL('./session.jsonl', import.meta.url), text, 'utf8')

const lines = text.split('\n').filter((line) => line.trim() !== '')
const counts = new Map()
for (const line of lines) {
  const record = JSON.parse(line)
  const kind = record.type ?? Object.keys(record).join(',')
  counts.set(kind, (counts.get(kind) ?? 0) + 1)
}
console.log(`frames: ${starts.length}, records: ${lines.length}, bytes: ${text.length}`)
for (const [kind, count] of counts) console.log(`${count}\t${kind}`)
