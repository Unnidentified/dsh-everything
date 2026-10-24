/**
 * Verification for dsh-plugin-reddit-playwright.
 *
 * Loads the plugin from the exact path a desktop profile resolves, applies it
 * to a REAL `ToolRuntime` from `@deepseek-ai/dsh-tools`, and exercises module
 * shape, registration, the compiled parameter schema, live extraction in every
 * format, spill behaviour on large threads, argument rejection, and the
 * `/reddit` toggle.
 *
 * `@deepseek-ai/dsh-tools` and `@deepseek-ai/cordis` ship with the DSH app, not
 * with this plugin, so the bare specifiers cannot resolve from here. The
 * runtimes are therefore imported from a DSH installation named by
 * `DSH_RUNTIME_DIR`.
 *
 * Usage:
 *   DSH_RUNTIME_DIR=/path/to/dsh/node_modules-parent node scripts/verify.mjs
 */

import { readFileSync, existsSync } from 'node:fs';

/** DSH installation whose node_modules provides the SDK. */
const RUNTIME_DIR = process.env.DSH_RUNTIME_DIR;
if (!RUNTIME_DIR) {
  console.error('verify: set DSH_RUNTIME_DIR to the DSH install whose node_modules provides the SDK');
  process.exit(2);
}

/** Absolute URL of a package entry inside the DSH installation. */
const sdk = (specifier) =>
  new URL(`node_modules/${specifier}/lib/index.js`, `file://${RUNTIME_DIR}/`).href;

let ToolRuntime;
let Context;
try {
  ({ ToolRuntime } = await import(sdk('@deepseek-ai/dsh-tools')));
  ({ Context } = await import(sdk('@deepseek-ai/cordis')));
} catch (error) {
  console.error(
    `Could not load the DSH SDK from ${RUNTIME_DIR}.\n` +
      `Set DSH_RUNTIME_DIR to a directory whose node_modules contains\n` +
      `@deepseek-ai/dsh-tools and @deepseek-ai/cordis.\n` +
      `Cause: ${error?.message ?? error}`,
  );
  process.exit(2);
}

/** Plugin path: the profile symlink when present, else this package. */
const LOAD_PATH =
  process.env.PLUGIN_PATH ??
  new URL('../../index.js', import.meta.url).pathname;

const plugin = await import(LOAD_PATH);

const results = [];
const check = (label, cond, detail = '') => {
  results.push({ label, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

/** Build a Cordis ctx with a real tools registry wired in. */
function makeHost() {
  const ctx = new Context();
  ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} });
  const runtime = new ToolRuntime(ctx);
  let command = null;
  ctx.inject = (deps, cb) => {
    if (Array.isArray(deps) && deps.includes('commands')) {
      cb({ commands: { register: (c) => { command = c; return () => {}; } } });
    }
  };
  return { ctx, runtime, cmd: () => command };
}

const namesOf = (rt) => rt.schemas(undefined).map((s) => s.name);
const run = (rt, args, id) =>
  rt.execute({
    name: 'reddit_extract',
    callId: id,
    signal: new AbortController().signal,
    arguments: args,
  });

/** The model-facing text of a tool result. */
const textOf = (out) => out?.content?.[0]?.text ?? '';

const SMALL = 'https://www.reddit.com/r/WRCTheGame/comments/1wvrtb3/as_someone_who_is_almost_always_away_from_my_pc_i/';
const LARGE = 'https://www.reddit.com/r/LocalLLaMA/comments/1wzuto0/new_lfm_to_be_released_today/';

console.log('=== 1. Module surface ===');
check('name export', plugin.name === 'reddit-playwright-extractor', plugin.name);
check('inject = ["tools"]', JSON.stringify(plugin.inject) === '["tools"]');
check('apply is a function', typeof plugin.apply === 'function');

console.log('\n=== 2. Apply against a REAL ToolRuntime ===');
const host = makeHost();
let applyError = null;
try {
  plugin.apply(host.ctx);
} catch (error) {
  applyError = error;
}
check('apply() threw nothing', !applyError, applyError?.message ?? '');
check(
  'reddit_extract registered',
  namesOf(host.runtime).includes('reddit_extract'),
  `[${namesOf(host.runtime).join(', ')}]`,
);

const schema = host.runtime.schemas(undefined).find((s) => s.name === 'reddit_extract');
check('url param present', !!schema?.parameters?.properties?.url);
check('url is required', (schema?.parameters?.required ?? []).includes('url'));
check('format enum closed', Array.isArray(schema?.parameters?.properties?.format?.enum));
check(
  'default format is agent-digest',
  schema?.parameters?.properties?.format?.enum?.[0] === 'agent-digest',
  JSON.stringify(schema?.parameters?.properties?.format?.enum),
);
check('description mentions Reddit', String(schema?.description).includes('Reddit'));

console.log('\n=== 3. Default format is the agent digest ===');
const def = await run(host.runtime, { url: SMALL }, 'default');
const defText = textOf(def);
check('returns content', def.isError !== true && defText.length > 0, `${defText.length} chars`);
check('digest header present', defText.startsWith('[THREAD]'));
check('digest comments section present', defText.includes('[COMMENTS]'));
check('reports provenance', /via="/.test(defText), defText.split('\n')[0].slice(0, 90));
check(
  'one comment per line',
  (defText.match(/^\[c\d+/gm) ?? []).length > 0,
  `${(defText.match(/^\[c\d+/gm) ?? []).length} comment lines`,
);

console.log('\n=== 4. Spill on oversized threads ===');
const large = await run(host.runtime, { url: LARGE }, 'large');
const largeText = textOf(large);
check('large thread returns content', large.isError !== true && largeText.length > 0, `${largeText.length} chars`);

const spilled = largeText.startsWith('[FULL_THREAD_SAVED]');
check('oversized digest spills to a file', spilled);
if (spilled) {
  const path = largeText.match(/saved at:\s*\n\s*(\S+)/)?.[1];
  check('spill path is present', !!path, path);
  check('spill file exists on disk', !!path && existsSync(path));

  if (path && existsSync(path)) {
    const full = readFileSync(path, 'utf8');
    const fileComments = (full.match(/^\[c\d+/gm) ?? []).length;
    // The preview must state the true total, and the file must match it.
    const stated = Number(largeText.match(/of=(\d+)/)?.[1] ?? NaN);
    check(
      'spill file holds every comment',
      fileComments > 0 && fileComments === stated,
      `file=${fileComments} preview=${stated}`,
    );
    check('preview is its own bounded payload', largeText.length < 20000, `${largeText.length} chars`);
    check(
      'preview admits what it omitted',
      /shown=\d+ of=\d+/.test(largeText),
      largeText.match(/\[COMMENTS[^\]]*\]/)?.[0],
    );
  }
}

console.log('\n=== 5. Explicit formats ===');
const md = await run(host.runtime, { url: SMALL, format: 'markdown' }, 'md');
check('markdown returns a heading', textOf(md).startsWith('# '), textOf(md).split('\n')[0].slice(0, 60));

const js = await run(host.runtime, { url: SMALL, format: 'json' }, 'json');
check('json returns a body', textOf(js).length > 0, `${textOf(js).length} chars`);

console.log('\n=== 6. Argument validation ===');
const badUrl = await run(host.runtime, { url: 'https://example.com/x' }, 'v1');
check('non-Reddit URL rejected', badUrl.isError === true, badUrl?.error?.message?.slice(0, 60));
const noUrl = await run(host.runtime, {}, 'v2');
check('missing url rejected', noUrl.isError === true);
const badFmt = await run(host.runtime, { url: SMALL, format: 'xml' }, 'v3');
check('bad format rejected', badFmt.isError === true, badFmt?.error?.message?.slice(0, 60));

console.log('\n=== 7. /reddit toggle drives the real disposer ===');
const cmd = host.cmd();
check('/reddit command registered', cmd?.name === 'reddit');
if (cmd) {
  const off = await cmd.handler({ rawInput: 'off' });
  check('/reddit off succeeds', off.kind === 'success');
  check(
    'tool UNREGISTERED after off',
    !namesOf(host.runtime).includes('reddit_extract'),
    `[${namesOf(host.runtime).join(', ')}]`,
  );

  const status = await cmd.handler({ rawInput: 'status' });
  check('/reddit status reports OFF', status.text.includes('OFF'));

  const on = await cmd.handler({ rawInput: 'on' });
  check('/reddit on succeeds', on.kind === 'success');
  check('tool REGISTERED after on', namesOf(host.runtime).includes('reddit_extract'));

  const again = await run(host.runtime, { url: SMALL }, 'after-on');
  check('works after re-enable', again.isError !== true && textOf(again).length > 0, `${textOf(again).length} chars`);

  const bad = await cmd.handler({ rawInput: 'nonsense' });
  check('unknown action errors', bad.kind === 'error');
}

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL: ${f.label} — ${f.detail}`);
  process.exitCode = 1;
}
