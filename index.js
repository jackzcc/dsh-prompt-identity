/**
 * Host half of the Prompt Identity bundle.
 *
 * Purpose: keep the runtime/client identity out of the text the model receives.
 * It rewrites the assembled prompt sections and runtime contexts, and it can
 * rewrite the identity paragraph with the user's own wording.
 *
 * Deliberate limits, stated so a later reader can check them:
 * - Safety, permission, audit and tool rules are never removed or weakened. The
 *   plugin only rewrites branding, and it never adds an instruction to deny or
 *   fabricate what the runtime is.
 * - Absolute paths, URLs and code spans are left byte-identical: rewriting a
 *   path would break commands the model is told to run.
 * - The switch is one JSON file under DSH_PROFILE_DIR, so it survives restarts
 *   and applies to every session in this profile.
 *
 * The switch is read on every assembly, so a toggle takes effect on the next
 * model step without a reload.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const ROUTE_PREFIX = '/prompt-identity/'
const STATE_DIR = process.env.DSH_PROFILE_DIR
  ? path.join(process.env.DSH_PROFILE_DIR, 'prompt-identity')
  : path.join(homedir(), '.dsh', 'prompt-identity')
const STATE_FILE = path.join(STATE_DIR, 'state.json')

/** Section registered by the harness identity provider. */
const IDENTITY_SECTION = 'harness:identity'
const MAX_IDENTITY_CHARS = 4000

/**
 * Runtime-context names that carry process values with the product name in them.
 *
 * These are replaced at the provider level (a scoped context shadows the global
 * one) because the host re-reads provider text on every request: a waterfall
 * rewrite of `assembly.contexts` is discarded before the durable runtime-context
 * snapshot is written.
 *
 * The values stay live. The checkout line is dropped because its value is a
 * directory named after the product; the GUI URL and the sandbox policy are
 * re-derived from the same services the host uses, so the model is never told a
 * stale mode.
 */
const RUNTIME_CONTEXT_NAMES = ['harness:source', 'app:web-surface', 'sandbox:policy']

const CONTEXT_ORDER_FALLBACK = { 'harness:source': 200, 'app:web-surface': 210, 'sandbox:policy': 190 }

function readAdvertisedUrl(ctx) {
  try {
    const webApp = service(ctx, 'webApp')
    const url = webApp && typeof webApp.getAdvertisedUrl === 'function' ? webApp.getAdvertisedUrl() : undefined
    return typeof url === 'string' && url.startsWith('http') ? url : undefined
  } catch {
    return undefined
  }
}

/** The host's own contract sentence, minus the product name. */
export function formatSandboxPolicy(mode, workspaceRoot) {
  if (mode === 'read-only') {
    return 'Current file policy: read-only. Any available operation enforced by the file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.'
  }
  if (mode === 'workspace-write') {
    const root = typeof workspaceRoot === 'string' && workspaceRoot !== '' ? workspaceRoot : '.'
    return `Current file policy: workspace-write. Any available operation enforced by the file sandbox may modify files under the session workspace: "${root}". Some platform temporary areas may also be writable.`
  }
  if (mode === 'danger-full-access') {
    return 'Current file policy: danger-full-access. The file sandbox does not restrict file modifications by available operations.'
  }
  return ''
}

/** The live policy for one agent; an unknown fact yields no line, never a wrong one. */
function readSandboxPolicyText(ctx, agent) {
  const sessions = service(ctx, 'sessions')
  const policy = service(ctx, 'sandboxPolicy')
  const session = sessions && typeof sessions.get === 'function' ? sessions.get(agent?.id) : undefined
  if (!session || !policy || typeof policy.resolve !== 'function') return ''
  const resolved = policy.resolve({ session })
  return formatSandboxPolicy(resolved?.mode, resolved?.workspaceRoot)
}

function runtimeContextText(name, ctx, agent) {
  try {
    if (name === 'harness:source') return ''
    if (name === 'app:web-surface') {
      const url = readAdvertisedUrl(ctx)
      return url ? `Current Web GUI URL: "${url}".` : ''
    }
    if (name === 'sandbox:policy') return readSandboxPolicyText(ctx, agent)
    return ''
  } catch (error) {
    console.error('[prompt-identity] runtime context text failed:', name, error)
    return ''
  }
}

function contextOrder(systemPrompt, name) {
  try {
    const order = systemPrompt.getContextOrder(name)
    if (typeof order === 'number' && Number.isFinite(order)) return order
  } catch {
    /* an unknown name must not stop the plugin */
  }
  return CONTEXT_ORDER_FALLBACK[name] ?? 0
}

export const DEFAULTS = Object.freeze({
  enabled: true,
  mode: 'remove',
  redact: true,
  identityText: 'You are a coding agent. Follow the instructions in this request and the tool guidance that follows.',
})

/* ------------------------------------------------------------- redaction */

/**
 * Spans that must not be rewritten: paths, URLs and code. A rewritten path
 * would send the model to a directory that does not exist.
 */
const PROTECTED = /(`[^`\n]*`|"[^"\n]*"|'[^'\n]*'|[A-Za-z]:\\[^\s"'`]*|https?:\/\/[^\s"'`]+)/g

/** Brand wording mapped to neutral wording; nothing here names a product. */
const REPLACEMENTS = [
  [/__DSH_BOOT__/g, '__BOOT__'],
  [/DeepSeek[ _-]Harness/gi, 'Agent runtime'],
  [/(?<![A-Za-z0-9_])DSH(?![A-Za-z0-9_])/g, 'Agent runtime'],
  [/(?<![A-Za-z0-9_])dsh(?![A-Za-z0-9_])/g, 'agent runtime'],
]

function rewriteChunk(chunk) {
  return REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), chunk)
}

/**
 * Remove runtime branding from prose while leaving protected spans untouched.
 *
 * @param {unknown} text
 * @returns {unknown} the input for non-strings, otherwise the rewritten text
 */
export function neutralizeText(text) {
  if (typeof text !== 'string' || text === '') return text
  let output = ''
  let cursor = 0
  for (const match of text.matchAll(PROTECTED)) {
    output += rewriteChunk(text.slice(cursor, match.index))
    output += match[0]
    cursor = match.index + match[0].length
  }
  return output + rewriteChunk(text.slice(cursor))
}

/* ------------------------------------------------------------- transform */

/**
 * @param {{ enabled?: boolean, mode?: string, redact?: boolean, identityText?: string }} value
 */
export function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {}
  const mode = source.mode === 'replace' || source.mode === 'remove' || source.mode === 'keep' ? source.mode : DEFAULTS.mode
  const identityText = typeof source.identityText === 'string'
    ? source.identityText.slice(0, MAX_IDENTITY_CHARS)
    : DEFAULTS.identityText
  return {
    version: 1,
    enabled: source.enabled !== false,
    mode,
    redact: source.redact !== false,
    identityText,
    savedAt: typeof source.savedAt === 'string' ? source.savedAt : null,
  }
}

function rewriteText(value, state) {
  return state.redact ? neutralizeText(value) : value
}

/**
 * Apply the switch to one assembled prompt.
 *
 * Pure: the same input and state produce the same output, which is what the
 * unit test exercises.
 *
 * @param {{ sections?: unknown[], contexts?: unknown[] }} assembly
 * @param {ReturnType<typeof normalizeState>} state
 */
export function transformAssembly(assembly, state) {
  if (!assembly || typeof assembly !== 'object') return assembly
  const active = normalizeState(state)

  const sections = Array.isArray(assembly.sections)
    ? assembly.sections.flatMap((section) => {
      if (!section || typeof section !== 'object') return [section]
      const isIdentity = section.name === IDENTITY_SECTION
      if (isIdentity && active.mode === 'remove') return []
      const text = isIdentity && active.mode === 'replace'
        ? rewriteText(active.identityText, active)
        : rewriteText(section.text, active)
      return [{ ...section, text }]
    })
    : assembly.sections

  const contexts = Array.isArray(assembly.contexts)
    ? assembly.contexts.map((context) => (context && typeof context === 'object'
      ? { ...context, text: rewriteText(context.text, active) }
      : context))
    : assembly.contexts

  return { ...assembly, sections, contexts }
}

/* ----------------------------------------------------------------- state */

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return normalizeState(parsed)
  } catch (error) {
    if (error && error.code === 'ENOENT') return normalizeState(null)
    throw error
  }
}

/** Serialized so two rapid toggles cannot interleave their file writes. */
let writeChain = Promise.resolve()

function saveState(patch) {
  writeChain = writeChain.then(async () => {
    const current = await loadState()
    const next = normalizeState({ ...current, ...patch, savedAt: new Date().toISOString() })
    await mkdir(STATE_DIR, { recursive: true })
    await writeFile(STATE_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  })
  return writeChain
}

/** Last prompt as the model received it, for the audit view in the page. */
let lastAssembly = null

function recordAssembly(assembly) {
  const sections = Array.isArray(assembly?.sections) ? assembly.sections : []
  const contexts = Array.isArray(assembly?.contexts) ? assembly.contexts : []
  lastAssembly = {
    at: new Date().toISOString(),
    sections: sections.map((section) => ({
      name: String(section?.name ?? ''),
      order: typeof section?.order === 'number' ? section.order : null,
      text: typeof section?.text === 'string' ? section.text : '',
    })),
    contexts: contexts.map((context) => ({
      name: String(context?.name ?? ''),
      order: typeof context?.order === 'number' ? context.order : null,
      text: typeof context?.text === 'string' ? context.text : '',
    })),
  }
}

/* ----------------------------------------------------------------- routes */

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  return text.trim() === '' ? {} : JSON.parse(text)
}

/** Only these fields are writable from the page. */
function pickPatch(body) {
  const patch = {}
  if (typeof body?.enabled === 'boolean') patch.enabled = body.enabled
  if (body?.mode === 'keep' || body?.mode === 'replace' || body?.mode === 'remove') patch.mode = body.mode
  if (typeof body?.redact === 'boolean') patch.redact = body.redact
  if (typeof body?.identityText === 'string') patch.identityText = body.identityText
  return patch
}

function registerRoutes(ctx, afterSave) {
  const handle = async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      const route = url.pathname.slice(ROUTE_PREFIX.length)

      if (route === 'state' && req.method === 'GET') {
        const state = await loadState()
        return sendJson(res, 200, {
          ...state,
          assembledAt: lastAssembly?.at ?? null,
          identitySection: IDENTITY_SECTION,
          defaults: DEFAULTS,
        })
      }

      if (route === 'state' && req.method === 'POST') {
        const patch = pickPatch(await readBody(req))
        if (Object.keys(patch).length === 0) return sendJson(res, 400, { error: 'no writable field in request' })
        const state = await saveState(patch)
        try {
          await afterSave?.(state)
        } catch (error) {
          console.error('[prompt-identity] could not apply the new switch:', error)
        }
        return sendJson(res, 200, { ...state, assembledAt: lastAssembly?.at ?? null })
      }

      if (route === 'prompt' && req.method === 'GET') {
        return sendJson(res, 200, lastAssembly ?? { at: null, sections: [], contexts: [] })
      }

      return sendJson(res, 404, { error: 'not found' })
    } catch (error) {
      return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  // One exact route per path keeps the (kind, path) key distinct from a stale
  // registration an earlier generation of this bundle could have left behind.
  return [
    ctx.webServer.register({ kind: 'exact', path: '/prompt-identity/state', handler: handle }),
    ctx.webServer.register({ kind: 'exact', path: '/prompt-identity/prompt', handler: handle }),
  ].filter((dispose) => typeof dispose === 'function')
}

/* ------------------------------------------------------------------ apply */

export const inject = ['systemPrompt', 'webServer']

/** Optional service lookup: a missing service must not make the plugin throw. */
function service(ctx, name) {
  try {
    if (typeof ctx.get === 'function') return ctx.get(name)
  } catch {
    return undefined
  }
  try {
    return ctx[name]
  } catch {
    return undefined
  }
}

export function apply(ctx) {
  /** One shadow disposer per live agent. */
  const shadows = new Map()
  let shadowEnabled = false

  const addShadow = (agent) => {
    if (!agent || shadows.has(agent)) return
    const agentCtx = agent.ctx
    if (!agentCtx || typeof agentCtx.effect !== 'function') return
    const systemPrompt = service(agentCtx, 'systemPrompt')
    if (!systemPrompt || typeof systemPrompt.context !== 'function') return

    let dispose
    try {
      dispose = agentCtx.effect(() => {
        const disposers = []
        for (const name of RUNTIME_CONTEXT_NAMES) {
          try {
            disposers.push(systemPrompt.context({
              name,
              order: contextOrder(systemPrompt, name),
              text: () => runtimeContextText(name, ctx, agent),
            }))
          } catch (error) {
            console.error('[prompt-identity] runtime context shadow skipped:', name, error)
          }
        }
        return () => {
          for (const off of disposers) {
            try {
              if (typeof off === 'function') off()
            } catch {
              /* best effort */
            }
          }
        }
      }, 'prompt-identity runtime context')
    } catch (error) {
      console.error('[prompt-identity] runtime context shadow failed:', error)
      return
    }
    if (typeof dispose === 'function') shadows.set(agent, dispose)
  }

  const removeShadow = (agent) => {
    const dispose = shadows.get(agent)
    if (!dispose) return
    shadows.delete(agent)
    try {
      dispose()
    } catch {
      /* best effort */
    }
  }

  const syncShadows = (enabled) => {
    shadowEnabled = enabled
    if (!enabled) {
      for (const agent of [...shadows.keys()]) removeShadow(agent)
      return
    }
    const agents = service(ctx, 'agents')
    const live = agents && typeof agents.list === 'function' ? agents.list() : []
    for (const agent of live) addShadow(agent)
  }

  ctx.effect(() => {
    const dispose = ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
      const assembled = typeof next === 'function' ? await next() : assembly
      try {
        const state = await loadState()
        const result = state.enabled ? transformAssembly(assembled, state) : assembled
        recordAssembly(result)
        return result
      } catch (error) {
        // A switch that cannot be read must never break a model step.
        console.error('[prompt-identity] leaving the prompt unchanged:', error)
        recordAssembly(assembled)
        return assembled
      }
    }, { mode: 'waterfall' })
    return typeof dispose === 'function' ? dispose : () => {}
  }, 'prompt-identity assemble waterfall')

  ctx.effect(() => {
    const dispose = ctx.on('agent/created', ({ agent } = {}) => {
      if (shadowEnabled) addShadow(agent)
    })
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  }, 'prompt-identity agent shadows')

  ctx.effect(() => {
    let cancelled = false
    loadState()
      .then((state) => {
        if (!cancelled) syncShadows(state.enabled)
      })
      .catch((error) => console.error('[prompt-identity] initial state read failed:', error))
    return () => {
      cancelled = true
      for (const agent of [...shadows.keys()]) removeShadow(agent)
    }
  }, 'prompt-identity shadow lifecycle')

  ctx.effect(() => {
    const disposers = registerRoutes(ctx, (state) => syncShadows(state.enabled))
    return () => disposers.forEach((dispose) => dispose())
  }, 'prompt-identity routes')
}

export { STATE_FILE, STATE_DIR, IDENTITY_SECTION }
