# Changelog

All notable changes to this project are documented in this file.

## [0.1.0] - 2026-10-21

Initial release.

- **Prompt Identity bundle**: a Harness bundle that hides the runtime product identity from the model-visible system prompt. Branding wording in prompt sections and runtime contexts is replaced with neutral wording, the `harness:identity` identity section is removed by default, and the branded runtime-context lines are handled at the provider level — while absolute paths, URLs, code spans and identifiers stay byte-identical.
- **Manual switch**: a single switch in Settings > Plugins (Prompt Identity → 「隐藏运行环境身份」 / Hide runtime identity). It is read on each prompt assembly, so turning it off restores the original prompt on the next model step without a restart.
- **Audit view**: 「查看当前提示词」 shows the exact sections and contexts that were assembled for the last model step, so you can verify what the model actually received (`GET /prompt-identity/prompt`).
