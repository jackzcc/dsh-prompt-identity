import { readFileSync } from "node:fs"
const lines = readFileSync(new URL("./session.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map(JSON.parse)
const ctxMessages = lines.filter((r) => r.type === "user/message" && r.data?.source?.kind === "runtime-context")
const last = ctxMessages[ctxMessages.length - 1]
const text = (last?.data?.content ?? []).map((b) => b.text ?? "").join("\n")
console.log("=== runtime context (" + text.length + " chars) ===")
console.log(text)
console.log("=== sections ===")
for (const section of last?.data?.source?.sections ?? []) console.log("--- " + section.name + "\n" + section.text)
