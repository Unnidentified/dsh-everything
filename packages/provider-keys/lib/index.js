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
import { chmod, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { mountChannel } from './route.js'

/**
 * The MCP rows read their bearer token from a file rather than from the
 * environment, because a Cordis `!!js` expression is evaluated synchronously and
 * cannot await a credential lookup. Writing the same value here keeps one
 * source of truth for a user: they type the key once, in Settings.
 *
 * @param name - basename inside the harness home.
 * @returns absolute path of that key file.
 */
function keyFilePath(name) {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, name)
}

/**
 * Mirror a provider key to the 0600 file an MCP row reads.
 *
 * The write is atomic and owner-only: a temporary sibling is written, chmodded,
 * then renamed over the target, so a reader never sees a partial key and the
 * final file is never group- or world-readable.
 *
 * @param name - basename inside the harness home.
 * @param value - the secret to store.
 */
async function writeKeyFile(name, value) {
  const target = keyFilePath(name)
  await mkdir(dirname(target), { recursive: true })
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, value, { mode: 0o600 })
  await chmod(temp, 0o600)
  await rename(temp, target)
}

/**
 * Root directories the skill provider scans, most specific first.
 *
 * Only these two are scanned (`dsh-skill-filesystem` builds its default roots
 * from exactly these paths), so a directory outside them is invisible to the
 * provider without any configuration.
 *
 * @returns absolute skill root paths.
 */
function skillRoots() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const agentsHome = process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents')
  return [join(home, 'skills'), join(agentsHome, 'skills')]
}

/**
 * Where a switched-off skill is parked.
 *
 * A sibling of the root, never inside it: a directory nested in the root would
 * still be ignored, but a sibling cannot be rediscovered by any provider
 * version that later starts recursing.
 *
 * @param root - the scanned root the skill came from.
 * @returns absolute path of the parking directory.
 */
function parkedDirFor(root) {
  return `${root}.disabled`
}

/**
 * Whether a skill directory currently sits in a scanned root.
 *
 * A skill absent from every root and every parking directory reports false:
 * it is not reaching the model either way, and calling it "live" would raise a
 * drift warning for a skill that simply was never installed.
 *
 * @param name - skill directory name.
 * @returns true when the provider would discover it.
 */
async function skillVisible(name) {
  for (const root of skillRoots()) {
    if (await pathExists(join(root, name))) return true
  }
  return false
}

/**
 * Move a skill directory between its scanned root and the parking directory.
 *
 * This is a rename within one filesystem, so it is atomic and lossless: the
 * directory keeps its contents, its permissions and its git state. A skill that
 * is already in the requested place is left alone, which makes the operation
 * safe to repeat.
 *
 * @param name - skill directory name.
 * @param visible - true to restore into the scanned root, false to park it.
 * @returns nothing; a skill absent from both places is not an error.
 */
async function setSkillVisible(name, visible) {
  for (const root of skillRoots()) {
    const live = join(root, name)
    const parked = join(parkedDirFor(root), name)
    if (visible) {
      if (!(await pathExists(parked))) continue
      await mkdir(root, { recursive: true })
      await rename(parked, live)
      return
    }
    if (!(await pathExists(live))) continue
    await mkdir(parkedDirFor(root), { recursive: true })
    await rename(live, parked)
    return
  }
}

/**
 * Whether a path exists, without throwing on a permission or absence error.
 *
 * @param path - absolute path to probe.
 * @returns true when it exists.
 */
async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Whether a mirrored key file currently exists.
 *
 * @param name - basename inside the harness home.
 * @returns true when the file is present.
 */
async function filePresent(name) {
  try {
    await stat(keyFilePath(name))
    return true
  } catch {
    return false
  }
}

/**
 * Remove a mirrored key file, treating an absent file as success.
 *
 * @param name - basename inside the harness home.
 */
async function removeKeyFile(name) {
  try {
    await rm(keyFilePath(name), { force: true })
  } catch {
    // A file that cannot be removed still leaves the credential store cleared,
    // which the page reports; failing the whole request would hide that.
  }
}

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
  {
    id: 'tinyfish',
    label: 'TinyFish #1',
    ref: 'TINYFISH_API_KEY',
    docs: 'https://agent.tinyfish.ai/',
    hint: 'Backs the `tinyfish` MCP connection (search, fetch, browser automation, monitors).',
    optional: true,
    file: 'tinyfish-api-key',
  },
  {
    id: 'tinyfish-2',
    label: 'TinyFish #2',
    ref: 'TINYFISH_API_KEY_2',
    docs: 'https://agent.tinyfish.ai/',
    hint: 'Backs the second `tinyfish-2` MCP connection, with its own wallet and usage meter.',
    optional: true,
    file: 'tinyfish-api-key-2',
  },
]

/**
 * MCP connections this page can switch off entirely.
 *
 * `entry` is the Loader entry id; `row` is what the user is actually turning off,
 * named in their terms rather than the plugin's. Disabling one of these unmounts
 * the mcp-client row, so its tools disappear from the model's tool list instead
 * of merely failing to authenticate.
 */
const CONNECTIONS = [
  {
    id: 'tinyfish',
    label: 'TinyFish',
    // Both accounts: "turn TinyFish off" must leave no tinyfish tool behind,
    // and account two is the same product billed separately.
    entries: ['include:tinyfish-mcp', 'include:tinyfish-mcp-2'],
    // Skills whose guidance would otherwise stay in the system prompt and keep
    // pointing at tools that no longer exist.
    skills: [
      'tinyfish-web',
      'tinyfish-research',
      'tinyfish-automation',
      'tinyfish-browser',
      'tinyfish-authenticated',
      'tinyfish-monitor',
    ],
    hint: 'Turn off to remove every TinyFish web tool and its skill guidance. Covers both accounts.',
  },
  {
    id: 'tinyfish-1',
    label: 'TinyFish #1 only',
    entries: ['include:tinyfish-mcp'],
    hint: 'First account. Use the switch above to turn the whole product off.',
  },
  {
    id: 'tinyfish-2',
    label: 'TinyFish #2 only',
    entries: ['include:tinyfish-mcp-2'],
    hint: 'Second account, with its own wallet.',
  },
  {
    id: 'packet-tracer',
    label: 'Cisco Packet Tracer',
    entries: ['include:packet-tracer-mcp'],
    hint: 'Turn off to remove the Packet Tracer MCP tool.',
  },
]

/**
 * Mount the settings channel.
 *
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  ctx.inject(['connection', 'credentialsController', 'pluginManager'], (inner) => {
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
      // Resolve delivery state before mapping: the callback is synchronous.
      const delivered = new Map()
      for (const p of PROVIDERS) {
        if (p.file !== undefined) delivered.set(p.id, await filePresent(p.file))
      }
      // Enablement is read from the live Loader tree, not from YAML: a row can
      // be disabled by a higher-priority layer, and reporting the file's
      // intention instead of reality would mislabel the toggle.
      let live = []
      try {
        live = await inner.pluginManager.listPlugins()
      } catch {
        live = []
      }
      const enabledOf = (entries) => {
        // A group reads as on only when every row it covers is on; one
        // disabled row means the product is not fully available.
        return entries.every((entry) => {
          const row = live.find((item) => item.entryId === entry)
          // A row absent from the tree is not mounted, so it reads as off.
          return row !== undefined && row.enabled === true
        })
      }
      return {
        providers: PROVIDERS.map((p) => ({
          // `file` is an internal routing detail; the page renders label/hint/ref.
          ...p,
          configured: stateOf(p.ref),
          // An MCP-backed provider also needs its mirrored file to exist, so a
          // key set outside this page (or a deleted file) shows as configured
          // but not delivered.
          ...(p.file === undefined ? {} : { delivered: delivered.get(p.id) === true }),
        })),
        connections: await Promise.all(CONNECTIONS.map(async (c) => {
          const { entries, skills, ...rest } = c
          // Enablement is owned by the rows, which are the persisted switch.
          // Skill visibility is reported separately: a skill left in a scanned
          // root while its rows are off is drift to surface, not a reason to
          // claim the connection is still on.
          const live = skills === undefined ? 0 : (await Promise.all(skills.map(skillVisible))).filter(Boolean).length
          return {
            ...rest,
            enabled: enabledOf(entries),
            ...(skills === undefined ? {} : { skillLive: live, skillCount: skills.length }),
          }
        })),
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
          // Mirror to the MCP row's key file when this provider is MCP-backed,
          // so the connection picks the new key up on its next mount without a
          // second place for the user to paste it.
          const provider = PROVIDERS.find((p) => p.ref === ref)
          if (provider?.file !== undefined) await writeKeyFile(provider.file, value.trim())
          return { ok: true, value: await state() }
        }

        case 'clearKey': {
          const ref = payload?.ref
          if (typeof ref !== 'string' || ref.length === 0) throw new Error('clearKey needs a ref')
          if (!PROVIDERS.some((p) => p.ref === ref)) throw new Error(`unknown credential ref: ${ref}`)
          await credentials.unset(ref)
          const provider = PROVIDERS.find((p) => p.ref === ref)
          if (provider?.file !== undefined) await removeKeyFile(provider.file)
          return { ok: true, value: await state() }
        }

        case 'setConnection': {
          const id = payload?.id
          const enabled = payload?.enabled
          if (typeof id !== 'string' || id.length === 0) throw new Error('setConnection needs an id')
          const conn = CONNECTIONS.find((c) => c.id === id)
          if (conn === undefined) throw new Error(`unknown connection: ${id}`)
          if (typeof enabled !== 'boolean') throw new Error('setConnection needs a boolean enabled')
          // setPluginEnabled persists the choice into the profile patch and
          // applies it to the running tree, so this is the same switch the
          // Plugins page flips — not a separate shadow flag.
          for (const entry of conn.entries) {
            await inner.pluginManager.setPluginEnabled(entry, enabled)
          }
          // The skills travel with the rows: leaving their descriptions in the
          // system prompt would keep advertising tools that just went away.
          for (const skill of conn.skills ?? []) {
            await setSkillVisible(skill, enabled)
          }
          return { ok: true, value: await state() }
        }

        default:
          throw new Error(`unknown method: ${String(method)}`)
      }
    })
  })
}
