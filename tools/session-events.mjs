/**
 * Dev helper: list record kinds in a decompressed session log and dump one.
 *
 *   node session-events.mjs
 *   node session-events.mjs system/message
 */
import { readFileSync, writeFileSync } from 'node:fs'

const lines = readFileSync(new URL('./session.jsonl', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line))

const counts = new Map()
for (const record of lines) counts.set(record.type, (counts.get(record.type) ?? 0) + 1)

const wanted = process.argv[2]
if (!wanted) {
  for (const [kind, count] of counts) console.log(`${count}\t${kind}`)
  console.log(`${lines.length}\trecords total`)
  process.exit(0)
}

const matches = lines.filter((record) => record.type === wanted)
writeFileSync(new URL('./event.json', import.meta.url), JSON.stringify(matches, null, 2), 'utf8')
console.log(`matches: ${matches.length}`)
if (matches[0]) console.log(JSON.stringify(matches[0]).slice(0, 800))
