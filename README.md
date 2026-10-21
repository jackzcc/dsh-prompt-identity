# Prompt Identity

A Harness bundle that keeps the runtime's product identity out of the prompt the
model receives, with one manual switch in the Web UI.

- **Switch**: Settings → Plugins → **提示词身份 / Prompt Identity** → 「隐藏运行环境身份」.
- **Applies to**: every session in this profile. The switch is read on each prompt
  assembly, so turning it off restores the original prompt on the next model step —
  no restart.
- **State**: `state.json` beside the profile, or in `~/.dsh/prompt-identity/` when
  the Host process does not export `DSH_PROFILE_DIR` (this desktop deployment
  writes `C:\Users\<user>\.dsh\prompt-identity\state.json`).

## Install

Clone this repository and point the bundle installer at the clone directory
(Plugin Manager → install from a local directory, or `install_bundle` with the
absolute path). There is no build step, no registry, and no dependency: the
package is plain JavaScript plus Node built-ins.

```powershell
git clone <this repository>
node --check index.js
node test/transform.test.mjs
```

## 中文说明

- **作用**：把系统提示词里的运行环境品牌（`DeepSeek Harness` / `DSH`）换成中性
  说法，删掉 `harness:identity` 身份段，并接管三条运行上下文：安装目录那一行
  直接去掉（路径本身带产品名），GUI URL 与沙箱策略用宿主服务实时重建。
- **开关**：设置 → 插件 → 提示词身份 →「隐藏运行环境身份」。关掉后，下一个模型
  步骤就恢复原始提示词，不需要重启。
- **不做什么**：不删改安全、权限、审计、工具与项目规则；也不会让模型否认或伪造
  运行环境身份——只去掉名称。
- **状态文件**：`~/.dsh/prompt-identity/state.json`（宿主未导出 `DSH_PROFILE_DIR`
  时），否则在 `<DSH_PROFILE_DIR>/prompt-identity/state.json`。
- **可移植**：纯 JS、无构建、无机器相关路径。换电脑时 clone 后，用
  `install_bundle` 指向新的绝对路径即可。

## What it changes

| Prompt input | When the switch is on |
|---|---|
| Prompt sections | Brand wording is replaced with neutral wording |
| Runtime contexts (in the step's assembly) | Same replacement |
| Identity section (`harness:identity`) | Removed by default; keep it, or replace it with your own text |
| Runtime-context line `harness:source` | Dropped (the value is a directory named after the product) |
| Runtime-context line `app:web-surface` | Kept as `Current Web GUI URL: "<url>".` |

The last two are host-owned dynamic values, so they are replaced at the provider
level: a scoped context shadows the global one for every live agent. Turning the
switch off disposes those shadows, and the original lines come back.

Brand wording is replaced only in prose. Absolute paths, URLs, backtick code
spans, `DSH_PROFILE_DIR`-style identifiers and the model name are left
byte-identical, so commands the model is told to run still resolve.

## What it never does

- It does not remove, weaken or reorder safety, permission, audit, tool or
  project instructions. Only branding text is rewritten.
- It does not add an instruction to deny or fabricate what the runtime is. It
  removes names; it never asks the model to lie.
- It does not change tools, tool schemas or their descriptions.

## Audit view

「查看当前提示词」 shows the exact sections and contexts that were assembled for
the last model step, so you can check the effect instead of trusting it. The same
data is at `GET /prompt-identity/prompt`.

## Limits

- `sandbox:policy` is restated from the live resolver
  (`ctx.sandboxPolicy.resolve({ session })`) instead of being copied from a
  cache, so the mode the model reads is always the enforced one. The wording is
  this plugin's own, so a future host reword of that contract line would lag
  behind here.
- Prompt assembly is rewritten; text that was already committed to the session
  log as a message cannot be rewritten retroactively (earlier turns keep whatever
  they were sent with).
- If a section is marked `complete`, the host restores it after the waterfall and
  this plugin's rewrite does not survive.
- Another always-on prompt-rewriting plugin also listening to
  `system-prompt/assemble` composes with this one; if it deletes the identity
  section first, the "中性重写" mode has nothing left to rewrite.

## HTTP routes

| Route | Method | Purpose |
|---|---|---|
| `/prompt-identity/state` | GET | Current switch, mode and text |
| `/prompt-identity/state` | POST | Write `enabled`, `mode`, `redact`, `identityText` |
| `/prompt-identity/prompt` | GET | Last assembled prompt (audit) |

## Development

```powershell
node --check index.js
node --check client.js
node test/transform.test.mjs
```

`tools/` holds three read-only helpers for checking what a session actually sent:
`unpack-session.mjs` decompresses the multi-frame `session.v4.jsonl.zstd` log into
`tools/session.jsonl`, `session-events.mjs` lists its record types or dumps one
event (`node tools/session-events.mjs system/message`), and `runtime-context.mjs`
prints the newest runtime-context snapshot.
