/**
 * dsh-plugin-exa-search — Exa.ai neural web search as native DeepSeek Harness
 * tools.
 *
 * Registers two first-party tools:
 *
 *   exa_search    — neural/keyword web search with optional contents and optional
 *                   grounded structured synthesis (`outputSchema`).
 *   exa_contents  — clean parsed content for URLs you already have.
 *
 * Both are backed by `api.exa.ai` over plain `fetch`, so the plugin has no
 * runtime dependency beyond Node's built-in globals and installs with no build
 * step.
 *
 * ## API key resolution
 *
 * `EXA_API_KEY` from the environment wins. When the Host process was launched
 * without it — which is normal for a GUI app that never sources a shell
 * profile — the plugin falls back to a value stored via
 * `/exa key <value>` in `<DSH home>/storages/exa-search.json`. The stored value
 * is never echoed back in full; only a short prefix and length are reported.
 *
 * ## Why the tool definitions are built defensively
 *
 * DSH resolves `@deepseek-ai/dsh-tools` for plugins through its own loader
 * resolver, which a bare `node` process cannot reach. The import is therefore
 * wrapped: when the SDK is available the tools are built with the real
 * `defineTool`, and when it is not the plugin emits an equivalent raw
 * definition carrying the exact contract `ToolRuntime.register()` enforces — a
 * JSON-Schema `parameters` object plus an `output { schema, render }` pair.
 * Either way the plugin loads.
 *
 * @module dsh-plugin-exa-search
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  CONTENT_MODES,
  SEARCH_TYPES,
  ExaError,
  exaGetContents,
  exaSearch,
  frameResult,
  renderContentsText,
  renderSearchText,
} from './exa-client.js';

/** Registry key this plugin inserts into. Declared so `ctx.tools` exists first. */
export const inject = ['tools'];

/** Plugin name reported to the loader. */
export const name = 'exa-search';

/** Harness home, honouring an explicit DSH_HOME before falling back to ~/.dsh. */
const HOME = process.env.DSH_HOME && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh');

/** Settings file, written only when a key is stored through `/exa key`. */
const STORE_PATH = join(HOME, 'storages', 'exa-search.json');

/** Per-call timeout. `deep-reasoning` can take 40s, so the ceiling is generous. */
const TIMEOUT_MS = 120000;

/** Tool description for `exa_search`, shown to the model. */
const SEARCH_DESCRIPTION = [
  "Search the web with Exa's neural search and get ranked results.",
  'Returns query-relevant highlights by default — enough to judge which results matter, at roughly a twentieth of the token cost of full page text.',
  'When a highlight says a page is worth reading in full, call this tool again with contentMode "text" (same query, or narrowed via includeDomains) to pull the page body, or call exa_contents on that one URL. Escalate only for the results you actually need: fetching text for every result in a broad search is expensive and rarely useful.',
  'Use contentMode "summary" instead when you want one LLM-written summary per result rather than the page itself.',
  'Prefer this over web_search for conceptual or research questions, and when you want excerpts rather than a synthesized answer.',
  'Set outputSchema to have Exa synthesize grounded structured JSON instead of raw results.',
  'type="auto" is the balanced default; "deep-reasoning" is slowest and best for hard multi-source synthesis.',
].join(' ');

/** Tool description for `exa_contents`. */
const CONTENTS_DESCRIPTION = [
  'Get clean parsed content for URLs you already have, via Exa.',
  'Use this instead of web_fetch when the page is JS-heavy, paywalled by a cookie wall, or you want an LLM-written summary per URL.',
  'Returns extracted page text by default; contentMode "summary" gives one LLM-written summary per URL instead.',
  'Also useful to refresh stale content by setting maxAgeHours.',
  'On this endpoint the content fields are top-level; contentMode selects one of highlights, text, or summary.',
].join(' ');

/** Per-argument descriptions shared by both definition paths. */
const ARG = {
  query: 'Natural-language search query. Use singular, specific phrasing.',
  type: `Search depth. One of: ${SEARCH_TYPES.join(', ')}. Default "auto".`,
  numResults: 'How many results to return, 1-100. Default 10.',
  contentMode: `Which content shape to request. "highlights" (default for exa_search) returns cheap query-relevant excerpts — use them to decide which results to read. "text" returns the extracted page body; ask for it when a highlight showed the page matters. "summary" returns one LLM-written summary per result. Pick only one.`,
  maxCharacters: 'How much page text Exa may return per result, when contentMode is "text". Default 20000. Raise it for long documents; raise the value to get more text both fetched and shown inline.',
  maxAgeHours:
    'Cache freshness: 24 = livecrawl if the cached copy is older than 24h, 0 = always livecrawl, -1 = cache only. Omit for the balanced default.',
  includeDomains: 'Optional list of hostnames (or hostname+path prefixes) to restrict results to.',
  excludeDomains: 'Optional list of hostnames to exclude. Not allowed with category "company" or "people".',
  startPublishedDate: 'Optional ISO date; keep results published on or after it.',
  endPublishedDate: 'Optional ISO date; keep results published on or before it.',
  category: 'Optional content category filter (for example "research paper", "news", "github").',
  systemPrompt:
    'Optional. Steers Exa synthesis when outputSchema is set: source preferences, dedupe rules, grounding rules.',
  outputSchema:
    'Optional JSON Schema for grounded structured output. When set, Exa returns synthesized JSON in output.content plus field-level citations in output.grounding.',
  urls: 'Absolute URLs to extract content from.',
};

/**
 * Load `defineTool` from the DSH SDK, or `undefined` when the loader does not
 * expose it to this module.
 *
 * @returns {Promise<Function | undefined>} The SDK constructor when available.
 */
async function loadDefineTool() {
  try {
    const sdk = await import('@deepseek-ai/dsh-tools');
    return typeof sdk.defineTool === 'function' ? sdk.defineTool : undefined;
  } catch {
    return undefined;
  }
}

/** Resolved once; SDK presence cannot change during a process lifetime. */
const defineTool = await loadDefineTool();

/**
 * Read the plugin's settings file.
 *
 * A missing file yields an empty object; a corrupt one is reported rather than
 * silently discarded, because silently ignoring a stored key would look exactly
 * like an unset key.
 *
 * @param {object} [logger] - Host logger, when available.
 * @returns {Promise<{ apiKey?: string }>} Current settings.
 */
async function readSettings(logger) {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      logger?.warn?.(`exa-search: could not read ${STORE_PATH}: ${String(error?.message ?? error)}`);
    }
    return {};
  }
}

/**
 * Write the settings file atomically.
 *
 * @param {object} settings - Settings to persist.
 * @returns {Promise<void>} Resolves once the rename lands.
 */
async function writeSettings(settings) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  const temp = `${STORE_PATH}.${randomUUID()}.tmp`;
  // Owner-only: the file holds a live API key.
  await writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, STORE_PATH);
}

/**
 * Resolve the effective API key, preferring the environment.
 *
 * @param {object} [logger] - Host logger, when available.
 * @returns {Promise<string | undefined>} The key, or undefined when unset.
 */
async function resolveApiKey(logger) {
  const fromEnv = process.env.EXA_API_KEY;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim();
  const stored = (await readSettings(logger)).apiKey;
  return typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : undefined;
}

/** Describe a key without disclosing it. */
function describeKey(key) {
  return key === undefined ? 'not set' : `set (${key.slice(0, 4)}…, ${key.length} chars)`;
}

/**
 * Register the plugin's tools and command.
 *
 * @param {object} ctx - Cordis context supplied by the loader.
 */
export function apply(ctx) {
  /** Exact disposers for the tools this plugin registered. */
  const disposers = [];

  /**
   * Resolve a usable key or throw the error that tells the caller how to fix it.
   *
   * @returns {Promise<string>} The API key.
   */
  async function requireKey() {
    const key = await resolveApiKey(ctx.logger);
    if (key === undefined) {
      throw new ExaError(
        'No Exa API key. Set EXA_API_KEY in the Harness environment, or run /exa key <value> to store one.',
        { kind: 'config' },
      );
    }
    return key;
  }

  /**
   * Execute `exa_search`.
   *
   * @param {object} args - Validated tool arguments.
   * @param {object} [exec] - Tool execution context.
   * @returns {Promise<{ text: string, spilled?: string }>} The tool result.
   */
  async function runSearch(args, exec) {
    const apiKey = await requireKey();
    const payload = await exaSearch(args, { apiKey, signal: exec?.signal, timeoutMs: TIMEOUT_MS });
    const type = args?.type ?? 'auto';
    const query = String(args?.query ?? '');
    // An explicit maxCharacters asks for more text, so it lifts the render
    // budget too; otherwise the page would be fetched and then thrown away.
    const textChars = typeof args?.maxCharacters === 'number' ? args.maxCharacters : undefined;
    const text = renderSearchText(payload, { query, type, textChars });
    return frameResult(
      payload,
      text,
      { query, type, textChars, limit: Array.isArray(payload?.results) ? payload.results.length : undefined },
      `exa-search-${query}`,
    );
  }

  /**
   * Execute `exa_contents`.
   *
   * @param {object} args - Validated tool arguments.
   * @param {object} [exec] - Tool execution context.
   * @returns {Promise<{ text: string, spilled?: string }>} The tool result.
   */
  async function runContents(args, exec) {
    const apiKey = await requireKey();
    const payload = await exaGetContents(args, { apiKey, signal: exec?.signal, timeoutMs: TIMEOUT_MS });
    const textChars = typeof args?.maxCharacters === 'number' ? args.maxCharacters : undefined;
    const text = renderContentsText(payload, { textChars });
    return frameResult(payload, text, { query: 'contents', type: 'contents', textChars }, 'exa-contents');
  }

  /**
   * Render a result as model-facing content parts.
   *
   * @param {object} _args - Call arguments (unused).
   * @param {{ text: string }} value - Executed result.
   * @returns {Array<{ type: 'text', text: string }>} Content parts.
   */
  function renderOutput(_args, value) {
    const text =
      value && typeof value.text === 'string' && value.text.length > 0
        ? value.text
        : String(value?.error ?? 'exa: no output');
    return [{ type: 'text', text }];
  }

  /** Output declaration; required by `register()`. */
  const OUTPUT = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, additionalProperties: true },
    render: renderOutput,
  };

  /** Raw JSON Schema fallback for `exa_search` arguments. */
  const SEARCH_PARAMETERS_SCHEMA = {
    type: 'object',
    properties: {
      query: { type: 'string', description: ARG.query },
      type: { type: 'string', enum: SEARCH_TYPES, description: ARG.type },
      numResults: { type: 'integer', description: ARG.numResults },
      contentMode: { type: 'string', enum: CONTENT_MODES, description: ARG.contentMode },
      maxCharacters: { type: 'integer', description: ARG.maxCharacters },
      maxAgeHours: { type: 'integer', description: ARG.maxAgeHours },
      includeDomains: { type: 'array', items: { type: 'string' }, description: ARG.includeDomains },
      excludeDomains: { type: 'array', items: { type: 'string' }, description: ARG.excludeDomains },
      startPublishedDate: { type: 'string', description: ARG.startPublishedDate },
      endPublishedDate: { type: 'string', description: ARG.endPublishedDate },
      category: { type: 'string', description: ARG.category },
      systemPrompt: { type: 'string', description: ARG.systemPrompt },
      outputSchema: { type: 'object', additionalProperties: true, description: ARG.outputSchema },
    },
    required: ['query'],
  };

  /** Raw JSON Schema fallback for `exa_contents` arguments. */
  const CONTENTS_PARAMETERS_SCHEMA = {
    type: 'object',
    properties: {
      urls: { type: 'array', items: { type: 'string' }, description: ARG.urls },
      contentMode: { type: 'string', enum: CONTENT_MODES, description: ARG.contentMode },
      maxCharacters: { type: 'integer', description: ARG.maxCharacters },
      maxAgeHours: { type: 'integer', description: ARG.maxAgeHours },
    },
    required: ['urls'],
  };

  /**
   * Build one registry-ready tool definition.
   *
   * Uses the SDK's `defineTool` when present so argument validation comes from
   * DSH itself; otherwise emits an equivalent definition in the same shape
   * `register()` accepts.
   *
   * @param {string} toolName - Model-facing tool name.
   * @param {string} description - Tool description.
   * @param {object} parameters - SDK property map, or raw JSON Schema on fallback.
   * @param {object} rawParameters - Raw JSON Schema equivalent.
   * @param {Function} execute - Execution body.
   * @returns {object} The tool definition.
   */
  function buildTool(toolName, description, parameters, rawParameters, execute) {
    if (typeof defineTool === 'function') {
      return defineTool({
        name: toolName,
        description,
        parameters,
        output: OUTPUT,
        // Independent HTTP calls; safe to overlap.
        isConcurrencySafe: () => true,
        execute,
      });
    }
    return {
      name: toolName,
      description,
      parameters: rawParameters,
      output: OUTPUT,
      isConcurrencySafe: () => true,
      execute,
    };
  }

  /** `exa_search` definition. */
  function createSearchTool() {
    return buildTool(
      'exa_search',
      SEARCH_DESCRIPTION,
      {
        // `required: true` must be literal true when present: the SDK rejects
        // `false` and treats omission as optional.
        query: { type: 'string', required: true, description: ARG.query },
        type: { type: 'string', enum: SEARCH_TYPES, description: ARG.type },
        numResults: { type: 'integer', description: ARG.numResults },
        contentMode: { type: 'string', enum: CONTENT_MODES, description: ARG.contentMode },
        maxCharacters: { type: 'integer', description: ARG.maxCharacters },
        maxAgeHours: { type: 'integer', description: ARG.maxAgeHours },
        includeDomains: { type: 'array', items: { type: 'string' }, description: ARG.includeDomains },
        excludeDomains: { type: 'array', items: { type: 'string' }, description: ARG.excludeDomains },
        startPublishedDate: { type: 'string', description: ARG.startPublishedDate },
        endPublishedDate: { type: 'string', description: ARG.endPublishedDate },
        category: { type: 'string', description: ARG.category },
        systemPrompt: { type: 'string', description: ARG.systemPrompt },
        outputSchema: { type: 'object', additionalProperties: true, description: ARG.outputSchema },
      },
      SEARCH_PARAMETERS_SCHEMA,
      runSearch,
    );
  }

  /** `exa_contents` definition. */
  function createContentsTool() {
    return buildTool(
      'exa_contents',
      CONTENTS_DESCRIPTION,
      {
        urls: { type: 'array', items: { type: 'string' }, required: true, description: ARG.urls },
        contentMode: { type: 'string', enum: CONTENT_MODES, description: ARG.contentMode },
        maxCharacters: { type: 'integer', description: ARG.maxCharacters },
        maxAgeHours: { type: 'integer', description: ARG.maxAgeHours },
      },
      CONTENTS_PARAMETERS_SCHEMA,
      runContents,
    );
  }

  for (const factory of [createSearchTool, createContentsTool]) {
    try {
      disposers.push(ctx.tools.register(factory()));
    } catch (error) {
      ctx.logger?.error?.(`exa-search: failed to register a tool: ${String(error?.message ?? error)}`);
    }
  }

  ctx.logger?.info?.('exa-search: registered exa_search and exa_contents');

  // Release on unload so a reload leaves nothing registered behind.
  ctx.effect?.(() => () => {
    for (const dispose of disposers.splice(0)) dispose();
  });

  // Optional seam: a host without `commands` still gets the tools.
  ctx.inject?.(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'exa',
      description: 'Inspect or configure the Exa search plugin',
      input: { hint: '[status | key <value> | forget]' },
      recordInput: false,
      handler: async ({ rawInput }) => {
        const input = String(rawInput ?? '').trim();
        const [action = 'status'] = input.split(/\s+/);

        try {
          if (action === 'key') {
            const value = input.slice(action.length).trim();
            if (value.length === 0) {
              return {
                kind: 'error',
                text: 'Usage: /exa key <value>\nRetrieve a key from https://dashboard.exa.ai.',
              };
            }
            await writeSettings({ ...(await readSettings(ctx.logger)), apiKey: value });
            ctx.logger?.info?.('exa-search: API key stored via /exa key');
            return {
              kind: 'success',
              text:
                `Exa API key stored at ${STORE_PATH} (${value.slice(0, 4)}…, ${value.length} chars).\n` +
                'Note: EXA_API_KEY in the environment, when present, takes precedence over this stored value.',
            };
          }

          if (action === 'forget') {
            const settings = await readSettings(ctx.logger);
            if (settings.apiKey === undefined) {
              return { kind: 'success', text: 'No stored Exa API key to remove.' };
            }
            delete settings.apiKey;
            await writeSettings(settings);
            const envKey = process.env.EXA_API_KEY?.trim();
            const note =
              typeof envKey === 'string' && envKey.length > 0
                ? ' EXA_API_KEY is still set in the environment, so searches keep working.'
                : ' No environment key is set, so searches will report a missing key.';
            return { kind: 'success', text: `Removed the stored Exa API key.${note}` };
          }

          const key = await resolveApiKey(ctx.logger);
          const source =
            typeof process.env.EXA_API_KEY === 'string' && process.env.EXA_API_KEY.trim().length > 0
              ? 'EXA_API_KEY environment variable'
              : key === undefined
                ? 'none'
                : `stored settings (${STORE_PATH})`;

          return {
            kind: 'success',
            text: [
              'Exa search plugin',
              '',
              `API key: ${describeKey(key)}`,
              `Key source: ${source}`,
              `Tools: ${disposers.length === 2 ? 'exa_search, exa_contents (registered)' : `only ${disposers.length} of 2 registered`}`,
              `SDK: ${typeof defineTool === 'function' ? 'defineTool (full argument validation)' : 'raw fallback definitions'}`,
              '',
              'Usage:',
              '  /exa status         — show this',
              '  /exa key <value>    — store a key for hosts started without EXA_API_KEY',
              '  /exa forget         — remove the stored key',
            ].join('\n'),
          };
        } catch (error) {
          return { kind: 'error', text: `exa: ${String(error?.message ?? error)}` };
        }
      },
    });
  });
}

export default { name, inject, apply };
