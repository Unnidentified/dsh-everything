/**
 * Provider keys — host half.
 *
 * A single Settings page manages every provider API key this profile can use.
 * The page never sees a key value: the host reports only whether a given
 * credential ref is configured, and writes/clears go through the credential
 * controller, so a value is write-only from the browser's point of view.
 *
 * The ref list is declared here rather than in YAML because it is UI identity:
 * a stale YAML copy would be a second place to edit when a provider is added.
 *
 * @module dsh-provider-keys
 */
import { mountChannel } from './route.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'provider-keys'

/** Services this plugin needs before it can mount its page. */
export const inject = []

/**
 * The providers this page manages, in display order.
 *
 * `ref` is the credential-store reference, which is also the environment
 * variable name the adapters read (`apiKeyEnv`). Keeping them identical means a
 * key saved here is picked up by a provider row without extra wiring.
 *
 * `docs` is the page a user visits to create the key; `hint` says what the key
 * is for, in one line. `optional` marks providers whose absence is not an error.
 */
const PROVIDERS = [
  {
    id: 'merge-1',
    label: 'Merge Gateway #1',
    ref: 'MERGE_GATEWAY_API_KEY',
    docs: 'https://gateway.merge.dev/settings/api-keys',
    hint: 'Primary Merge Gateway org. Also reachable as the `merge-direct` provider.',
    optional: true,
  },
  {
    id: 'merge-2',
    label: 'Merge Gateway #2',
    ref: 'MERGE_GATEWAY_API_KEY_2',
    docs: 'https://gateway.merge.dev/settings/api-keys',
    hint: 'Second Merge account. Backs the `merge-direct-2` provider you use by default.',
    optional: true,
  },
  {
    id: 'concentrate',
    label: 'Concentrate AI',
    ref: 'CONCENTRATE_API_KEY',
    docs: 'https://api.concentrate.ai/',
    hint: 'Backs the `concentrate-direct` provider (cache-pinned DeepSeek routes).',
    optional: true,
  },
  {
    id: 'exa',
    label: 'Exa',
    ref: 'EXA_API_KEY',
    docs: 'https://dashboard.exa.ai/api-keys',
    hint: 'Used by the Exa search tool. An environment EXA_API_KEY overrides a key saved here.',
    optional: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    ref: 'DEEPSEEK_API_KEY',
    docs: 'https://platform.deepseek.com/api_keys',
    hint: 'Needed by the built-in web_search provider (deepseek-official), and by anything else that calls DeepSeek directly.',
    optional: true,
  },
  {
    id: 'zai',
    label: 'Z.ai',
    ref: 'ZAI_API_KEY',
    docs: 'https://z.ai/manage-apikey/apikey-list',
    hint: 'Only needed for a Z.ai provider row; the Merge routes do not use it.',
    optional: true,
  },
  {
    id: 'orcarouter',
    label: 'OrcaRouter',
    ref: 'ORCAROUTER_API_KEY',
    docs: 'https://orcarouter.ai/',
    hint: 'Only needed if you add an OrcaRouter provider row.',
    optional: true,
  },
  {
    id: 'commandcode',
    label: 'CommandCode',
    ref: 'COMMANDCODE_API_KEY',
    docs: 'https://commandcode.ai/',
    hint: 'Only needed if you add a CommandCode provider row.',
    optional: true,
  },
]

/**
 * Mount the settings channel.
 *
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  ctx.inject(['connection', 'credentialsController'], (inner) => {
    const credentials = inner.credentialsController

    /**
     * Provider list plus each ref's configured state.
     *
     * @returns the payload the page renders from.
     */
    const state = async () => {
      // `credentialsController.describe` takes a list of refs and answers a map
      // keyed by ref. Older shapes answer one record per ref, so both are
      // accepted and a failure reads as unconfigured rather than the page
      // refusing to open.
      const refs = PROVIDERS.map((p) => p.ref)
      let described
      try {
        described = await credentials.describe(refs)
      } catch {
        described = undefined
      }
      const stateOf = (ref) => {
        if (described === undefined || described === null) return false
        const perRef = described[ref]
        if (perRef !== undefined && perRef !== null) return Boolean(perRef.configured)
        return Boolean(described.configured)
      }
      return {
        providers: PROVIDERS.map((p) => ({ ...p, configured: stateOf(p.ref) })),
      }
    }

    mountChannel(inner, async (method, payload) => {
      switch (method) {
        case 'state':
          return { ok: true, value: await state() }

        case 'setKey': {
          const ref = payload?.ref
          const value = payload?.value
          if (typeof ref !== 'string' || ref.length === 0) throw new Error('setKey needs a ref')
          if (!PROVIDERS.some((p) => p.ref === ref)) throw new Error(`unknown credential ref: ${ref}`)
          if (typeof value !== 'string' || value.trim().length === 0) {
            throw new Error('setKey needs a non-empty value')
          }
          await credentials.set(ref, value.trim())
          return { ok: true, value: await state() }
        }

        case 'clearKey': {
          const ref = payload?.ref
          if (typeof ref !== 'string' || ref.length === 0) throw new Error('clearKey needs a ref')
          if (!PROVIDERS.some((p) => p.ref === ref)) throw new Error(`unknown credential ref: ${ref}`)
          await credentials.unset(ref)
          return { ok: true, value: await state() }
        }

        default:
          throw new Error(`unknown method: ${String(method)}`)
      }
    })
  })
}
