/**
 * Provider keys — browser half.
 *
 * One Settings page for the credentials this profile can use and for what the
 * chat model menu offers. It is organized by what a row *is*, not by which
 * widget renders it:
 *
 *   Model providers   one key per LLM route
 *   Chat model picker one card per provider, with a master switch and its models
 *   Tools             search and web tools, key and on/off together
 *
 * Two rules keep the page honest. A key is write-only: the field starts empty and
 * typing replaces the stored value, so nothing secret is ever read back into the
 * DOM. And switching a model or provider off only empties the dropdown — the
 * adapter still resolves it, so a session already using it keeps running.
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
.pk-root { display: flex; flex-direction: column; gap: 22px; padding: 4px 2px 24px; }
.pk-section { display: flex; flex-direction: column; gap: 10px; }
.pk-section-head { display: flex; flex-direction: column; gap: 2px; }
.pk-section-title {
  font-size: 12px; font-weight: 600; letter-spacing: .02em;
  color: var(--dsw-alias-label-primary);
}
.pk-section-note { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.4; }
.pk-card {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.pk-card + .pk-card { margin-top: 8px; }
.pk-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.pk-row:first-child { border-top: none; }
.pk-row-sub { padding-left: 30px; background: var(--dsw-alias-bg-layer-2); }
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
.pk-pill-on { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.pk-pill-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.pk-warn { font-size: 11px; color: var(--dsw-alias-state-warn-primary); }
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
.pk-note { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.4; }
.pk-err { font-size: 12px; color: var(--dsw-alias-state-error-primary); }

/* Switch: the page's one control for "does the chat menu offer this". */
.pk-switch {
  position: relative; flex: none;
  width: 34px; height: 20px; padding: 0;
  border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));
  transition: background .12s ease, border-color .12s ease;
}
.pk-switch::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--dsw-alias-label-secondary);
  transition: transform .12s ease, background .12s ease;
}
.pk-switch[aria-checked='true'] {
  background: var(--dsw-alias-button-primary-fill);
  border-color: var(--dsw-alias-button-primary-fill);
}
.pk-switch[aria-checked='true']::after {
  transform: translateX(14px);
  background: var(--dsw-alias-bg-layer-1);
}
.pk-switch:disabled { opacity: .45; cursor: default; }
.pk-switch-row { display: flex; align-items: center; gap: 10px; }

/* Provider card in the chat-picker section. */
.pk-provider { display: flex; flex-direction: column; }
.pk-provider-head {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
}
.pk-provider-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.pk-provider-name { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.pk-disclosure {
  flex: none; height: ${BTN_H}; padding: 0 10px;
  font-size: 11px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-secondary);
}
.pk-disclosure:hover { background: var(--dsw-alias-interactive-bg-hover); }
.pk-model-row {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 14px 9px 30px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
}
.pk-model-name { font-size: 12px; color: var(--dsw-alias-label-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-model-id { font-size: 10.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-secondary); flex: none; }
.pk-provider-foot {
  padding: 8px 14px; border-top: 1px solid var(--dsw-alias-border-l1);
  font-size: 11px; color: var(--dsw-alias-label-secondary);
}
`

    /** Section membership for the key rows; order here is the order on the page. */
    const KEY_SECTIONS = [
      { id: 'models', title: 'Model providers', ids: ['isoquant', 'mistral', 'merge-1', 'merge-2', 'concentrate'] },
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
     * One labelled switch.
     *
     * @param props - checked state, change handler, accessible label, disabled.
     */
    function Switch({ checked, onChange, label, disabled }) {
      return h('button', {
        type: 'button',
        className: 'pk-switch',
        role: 'switch',
        'aria-checked': checked === true,
        'aria-label': label,
        disabled,
        onClick: onChange,
      })
    }

    /**
     * One provider row: status, a write-only key field, and its action buttons.
     *
     * @param props - the provider row plus a refresh callback.
     */
    function KeyRow({ provider, onChanged, sub }) {
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

      return h('div', { className: `pk-row${sub === true ? ' pk-row-sub' : ''}` },
        h('div', { className: 'pk-name' },
          h('div', { className: 'pk-name-top' },
            h('span', { className: 'pk-label' }, provider.label),
            h('span', {
              className: `pk-pill${provider.configured ? ' pk-pill-on' : ''}${provider.configured && provider.delivered === false ? ' pk-pill-warn' : ''}`,
            }, provider.configured
              // An MCP-backed key also has to reach its connection file; a key
              // stored but not delivered would otherwise look healthy while the
              // MCP tools stayed unauthenticated.
              ? (provider.delivered === false ? 'Stored, not connected' : 'Key set')
              : 'Not set'),
            provider.docs === undefined ? null : h('a', {
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
     * One provider's entry in the chat model picker.
     *
     * The master switch is the whole-provider answer to "should these models be
     * selectable in chat"; the per-model switches below it refine that without
     * touching the provider. A hidden provider leaves its model switches visible
     * but disabled, so the per-model choices are not lost while it is off.
     */
    function ProviderCard({ entry, onChanged }) {
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(undefined)
      const [open, setOpen] = useState(false)

      const setProvider = useCallback(async () => {
        setBusy(true)
        setFailure(undefined)
        try {
          onChanged(await rpc('setProviderHidden', { provider: entry.provider, hidden: entry.hidden !== true, models: entry.models }))
        } catch (e) {
          setFailure(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [entry.provider, entry.hidden, onChanged])

      const setModel = useCallback(async (model, hidden) => {
        setBusy(true)
        setFailure(undefined)
        try {
          onChanged(await rpc('setModelHidden', { provider: entry.provider, model: model.id, name: model.name, hidden }))
        } catch (e) {
          setFailure(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [entry.provider, onChanged])

      const shown = entry.models.filter((m) => m.hidden !== true).length
      const total = entry.models.length
      const offered = entry.hidden !== true

      return h('div', { className: 'pk-card pk-provider' },
        h('div', { className: 'pk-provider-head' },
          h('div', { className: 'pk-provider-title' },
            h('span', { className: 'pk-provider-name' }, entry.name),
            h('span', { className: 'pk-hint' },
              offered
                ? `${shown} of ${total} model${total === 1 ? '' : 's'} in the chat menu`
                : 'All of its models are hidden from the chat menu'),
            failure === undefined ? null : h('span', { className: 'pk-warn' }, failure),
          ),
          h(Switch, {
            checked: offered,
            disabled: busy,
            label: `Offer ${entry.name} models in the chat model menu`,
            onChange: setProvider,
          }),
          total <= 1 && entry.models.every((m) => m.hidden !== true) ? null : h('button', {
            type: 'button',
            className: 'pk-disclosure',
            onClick: () => setOpen((value) => !value),
            'aria-expanded': open,
          }, open ? 'Hide models' : 'Models'),
        ),
        open ? entry.models.map((model) => h('div', { className: 'pk-model-row', key: model.id },
          h('span', { className: 'pk-model-name' }, model.name || model.id),
          h('span', { className: 'pk-model-id' }, model.id),
          h(Switch, {
            checked: model.hidden !== true,
            disabled: busy || !offered,
            label: `Offer ${model.name || model.id} in the chat model menu`,
            onChange: () => setModel(model, model.hidden !== true),
          }),
        )) : null,
      )
    }

    /**
     * One whole-connection switch.
     *
     * This is the same persisted row toggle the Plugins page flips, surfaced
     * here because turning a connection off usually follows from deciding it
     * does not apply, and hunting for it in a 220-row plugin list is worse.
     */
    function ConnectionRow({ connection, onChanged, sub }) {
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)

      const flip = useCallback(async () => {
        setBusy(true)
        setError(undefined)
        try {
          onChanged(await rpc('setConnection', { id: connection.id, enabled: !connection.enabled }))
        } catch (e) {
          setError(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [connection.id, connection.enabled, onChanged])

      return h('div', { className: `pk-row${sub === true ? ' pk-row-sub' : ''}` },
        h('div', { className: 'pk-name' },
          h('div', { className: 'pk-name-top' },
            h('span', { className: 'pk-label' }, connection.label),
            h('span', {
              className: `pk-pill${connection.enabled ? ' pk-pill-on' : ''}`,
            }, connection.enabled ? 'On' : 'Off'),
          ),
          h('span', { className: 'pk-hint' }, connection.hint),
          // Report skill leakage explicitly: rows off while skills stay
          // discoverable is the exact half-applied state worth noticing.
          connection.skillCount === undefined ? null : h('span', {
            className: connection.enabled === false && connection.skillLive > 0 ? 'pk-warn' : 'pk-ref',
          }, connection.enabled === false && connection.skillLive > 0
            ? `${connection.skillLive} of ${connection.skillCount} skills still loaded — press Turn off again`
            : `${connection.skillCount} skills`),
          error === undefined ? null : h('span', { className: 'pk-err' }, error),
        ),
        h('span'),
        h('div', { className: 'pk-actions' },
          h('button', {
            type: 'button',
            className: 'pk-btn',
            disabled: busy,
            onClick: flip,
          }, busy ? '…' : connection.enabled ? 'Turn off' : 'Turn on'),
        ),
      )
    }

    /**
     * One titled block with an optional one-line explanation.
     */
    function Section({ title, note, children }) {
      return h('div', { className: 'pk-section' },
        h('div', { className: 'pk-section-head' },
          h('span', { className: 'pk-section-title' }, title),
          note === undefined ? null : h('span', { className: 'pk-section-note' }, note),
        ),
        children,
      )
    }

    /**
     * The settings page.
     */
    function ProviderKeysSettings() {
      const [providers, setProviders] = useState(undefined)
      const [connections, setConnections] = useState([])
      const [picker, setPicker] = useState([])
      const [error, setError] = useState(undefined)

      useEffect(() => {
        let alive = true
        rpc('state')
          .then((value) => {
            if (!alive) return
            setProviders(value.providers)
            setConnections(value.connections ?? [])
            setPicker(value.picker ?? [])
          })
          .catch((e) => { if (alive) setError(String(e?.message ?? e)) })
        return () => { alive = false }
      }, [])

      const apply = useCallback((value) => {
        setProviders(value.providers)
        setConnections(value.connections ?? [])
        setPicker(value.picker ?? [])
      }, [])

      if (error !== undefined) return h('div', { className: 'pk-root' }, h('span', { className: 'pk-err' }, error))
      if (providers === undefined) return h('div', { className: 'pk-root' }, h('span', { className: 'pk-note' }, 'Loading…'))

      return renderPage({ providers, connections, picker }, apply)
    }

    /**
     * The page body for one loaded state.
     *
     * Pure on purpose: the same tree can be built in a test and inspected, which
     * is the only way to check this layout without a browser.
     *
     * @param state - providers, connections and picker as `state` returned them.
     * @param apply - refresh callback for any switch.
     */
    function renderPage(state, apply) {
      const { providers, connections, picker } = state
      const byId = new Map(providers.map((p) => [p.id, p]))
      const tinyfish = providers.filter((p) => p.id === 'tinyfish' || p.id === 'tinyfish-2')
      const tinyfishSwitches = connections.filter((c) => c.id.startsWith('tinyfish'))
      const otherConnections = connections.filter((c) => !c.id.startsWith('tinyfish'))

      return h('div', { className: 'pk-root' },
        KEY_SECTIONS.map((section) => {
          const rows = section.ids.map((id) => byId.get(id)).filter(Boolean)
          if (rows.length === 0) return null
          return h(Section, {
            key: section.id,
            title: section.title,
            note: section.id === 'models'
              ? 'A key here lets its provider serve chat. Models appear in the picker section below.'
              : undefined,
          }, h('div', { className: 'pk-card' }, rows.map((p) => h(KeyRow, { key: p.ref, provider: p, onChanged: apply }))))
        }),

        h(Section, {
          title: 'Chat model picker',
          note: 'What the chat model menu offers. Switching one off only empties the menu: an open session keeps working and nothing has to be re-added.',
        },
          picker.length === 0
            ? h('div', { className: 'pk-card' }, h('div', { className: 'pk-row' },
                h('span', { className: 'pk-note' }, 'No provider in this profile advertises models.')))
            : picker.map((entry) => h(ProviderCard, { key: entry.provider, entry, onChanged: apply })),
        ),

        h(Section, { title: 'Search and web tools' },
          h('div', { className: 'pk-card' },
            byId.get('exa') === undefined ? null : h(KeyRow, { key: 'exa', provider: byId.get('exa'), onChanged: apply }),
            tinyfish.length === 0 ? null : tinyfish.map((p) => h(KeyRow, { key: p.ref, provider: p, onChanged: apply })),
            tinyfishSwitches.length === 0 ? null : h('div', { className: 'pk-provider-foot' },
              'Turning TinyFish off removes every one of its tools and their skill guidance.'),
            tinyfishSwitches.map((c) => h(ConnectionRow, {
              key: c.id,
              connection: c,
              onChanged: apply,
              sub: c.sub === true,
            })),
            otherConnections.map((c) => h(ConnectionRow, { key: c.id, connection: c, onChanged: apply })),
          ),
        ),

        h('div', { className: 'pk-note' },
          'Keys are written to the DSH credential store and never read back into this page. ',
          'An environment variable of the same name takes precedence over a key saved here.'),
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
          label: 'Providers & models',
        }, ProviderKeysSettings))
      },
    }
  },
})
