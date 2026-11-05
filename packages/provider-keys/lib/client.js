/**
 * Provider keys — browser half.
 *
 * One Settings page for the credentials this profile can use and for what the
 * chat model menu offers. Every row is one card: the key field, the on/off
 * switch and the model list live together, because they answer one question
 * ("may this provider serve chat, and with which models?").
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

    /** Button geometry shared by every row, so the cards stay on one axis. */
    const BTN_H = '28px'

    const CSS = `
.pk-root { display: flex; flex-direction: column; gap: 20px; padding: 4px 2px 24px; }
.pk-section { display: flex; flex-direction: column; gap: 8px; }
.pk-section-head { display: flex; align-items: center; gap: 10px; padding: 0 2px; }
.pk-section-title {
  font-size: 12px; font-weight: 600; letter-spacing: .02em;
  color: var(--dsw-alias-label-primary); flex: 1;
}
.pk-section-tools { display: flex; align-items: center; gap: 8px; }
.pk-section-tool-label { font-size: 11px; color: var(--dsw-alias-label-secondary); }

.pk-card {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.pk-label { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.pk-ref {
  font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pk-pill {
  font-size: 10px; font-weight: 500; padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  flex: none;
}
.pk-pill-on { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.pk-pill-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.pk-warn { font-size: 11px; color: var(--dsw-alias-state-warn-primary); }
.pk-note { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.4; }
.pk-err { font-size: 12px; color: var(--dsw-alias-state-error-primary); }

.pk-input {
  box-sizing: border-box;
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

/* Switch: the page's one control for "is this offered". */
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

/* One provider: identity and controls on the first line, key field below. */
.pk-provider { display: flex; flex-direction: column; }
.pk-provider-head {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 14px 9px;
}
.pk-provider-title {
  display: flex; align-items: center; gap: 8px;
  flex: 1; min-width: 0;
}
.pk-provider-tools { display: flex; align-items: center; gap: 8px; flex: none; }
.pk-field {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 0 14px 12px;
}
.pk-field .pk-input { flex: 1 1 220px; min-width: 0; }
.pk-field .pk-err { flex-basis: 100%; }
.pk-account-body { display: flex; flex-direction: column; gap: 8px; padding: 0 14px 12px; }
.pk-quota { display: flex; flex-direction: column; gap: 5px; }
.pk-quota-row { display: flex; align-items: center; gap: 10px; font-size: 11.5px; }
.pk-quota-group {
  width: 92px; flex: none;
  color: var(--dsw-alias-label-primary); font-weight: 500;
}
.pk-quota-window { display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); }
.pk-quota-bar {
  width: 54px; height: 5px; border-radius: 999px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));
}
.pk-quota-fill { height: 100%; background: var(--dsw-alias-state-success-primary); }
.pk-ack {
  display: flex; flex-direction: column; gap: 8px;
  margin: 0 14px 12px; padding: 10px 12px;
  border: 1px solid var(--dsw-alias-state-warn-primary); border-radius: 8px;
}
.pk-ack-text { font-size: 11.5px; color: var(--dsw-alias-label-secondary); line-height: 1.45; }
.pk-ack-actions { display: flex; gap: 8px; }
.pk-disclosure {
  flex: none; height: ${BTN_H}; padding: 0 10px;
  font-size: 11px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.pk-disclosure:hover { background: var(--dsw-alias-interactive-bg-hover); }
.pk-model-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px 8px 26px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
}
.pk-model-name { font-size: 12px; color: var(--dsw-alias-label-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-model-id { font-size: 10.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-secondary); flex: none; }
.pk-card + .pk-card { margin-top: 0; }
`

    /**
     * The plugin context, captured on apply.
     *
     * The page renders from a slot registration, so this is the only handle it
     * has on `connection` — the harness client that owns the channel envelope.
     */
    let pluginCtx

    /**
     * Call one channel method.
     *
     * Through `connection.rpc.call` the harness builds the `client-request`
     * envelope, correlates the `server-response`, and returns its `result`. A
     * bare `fetch` post is what made this page answer "request failed (200)":
     * the channel speaks envelopes, so a body without one is rejected with an
     * error envelope at status 200.
     *
     * @param method - endpoint after the channel prefix.
     * @param payload - request payload.
     * @returns the server's `value`.
     */
    async function rpc(method, payload) {
      let result
      if (pluginCtx?.connection?.rpc?.call !== undefined) {
        result = await pluginCtx.connection.rpc.call(CHANNEL, method, payload ?? {})
      } else {
        // A harness without the client RPC caller still reaches the same route:
        // send the envelope by hand and read the correlated reply.
        const rpcId = crypto.randomUUID()
        const response = await fetch(`${CHANNEL}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'client-request', rpcId, method, payload: payload ?? {} }),
        })
        if (!response.ok) throw new Error(`transport failure for ${CHANNEL}/${method}: HTTP ${response.status}`)
        const full = await response.json()
        if (full?.rpcId !== rpcId) throw new Error(`rpcId mismatch for ${method}: sent ${rpcId}, got ${String(full?.rpcId)}`)
        result = full?.result
      }
      if (result?.ok !== true) {
        const message = result?.error?.message
        throw new Error(typeof message === 'string' && message.length > 0 ? message : 'request failed')
      }
      return result.value
    }

    /**
     * One quota window as the card shows it: percentage left and when it resets.
     *
     * @param fraction - `remainingFraction` from the host, clamped to 0…1.
     * @returns whole percent left.
     */
    function percentLeft(fraction) {
      if (typeof fraction !== 'number' || Number.isNaN(fraction)) return 0
      return Math.round(Math.max(0, Math.min(1, fraction)) * 100)
    }

    /**
     * A reset instant as remaining time, compact enough for one line.
     *
     * @param iso - reset time from the host.
     * @param now - clock to measure against; injected by tests.
     * @returns `2h 10m`, `now`, or an empty string when unparseable.
     */
    function untilLabel(iso, now = Date.now()) {
      const target = Date.parse(iso)
      if (Number.isNaN(target)) return ''
      const minutes = Math.max(0, Math.round((target - now) / 60000))
      if (minutes === 0) return 'now'
      const days = Math.floor(minutes / 1440)
      const hours = Math.floor((minutes % 1440) / 60)
      const rest = minutes % 60
      if (days > 0) return `${days}d ${hours}h`
      if (hours > 0) return `${hours}h ${rest}m`
      return `${rest}m`
    }

    /**
     * The quota groups to render, or none when the host has nothing usable.
     *
     * @param usage - `QuotaStatusView` from the host.
     * @returns one row per model family, each with its windows.
     */
    function quotaRows(usage) {
      if (usage === undefined || usage === null || usage.state !== 'available' || !Array.isArray(usage.groups)) return []
      return usage.groups.map((group) => ({
        key: String(group?.group ?? ''),
        label: group?.group === 'gemini' ? 'Gemini' : 'Claude / GPT',
        windows: (Array.isArray(group?.windows) ? group.windows : []).map((w) => ({
          window: String(w?.window ?? ''),
          label: w?.window === 'weekly' ? 'wk' : '5h',
          left: percentLeft(w?.remainingFraction),
          reset: untilLabel(w?.resetTime),
        })),
      }))
    }

    /**
     * The account line for the pill: what the card knows about the session.
     *
     * @param status - `AntigravityStatusView`, or undefined while loading.
     * @returns one short label.
     */
    /**
     * Whether a provider has a key at all.
     *
     * A file-backed provider (the MCP ones) is live from its mirrored key file
     * even when the credential store holds nothing, so both count.
     *
     * @param provider - one row from the host's provider list.
     * @returns true when some key exists for it.
     */
    function hasStoredKey(provider) {
      return provider.configured === true || provider.delivered === true
    }

    /**
     * The one-line key state shown in the pill.
     *
     * "Stored, not connected" is the state worth noticing: the key is in the
     * store but the connection's own file never got it.
     *
     * @param provider - one row from the host's provider list.
     * @returns label text.
     */
    function keyStateLabel(provider) {
      if (provider.configured === true) {
        return provider.delivered === false ? 'Stored, not connected' : 'Key set'
      }
      return provider.delivered === true ? 'Key file' : 'Not set'
    }

    function accountLabel(status) {
      if (status === undefined) return 'Checking…'
      if (status?.login?.phase === 'pending') return 'Waiting for browser'
      if (status?.login?.configured === true) return 'Signed in'
      return 'Signed out'
    }

    /**
     * Live Antigravity account state.
     *
     * The host serves this account over the shared `/api` channel, so the card
     * talks to it exactly as the plugin's own settings page did — through
     * `connection.rpc.call`. Every endpoint returns a value-safe view; nothing
     * secret crosses this boundary, which is why the quota can be shown here.
     */
    function useAntigravity(onSettled) {
      const [status, setStatus] = useState(undefined)
      const [usage, setUsage] = useState(undefined)
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(undefined)
      // Whether the account was signed in on the previous read: a flip either way
      // changes which models the host can offer, so the page state reloads.
      const settled = useRef(null)

      const call = useCallback(async (endpoint, payload) => {
        const connection = pluginCtx?.connection
        if (connection?.rpc?.call === undefined) {
          throw new Error('Antigravity is only reachable from a local app window')
        }
        const result = await connection.rpc.call('/api', `antigravity-auth/${endpoint}`, payload ?? {})
        if (result?.ok !== true) throw new Error(result?.error?.message ?? `Antigravity ${endpoint} failed`)
        return result.value
      }, [])

      const refresh = useCallback(async () => {
        try {
          const value = await call('status')
          setStatus(value.status)
          const signedIn = value.status?.login?.configured === true
          if (settled.current === null) settled.current = signedIn
          else if (settled.current !== signedIn) {
            settled.current = signedIn
            onSettled?.()
          }
          if (signedIn) {
            try { setUsage(await call('usage')) } catch { setUsage(undefined) }
          } else {
            setUsage(undefined)
          }
          setFailure(undefined)
        } catch (error) {
          setFailure(String(error?.message ?? error))
        }
      }, [call, onSettled])

      useEffect(() => { refresh() }, [refresh])

      // The login completes in the browser, so the card polls while it waits and
      // flips to signed-in on its own.
      useEffect(() => {
        if (status?.login?.phase !== 'pending') return undefined
        const id = setInterval(refresh, 2500)
        return () => clearInterval(id)
      }, [status?.login?.phase, refresh])

      const run = useCallback(async (operation) => {
        setBusy(true)
        setFailure(undefined)
        try {
          await operation()
        } catch (error) {
          setFailure(String(error?.message ?? error))
        } finally {
          setBusy(false)
          refresh()
        }
      }, [refresh])

      return {
        status,
        usage,
        busy,
        failure,
        // Acknowledging the risk is a consent, not a formality: the card asks
        // before it records one, then starts the login in the same action.
        signIn: () => run(async () => { await call('login') }),
        acknowledgeAndSignIn: () => run(async () => {
          await call('acknowledge-risk', { acknowledge: true })
          await call('login')
        }),
        cancel: () => run(async () => { await call('cancel') }),
        signOut: () => run(async () => { await call('logout') }),
        refresh,
      }
    }

    /**
     * One on/off switch.
     *
     * `label` is the accessible name rather than visible text: every switch on
     * this page sits next to the thing it controls.
     */
    function Switch({ checked, onChange, label, disabled }) {
      return h('button', {
        type: 'button',
        className: 'pk-switch',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        title: label,
        disabled,
        onClick: onChange,
      })
    }

    /**
     * The write-only key field of one card.
     *
     * The draft starts empty on purpose: a stored key is never read back, so the
     * only value the field can hold is what the user is typing now.
     */
    function KeyInput({ provider, onChanged }) {
      const [draft, setDraft] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)
      const inputRef = useRef(null)

      const hasKey = hasStoredKey(provider)

      const save = useCallback(async () => {
        if (draft.trim().length === 0) return
        setBusy(true)
        setError(undefined)
        try {
          const next = await rpc('setKey', { ref: provider.ref, value: draft.trim() })
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

      return h('div', { className: 'pk-field' },
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
            disabled: busy || !hasKey,
            onClick: clear,
          }, 'Clear'),
        ),
        error === undefined ? null : h('span', { className: 'pk-err' }, error),
      )
    }

    /**
     * One provider card: key, availability switch, and its models.
     *
     * `entry` is the provider's model-picker state, absent for a card that only
     * stores a key (a tool, or a route that advertises no models). The switch is
     * the whole-provider answer to "may these models be picked in chat"; the
     * per-model switches refine it without touching the provider. A hidden
     * provider keeps its model rows visible but disabled, so the per-model
     * choices are not lost while it is off.
     */
    function ProviderCard({ provider, entry, connection, onChanged }) {
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(undefined)
      const [open, setOpen] = useState(false)

      const setProvider = useCallback(async () => {
        if (entry === undefined) return
        setBusy(true)
        setFailure(undefined)
        try {
          onChanged(await rpc('setProviderHidden', {
            provider: entry.provider,
            hidden: entry.hidden !== true,
            models: entry.models,
          }))
        } catch (e) {
          setFailure(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [entry, onChanged])

      const setModel = useCallback(async (model) => {
        if (entry === undefined) return
        setBusy(true)
        setFailure(undefined)
        try {
          onChanged(await rpc('setModelHidden', {
            provider: entry.provider,
            model: model.id,
            name: model.name,
            hidden: model.hidden !== true,
          }))
        } catch (e) {
          setFailure(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [entry, onChanged])

      const flipConnection = useCallback(async () => {
        if (connection === undefined) return
        setBusy(true)
        setFailure(undefined)
        try {
          onChanged(await rpc('setConnection', { id: connection.id, enabled: !connection.enabled }))
        } catch (e) {
          setFailure(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [connection, onChanged])

      const models = entry === undefined ? [] : entry.models
      const shown = models.filter((m) => m.hidden !== true).length
      const total = models.length
      const offered = entry !== undefined && entry.hidden !== true
      const disclosure = total > 1 || models.some((m) => m.hidden === true)

      return h('div', { className: 'pk-card pk-provider' },
        h('div', { className: 'pk-provider-head' },
          h('div', { className: 'pk-provider-title' },
            h('span', { className: 'pk-label' }, provider.label),
            h('span', {
              className: `pk-pill${hasStoredKey(provider) ? ' pk-pill-on' : ''}${provider.configured && provider.delivered === false ? ' pk-pill-warn' : ''}`,
            }, keyStateLabel(provider)),
            h('span', { className: 'pk-ref' }, provider.ref),
            provider.docs === undefined ? null : h('a', {
              className: 'pk-link',
              href: provider.docs,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, 'Get a key ↗'),
          ),
          h('div', { className: 'pk-provider-tools' },
            failure === undefined ? null : h('span', { className: 'pk-warn' }, failure),
            connection === undefined ? null : h(Switch, {
              checked: connection.enabled,
              disabled: busy,
              label: connection.enabled
                ? `Turn off ${connection.label} and remove its tools`
                : `Turn on ${connection.label}`,
              onChange: flipConnection,
            }),
            entry === undefined ? null : h(Switch, {
              checked: offered,
              disabled: busy,
              label: offered
                ? `Hide ${entry.name} models from the chat model menu`
                : `Offer ${entry.name} models in the chat model menu`,
              onChange: setProvider,
            }),
            entry === undefined || !disclosure ? null : h('button', {
              type: 'button',
              className: 'pk-disclosure',
              onClick: () => setOpen((value) => !value),
              'aria-expanded': open,
              title: 'Choose which models this provider may offer',
            }, offered ? `${shown}/${total} models` : 'Models'),
          ),
        ),

        h(KeyInput, { provider, onChanged }),

        entry === undefined || !open ? null : models.map((model) => h('div', { className: 'pk-model-row', key: model.id },
          h('span', { className: 'pk-model-name' }, model.name || model.id),
          h('span', { className: 'pk-model-id' }, model.id),
          h(Switch, {
            checked: model.hidden !== true,
            disabled: busy || !offered,
            label: `Offer ${model.name || model.id} in the chat model menu`,
            onChange: () => setModel(model),
          }),
        )),
      )
    }

    /**
     * One account provider: the Antigravity card.
     *
     * Same shape as a key row — identity, a state pill, one action, the model
     * list — but the action is a Google sign-in rather than a paste field, and
     * the body carries the live quota. Both come from the host's account RPC,
     * which keeps tokens host-side and sends only these value-safe views.
     */
    function AccountCard({ provider, entry, onChanged }) {
      // Signing in or out changes the model list the host can offer, so the page
      // state reloads once the account settles instead of waiting for a reopen.
      const reloadPage = useCallback(() => {
        rpc('state').then(onChanged).catch(() => {})
      }, [onChanged])
      const account = useAntigravity(reloadPage)
      const [askRisk, setAskRisk] = useState(false)
      const [open, setOpen] = useState(false)
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(undefined)

      const models = entry === undefined ? [] : entry.models
      const offered = entry !== undefined && entry.hidden !== true
      const shown = models.filter((m) => m.hidden !== true).length
      const total = models.length
      const disclosure = total > 1 || models.some((m) => m.hidden === true)
      const signedIn = account.status?.login?.configured === true
      const pending = account.status?.login?.phase === 'pending'
      const acknowledged = account.status?.riskAcknowledged === true

      const setModel = useCallback(async (model) => {
        if (entry === undefined) return
        setBusy(true)
        setFailure(undefined)
        try {
          onChanged(await rpc('setModelHidden', {
            provider: entry.provider,
            model: model.id,
            name: model.name,
            hidden: model.hidden !== true,
          }))
        } catch (e) {
          setFailure(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [entry, onChanged])

      const setProvider = useCallback(async () => {
        if (entry === undefined) return
        setBusy(true)
        setFailure(undefined)
        try {
          onChanged(await rpc('setProviderHidden', {
            provider: entry.provider,
            hidden: entry.hidden !== true,
            models: entry.models,
          }))
        } catch (e) {
          setFailure(String(e?.message ?? e))
        } finally {
          setBusy(false)
        }
      }, [entry, onChanged])

      const startSignIn = useCallback(() => {
        // The acknowledgement is a consent to an unsupported login path; ask
        // before recording one, then continue straight into the browser flow.
        if (acknowledged) account.signIn()
        else setAskRisk(true)
      }, [acknowledged, account])

      const quota = quotaRows(account.usage)

      return h('div', { className: 'pk-card pk-provider' },
        h('div', { className: 'pk-provider-head' },
          h('div', { className: 'pk-provider-title' },
            h('span', { className: 'pk-label' }, provider.label),
            h('span', { className: `pk-pill${signedIn ? ' pk-pill-on' : ''}` }, accountLabel(account.status)),
            h('span', { className: 'pk-ref' }, account.status?.login?.maskedEmail ?? 'Google account'),
            provider.docs === undefined ? null : h('a', {
              className: 'pk-link',
              href: provider.docs,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, 'About ↗'),
          ),
          h('div', { className: 'pk-provider-tools' },
            account.failure === undefined && failure === undefined
              ? null
              : h('span', { className: 'pk-warn' }, account.failure ?? failure),
            signedIn
              ? h('button', { className: 'pk-btn', type: 'button', disabled: account.busy, onClick: account.signOut }, 'Log out')
              : pending
                ? h('button', { className: 'pk-btn', type: 'button', disabled: account.busy, onClick: account.cancel }, 'Cancel')
                : h('button', {
                    className: 'pk-btn pk-btn-primary',
                    type: 'button',
                    disabled: account.busy,
                    onClick: startSignIn,
                  }, account.busy ? 'Starting…' : 'Sign in'),
            entry === undefined ? null : h(Switch, {
              checked: offered,
              disabled: busy,
              label: offered
                ? `Hide ${entry.name} models from the chat model menu`
                : `Offer ${entry.name} models in the chat model menu`,
              onChange: setProvider,
            }),
            entry === undefined || !disclosure ? null : h('button', {
              type: 'button',
              className: 'pk-disclosure',
              onClick: () => setOpen((value) => !value),
              'aria-expanded': open,
              title: 'Choose which models this provider may offer',
            }, offered ? `${shown}/${total} models` : 'Models'),
          ),
        ),

        askRisk && !acknowledged ? h('div', { className: 'pk-ack' },
          h('span', { className: 'pk-ack-text' },
            'Google does not support third-party Antigravity login tools. Your account may be suspended or terminated.'),
          h('div', { className: 'pk-ack-actions' },
            h('button', {
              className: 'pk-btn pk-btn-primary',
              type: 'button',
              onClick: () => { setAskRisk(false); account.acknowledgeAndSignIn() },
            }, 'I understand'),
            h('button', { className: 'pk-btn', type: 'button', onClick: () => setAskRisk(false) }, 'Cancel'),
          ),
        ) : null,

        pending ? h('div', { className: 'pk-account-body' },
          h('span', { className: 'pk-note' }, 'Finish signing in in your browser — this card updates when it completes.'),
        ) : null,

        quota.length === 0 ? null : h('div', { className: 'pk-account-body pk-quota' },
          quota.map((row) => h('div', { className: 'pk-quota-row', key: row.key },
            h('span', { className: 'pk-quota-group' }, row.label),
            row.windows.map((w) => h('span', {
              className: 'pk-quota-window',
              key: w.window,
              title: w.reset === '' ? undefined : `resets in ${w.reset}`,
            },
              h('span', {}, w.label),
              h('span', { className: 'pk-quota-bar' }, h('span', { className: 'pk-quota-fill', style: { width: `${w.left}%` } })),
              h('span', {}, `${w.left}%`),
            )),
          )),
        ),

        entry === undefined || !open ? null : models.map((model) => h('div', { className: 'pk-model-row', key: model.id },
          h('span', { className: 'pk-model-name' }, model.name || model.id),
          h('span', { className: 'pk-model-id' }, model.id),
          h(Switch, {
            checked: model.hidden !== true,
            disabled: busy || !offered,
            label: `Offer ${model.name || model.id} in the chat model menu`,
            onChange: () => setModel(model),
          }),
        )),
      )
    }

    /**
     * One titled block.
     */
    function Section({ title, tools, children }) {
      return h('div', { className: 'pk-section' },
        h('div', { className: 'pk-section-head' },
          h('span', { className: 'pk-section-title' }, title),
          tools === undefined ? null : h('div', { className: 'pk-section-tools' }, tools),
        ),
        children,
      )
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
      const pickerOf = new Map(picker.map((entry) => [entry.provider, entry]))
      const connectionOf = new Map(connections.map((connection) => [connection.id, connection]))
      // Model routes carry `route`; tool rows (Exa, TinyFish) carry `connection`.
      const modelProviders = providers.filter((p) => p.route !== undefined)
      const toolProviders = providers.filter((p) => p.route === undefined && p.connection === undefined)
      const pairedTools = providers.filter((p) => p.route === undefined && p.connection !== undefined)
      const bothTinyfish = connectionOf.get('tinyfish')

      return h('div', { className: 'pk-root' },
        h(Section, { title: 'Model providers' },
          modelProviders.length === 0
            ? h('div', { className: 'pk-card' }, h('div', { className: 'pk-model-row' },
                h('span', { className: 'pk-note' }, 'No provider in this profile advertises models.')))
            : modelProviders.map((provider) => (provider.oauth === true
                ? h(AccountCard, {
                    key: provider.id,
                    provider,
                    entry: pickerOf.get(provider.route),
                    onChanged: apply,
                  })
                : h(ProviderCard, {
                    key: provider.id,
                    provider,
                    entry: provider.route === undefined ? undefined : pickerOf.get(provider.route),
                    onChanged: apply,
                  }))),
        ),

        h(Section, {
          title: 'Search and web tools',
          tools: bothTinyfish === undefined ? undefined : [
            h('span', { key: 'label', className: 'pk-section-tool-label' }, 'TinyFish, both accounts'),
            h(Switch, {
              key: 'switch',
              checked: bothTinyfish.enabled,
              disabled: false,
              label: bothTinyfish.enabled
                ? 'Turn off both TinyFish accounts and remove their tools'
                : 'Turn on both TinyFish accounts',
              onChange: async () => {
                try {
                  apply(await rpc('setConnection', { id: bothTinyfish.id, enabled: !bothTinyfish.enabled }))
                } catch { /* the per-account switches still report their own errors */ }
              },
            }),
          ],
        },
          toolProviders.concat(pairedTools).map((provider) => h(ProviderCard, {
            key: provider.id,
            provider,
            entry: undefined,
            connection: provider.connection === undefined ? undefined : connectionOf.get(provider.connection),
            onChanged: apply,
          })),
        ),

        h('div', { className: 'pk-note' },
          'Keys are written to the DSH credential store and never read back into this page. ',
          'An environment variable of the same name takes precedence over a key saved here.'),
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

    return {
      inject: ['slots', 'connection'],
      apply(ctx) {
        pluginCtx = ctx
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
          label: 'Providers',
        }, ProviderKeysSettings))
      },
    }
  },
})
