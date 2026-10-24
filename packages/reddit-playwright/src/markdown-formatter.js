import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

/**
 * Convert an HTML fragment to Markdown, leaving plain text untouched.
 *
 * @param {string} text - Raw text, possibly containing HTML.
 * @returns {string} Markdown-ish text.
 */
export function toMarkdown(text) {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) {
    try {
      return turndown.turndown(text).trim();
    } catch {
      return text.trim();
    }
  }
  return text.trim();
}

/**
 * Collapse a comment body to a single line.
 *
 * The digest is line-oriented — one comment per line — so that it stays
 * parseable and so a downstream line-counting compressor cannot split a
 * comment in half. Newlines inside a body would break that invariant.
 *
 * @param {string} body - Raw comment body.
 * @returns {string} A single-line rendering.
 */
function oneLine(body) {
  return toMarkdown(body)
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Walk the comment tree in document order, yielding each comment.
 *
 * @param {Array<object>} comments - Comments with nested `replies`.
 * @yields {{ comment: object, parentId: string|null }}
 */
function* walk(comments) {
  const stack = [];
  for (let i = (comments?.length ?? 0) - 1; i >= 0; i -= 1) {
    stack.push({ comment: comments[i], parentId: null });
  }
  while (stack.length > 0) {
    const { comment, parentId } = stack.pop();
    if (!comment?.body) continue;
    yield { comment, parentId };
  }
}

/**
 * Assign stable ids to every comment and index them by id.
 *
 * Two passes are needed because a comment references its parent's id, which
 * may be assigned after the child is visited in a plain traversal.
 *
 * @param {Array<object>} comments - Root comments.
 * @returns {Array<{ id: string, comment: object, parentId: string|null }>} Ordered rows.
 */
function indexComments(comments) {
  const rows = [];
  const visit = (list, parentId) => {
    for (const comment of list ?? []) {
      if (!comment?.body) continue;
      const row = { id: `c${rows.length + 1}`, comment, parentId };
      rows.push(row);
      if (Array.isArray(comment.replies)) visit(comment.replies, row.id);
    }
  };
  visit(comments, null);
  return rows;
}

/**
 * One `[THREAD]` header line describing the post and its completeness.
 *
 * `comments` reports what was actually extracted and, when Reddit advertised
 * more, how many were withheld — so a reader can tell a short thread from a
 * partial fetch without guessing.
 *
 * @param {object} postData - Extracted thread.
 * @returns {string} The header line.
 */
function threadHeader(postData) {
  const parts = [
    `title="${postData.title}"`,
    postData.subreddit ? `subreddit="r/${postData.subreddit}"` : null,
    postData.author ? `author="u/${postData.author}"` : null,
    Number.isFinite(postData.score) ? `score=${postData.score}` : null,
    `comments=${postData.extractedCommentCount ?? 0}`,
  ];

  if (
    Number.isFinite(postData.reportedCommentCount) &&
    postData.reportedCommentCount > (postData.extractedCommentCount ?? 0)
  ) {
    parts.push(`of_reported=${postData.reportedCommentCount}`);
  }
  if (Number.isFinite(postData.withheldCommentCount) && postData.withheldCommentCount > 0) {
    parts.push(`withheld=${postData.withheldCommentCount}`);
  }

  parts.push(`via="${postData.extractionMethod ?? 'unknown'}"`);
  if (postData.url) parts.push(`url="${postData.url}"`);

  return `[THREAD] ${parts.filter(Boolean).join(' ')}`;
}

/**
 * Standard Indented Markdown Tree Formatter (for human readers).
 *
 * @param {object} comment - Comment with nested `replies`.
 * @param {number} depth - Current nesting depth.
 * @returns {string} Markdown for this comment and its replies.
 */
export function formatComment(comment, depth = 0) {
  if (!comment?.body || comment.body === '[deleted]' || comment.body === '[removed]') return '';

  const indent = '  '.repeat(depth);
  const author = comment.author ? `**u/${comment.author}**` : '*[deleted]*';
  const score = comment.score !== undefined ? ` • ${comment.score} points` : '';
  const time = comment.created ? ` • ${comment.created}` : '';

  let markdown = `${indent}- ${author}${score}${time}\n`;
  markdown += toMarkdown(comment.body)
    .split('\n')
    .map((line) => `${indent}  ${line}`)
    .join('\n');
  markdown += '\n\n';

  for (const reply of comment.replies ?? []) markdown += formatComment(reply, depth + 1);
  return markdown;
}

/**
 * Format a thread as human-readable Markdown.
 *
 * @param {object} postData - Extracted thread.
 * @param {object} [options] - Formatting options.
 * @param {number} [options.maxComments] - Cap on root comments rendered.
 * @returns {string} Markdown.
 */
export function formatThreadToMarkdown(postData, options = {}) {
  const { maxComments = Infinity } = options;
  let md = '';

  md += `# ${postData.title}\n\n`;
  md += `**Subreddit:** r/${postData.subreddit} | **Author:** u/${postData.author} | **Score:** ${postData.score}`;
  if (postData.url) md += ` | **URL:** [Reddit Link](${postData.url})`;
  md += '\n\n';

  if (
    Number.isFinite(postData.reportedCommentCount) &&
    postData.reportedCommentCount > (postData.extractedCommentCount ?? 0)
  ) {
    md += `**Comments:** ${postData.extractedCommentCount} extracted of ${postData.reportedCommentCount} reported`;
    if (postData.withheldCommentCount > 0) {
      md += ` (${postData.withheldCommentCount} withheld by Reddit)`;
    }
    md += '\n\n';
  }

  md += '---\n\n';

  if (postData.selftext) {
    md += `## Main Thread Post\n\n${toMarkdown(postData.selftext)}\n\n---\n\n`;
  } else if (postData.mediaUrl) {
    md += `## Main Thread Post\n\n**[${(postData.postType || 'media').toUpperCase()}]** ${postData.mediaUrl}\n\n---\n\n`;
  }

  md += '## Top Comments\n\n';

  if (!postData.comments?.length) {
    md += '*No comments found or comments disabled.*\n';
  } else {
    for (const comment of postData.comments.slice(0, maxComments)) md += formatComment(comment, 0);
  }

  return md;
}

/**
 * Structured JSON, for programmatic use.
 *
 * @param {object} postData - Extracted thread.
 * @returns {string} Pretty-printed JSON.
 */
export function formatThreadToJson(postData) {
  return JSON.stringify(postData, null, 2);
}

/**
 * Estimate the agent-digest size before rendering it.
 *
 * Used to decide whether the thread fits in a single tool result or needs the
 * spill file.
 *
 * @param {object} postData - Extracted thread.
 * @returns {number} Approximate byte length of the digest.
 */
export function estimateDigestBytes(postData) {
  const rows = indexComments(postData.comments);
  let bytes = 200 + (postData.selftext?.length ?? 0);
  for (const { comment } of rows) {
    bytes += (comment.body?.length ?? 0) + 60;
  }
  return bytes;
}

/**
 * Render one comment row as a single digest line.
 *
 * Shape: `[id re:parent scored] u/author (+n): body`. The `re:` reference is
 * explicit so nesting survives flattening, and the id/author/score prefix lets
 * a reader reconstruct the tree without indentation.
 *
 * @param {{ id: string, comment: object, parentId: string|null }} row - Indexed comment.
 * @returns {string} One digest line.
 */
function digestLine({ id, comment, parentId }) {
  const ref = parentId ? ` re:${parentId}` : '';
  const author = comment.author ? `u/${comment.author}` : 'u/[deleted]';
  const score = Number.isFinite(comment.score) ? ` (+${comment.score})` : '';
  return `[${id}${ref}] ${author}${score}: ${oneLine(comment.body)}`;
}

/**
 * Compact, line-oriented digest built for an agent's context window.
 *
 * One comment per line, with explicit parent references. The format is
 * deliberately flat and regular: no indentation to lose, no nested fences, and
 * a byte-per-thought density close to plain prose, which keeps it intact when
 * something downstream counts lines or reflows text.
 *
 * @param {object} postData - Extracted thread.
 * @returns {string} The digest.
 */
export function formatThreadToAgentDigest(postData) {
  const rows = indexComments(postData.comments);
  const out = [threadHeader(postData), ''];

  if (postData.selftext) {
    out.push('[POST_BODY]', oneLine(postData.selftext), '');
  } else if (postData.mediaUrl) {
    out.push('[POST_MEDIA]', `${(postData.postType || 'media').toUpperCase()} ${postData.mediaUrl}`, '');
  }

  out.push('[COMMENTS]');
  for (const row of rows) out.push(digestLine(row));

  return out.join('\n').trim();
}

/**
 * Byte-bounded preview: the header, post body, and as many top-scoring
 * comments as fit within `maxBytes`.
 *
 * Used when the full thread is written to a file: the caller needs a useful
 * starting point that is guaranteed to survive the pipeline intact, and a
 * byte budget is the only bound that actually holds (a line count does not,
 * because comment lengths vary by three orders of magnitude).
 *
 * @param {object} postData - Extracted thread.
 * @param {number} [maxBytes] - Byte budget for the returned text.
 * @returns {string} The preview.
 */
export function formatThreadToAgentPreviewBounded(postData, maxBytes = 12000) {
  const rows = indexComments(postData.comments);
  const head = [threadHeader(postData), ''];
  if (postData.selftext) head.push('[POST_BODY]', oneLine(postData.selftext), '');
  else if (postData.mediaUrl) head.push('[POST_MEDIA]', `${(postData.postType || 'media').toUpperCase()} ${postData.mediaUrl}`, '');

  const header = head.join('\n');
  const budget = maxBytes - Buffer.byteLength(header, 'utf8');

  // Rank by score so the preview leads with what the thread found important,
  // then restore document order for readability.
  const ranked = [...rows].sort((a, b) => (b.comment.score ?? 0) - (a.comment.score ?? 0));
  const selected = [];
  let used = 0;
  for (const row of ranked) {
    const line = digestLine(row);
    const size = Buffer.byteLength(line, 'utf8') + 1;
    if (used + size > budget) continue;
    used += size;
    selected.push(row);
  }

  const order = new Map(rows.map((r, i) => [r.id, i]));
  selected.sort((a, b) => order.get(a.id) - order.get(b.id));

  const omitted = rows.length - selected.length;
  const lines = [
    header,
    `[COMMENTS shown=${selected.length} of=${rows.length} ranked=top_by_score${omitted > 0 ? ` omitted=${omitted}` : ''}]`,
    ...selected.map(digestLine),
  ];
  return lines.join('\n').trim();
}

/**
 * Preview digest: the header plus the highest-scoring comments, as a fallback
 * when the full digest is too large to return inline.
 *
 * @param {object} postData - Extracted thread.
 * @param {number} [limit] - Maximum comment lines to include.
 * @returns {string} The preview digest.
 */
export function formatThreadToAgentPreview(postData, limit = 120) {
  const rows = indexComments(postData.comments);
  const ranked = [...rows].sort((a, b) => (b.comment.score ?? 0) - (a.comment.score ?? 0));
  const keep = new Set(ranked.slice(0, limit).map((r) => r.id));
  // Preserve document order in the output; only the selection is ranked.
  const selected = rows.filter((r) => keep.has(r.id));

  const out = [threadHeader(postData), ''];
  if (postData.selftext) out.push('[POST_BODY]', oneLine(postData.selftext), '');
  else if (postData.mediaUrl) out.push('[POST_MEDIA]', `${(postData.postType || 'media').toUpperCase()} ${postData.mediaUrl}`, '');
  out.push(`[COMMENTS filtered=top${selected.length} of ${rows.length}]`);
  for (const row of selected) out.push(digestLine(row));

  return out.join('\n').trim();
}
