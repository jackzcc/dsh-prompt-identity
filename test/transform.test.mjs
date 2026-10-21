import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULTS,
  IDENTITY_SECTION,
  formatSandboxPolicy,
  neutralizeText,
  normalizeState,
  transformAssembly,
} from '../index.js'

test('prose keeps the meaning but loses the product name', () => {
  assert.equal(
    neutralizeText('You are interacting with the user through the DeepSeek Harness Web GUI.'),
    'You are interacting with the user through the Agent runtime Web GUI.',
  )
  assert.equal(
    neutralizeText('Current DSH file policy: workspace-write.'),
    'Current Agent runtime file policy: workspace-write.',
  )
})

test('the model name is not client identity and survives', () => {
  assert.equal(
    neutralizeText('You are a coding agent powered by the deepseek-flash model.'),
    'You are a coding agent powered by the deepseek-flash model.',
  )
})

test('quoted paths and URLs stay byte-identical', () => {
  const line = 'Current DeepSeek Harness implementation checkout: "C:\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\".'
  assert.equal(
    neutralizeText(line),
    'Current Agent runtime implementation checkout: "C:\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\".',
  )
  assert.equal(neutralizeText('see https://example.com/dsh/manual'), 'see https://example.com/dsh/manual')
})

test('code spans and identifiers keep working', () => {
  assert.equal(
    neutralizeText('because only dsh web injects window.__DSH_BOOT__'),
    'because only agent runtime web injects window.__BOOT__',
  )
  assert.equal(neutralizeText('set DSH_PROFILE_DIR and run `dsh --profile`'), 'set DSH_PROFILE_DIR and run `dsh --profile`')
})

test('non-strings pass through untouched', () => {
  assert.equal(neutralizeText(undefined), undefined)
  assert.equal(neutralizeText(null), null)
  assert.equal(neutralizeText(''), '')
})

test('assembly rewriting covers sections and runtime contexts', () => {
  const assembly = {
    sections: [
      { name: IDENTITY_SECTION, order: 0, text: 'You are a coding agent.' },
      { name: 'harness:source', order: 1, text: 'The DeepSeek Harness checkout is separate.' },
    ],
    contexts: [{ name: 'app:web-surface', order: 2, text: 'The DeepSeek Harness Web GUI URL.' }],
    tools: [{ name: 'read' }],
  }
  const output = transformAssembly(assembly, { enabled: true, mode: 'keep' })

  assert.equal(output.sections[1].text, 'The Agent runtime checkout is separate.')
  assert.equal(output.contexts[0].text, 'The Agent runtime Web GUI URL.')
  assert.equal(output.tools, assembly.tools, 'tools are never touched')
  assert.equal(output.sections[1].order, 1, 'ordering survives')
  assert.notEqual(output, assembly, 'a new assembly is returned')
  assert.deepEqual(output.sections.map((section) => section.name), [IDENTITY_SECTION, 'harness:source'])

  // The default removes the identity paragraph instead of restating it.
  assert.deepEqual(
    transformAssembly(assembly, { enabled: true }).sections.map((section) => section.name),
    ['harness:source'],
  )
})

test('identity modes: keep, replace, remove', () => {
  const assembly = { sections: [{ name: IDENTITY_SECTION, order: 0, text: 'Original identity.' }], contexts: [] }

  assert.equal(transformAssembly(assembly, { enabled: true, mode: 'keep' }).sections[0].text, 'Original identity.')
  assert.equal(
    transformAssembly(assembly, { enabled: true, mode: 'replace', identityText: 'Custom persona.' }).sections[0].text,
    'Custom persona.',
  )
  assert.deepEqual(transformAssembly(assembly, { enabled: true, mode: 'remove' }).sections, [])
  assert.equal(assembly.sections.length, 1, 'the input assembly is not mutated')
})

test('the replacement text is also brand-neutralised', () => {
  const assembly = { sections: [{ name: IDENTITY_SECTION, order: 0, text: 'x' }], contexts: [] }
  const output = transformAssembly(assembly, { enabled: true, mode: 'replace', identityText: 'You are DeepSeek Harness.' })
  assert.equal(output.sections[0].text, 'You are Agent runtime.')
})

test('a redaction-free state leaves text exactly as assembled', () => {
  const assembly = { sections: [{ name: 'harness:source', order: 1, text: 'DeepSeek Harness' }], contexts: [] }
  assert.equal(transformAssembly(assembly, { enabled: true, redact: false }).sections[0].text, 'DeepSeek Harness')
})

test('the live sandbox policy is restated without the product name', () => {
  const readonly = formatSandboxPolicy('read-only', '/tmp')
  const workspace = formatSandboxPolicy('workspace-write', 'C:\\w')
  const full = formatSandboxPolicy('danger-full-access', '/')

  for (const text of [readonly, workspace, full]) {
    assert.ok(text.startsWith('Current file policy: '))
    assert.ok(!/DSH|DeepSeek Harness/.test(text))
  }
  assert.match(readonly, /Do not refuse a required modification from this policy alone/)
  assert.match(workspace, /session workspace: "C:\\w"/)
  assert.match(full, /does not restrict file modifications/)
  assert.equal(formatSandboxPolicy('something-new', '/'), '', 'an unknown mode states nothing')
})

test('state defaults are safe and explicit values win', () => {
  const fallback = normalizeState(undefined)
  assert.equal(fallback.enabled, true)
  assert.equal(fallback.mode, 'remove')
  assert.equal(fallback.redact, true)
  assert.equal(fallback.identityText, DEFAULTS.identityText)

  const explicit = normalizeState({ enabled: false, mode: 'replace', redact: false, identityText: 'Hi', savedAt: 'now' })
  assert.equal(explicit.enabled, false)
  assert.equal(explicit.mode, 'replace')
  assert.equal(explicit.redact, false)
  assert.equal(explicit.savedAt, 'now')

  assert.equal(normalizeState({ mode: 'garbage' }).mode, 'remove')
  assert.equal(normalizeState({ identityText: 'x'.repeat(9000) }).identityText.length, 4000)
})
