/**
 * Exa API client and model-facing formatters for `dsh-plugin-exa-search`.
 *
 * This module is deliberately free of any `@deepseek-ai/*` import so it can be
 * unit-tested under a bare `node` process, outside the Harness loader. The DSH
 * wiring lives in `lib/index.js`.
 *
 * Endpoints implemented, per https://docs.exa.ai/reference/search-api-guide-for-coding-agents:
 *   POST /search    — neural/keyword search, optional contents, optional outputSchema
 *   POST /contents  — clean parsed content for URLs you already have
 *
 * @module dsh-plugin-exa-search/client
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Base URL for every Exa endpoint. */
export const EXA_BASE_URL = 'https://api.exa.ai';

/**
 * Accepted `type` values for `/search`.
 *
 * Latency figures are Exa's own ballpark numbers and are quoted only to help the
 * model choose; `deep` variants are 4-40s and `outputSchema` adds synthesis time
 * on top of whatever the base type costs.
 */
export const SEARCH_TYPES = ['auto', 'fast', 'instant', 'deep-lite', 'deep', 'deep-reasoning'];

/** Accepted content modes. Exa asks callers to pick one, not combine them. */
export const CONTENT_MODES = ['highlights', 'text', 'summary'];

/**
 * Accepted `category` values.
 *
 * `company` and `people` reject `excludeDomains` and every date filter with a
 * 400, which {@link buildSearchBody} enforces before the request is sent.
 */
export const CATEGORIES = [
  'company',
  'research paper',
  'news',
  'pdf',
  'github',
  'tweet',
  'personal site',
  'people',
  'financial report',
];

/** Categories that reject domain exclusion and date filters. */
const CATEGORIES_WITHOUT_FILTERS = new Set(['company', 'people']);

/** Default `type` when the caller names none — Exa's balanced recommendation. */
export const DEFAULT_TYPE = 'auto';

/**
 * Default content mode for `/search`.
 *
 * A search is normally exploratory — you are deciding *which* results deserve
 * attention, and highlights are far cheaper for that decision (~2 KB for ten
 * results versus ~42 KB of page text). Escalating to `text` is a per-call
 * choice, and the tool description tells the model when to make it.
 */
export const DEFAULT_SEARCH_CONTENT_MODE = 'highlights';

/**
 * Default content mode for `/contents`.
 *
 * The opposite default from `/search`, deliberately. A `/contents` call already
 * names the exact URLs, so the caller has decided the pages matter; returning
 * excerpts there would be answering a question nobody asked.
 */
export const DEFAULT_CONTENTS_CONTENT_MODE = 'text';

/** Default cap for `contents.text.maxCharacters`. Never request uncapped text. */
export const DEFAULT_MAX_CHARACTERS = 20000;

/** Hard ceiling for `numResults`; Exa rejects more. */
const MAX_NUM_RESULTS = 100;

/** Characters of one highlight kept in the compact rendering. */
const HIGHLIGHT_CHARS = 700;

/** Highlights rendered per result in the compact rendering. */
const HIGHLIGHTS_PER_RESULT = 4;

/**
 * Characters of page text rendered per result when the caller did not ask for
 * a specific `maxCharacters`.
 *
 * Exa will happily return 20 000 characters per page, but rendering that for
 * ten results is a 200 KB tool result: it spills to a file on every call and
 * costs a round trip to read. This budget keeps a default text search inline
 * and directly usable, while an explicit `maxCharacters` still lifts it — the
 * caller who asks for more gets more.
 */
const DEFAULT_TEXT_CHARS = 4000;

/** Ceiling for rendered page text, however large a `maxCharacters` was passed. */
const MAX_RENDER_TEXT_CHARS = 20000;

/** Results kept in the bounded preview returned when a payload is spilled. */
const PREVIEW_RESULTS = 5;

/**
 * Byte size above which the full payload is written to a file and a bounded
 * preview is returned instead.
 *
 * An oversized tool result is not merely expensive: a downstream line-based
 * compressor elides its middle *without* marking where, so the caller cannot
 * tell a complete result set from a silently truncated one. Spilling keeps every
 * result reachable through the `read` tool, which such compressors exempt.
 */
export const SPILL_THRESHOLD_BYTES = 60000;

/** Directory for spilled payloads, under the platform temp root. */
const SPILL_DIR = join(tmpdir(), 'exa-search');

/** An Exa request failure carrying the HTTP status when there was one. */
export class ExaError extends Error {
  /**
   * @param {string} message - Operator-facing explanation.
   * @param {{ status?: number, kind?: string }} [details] - Failure classification.
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'ExaError';
    this.status = details.status;
    this.kind = details.kind;
  }
}

/** True when the value is a plain object (not null, not an array). */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Truncate a string to a character budget, marking the cut explicitly. */
function clip(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max)} […truncated]`;
}

/** Collapse runs of whitespace so a highlight renders on one line. */
function singleLine(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prefix every line of a multi-line block, so it stays visually nested. */
function indent(text, prefix) {
  return String(text ?? '')
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n');
}

/** Validate one string argument, returning the trimmed value. */
function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ExaError(`${field} must be a non-empty string; received ${JSON.stringify(value)}`, {
      kind: 'author',
    });
  }
  return value.trim();
}

/** Validate an optional string argument. */
function optionalString(value, field) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ExaError(`${field} must be a non-empty string when provided; received ${JSON.stringify(value)}`, {
      kind: 'author',
    });
  }
  return value.trim();
}

/** Validate one member of a closed value set. */
function requireEnum(value, allowed, field) {
  if (value === undefined || value === null) return undefined;
  if (!allowed.includes(value)) {
    throw new ExaError(`${field} must be one of: ${allowed.join(', ')}; received ${JSON.stringify(value)}`, {
      kind: 'author',
    });
  }
  return value;
}

/** Validate an optional array of non-empty strings. */
function optionalStringArray(value, field) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new ExaError(`${field} must be a non-empty array of strings; received ${JSON.stringify(value)}`, {
      kind: 'author',
    });
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

/** Validate an optional integer within an inclusive range. */
function optionalInteger(value, field, min, max) {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ExaError(`${field} must be an integer between ${min} and ${max}; received ${JSON.stringify(value)}`, {
      kind: 'author',
    });
  }
  return value;
}

/**
 * Build the `contents` object for `/search` from a content mode.
 *
 * Exa requires `text`, `highlights`, and `summary` to be nested inside
 * `contents` on `/search` (they are top-level on `/contents`), and combining
 * modes at the start of a project is usually an antipattern — hence one mode.
 *
 * @param {string} [mode] - One of {@link CONTENT_MODES}.
 * @param {number} [maxCharacters] - Cap for `text`, ignored for other modes.
 * @param {number} [maxAgeHours] - Cache freshness threshold.
 * @param {string} [fallback] - Mode to use when the caller named none.
 * @returns {object} The `contents` object, empty when nothing was requested.
 */
export function buildContents(mode, maxCharacters, maxAgeHours, fallback = DEFAULT_SEARCH_CONTENT_MODE) {
  const contents = {};
  const resolved = requireEnum(mode, CONTENT_MODES, 'contentMode') ?? fallback;

  if (resolved === 'highlights') {
    contents.highlights = true;
  } else if (resolved === 'text') {
    contents.text = { maxCharacters: maxCharacters ?? DEFAULT_MAX_CHARACTERS };
  } else if (resolved === 'summary') {
    contents.summary = true;
  }

  if (maxAgeHours !== undefined) contents.maxAgeHours = maxAgeHours;
  return contents;
}

/**
 * Build a validated `/search` request body.
 *
 * Only parameters that exist are ever emitted: the deprecated or nonexistent
 * ones (`useAutoprompt`, `includeUrls`, `numSentences`, `tokensNum`,
 * `livecrawl: "always"`) are deliberately never accepted as arguments.
 *
 * @param {object} args - Tool arguments.
 * @returns {object} Request body for `POST /search`.
 */
export function buildSearchBody(args) {
  const raw = isPlainObject(args) ? args : {};
  const query = requireString(raw.query, 'query');
  const type = requireEnum(raw.type, SEARCH_TYPES, 'type') ?? DEFAULT_TYPE;
  const category = requireEnum(raw.category, CATEGORIES, 'category');
  const numResults = optionalInteger(raw.numResults, 'numResults', 1, MAX_NUM_RESULTS) ?? 10;
  const includeDomains = optionalStringArray(raw.includeDomains, 'includeDomains');
  const excludeDomains = optionalStringArray(raw.excludeDomains, 'excludeDomains');
  const startPublishedDate = optionalString(raw.startPublishedDate, 'startPublishedDate');
  const endPublishedDate = optionalString(raw.endPublishedDate, 'endPublishedDate');
  const systemPrompt = optionalString(raw.systemPrompt, 'systemPrompt');
  const maxCharacters = optionalInteger(raw.maxCharacters, 'maxCharacters', 1, 500000);
  const maxAgeHours = optionalInteger(raw.maxAgeHours, 'maxAgeHours', -1, 8760);

  // Exa answers 400 for these combinations; refusing here turns an opaque HTTP
  // failure into an instruction the caller can act on.
  if (category !== undefined && CATEGORIES_WITHOUT_FILTERS.has(category)) {
    if (excludeDomains !== undefined) {
      throw new ExaError(`category "${category}" does not support excludeDomains; drop one of them`, { kind: 'author' });
    }
    if (startPublishedDate !== undefined || endPublishedDate !== undefined) {
      throw new ExaError(`category "${category}" does not support date filters; drop one of them`, { kind: 'author' });
    }
  }

  if (raw.outputSchema !== undefined && raw.outputSchema !== null) {
    if (!isPlainObject(raw.outputSchema)) {
      throw new ExaError('outputSchema must be a JSON Schema object', { kind: 'author' });
    }
  }

  const body = { query, type, numResults };
  if (category !== undefined) body.category = category;
  if (includeDomains !== undefined) body.includeDomains = includeDomains;
  if (excludeDomains !== undefined) body.excludeDomains = excludeDomains;
  if (startPublishedDate !== undefined) body.startPublishedDate = startPublishedDate;
  if (endPublishedDate !== undefined) body.endPublishedDate = endPublishedDate;
  if (systemPrompt !== undefined) body.systemPrompt = systemPrompt;
  if (isPlainObject(raw.outputSchema)) body.outputSchema = raw.outputSchema;

  const contents = buildContents(raw.contentMode, maxCharacters, maxAgeHours);
  if (Object.keys(contents).length > 0) body.contents = contents;

  return body;
}

/**
 * Build a validated `/contents` request body.
 *
 * On `/contents` the content fields are top-level, not nested — the opposite of
 * `/search`. Getting this backwards is the single most common integration bug,
 * so the two builders are kept separate rather than parameterized.
 *
 * @param {object} args - Tool arguments.
 * @returns {object} Request body for `POST /contents`.
 */
export function buildContentsBody(args) {
  const raw = isPlainObject(args) ? args : {};
  const urls = optionalStringArray(raw.urls, 'urls');
  if (urls === undefined) {
    throw new ExaError('urls must be a non-empty array of absolute URLs', { kind: 'author' });
  }
  const mode = requireEnum(raw.contentMode, CONTENT_MODES, 'contentMode') ?? DEFAULT_CONTENTS_CONTENT_MODE;
  const maxCharacters = optionalInteger(raw.maxCharacters, 'maxCharacters', 1, 500000);
  const maxAgeHours = optionalInteger(raw.maxAgeHours, 'maxAgeHours', -1, 8760);

  const body = { urls };
  if (mode === 'highlights') body.highlights = true;
  else if (mode === 'text') body.text = { maxCharacters: maxCharacters ?? DEFAULT_MAX_CHARACTERS };
  else if (mode === 'summary') body.summary = true;

  if (maxAgeHours !== undefined) body.maxAgeHours = maxAgeHours;
  return body;
}

/**
 * Classify a non-2xx Exa response into an actionable error.
 *
 * @param {Response} response - The failed response.
 * @param {string} endpoint - Endpoint label for the message.
 * @returns {Promise<ExaError>} The classified error.
 */
async function classifyFailure(response, endpoint) {
  let detail = '';
  try {
    const body = await response.text();
    if (body) detail = ` — ${clip(singleLine(body), 400)}`;
  } catch {
    /* An unreadable body does not change the classification. */
  }

  const status = response.status;
  if (status === 401) {
    return new ExaError(
      `Exa rejected the API key (HTTP 401). Check EXA_API_KEY, or set one with /exa key <value>.${detail}`,
      { status, kind: 'auth' },
    );
  }
  if (status === 402) {
    return new ExaError(
      `Exa needs credits for this request (HTTP 402). Top up at https://dashboard.exa.ai.${detail}`,
      { status, kind: 'payment' },
    );
  }
  if (status === 429) {
    return new ExaError(`Exa rate-limited this request (HTTP 429). Retry shortly.${detail}`, {
      status,
      kind: 'rate-limit',
    });
  }
  if (status === 400) {
    return new ExaError(`${endpoint} rejected the request (HTTP 400)${detail}`, { status, kind: 'request' });
  }
  return new ExaError(`${endpoint} failed (HTTP ${status})${detail}`, { status, kind: 'http' });
}

/**
 * POST JSON to one Exa endpoint.
 *
 * @param {string} path - Endpoint path, e.g. `/search`.
 * @param {object} body - Request body.
 * @param {{ apiKey: string, signal?: AbortSignal, timeoutMs?: number }} options - Call options.
 * @returns {Promise<object>} The decoded JSON payload.
 */
export async function exaPost(path, body, options) {
  const apiKey = requireString(options?.apiKey, 'EXA_API_KEY');
  const timeoutMs = options?.timeoutMs ?? 120000;
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (options?.signal) signals.push(options.signal);
  const signal = AbortSignal.any(signals);

  let response;
  try {
    response = await fetch(`${EXA_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (options?.signal?.aborted) throw new ExaError(`${path} was cancelled`, { kind: 'aborted' });
    if (error?.name === 'TimeoutError') {
      throw new ExaError(`${path} timed out after ${timeoutMs}ms; a deep search can take 40s, or the network stalled`, {
        kind: 'timeout',
      });
    }
    throw new ExaError(`${path} could not reach ${EXA_BASE_URL}: ${String(error?.message ?? error)}`, {
      kind: 'network',
    });
  }

  if (!response.ok) throw await classifyFailure(response, path);

  try {
    return await response.json();
  } catch (error) {
    throw new ExaError(`${path} returned a body that is not JSON: ${String(error?.message ?? error)}`, {
      kind: 'decode',
    });
  }
}

/** Run one Exa search. */
export function exaSearch(args, options) {
  return exaPost('/search', buildSearchBody(args), options);
}

/** Fetch contents for known URLs. */
export function exaGetContents(args, options) {
  return exaPost('/contents', buildContentsBody(args), options);
}

/**
 * Report whether a rendering dropped content that Exa actually returned.
 *
 * This is the correction to a subtle failure: the spill decision used to hinge
 * on the *rendered* size, so a render that trimmed text to fit under the
 * threshold never triggered a spill — the untrimmed text was downloaded, paid
 * for, and then discarded with no way to reach it. Keying the spill on
 * truncation instead of size makes the inline budget a display choice rather
 * than a data-loss boundary.
 *
 * Only two things count as loss. Trimmed page text is loss because text is
 * meant to be the page itself, so a shortened copy is a different thing.
 * Omitted results are loss because the caller never saw them exist. Overflow
 * highlights are *not* loss by default: highlights are a ranked sample by
 * design, so rendering four of twelve narrows a sample rather than hiding a
 * document, and treating it as loss would put a spill notice on nearly every
 * search.
 *
 * @param {object} payload - Decoded `/search` or `/contents` response.
 * @param {object} [params] - Same knobs passed to the renderer.
 * @param {boolean} [params.countHighlightOverflow] - Also report dropped highlights.
 * @returns {{ truncated: boolean, reasons: string[] }} What was left out.
 */
export function detectTruncation(payload, params = {}) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const limit = params.limit ?? results.length;
  const textChars = Math.min(params.textChars ?? DEFAULT_TEXT_CHARS, MAX_RENDER_TEXT_CHARS);
  const highlightsPerResult = params.highlightsPerResult ?? HIGHLIGHTS_PER_RESULT;
  const reasons = [];

  if (results.length > limit) {
    reasons.push(`${results.length - limit} of ${results.length} results omitted`);
  }

  for (const [index, result] of results.slice(0, limit).entries()) {
    const body =
      typeof result?.text === 'string'
        ? result.text.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
        : '';
    if (body.length > textChars) {
      reasons.push(`result ${index + 1} page text trimmed from ${body.length} to ${textChars} characters`);
    }
    const highlights = Array.isArray(result?.highlights) ? result.highlights : [];
    if (params.countHighlightOverflow === true && highlights.length > highlightsPerResult) {
      reasons.push(`result ${index + 1} has ${highlights.length - highlightsPerResult} further highlight(s)`);
    }
  }

  return { truncated: reasons.length > 0, reasons };
}

/**
 * Render one search result as compact, line-oriented text.
 *
 * Page text keeps its paragraph breaks and gets its own, much larger budget:
 * flattening a page to a single line would destroy the structure that makes
 * full text worth requesting, and clipping it to the highlight budget would
 * discard most of what was just paid for.
 *
 * @param {object} result - One entry of `payload.results`.
 * @param {number} index - 1-based position.
 * @param {number} highlightChars - Per-highlight character cap.
 * @param {number} highlightsPerResult - Highlights kept per result.
 * @param {number} [textChars] - Character budget for page text.
 * @returns {string} The rendered result.
 */
function renderResult(result, index, highlightChars, highlightsPerResult, textChars = DEFAULT_TEXT_CHARS) {
  const lines = [`${index}. ${singleLine(result?.title) || '(untitled)'}`, `   ${String(result?.url ?? '(no url)')}`];

  const meta = [];
  if (result?.publishedDate) meta.push(`published ${singleLine(result.publishedDate)}`);
  if (result?.author) meta.push(`by ${singleLine(result.author)}`);
  if (meta.length > 0) lines.push(`   ${meta.join(' | ')}`);

  const highlights = Array.isArray(result?.highlights) ? result.highlights : [];
  for (const highlight of highlights.slice(0, highlightsPerResult)) {
    lines.push(`   - ${clip(singleLine(highlight), highlightChars)}`);
  }
  if (highlights.length > highlightsPerResult) {
    lines.push(`   - (+${highlights.length - highlightsPerResult} more highlights)`);
  }

  if (typeof result?.summary === 'string' && result.summary.length > 0) {
    lines.push(`   summary: ${clip(singleLine(result.summary), highlightChars)}`);
  }

  if (typeof result?.text === 'string' && result.text.trim().length > 0) {
    // Preserve paragraph breaks; collapse only the runs of spaces and blank
    // lines that page extraction leaves behind.
    const body = result.text
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    lines.push('', '   --- page text ---', indent(clip(body, textChars), '   '));
  }

  return lines.join('\n');
}

/**
 * Render a search payload as bounded compact text.
 *
 * @param {object} payload - Decoded `/search` response.
 * @param {object} params - Rendering knobs.
 * @param {string} params.query - The query, echoed in the header.
 * @param {string} params.type - The resolved search type.
 * @param {number} [params.limit] - Maximum results rendered.
 * @param {number} [params.highlightChars] - Per-highlight character cap.
 * @param {number} [params.highlightsPerResult] - Highlights kept per result.
 * @param {number} [params.textChars] - Character budget for page text per result.
 * @returns {string} The compact rendering.
 */
export function renderSearchText(payload, params) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const limit = params.limit ?? results.length;
  const highlightChars = params.highlightChars ?? HIGHLIGHT_CHARS;
  const highlightsPerResult = params.highlightsPerResult ?? HIGHLIGHTS_PER_RESULT;
  const textChars = Math.min(params.textChars ?? DEFAULT_TEXT_CHARS, MAX_RENDER_TEXT_CHARS);

  const header = [
    `Exa search "${params.query}" — type=${params.type}${payload?.resolvedSearchType ? ` (resolved ${payload.resolvedSearchType})` : ''}, ${results.length} result(s)`,
  ];

  // Grounded synthesis, when outputSchema was supplied.
  if (isPlainObject(payload?.output) && payload.output.content !== undefined) {
    header.push('', 'Synthesized output:', clip(JSON.stringify(payload.output.content, null, 2), 8000));
    const grounding = Array.isArray(payload.output.grounding) ? payload.output.grounding : [];
    if (grounding.length > 0) {
      header.push('', 'Grounding:');
      for (const entry of grounding.slice(0, 12)) {
        const urls = (Array.isArray(entry?.citations) ? entry.citations : [])
          .map((citation) => citation?.url)
          .filter((url) => typeof url === 'string')
          .slice(0, 3)
          .join(', ');
        header.push(`  ${String(entry?.field ?? '?')} [${String(entry?.confidence ?? '?')}] ${urls}`);
      }
    }
  }

  if (results.length === 0) {
    header.push('', 'No results. Try type "auto", drop filters, or simplify the query.');
    return header.join('\n');
  }

  const rendered = results
    .slice(0, limit)
    .map((result, index) => renderResult(result, index + 1, highlightChars, highlightsPerResult, textChars));

  if (results.length > limit) rendered.push(`(+${results.length - limit} more results not shown)`);
  return [header.join('\n'), '', rendered.join('\n\n')].join('\n');
}

/**
 * Render a `/contents` payload as compact text.
 *
 * @param {object} payload - Decoded `/contents` response.
 * @param {object} [params] - Rendering knobs.
 * @param {number} [params.textChars] - Character budget for page text per document.
 * @returns {string} The compact rendering.
 */
export function renderContentsText(payload, params = {}) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const textChars = Math.min(params.textChars ?? DEFAULT_TEXT_CHARS, MAX_RENDER_TEXT_CHARS);
  const lines = [`Exa contents — ${results.length} document(s)`];

  for (const [index, result] of results.entries()) {
    lines.push('', `${index + 1}. ${singleLine(result?.title) || '(untitled)'}`, `   ${String(result?.url ?? '(no url)')}`);

    const highlights = Array.isArray(result?.highlights) ? result.highlights : [];
    for (const highlight of highlights.slice(0, HIGHLIGHTS_PER_RESULT)) {
      lines.push(`   - ${clip(singleLine(highlight), HIGHLIGHT_CHARS)}`);
    }
    if (typeof result?.summary === 'string' && result.summary.length > 0) {
      lines.push(`   summary: ${clip(singleLine(result.summary), HIGHLIGHT_CHARS)}`);
    }
    if (typeof result?.text === 'string' && result.text.trim().length > 0) {
      const body = result.text
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      lines.push('', '   --- page text ---', indent(clip(body, textChars), '   '));
    }
  }

  return lines.join('\n');
}

/**
 * Write an oversized payload to a file and describe where it went.
 *
 * @param {object} payload - The full response payload.
 * @param {string} label - Filename stem.
 * @returns {Promise<string>} Absolute path of the written file.
 */
export async function spillPayload(payload, label) {
  await mkdir(SPILL_DIR, { recursive: true });
  const safe = String(label).replace(/[^a-z0-9-]+/gi, '-').slice(0, 60) || 'exa';
  const path = join(SPILL_DIR, `${safe}-${Date.now()}.json`);
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
  return path;
}

/**
 * Frame a rendered payload, spilling it to a file when it is too large *or*
 * when the rendering left out content Exa returned.
 *
 * Both triggers matter and neither subsumes the other. A large render must
 * spill or it floods the context. A *trimmed* render must spill or the omitted
 * text is unreachable — and a trimmed render can easily be small, so size alone
 * would never catch it. The spill file always holds the complete payload, so
 * the inline budget stays a display choice rather than a boundary past which
 * information ceases to exist.
 *
 * @param {object} payload - The full response payload.
 * @param {string} text - The compact rendering.
 * @param {object} previewParams - Rendering knobs for the spilled preview.
 * @param {string} label - Filename stem for the spill.
 * @returns {Promise<{ text: string, spilled?: string }>} The tool result value.
 */
export async function frameResult(payload, text, previewParams, label) {
  const bytes = Buffer.byteLength(text, 'utf8');
  const oversized = bytes > SPILL_THRESHOLD_BYTES;
  const { truncated, reasons } = detectTruncation(payload, previewParams);
  if (!oversized && !truncated) return { text };

  const path = await spillPayload(payload, label);
  const preview = renderSearchText(payload, {
    ...previewParams,
    limit: PREVIEW_RESULTS,
    highlightsPerResult: 2,
  });

  const header = oversized
    ? [`[FULL_RESULT_SAVED] The complete Exa payload (${bytes} bytes) is saved at:`, `  ${path}`]
    : [
        '[FULL_RESULT_SAVED] The text shown below is a trimmed preview; the complete payload is saved at:',
        `  ${path}`,
        `Omitted here: ${reasons.slice(0, 3).join('; ')}${reasons.length > 3 ? ` (+${reasons.length - 3} more)` : ''}.`,
      ];

  return {
    text: [
      ...header,
      'Use the read tool on that path for every result verbatim.',
      '',
      'Preview follows:',
      '',
      preview,
    ].join('\n'),
    spilled: path,
  };
}

/** Where the plugin keeps its settings when no environment key is present. */
export function storagePath(homeDir) {
  return join(homeDir, 'storages', 'exa-search.json');
}
