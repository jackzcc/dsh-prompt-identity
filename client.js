/**
 * Client half of the Prompt Identity bundle.
 *
 * One page inside Settings -> Plugins: the master switch, the identity-paragraph
 * mode, the replacement text, and an audit view of the prompt the Host half
 * actually assembled for the last model step.
 */

window.__ModuleLoader__.load({
  id: '@local/prompt-identity',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Rebound in apply() once the locale service is available. */
    let t = (key) => key

    const ZH = {
      tabLabel: '提示词身份',
      title: '提示词身份',
      subtitle: '让模型看不到运行环境的产品身份；工具、权限、审计与项目规则保持不变。',
      switchLabel: '隐藏运行环境身份',
      switchHint: '开关立即生效，下一个模型步骤就会使用新的提示词。',
      on: '已开启',
      off: '已关闭',
      identityLabel: '身份段落',
      modeKeep: '保持原样',
      modeReplace: '中性重写',
      modeRemove: '删除',
      identityPlaceholder: '例如：你是一个编程助手。',
      identityHint: '选择「中性重写」时，身份段落会整段替换为下面这段文字。',
      save: '保存',
      saved: '已保存',
      refresh: '刷新',
      preview: '查看当前提示词',
      hidePreview: '收起提示词',
      previewTitle: '最近一次组装（模型实际收到的内容）',
      sections: '段落',
      contexts: '运行上下文',
      empty: '还没有组装记录。',
      assembledAt: '最近组装',
      never: '尚未组装',
      loading: '加载中…',
      error: '出错',
      readOnlyNote: '只读视图：这里展示的是已经生效的提示词文本。',
      brandNote: '品牌词替换会跳过路径、URL 与代码片段，避免破坏命令。',
    }

    const EN = {
      tabLabel: 'Prompt Identity',
      title: 'Prompt Identity',
      subtitle: 'Keep the runtime product identity out of the prompt; tools, permissions, audits and project rules stay as they are.',
      switchLabel: 'Hide runtime identity',
      switchHint: 'Takes effect immediately: the next model step uses the new prompt.',
      on: 'On',
      off: 'Off',
      identityLabel: 'Identity section',
      modeKeep: 'Leave as is',
      modeReplace: 'Neutral rewrite',
      modeRemove: 'Remove',
      identityPlaceholder: 'e.g. You are a coding assistant.',
      identityHint: 'With “Neutral rewrite”, the identity section is replaced by the text below.',
      save: 'Save',
      saved: 'Saved',
      refresh: 'Refresh',
      preview: 'Show current prompt',
      hidePreview: 'Hide prompt',
      previewTitle: 'Last assembly (what the model actually received)',
      sections: 'sections',
      contexts: 'runtime contexts',
      empty: 'No assembly recorded yet.',
      assembledAt: 'Last assembled',
      never: 'not yet',
      loading: 'Loading…',
      error: 'Error',
      readOnlyNote: 'Read-only: this is the prompt text already in effect.',
      brandNote: 'Brand replacement skips paths, URLs and code spans so commands keep working.',
    }

    async function call(path, init) {
      const response = await fetch(path, { cache: 'no-store', ...init })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) throw new Error((payload && payload.error) || `${response.status} ${response.statusText}`)
      return payload
    }

    const postState = (patch) => call('/prompt-identity/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })

    const MODES = ['keep', 'replace', 'remove']
    const modeLabel = (mode) => t(mode === 'replace' ? 'modeReplace' : mode === 'remove' ? 'modeRemove' : 'modeKeep')

    function Row(props) {
      return h('div', { className: props.className || 'pi-row' }, [
        h('div', { key: 'label', className: 'pi-row-text' }, [
          h('div', { key: 'title', className: 'pi-row-title' }, props.title),
          props.hint ? h('div', { key: 'hint', className: 'pi-row-hint' }, props.hint) : null,
        ]),
        h('div', { key: 'control', className: 'pi-row-control' }, props.children),
      ])
    }

    function Switch({ checked, disabled, label, onToggle }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        disabled,
        className: checked ? 'pi-switch pi-switch-on' : 'pi-switch',
        onClick: onToggle,
      }, h('span', { className: 'pi-switch-knob' }))
    }

    function Panel() {
      const [state, setState] = React.useState(null)
      const [draft, setDraft] = React.useState('')
      const [preview, setPreview] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [note, setNote] = React.useState('')

      const load = React.useCallback(async () => {
        try {
          const next = await call('/prompt-identity/state')
          setState(next)
          setDraft(next.identityText || '')
          setError('')
        } catch (cause) {
          setError(String(cause.message || cause))
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      const patch = async (change) => {
        setBusy(true)
        setError('')
        try {
          const next = await postState(change)
          setState((current) => ({ ...current, ...next }))
          if (typeof change.identityText === 'string') {
            setDraft(next.identityText || '')
            setNote(t('saved'))
          }
        } catch (cause) {
          setError(String(cause.message || cause))
        } finally {
          setBusy(false)
        }
      }

      const togglePreview = async () => {
        if (preview) {
          setPreview(null)
          return
        }
        try {
          setPreview(await call('/prompt-identity/prompt'))
          setError('')
        } catch (cause) {
          setError(String(cause.message || cause))
        }
      }

      const enabled = Boolean(state && state.enabled)
      const mode = state && MODES.includes(state.mode) ? state.mode : 'keep'
      const assembled = state && state.assembledAt
        ? new Date(state.assembledAt).toLocaleString()
        : t('never')

      return h('div', { className: 'pi-root' }, [
        h('style', { key: 'css' }, `
          .pi-root { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 24px; color: var(--dsw-alias-label-primary); font-size: 13px; }
          .pi-head { display: flex; flex-direction: column; gap: 4px; }
          .pi-head h3 { margin: 0; font-size: 15px; font-weight: 600; }
          .pi-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.55; }
          .pi-card { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
          .pi-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
          .pi-row:last-child { border-bottom: none; }
          .pi-row-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
          .pi-row-title { font-size: 13px; font-weight: 500; }
          .pi-row-hint { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; }
          .pi-row-control { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
          .pi-switch { position: relative; width: 36px; height: 20px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); cursor: pointer; padding: 0; transition: background .15s ease, border-color .15s ease; }
          .pi-switch:disabled { opacity: .55; cursor: default; }
          .pi-switch-on { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
          .pi-switch-knob { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: left .15s ease; }
          .pi-switch-on .pi-switch-knob { left: 18px; }
          .pi-state { font-size: 11px; color: var(--dsw-alias-label-secondary); min-width: 44px; text-align: right; }
          .pi-select { height: 30px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; }
          .pi-textarea { width: 100%; min-height: 76px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 1.55; resize: vertical; font-family: inherit; outline: none; box-sizing: border-box; }
          .pi-textarea:focus { border-color: var(--dsw-alias-brand-primary); }
          .pi-edit { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
          .pi-actions { display: flex; gap: 8px; align-items: center; }
          .pi-btn { height: 30px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; cursor: pointer; }
          .pi-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
          .pi-btn:disabled { opacity: .55; cursor: default; }
          .pi-btn-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
          .pi-status { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; color: var(--dsw-alias-label-secondary); font-size: 11px; }
          .pi-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
          .pi-done { color: var(--dsw-alias-state-success-primary); font-size: 11px; }
          .pi-preview { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 12px 14px; }
          .pi-preview-title { font-size: 12px; font-weight: 600; }
          .pi-names { display: flex; flex-wrap: wrap; gap: 6px; }
          .pi-chip { padding: 2px 8px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 11px; }
          .pi-pre { margin: 0; max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-word; padding: 10px; border-radius: 8px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.55; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
          .pi-note { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; }
        `),
        h('div', { key: 'head', className: 'pi-head' }, [
          h('h3', { key: 'title' }, t('title')),
          h('div', { key: 'sub', className: 'pi-sub' }, t('subtitle')),
        ]),
        h('div', { key: 'card', className: 'pi-card' }, [
          h(Row, {
            key: 'switch',
            title: t('switchLabel'),
            hint: t('switchHint'),
          }, [
            h(Switch, {
              key: 'sw',
              checked: enabled,
              disabled: busy || !state,
              label: t('switchLabel'),
              onToggle: () => patch({ enabled: !enabled }),
            }),
            h('span', { key: 'st', className: 'pi-state' }, enabled ? t('on') : t('off')),
          ]),
          h(Row, { key: 'mode', title: t('identityLabel'), hint: t('identityHint') }, [
            h('select', {
              key: 'sel',
              className: 'pi-select',
              value: mode,
              disabled: busy || !state,
              onChange: (event) => patch({ mode: event.target.value }),
            }, MODES.map((value) => h('option', { key: value, value }, modeLabel(value)))),
          ]),
          mode === 'replace'
            ? h('div', { key: 'edit', className: 'pi-edit' }, [
                h('textarea', {
                  key: 'ta',
                  className: 'pi-textarea',
                  value: draft,
                  spellCheck: false,
                  placeholder: t('identityPlaceholder'),
                  onChange: (event) => {
                    setDraft(event.target.value)
                    setNote('')
                  },
                }),
                h('div', { key: 'actions', className: 'pi-actions' }, [
                  h('button', {
                    key: 'save',
                    type: 'button',
                    className: 'pi-btn pi-btn-primary',
                    disabled: busy,
                    onClick: () => patch({ identityText: draft }),
                  }, t('save')),
                  note ? h('span', { key: 'note', className: 'pi-done' }, note) : null,
                ]),
              ])
            : null,
        ]),
        error ? h('div', { key: 'err', className: 'pi-error' }, `${t('error')}: ${error}`) : null,
        h('div', { key: 'status', className: 'pi-status' }, [
          h('span', { key: 'at' }, `${t('assembledAt')} ${assembled}`),
          h('span', { key: 'refresh-wrap' }, h('button', {
            key: 'refresh',
            type: 'button',
            className: 'pi-btn',
            disabled: busy,
            onClick: load,
          }, t('refresh'))),
          h('span', { key: 'preview-wrap' }, h('button', {
            key: 'preview',
            type: 'button',
            className: 'pi-btn',
            onClick: togglePreview,
          }, preview ? t('hidePreview') : t('preview'))),
          h('span', { key: 'brand', className: 'pi-note' }, t('brandNote')),
        ]),
        preview
          ? h('div', { key: 'preview', className: 'pi-preview' }, [
              h('div', { key: 'pt', className: 'pi-preview-title' }, t('previewTitle')),
              h('div', { key: 'pn', className: 'pi-names' },
                (preview.sections || []).map((section) => h('span', { key: `s:${section.name}`, className: 'pi-chip' }, section.name || '?')),
              ),
              h('pre', { key: 'text', className: 'pi-pre' },
                (preview.sections || []).map((section) => section.text).join('\n\n'),
              ),
              h('div', { key: 'pn2', className: 'pi-names' },
                (preview.contexts || []).map((context) => h('span', { key: `c:${context.name}`, className: 'pi-chip' }, context.name || '?')),
              ),
              h('div', { key: 'ro', className: 'pi-note' }, t('readOnlyNote')),
            ])
          : null,
      ])
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale && typeof locale.register === 'function') {
          ctx.effect(() => locale.register('promptIdentity', 'zh', ZH), 'prompt-identity locale zh')
          ctx.effect(() => locale.register('promptIdentity', 'en', EN), 'prompt-identity locale en')
          if (typeof locale.bind === 'function') t = locale.bind('promptIdentity')
        }

        ctx.effect(() => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'prompt-identity',
          order: 60,
          label: () => t('tabLabel'),
        }, Panel)), 'prompt-identity tab')
      },
    }
  },
})
