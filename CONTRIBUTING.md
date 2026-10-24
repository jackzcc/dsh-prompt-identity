# Contributing

Thanks for your interest in contributing to Prompt Identity (dsh-prompt-identity).

## Getting the bundle

```bash
git clone https://github.com/jackzcc/dsh-prompt-identity.git
cd dsh-prompt-identity
```

There is no build step, no registry and no dependencies to install: the bundle is plain JavaScript. To install it, point the bundle installer at the clone directory (Plugin Manager → install from a local directory, or `install_bundle` with the absolute path).

## Before you submit

Run the checks from the repository root:

```bash
node --check index.js
node test/transform.test.mjs
```

Both must pass before you open a pull request.

## Issues and pull requests

- **Issues**: use the Issues tab to report bugs or suggest changes. Describe the behaviour you saw, what you expected instead, and the steps that reproduce it.
- **Pull requests**: fork the repository, work on a branch, keep the change focused, and explain in the description what the change does and why. Make sure the checks above still pass.

## Ground rule

Changes must only touch branding text. Never remove, weaken, reorder or otherwise alter the safety, permission, audit, tool or project instructions in the prompt — this rule from the README applies to every contribution.
