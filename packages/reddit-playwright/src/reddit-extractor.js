import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import fs from 'node:fs';

/**
 * Locate an installed Chromium / Chrome binary.
 *
 * @returns {string|undefined} The first candidate path that exists.
 */
/**
 * Chromium binaries Playwright has already downloaded, newest build first.
 *
 * Playwright names its cache `chromium-<build>` and the build number changes
 * with every release, so a pinned path goes stale on the next `playwright
 * install`. Scanning the cache directory keeps this working across upgrades.
 *
 * @param {string} home - Resolved home directory.
 * @returns {string[]} Existing-plausible binary paths, or an empty array.
 */
function playwrightCacheCandidates(home) {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    `${home}/Library/Caches/ms-playwright`, // macOS
    `${home}/.cache/ms-playwright`, // Linux
    `${process.env.LOCALAPPDATA ?? ''}\\ms-playwright`, // Windows
  ].filter(Boolean);
  const out = [];
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue; // Root does not exist: not an error, just not a candidate.
    }
    const builds = entries
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const build of builds) {
      out.push(
        `${root}/${build}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
        `${root}/${build}/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
        `${root}/${build}/chrome-linux/chrome`,
        `${root}/${build}/chrome-win/chrome.exe`,
      );
    }
  }
  return out;
}

function findChromiumExecutable() {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const candidates = [
    // An explicitly configured browser always wins.
    process.env.DSH_REDDIT_CHROMIUM,
    // Playwright's own download, current and legacy cache layouts. The build
    // number is not stable, so glob the cache dir instead of pinning one.
    ...playwrightCacheCandidates(home),
    // A browser the machine already has. On Windows this covers Edge, which
    // ships with the OS, so no download is needed at all.
    ...systemBrowserCandidates(),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

/**
 * Browsers already installed on this machine.
 *
 * Checked before anything is downloaded: Edge ships with Windows and Chrome is
 * common, so most installs never need Playwright's own Chromium at all.
 *
 * @returns {string[]} Candidate executable paths, most preferred first.
 */
function systemBrowserCandidates() {
  const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA ?? '';
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);
}

/**
 * Download Playwright's Chromium once, the first time it is actually needed.
 *
 * A plugin installed through the DSH Plugins page cannot rely on someone
 * running `npx playwright install chromium` by hand, and a pnpm postinstall
 * would not run either: the profile enables `strictDepBuilds`, so dependency
 * build scripts are refused outright. Doing it lazily keeps the install fast
 * and only pays the download when the tool is first used.
 *
 * Playwright 1.6x exposes no `download()` on the browser type, so this drives
 * the CLI it ships instead (`cli.js install chromium`).
 *
 * @returns {Promise<string|undefined>} The binary that is now available.
 */
async function ensureChromiumDownloaded() {
  let chromiumInstaller;
  let cliPath;
  try {
    ({ chromium: chromiumInstaller } = await import('playwright'));
    const { createRequire } = await import('node:module');
    const require_ = createRequire(import.meta.url);
    cliPath = join(dirname(require_.resolve('playwright/package.json')), 'cli.js');
  } catch {
    return undefined; // Playwright itself is missing; the caller reports that.
  }

  try {
    return chromiumInstaller.executablePath(); // already downloaded
  } catch {
    // Not present yet: run the installer.
  }

  try {
    await runProcess(process.execPath, [cliPath, 'install', 'chromium'], 15 * 60_000);
    return chromiumInstaller.executablePath();
  } catch (error) {
    throw new Error(
      'reddit: no Chromium available. Install Google Chrome or Microsoft Edge, ' +
        'or run `npx playwright install chromium`. Underlying error: ' +
        String(error?.message ?? error).split('\n')[0],
    );
  }
}

/**
 * Run a child process to completion, inheriting the current environment.
 *
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments for it.
 * @param {number} timeoutMs - Give up after this long.
 * @returns {Promise<void>} Resolves when it exits successfully.
 */
function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`exited with code ${code}`));
    });
  });
}

/**
 * Normalize a Reddit URL to its canonical, query-free form.
 *
 * @param {string} rawUrl - Any user-supplied Reddit URL.
 * @returns {string} The URL without a query string, with one trailing slash.
 */
export function normalizeRedditUrl(rawUrl) {
  let clean = String(rawUrl).trim().split('?')[0].split('#')[0];
  if (!clean.endsWith('/')) clean += '/';
  return clean;
}

/**
 * Turn a flat list of depth-tagged comments into the nested reply tree.
 *
 * The JSON API already nests replies, so this is used only by the DOM
 * fallback, where `depth` is the only ordering signal available.
 *
 * @param {Array<{depth: number}>} flatComments - Comments in document order.
 * @returns {Array<object>} Root-level comments with nested `replies`.
 */
function buildCommentTree(flatComments) {
  const root = [];
  const stack = [{ depth: -1, children: root }];

  for (const comment of flatComments) {
    const node = { author: comment.author, score: comment.score, body: comment.body, replies: [] };
    while (stack.length > 1 && stack[stack.length - 1].depth >= comment.depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ depth: comment.depth, children: node.replies });
  }
  return root;
}

/**
 * Count comments in a Reddit `Listing` payload, recursively.
 *
 * @param {Array<object>} children - `data.children` from a listing.
 * @returns {number} The number of `t1` (comment) things, at any depth.
 */
function countComments(children) {
  let n = 0;
  for (const thing of children ?? []) {
    if (thing?.kind !== 't1' || !thing.data) continue;
    n += 1;
    const replies = thing.data.replies;
    if (replies && typeof replies === 'object' && Array.isArray(replies.data?.children)) {
      n += countComments(replies.data.children);
    }
  }
  return n;
}

/**
 * Convert a Reddit listing's comment children into our nested shape.
 *
 * Reddit's own `replies` nesting is used directly, so depth bookkeeping and
 * the "is this a reply or a sibling" ambiguity disappear entirely.
 *
 * @param {Array<object>} children - `data.children` from a comment listing.
 * @returns {Array<object>} Comments with nested `replies`.
 */
function fromListing(children) {
  const out = [];
  for (const thing of children ?? []) {
    // `more` stubs are the API's placeholder for collapsed/absent comments.
    // They carry no body, so they are counted separately, not emitted.
    if (thing?.kind !== 't1' || !thing.data) continue;

    const c = thing.data;
    const body = typeof c.body === 'string' ? c.body.trim() : '';
    if (!body) continue;

    const replies = c.replies;
    const nested =
      replies && typeof replies === 'object' && Array.isArray(replies.data?.children)
        ? fromListing(replies.data.children)
        : [];

    out.push({
      id: c.id,
      author: c.author ?? '[deleted]',
      score: typeof c.score === 'number' ? c.score : 0,
      created: c.created_utc ? new Date(c.created_utc * 1000).toISOString() : '',
      body,
      replies: nested,
    });
  }
  return out;
}

/**
 * Total number of `more` stubs anywhere in a listing.
 *
 * A non-zero value means Reddit withheld comments from this payload (they are
 * collapsed, `continue this thread` stubs, or beyond the API's tree limit).
 *
 * @param {Array<object>} children - `data.children` from a listing.
 * @returns {number} The number of `more` stubs, at any depth.
 */
function countMoreStubs(children) {
  let n = 0;
  for (const thing of children ?? []) {
    if (thing?.kind === 'more') n += 1;
    const replies = thing?.data?.replies;
    if (thing?.kind === 't1' && replies && typeof replies === 'object' && Array.isArray(replies.data?.children)) {
      n += countMoreStubs(replies.data.children);
    }
  }
  return n;
}

/**
 * Fetch a thread through Reddit's JSON API, from inside the loaded page.
 *
 * This runs in page context on purpose. A Node-side `fetch` is served the bot
 * wall, while a same-origin request inherits the browser's clearance, cookies,
 * and TLS fingerprint — the same reason the browser is used at all.
 *
 * The JSON path is both more complete and cheaper than scrape-and-expand: the
 * API returns its whole comment tree in one response, whereas the DOM only
 * holds what has scrolled into view and been clicked open.
 *
 * @param {import('playwright').Page} page - A page already on the thread.
 * @param {string} targetUrl - Canonical thread URL.
 * @returns {Promise<object|null>} The extracted thread, or null on failure.
 */
async function extractViaJsonApi(page, targetUrl) {
  const endpoint = `${normalizeRedditUrl(targetUrl).replace(/\/$/, '')}.json?limit=500&raw_json=1`;

  const payload = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
      if (!res.ok) return { error: `http ${res.status}` };
      const text = await res.text();
      // A redirect to the login page or an HTML interstitial lands here.
      if (!text.startsWith('[') && !text.startsWith('{')) return { error: 'non-json response' };
      return { data: JSON.parse(text) };
    } catch (error) {
      return { error: String(error?.message ?? error) };
    }
  }, endpoint);

  if (payload.error || !Array.isArray(payload.data)) return null;

  const [postListing, commentListing] = payload.data;
  const post = postListing?.data?.children?.[0]?.data;
  const commentChildren = commentListing?.data?.children;
  if (!post || !Array.isArray(commentChildren)) return null;

  const comments = fromListing(commentChildren);
  const extracted = countComments(commentChildren);

  return {
    title: post.title ?? 'Untitled Post',
    subreddit: post.subreddit ?? '',
    author: post.author ?? '[deleted]',
    score: typeof post.score === 'number' ? post.score : 0,
    created: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : '',
    url: `https://www.reddit.com${post.permalink ?? ''}`,
    selftext: typeof post.selftext === 'string' ? post.selftext : '',
    // Media/link posts carry no selftext, so surface the target instead.
    mediaUrl: post.url_overridden_by_dest || (post.is_video ? post.url : ''),
    postType: post.post_hint ?? (post.is_video ? 'video' : post.is_self ? 'text' : 'link'),
    comments,
    // Provenance for the caller: what Reddit says exists, versus what arrived.
    reportedCommentCount: typeof post.num_comments === 'number' ? post.num_comments : null,
    extractedCommentCount: extracted,
    withheldCommentCount: countMoreStubs(commentChildren),
    extractionMethod: 'reddit JSON API (in-page fetch)',
  };
}

/**
 * Fallback: scrape the rendered thread from the DOM.
 *
 * Used when the JSON request is refused. Less complete than the API — the DOM
 * only contains comments that have scrolled into view and been expanded — so
 * this path clicks every expansion control it can find and then reports the
 * shortfall against the count the page itself advertises.
 *
 * @param {import('playwright').Page} page - A page already on the thread.
 * @param {string} targetUrl - Canonical thread URL.
 * @param {object} options - Extraction options.
 * @param {boolean} [options.expandAllComments] - Whether to expand at all.
 * @returns {Promise<object|null>} The extracted thread, or null on failure.
 */
async function extractViaDom(page, targetUrl, options = {}) {
  const { expandAllComments = true } = options;

  await page.waitForSelector('shreddit-post', { timeout: 15000 }).catch(() => {});

  const shPost = page.locator('shreddit-post').first();
  if ((await shPost.count()) === 0) return null;

  // The page states the true total; it is the yardstick for the shortfall.
  const reported = parseInt((await shPost.getAttribute('comment-count')) || '', 10);

  if (expandAllComments) {
    // Expand until the comment count stops growing, not for a fixed number of
    // passes: a big thread needs more rounds than a small one, and a fixed
    // count either wastes time or stops early.
    let previous = -1;
    for (let pass = 0; pass < 30; pass += 1) {
      for (let step = 0; step < 4; step += 1) {
        await page.evaluate(() => window.scrollBy(0, 3000));
        await page.waitForTimeout(150);
      }

      const controls = await page
        .locator('faceplate-partial[src*="comments"], button:has-text("more"), button:has-text("View more")')
        .all();
      for (const control of controls) {
        try {
          if (await control.isVisible()) {
            await control.click();
            await page.waitForTimeout(120);
          }
        } catch {
          // Detached mid-click; the next pass picks up whatever replaced it.
        }
      }

      const now = await page.locator('shreddit-comment').count();
      if (now === previous) {
        // One extra round guards against a slow batch landing just late.
        await page.waitForTimeout(500);
        if ((await page.locator('shreddit-comment').count()) === now) break;
      }
      previous = now;
    }
  }

  const title = (await shPost.getAttribute('post-title')) || (await page.title()) || 'Untitled Post';
  const author = (await shPost.getAttribute('author')) || '[deleted]';
  const subreddit = ((await shPost.getAttribute('subreddit-prefixed-name')) || '').replace(/^r\//, '');
  const score = parseInt((await shPost.getAttribute('score')) || '0', 10);
  const postType = (await shPost.getAttribute('post-type')) || 'text';
  const contentHref = (await shPost.getAttribute('content-href')) || '';

  const selftext = await page.evaluate(() => {
    const post = document.querySelector('shreddit-post');
    if (!post) return '';
    const body =
      post.querySelector('[slot="text-body"]') ||
      post.querySelector('div[id*="post-rtjson"]') ||
      post.querySelector('div.text-neutral-content');
    if (body) {
      const clone = body.cloneNode(true);
      clone.querySelectorAll('button, faceplate-tracker').forEach((el) => el.remove());
      return clone.innerText.replace(/Read more$/i, '').trim();
    }
    return Array.from(post.querySelectorAll('p')).map((p) => p.innerText.trim()).filter(Boolean).join('\n\n');
  });

  const commentNodes = await page.locator('shreddit-comment').all();
  const flat = [];
  for (const node of commentNodes) {
    const body = await node.evaluate((el) => {
      const slot = el.querySelector('[slot="comment"]');
      if (!slot) return el.innerText.trim();
      const clone = slot.cloneNode(true);
      // Child comments are separate nodes; including them would duplicate
      // every reply inside its parent's body.
      clone.querySelectorAll('shreddit-comment, style, script, faceplate-tracker').forEach((el2) => el2.remove());
      return clone.innerText.trim();
    });
    if (!body || body === '[deleted]' || body === '[removed]') continue;

    flat.push({
      id: await node.getAttribute('thingid') || undefined,
      author: (await node.getAttribute('author')) || '[deleted]',
      score: parseInt((await node.getAttribute('score')) || '0', 10),
      depth: parseInt((await node.getAttribute('depth')) || '0', 10),
      body,
    });
  }

  return {
    title,
    subreddit,
    author,
    score,
    created: '',
    url: targetUrl,
    selftext,
    mediaUrl: contentHref || '',
    postType,
    comments: buildCommentTree(flat),
    reportedCommentCount: Number.isFinite(reported) ? reported : null,
    extractedCommentCount: flat.length,
    withheldCommentCount: Number.isFinite(reported) ? Math.max(0, reported - flat.length) : null,
    extractionMethod: 'rendered DOM (shreddit-comment)',
  };
}

/**
 * Extract a Reddit thread — post plus comments, with nested replies.
 *
 * Tries the JSON API first because it returns the complete tree in one
 * request, then falls back to scraping the rendered page.
 *
 * @param {string} redditUrl - Target Reddit thread URL.
 * @param {object} [options] - Extraction options.
 * @param {boolean} [options.headless] - Run the browser headless.
 * @param {number} [options.timeout] - Navigation timeout in milliseconds.
 * @param {string|null} [options.sessionCookie] - A `reddit_session` value for
 *   logged-in extraction (raises both the rate limit and the visible tree).
 * @param {boolean} [options.expandAllComments] - DOM fallback: expand replies.
 * @param {boolean} [options.preferJson] - Try the JSON API first.
 * @returns {Promise<object>} The extracted thread.
 * @throws {Error} When Reddit's bot defense blocks the page, or nothing parses.
 */
export async function extractRedditThread(redditUrl, options = {}) {
  const {
    headless = true,
    timeout = 45000,
    sessionCookie = null,
    expandAllComments = true,
    preferJson = true,
  } = options;

  const targetUrl = normalizeRedditUrl(redditUrl);
  // Resolve a browser, downloading Playwright's own build on first use so the
  // tool works straight after install with no manual `playwright install`.
  const executablePath =
    options.executablePath || findChromiumExecutable() || (await ensureChromiumDownloaded());

  const browser = await chromium.launch({
    headless,
    executablePath,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--lang=en-US,en',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    },
  });

  // Age gate and consent banner, bypassed at the cookie layer.
  const cookies = [
    { name: 'over18', value: '1', domain: '.reddit.com', path: '/' },
    { name: 'eu_cookie_consent', value: 'true', domain: '.reddit.com', path: '/' },
  ];
  if (sessionCookie) {
    cookies.push({ name: 'reddit_session', value: sessionCookie, domain: '.reddit.com', path: '/' });
  }
  await context.addCookies(cookies);

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  const page = await context.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout });

    // Dismiss consent dialogs that would otherwise hold the page hostage.
    for (const selector of [
      'button:has-text("Accept All")',
      'button:has-text("Accept all")',
      'button:has-text("I agree")',
      'button:has-text("Accept Cookies")',
      'button:has-text("Continue in app")',
      'button[aria-label="Close"]',
    ]) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible()) {
          await button.click();
          await page.waitForTimeout(150);
        }
      } catch {
        // Absent or transient; nothing to dismiss.
      }
    }

    const pageTitle = await page.title();
    if (pageTitle.includes('Prove your humanity') || pageTitle.includes('Blocked')) {
      throw new Error(
        `Reddit bot defense is active ("${pageTitle}"). Pass a sessionCookie option, or retry — the challenge is often transient.`,
      );
    }

    // Reading the DOM requires hydration; the JSON path also needs the origin
    // to be a real reddit.com document so cookies and clearance apply.
    await page.waitForSelector('shreddit-post', { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('load').catch(() => {});

    let result = null;
    let jsonError = null;

    if (preferJson) {
      try {
        result = await extractViaJsonApi(page, targetUrl);
        if (!result) jsonError = 'JSON endpoint returned no usable payload';
      } catch (error) {
        jsonError = String(error?.message ?? error);
      }
    }

    if (!result) {
      result = await extractViaDom(page, targetUrl, { expandAllComments });
    }

    if (!result) {
      throw new Error(
        `Could not extract the thread. JSON API: ${jsonError ?? 'not attempted'}; DOM fallback found no parsed post.`,
      );
    }

    return result;
  } finally {
    await browser.close().catch(() => {});
  }
}
