/**
 * dsh-plugin-reddit-playwright — a DeepSeek Harness (dsh) bundle plugin.
 *
 * Registers one first-party tool, `reddit_extract`, which turns a Reddit
 * thread URL into Markdown, a compact Agent Digest, or JSON.
 *
 * ## Why the definition is built defensively
 *
 * DSH resolves `@deepseek-ai/dsh-tools` for plugins through its own loader
 * resolver, which is not reachable from a bare `node` process (the working
 * `dsh-plugin-save-token` has the same property). The import below is
 * therefore wrapped: when the SDK is available the tool is built with the
 * real `defineTool`, and when it is not the plugin falls back to an
 * equivalent raw definition carrying the exact contract
 * `ToolRuntime.register()` enforces — a JSON-Schema `parameters` object plus
 * an `output { schema, render }` pair. Either way the plugin loads.
 *
 * @module dsh-plugin-reddit-playwright
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
/**
 * Load the implementation on demand.
 *
 * Everything under `src/` imports `playwright` or `turndown`, so the whole
 * layer is dynamic on purpose. A static import turns one absent package into
 * `failed to import` for the entire row and takes the tool off the menu with a
 * message that never names the missing dependency. Loading lazily keeps the
 * plugin registered, and a real call then fails with an actionable reason.
 *
 * @returns {Promise<object>} The extractor and formatter functions.
 * @throws {Error} With an actionable message when a dependency is missing.
 */
async function loadImpl() {
  try {
    const [extractor, formatter] = await Promise.all([
      import('./src/reddit-extractor.js'),
      import('./src/markdown-formatter.js'),
    ]);
    return {
      extractRedditThread: extractor.extractRedditThread,
      formatThreadToMarkdown: formatter.formatThreadToMarkdown,
      formatThreadToJson: formatter.formatThreadToJson,
      formatThreadToAgentDigest: formatter.formatThreadToAgentDigest,
      formatThreadToAgentPreviewBounded: formatter.formatThreadToAgentPreviewBounded,
    };
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/playwright|turndown/.test(message)) throw error;
    const missing = /'([^']+)'/.exec(message)?.[1] ?? 'a dependency';
    throw new Error(
      `reddit_extract: the "${missing}" package is not installed for this profile. ` +
        'Reinstall the bundle -- it declares playwright and turndown at its root -- ' +
        `or install them into the profile. Underlying error: ${message.split('\n')[0]}`,
    );
  }
}

/** Registry key this plugin inserts into. Declared so `ctx.tools` exists first. */
export const inject = ['tools'];

/** Plugin name reported to the loader. */
export const name = 'reddit-playwright-extractor';

/** Output formats, in the order `/reddit status` advertises them. */
const FORMATS = ['agent-digest', 'markdown', 'json'];

/**
 * Format used when the caller names none.
 *
 * `agent-digest` is the default because it is the one shape that survives the
 * rest of the pipeline: it is line-oriented and single-line-per-comment, so a
 * downstream line-counting compressor cannot split a comment or drop the tail
 * without the omission being visible. Markdown and JSON are preserved as
 * opt-ins for callers that render or parse the result themselves.
 */
const DEFAULT_FORMAT = 'agent-digest';

/**
 * Digest size above which the full text is written to a file and the tool
 * returns a summary plus top comments instead.
 *
 * Sized below the point where an external line-based compressor starts
 * eliding: an oversized result is not merely large, it is *silently partial*,
 * which is worse than an explicitly truncated one.
 */
const SPILL_THRESHOLD_BYTES = 24000;

/**
 * Byte budget for the inline preview returned alongside a spilled full thread.
 * Small enough to always survive intact, large enough to answer most questions
 * without opening the file.
 */
const PREVIEW_BYTES = 12000;

/** Matches the thread URLs this extractor is built for. */
const REDDIT_URL = /^https?:\/\/(?:www\.|old\.|new\.|np\.)?reddit\.com\/r\//i;

/** Tool description shown to the model. */
const DESCRIPTION =
  'Read a Reddit thread: the post body plus its comments, including nested replies. ' +
  'Returns the compact agent-digest by default (one comment per line with explicit reply ids), ' +
  'or Markdown / JSON on request. Very large threads return a summary that points at a file ' +
  'holding the full thread. Use this instead of web_fetch or curl for reddit.com, which are ' +
  'served a bot wall.';

/** Per-argument descriptions, shared by both definition paths. */
const ARG_DESCRIPTIONS = {
  url: 'Reddit thread URL to read.',
  format:
    'Output shape. "agent-digest" (default) is compact and line-oriented, "markdown" is the readable nested rendering, "json" is the structured tree.',
  expand_all_comments:
    'Fallback path only: whether to scroll and expand lazy-loaded replies. Defaults to true.',
};

/**
 * Extract a Reddit thread and format it.
 *
 * Exported for reuse from scripts and tests; the agent-facing path is the
 * `reddit_extract` tool.
 *
 * @param {string} url - Reddit thread URL.
 * @param {object} [options] - Extraction and formatting options.
 * @param {string} [options.format] - One of `markdown`, `agent-digest`, `json`.
 * @param {boolean} [options.expandAllComments] - Expand lazy-loaded replies.
 * @returns {Promise<string>} The formatted thread.
 */
export async function extractRedditMarkdown(url, options = {}) {
  const format = FORMATS.includes(options.format) ? options.format : DEFAULT_FORMAT;
  const impl = await loadImpl();
  const postData = await impl.extractRedditThread(url, options);

  switch (format) {
    case 'json':
      return impl.formatThreadToJson(postData);
    case 'markdown':
      return impl.formatThreadToMarkdown(postData, options);
    default:
      return impl.formatThreadToAgentDigest(postData);
  }
}

/**
 * Write the full thread to a file under a temp directory.
 *
 * @param {string} text - Full formatted thread.
 * @param {object} postData - Extracted thread, for the filename.
 * @returns {string} Absolute path to the written file.
 */
function spillToFile(text, postData) {
  const dir = join(tmpdir(), 'reddit-extract');
  mkdirSync(dir, { recursive: true });
  // Sanitize the post id into a stable, filesystem-safe filename.
  const id = String(postData.url ?? '').match(/\/comments\/([a-z0-9]+)/i)?.[1] ?? String(Date.now());
  const path = join(dir, `${id}.agent-digest.txt`);
  writeFileSync(path, text, 'utf8');
  return path;
}

/**
 * Extract a thread and return content sized for a single tool result.
 *
 * A thread whose digest exceeds {@link SPILL_THRESHOLD_BYTES} is written to a
 * file in full, and the returned text carries a summary plus the highest-scoring
 * comments and the file path. Returning the oversized text directly would be
 * worse than useless: a downstream line-based compressor would elide its middle
 * *without* marking where, so the caller could not tell a complete thread from
 * a silently truncated one.
 *
 * @param {object} args - Validated call arguments.
 * @returns {Promise<{ text: string }>} The tool result.
 */
async function runExtraction(args) {
  const url = String(args?.url ?? '').trim();
  if (!REDDIT_URL.test(url)) {
    throw new Error(
      `reddit_extract expects a reddit.com thread URL ` +
        `(https://www.reddit.com/r/<sub>/comments/<id>/...), received: ${url || '(empty)'}`,
    );
  }

  const format = args?.format;
  if (format !== undefined && !FORMATS.includes(format)) {
    throw new Error(
      `reddit_extract format must be one of: ${FORMATS.join(', ')}; received ${JSON.stringify(format)}`,
    );
  }

  const expandAllComments = args?.expand_all_comments;
  if (expandAllComments !== undefined && typeof expandAllComments !== 'boolean') {
    throw new Error(
      `reddit_extract expand_all_comments must be a boolean; received ${JSON.stringify(expandAllComments)}`,
    );
  }

  const requested = format ?? DEFAULT_FORMAT;
  const impl = await loadImpl();
  const postData = await impl.extractRedditThread(url, {
    expandAllComments: expandAllComments !== false,
  });

  const full =
    requested === 'json'
      ? impl.formatThreadToJson(postData)
      : requested === 'markdown'
        ? impl.formatThreadToMarkdown(postData)
        : formatThreadToAgentDigest(postData);

  // Oversized results do not merely cost tokens: an external line-based
  // compressor will elide the middle without marking where, so the caller
  // cannot distinguish a complete thread from a silently partial one. Writing
  // the full text to a file and returning a bounded preview keeps every
  // comment reachable through the `read` tool, which such compressors exempt.
  if (Buffer.byteLength(full, 'utf8') > SPILL_THRESHOLD_BYTES) {
    const path = spillToFile(full, postData);
    const preview = impl.formatThreadToAgentPreviewBounded(postData, PREVIEW_BYTES);
    return {
      text:
        `[FULL_THREAD_SAVED] All ${postData.extractedCommentCount} extracted comments ` +
        `(${full.length} bytes, format=${requested}) are saved at:\n  ${path}\n` +
        `Use the read tool on that path to get every comment verbatim.\n\n` +
        `Preview (top comments by score) follows:\n\n${preview}`,
    };
  }

  return { text: full };
}

/**
 * Render a result as model-facing content parts.
 *
 * @param {object} _args - Call arguments (unused).
 * @param {{ text: string }} value - Executed result.
 * @returns {Array<{ type: 'text', text: string }>} Content parts.
 */
function renderOutput(_args, value) {
  return [{ type: 'text', text: value.text }];
}

/**
 * Output declaration. Required by `register()`, which throws
 * `tool "…" must declare output { schema, render }` without it.
 *
 * The schema uses the SDK's *value* DSL, which has two rules worth stating:
 * `required` is not a member of the value vocabulary (unlike the parameter
 * map, where `required: true` marks an argument mandatory), and
 * `additionalProperties` must be explicitly true or false.
 *
 * @type {{ schema: object, render: (args: object, value: { text: string }) => Array<object> }}
 */
const OUTPUT = {
  schema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    additionalProperties: true,
  },
  render: renderOutput,
};

/** Raw JSON Schema for the tool's arguments. */
const PARAMETERS_SCHEMA = {
  type: 'object',
  properties: {
    url: { type: 'string', description: ARG_DESCRIPTIONS.url },
    format: { type: 'string', enum: FORMATS, description: ARG_DESCRIPTIONS.format },
    expand_all_comments: { type: 'boolean', description: ARG_DESCRIPTIONS.expand_all_comments },
  },
  required: ['url'],
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

/** Resolved once; the SDK presence cannot change during a process lifetime. */
const defineTool = await loadDefineTool();

/**
 * Build a registry-ready tool definition.
 *
 * Uses the SDK's `defineTool` when present so argument validation and schema
 * compilation come from DSH itself; otherwise emits an equivalent definition
 * in the same shape `register()` accepts.
 *
 * @returns {object} The tool definition.
 */
export function createRedditExtractTool() {
  if (typeof defineTool === 'function') {
    return defineTool({
      name: 'reddit_extract',
      description: DESCRIPTION,
      // `required` must be `true` when present: the SDK rejects `false` and
      // treats omission as optional.
      parameters: {
        url: { type: 'string', required: true, description: ARG_DESCRIPTIONS.url },
        format: { type: 'string', enum: FORMATS, description: ARG_DESCRIPTIONS.format },
        expand_all_comments: { type: 'boolean', description: ARG_DESCRIPTIONS.expand_all_comments },
      },
      output: OUTPUT,
      // A headless browser launch is heavy and stateful: never overlap two.
      isConcurrencySafe: () => false,
      execute: (args) => runExtraction(args),
    });
  }

  return {
    name: 'reddit_extract',
    description: DESCRIPTION,
    parameters: PARAMETERS_SCHEMA,
    output: OUTPUT,
    isConcurrencySafe: () => false,
    execute: (args) => runExtraction(args),
  };
}

/**
 * Build the `/reddit` slash command.
 *
 * @param {{ isEnabled: () => boolean, enable: () => void, disable: () => void }} toggle - Toggle backed by the registration disposer.
 * @param {object|undefined} logger - Host logger, when available.
 * @returns {object} A command definition for `commands.register`.
 */
function createRedditCommand(toggle, logger) {
  return {
    name: 'reddit',
    description: 'Toggle the reddit_extract tool on or off',
    input: { hint: '[on | off | status]' },
    handler: async ({ rawInput }) => {
      const action = (String(rawInput ?? '').trim().split(/\s+/)[0] || 'status').toLowerCase();

      try {
        switch (action) {
          case 'on':
            toggle.enable();
            logger?.info?.('reddit: reddit_extract registered via /reddit on');
            return {
              kind: 'success',
              text: 'reddit_extract is now ON. It appears in the tool list from the next turn.',
            };

          case 'off':
            toggle.disable();
            logger?.info?.('reddit: reddit_extract unregistered via /reddit off');
            return {
              kind: 'success',
              text: 'reddit_extract is now OFF. The agent will fall back to web_fetch on Reddit URLs.',
            };

          case 'status':
            return {
              kind: 'success',
              text:
                `reddit_extract is currently ${toggle.isEnabled() ? 'ON' : 'OFF'}.\n\n` +
                'Usage:\n' +
                '  /reddit on      — register the tool for the next turn\n' +
                '  /reddit off     — unregister the tool\n' +
                '  /reddit status  — show the current state\n\n' +
                `Formats: ${FORMATS.join(', ')}`,
            };

          default:
            return {
              kind: 'error',
              text: `Unknown /reddit action "${action}". Use: on | off | status`,
            };
        }
      } catch (error) {
        return { kind: 'error', text: `reddit: ${String(error?.message ?? error)}` };
      }
    },
  };
}

/**
 * Install the plugin.
 *
 * Registers `reddit_extract` and wires `/reddit` to the exact disposer
 * `tools.register()` returns, so toggling genuinely adds and removes the tool
 * instead of leaving a dead entry in the agent's tool list.
 *
 * @param {object} ctx - Cordis context supplied by the loader.
 */
export function apply(ctx) {
  /** Exact disposer from the last successful registration, or null. */
  let disposeTool = null;

  const toggle = {
    isEnabled: () => disposeTool !== null,
    enable: () => {
      if (disposeTool !== null) return;
      disposeTool = ctx.tools.register(createRedditExtractTool());
    },
    disable: () => {
      if (disposeTool === null) return;
      const dispose = disposeTool;
      disposeTool = null;
      dispose();
    },
  };

  toggle.enable();

  // Release on unload so a reload leaves nothing registered behind.
  ctx.effect?.(() => () => {
    toggle.disable();
  });

  // Optional seam: a host without `commands` still gets the tool.
  ctx.inject?.(['commands'], (commandCtx) => {
    commandCtx.commands.register(createRedditCommand(toggle, ctx.logger));
  });
}

export default { name, inject, apply, extractRedditMarkdown };
