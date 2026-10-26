/**
 * Provider keys — browser half.
 *
 * One Settings page for every provider API key this profile can use, grouped by
 * what the key is for. Each row reports only whether a key is stored, never the
 * value: the field starts empty and typing replaces the stored key.
 *
 * Layout note: the action buttons live in a fixed-width grid column so every
 * row's Save/Clear pair lines up on the same axis regardless of label or pill
 * width. `align-items: center` on the row plus a shared button height does the
 * rest; the earlier misalignment came from letting the pill and buttons share a
 * flex row with no shared baseline.
 *
 * Styling uses `--dsw-alias-*` tokens only, so it follows light/dark and any
 * theme override without a colour of its own.
 *
 * @module dsh-provider-keys/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-provider-keys',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useRef } = React

    const CHANNEL = '/provider-keys'

    /** Button geometry shared by every row, so the grid stays on one axis. */
    const BTN_H = '28px'

    const CSS = `
.pk-root { display: flex; flex-direction: column; gap: 16px; padding: 4px 2px 24px; }
.pk-group { display: flex; flex-direction: column; gap: 8px; }
.pk-group-title {
  font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}
.pk-card {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.pk-row {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.pk-row:first-child { border-top: none; }
.pk-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pk-name-top { display: flex; align-items: center; gap: 7px; min-width: 0; }
.pk-label { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.pk-ref {
  font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pk-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.35; }
.pk-pill {
  font-size: 10px; font-weight: 500; padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  flex: none;
}
.pk-pill-on {
  color: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
}
.pk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pk-input {
  width: 100%; box-sizing: border-box;
  height: ${BTN_H};
  padding: 0 9px; font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
}
.pk-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.pk-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.pk-btn {
  height: ${BTN_H};
  padding: 0 12px;
  font-size: 12px; font-weight: 500;
  line-height: 1;
  border-radius: 7px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}
.pk-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.pk-btn:disabled { opacity: .45; cursor: default; }
.pk-btn-primary {
  background: var(--dsw-alias-button-primary-fill);
  border-color: var(--dsw-alias-button-primary-fill);
}
.pk-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.pk-link {
  font-size: 11px; color: var(--dsw-alias-brand-primary);
  text-decoration: none; white-space: nowrap; margin-left: auto; flex: none;
}
.pk-link:hover { text-decoration: underline; }
.pk-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding-top: 4px;
}
.pk-note { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.4; }
.pk-err { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
.pk-fine { font-size: 11px; color: var(--dsw-alias-label-secondary); opacity: .85; }
`

    /** Group order and titles; a key not listed here falls into the last group. */
    const GROUPS = [
      { id: 'merge', title: 'Merge Gateway', ids: ['merge-1', 'merge-2'] },
      { id: 'search', title: 'Search', ids: ['exa', 'deepseek'] },
      { id: 'llm', title: 'Other model providers', ids: ['concentrate', 'zai', 'orcarouter', 'commandcode'] },
    ]

    /**
     * Call one channel method.
     *
     * @param method - endpoint after the channel prefix.
     * @param payload - request payload.
     * @returns the server's `value`.
     */
    async function rpc(method, payload) {
      const res = await fetch(`${CHANNEL}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `pk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          method,
          payload: payload ?? {},
        }),
      })
      if (!res.ok) throw new Error(`provider keys: HTTP ${res.status}`)
      const body = await res.json()
      const result = body?.result
      if (!result || result.ok !== true) throw new Error(result?.error?.message ?? 'request failed')
      return result.value
    }

    /**
     * One provider row: status, a write-only key field, and its action buttons.
     *
     * @param props - the provider row plus a refresh callback.
     */
    function Row({ provider, onChanged }) {
      const [draft, setDraft] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)
      const inputRef = useRef(null)

      const save = useCallback(async () => {
        if (draft.trim().length === 0) {
          setError('Type a key first.')
          inputRef.current?.focus()
          return
        }
        setBusy(true)
        setError(undefined)
        try {
          const next = await rpc('setKey', { ref: provider.ref, value: draft })
          setDraft('')
          onChanged(next)
        } catch (e) {
          setError(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [draft, onChanged, provider.ref])

      const clear = useCallback(async () => {
        setBusy(true)
        setError(undefined)
        try {
          const next = await rpc('clearKey', { ref: provider.ref })
          setDraft('')
          onChanged(next)
        } catch (e) {
          setError(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [onChanged, provider.ref])

      const onKeyDown = useCallback((event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          save()
        }
      }, [save])

      return h('div', { className: 'pk-row' },
        h('div', { className: 'pk-name' },
          h('div', { className: 'pk-name-top' },
            h('span', { className: 'pk-label' }, provider.label),
            h('span', {
              className: `pk-pill${provider.configured ? ' pk-pill-on' : ''}`,
            }, provider.configured ? 'Key set' : 'Not set'),
            h('a', {
              className: 'pk-link',
              href: provider.docs,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, 'Get a key ↗'),
          ),
          h('span', { className: 'pk-ref' }, provider.ref),
          h('span', { className: 'pk-hint' }, provider.hint),
        ),
        h('div', { className: 'pk-field' },
          h('input', {
            ref: inputRef,
            className: 'pk-input',
            type: 'password',
            autoComplete: 'off',
            spellCheck: false,
            placeholder: provider.configured ? '••••••••  (stored — type to replace)' : 'Paste key',
            value: draft,
            disabled: busy,
            onChange: (e) => setDraft(e.target.value),
            onKeyDown,
            'aria-label': `${provider.label} API key`,
          }),
          error === undefined ? null : h('span', { className: 'pk-err' }, error),
        ),
        h('div', { className: 'pk-actions' },
          h('button', {
            className: 'pk-btn pk-btn-primary',
            type: 'button',
            disabled: busy || draft.trim().length === 0,
            onClick: save,
          }, 'Save'),
          h('button', {
            className: 'pk-btn',
            type: 'button',
            disabled: busy || !provider.configured,
            onClick: clear,
          }, 'Clear'),
        ),
      )
    }

    /**
     * The settings page.
     */
    function ProviderKeysSettings() {
      const [providers, setProviders] = useState(undefined)
      const [error, setError] = useState(undefined)

      useEffect(() => {
        let alive = true
        rpc('state')
          .then((value) => { if (alive) setProviders(value.providers) })
          .catch((e) => { if (alive) setError(String(e?.message ?? e)) })
        return () => { alive = false }
      }, [])

      const onChanged = useCallback((value) => setProviders(value.providers), [])

      if (error !== undefined) return h('div', { className: 'pk-root' }, h('span', { className: 'pk-err' }, error))
      if (providers === undefined) return h('div', { className: 'pk-root' }, h('span', { className: 'pk-note' }, 'Loading…'))

      const byId = new Map(providers.map((p) => [p.id, p]))
      const grouped = new Set(GROUPS.flatMap((g) => g.ids))
      const leftovers = providers.filter((p) => !grouped.has(p.id))

      return h('div', { className: 'pk-root' },
        GROUPS.map((group) => {
          const rows = group.ids.map((id) => byId.get(id)).filter(Boolean)
          if (rows.length === 0) return null
          return h('div', { className: 'pk-group', key: group.id },
            h('div', { className: 'pk-group-title' }, group.title),
            h('div', { className: 'pk-card' },
              rows.map((p) => h(Row, { key: p.ref, provider: p, onChanged })),
            ),
          )
        }),
        leftovers.length === 0 ? null : h('div', { className: 'pk-group' },
          h('div', { className: 'pk-group-title' }, 'Other'),
          h('div', { className: 'pk-card' },
            leftovers.map((p) => h(Row, { key: p.ref, provider: p, onChanged })),
          ),
        ),
        h('div', { className: 'pk-foot' },
          h('span', { className: 'pk-note' },
            'Keys are written to the DSH credential store and never read back into this page. ',
            'An environment variable of the same name takes precedence over a key saved here.',
          ),
        ),
        h('div', { className: 'pk-fine' },
          'Merge keys are read by the merge-direct and merge-direct-2 provider rows; ',
          'Concentrate by concentrate-direct; Exa by the Exa search tool.',
        ),
      )
    }

    return {
      inject: ['slots', 'connection'],
      apply(ctx) {
        ctx.effect(() => {
          const el = document.createElement('style')
          el.setAttribute('data-dsh-provider-keys', '')
          el.textContent = CSS
          document.head.appendChild(el)
          return () => { el.remove() }
        }, 'dsh-provider-keys: styles')
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'provider-keys',
          order: 13,
          label: 'Provider keys',
        }, ProviderKeysSettings))
      },
    }
  },
})
