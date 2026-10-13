import { ChatOpenAI } from '@langchain/openai';
import { search as pineconeSearch } from './pinecone.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TOP_K = Number(process.env.RETRIEVAL_TOP_K) || 8;
const MAX_QUERY_CHARS = 6000;
const PER_PAGE = Number(process.env.PR_FILES_PER_PAGE) || 20;
const MAX_PAGES = Number(process.env.MAX_PR_PAGES) || 10;

const REVIEW_SYSTEM = `You review the changes in a GitHub PR and summarise them.
Reply with a single JSON object only, no markdown fence, of the form:
{"content":"markdown summary","critical_fixes":["..."],"suggested_fixes":["..."]}

Along with the diff you are usually given repository context retrieved from a
vector index of the same repo. That context is evidence -- use it to VERIFY the
change, never to assume the change is fine.

When a symbol is renamed, moved, or its signature changes, first find where that
symbol is DEFINED and EXPORTED -- that file is usually not in the diff, and is the
most common thing a rename forgets. Then find every other place it is used.
If any of them still use the old form and are not part of this PR, that is a
critical fix -- name that exact file.

Only report a file if the context actually shows the old name in it. Do not guess
about files you cannot see, and do not report the changed files themselves as
needing the change -- they are already updated by this PR.

Never write phrases like 'assuming this is consistent elsewhere'. Either the
context shows it is consistent, or it shows a problem, or the context does not
cover it -- in which case say exactly what still needs checking.

Do not comment on the style or quality of the context code itself; it is not part
of this PR. Reporting that a context file must be updated to keep the PR working
is not a style comment -- that is exactly what you should report.

critical_fixes: things that will break if this PR is merged as-is. One sentence
each, naming the file that must be changed and why.
suggested_fixes: optional improvements.
content: a detailed summary of the changes.`;

export function reviewGate(repo) {
  if (!repo) return { ok: false, status: 403, error: 'Shelve that repository first' };
  if (repo.status !== 'ready') {
    return { ok: false, status: 409, error: 'Wait until the shelf is ready before reviewing' };
  }
  return { ok: true };
}

export async function retrieveContext(repoUrl, changes, { search = pineconeSearch, topK = TOP_K } = {}) {
  const query = changes
    .map((change) => `${change.filename}\n${change.patch ?? ''}`)
    .join('\n\n')
    .slice(0, MAX_QUERY_CHARS);

  const paths = changes.map((change) => change.filename);
  const repoFilter = { repo: { $eq: repoUrl } };

  const [sameFile, related] = await Promise.all([
    paths.length
      ? search(query, topK, { ...repoFilter, source: { $in: paths } })
      : [],
    search(query, topK, repoFilter),
  ]);

  const seen = new Set();
  return [...sameFile, ...related].filter((chunk) => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  });
}

export function formatContext(chunks) {
  return chunks
    .map((chunk) => {
      const source = chunk.metadata?.source ?? chunk.source ?? 'unknown';
      const text = chunk.metadata?.text ?? chunk.text ?? '';
      return `### ${source}\n${text}`;
    })
    .join('\n\n');
}

export function parseReviewJson(text) {
  const trimmed = String(text ?? '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(raw);
  return {
    content: parsed.content ?? '',
    critical_fixes: parsed.critical_fixes ?? [],
    suggested_fixes: parsed.suggested_fixes ?? [],
  };
}

export function formatCommentBody({
  content,
  critical_fixes = [],
  suggested_fixes = [],
  hitPageLimit = false,
  filesReviewed = 0,
  maxPages = MAX_PAGES,
} = {}) {
  const sections = [content].filter(Boolean);

  if (critical_fixes.length) {
    sections.push(`**Critical Changes:**\n${critical_fixes.map((fix) => `- ${fix}`).join('\n')}`);
  }
  if (suggested_fixes.length) {
    sections.push(`**Suggestions:**\n${suggested_fixes.map((fix) => `- ${fix}`).join('\n')}`);
  }
  if (hitPageLimit) {
    sections.push(
      `_Note: this PR has more than ${maxPages} pages of files. Only the first ${filesReviewed} files were reviewed._`,
    );
  }

  return sections.join('\n\n');
}

export function mergeReviews(reviews) {
  return {
    content: reviews.map((r) => r.content).filter(Boolean).join('\n\n'),
    critical_fixes: reviews.flatMap((r) => r.critical_fixes ?? []),
    suggested_fixes: reviews.flatMap((r) => r.suggested_fixes ?? []),
  };
}

async function analyzePage(pr, changes, contextChunks, invoke) {
  const prompt = [
    `## Pull request\n${JSON.stringify(pr, null, 2)}`,
    `## Changed files (review these)\n${JSON.stringify(changes, null, 2)}`,
    contextChunks.length
      ? `## Related repository context (read-only, do NOT review)\n${formatContext(contextChunks)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const reply = await invoke([
    { role: 'system', content: REVIEW_SYSTEM },
    { role: 'user', content: prompt },
  ]);

  return parseReviewJson(reply.text ?? reply.content ?? reply);
}

export async function draftReview({
  repoUrl,
  pr,
  listFiles,
  search,
  invoke,
  perPage = PER_PAGE,
  maxPages = MAX_PAGES,
}) {
  const llmInvoke =
    invoke ??
    ((messages) =>
      new ChatOpenAI({ model: MODEL, temperature: 0 }).invoke(messages));

  const reviews = [];
  let filesReviewed = 0;
  let hitPageLimit = false;

  for (let page = 1; page <= maxPages; page++) {
    const changes = await listFiles(page, perPage);
    if (changes.length === 0) break;

    const context = await retrieveContext(repoUrl, changes, { search });
    reviews.push(await analyzePage(pr, changes, context, llmInvoke));
    filesReviewed += changes.length;

    if (changes.length < perPage) break;
    if (page === maxPages) hitPageLimit = true;
  }

  if (filesReviewed === 0) {
    return {
      content: 'No file changes were found on this pull request.',
      critical_fixes: [],
      suggested_fixes: [],
      filesReviewed: 0,
      pagesReviewed: 0,
      hitPageLimit: false,
      body: formatCommentBody({ content: 'No file changes were found on this pull request.' }),
    };
  }

  const merged = mergeReviews(reviews);
  return {
    ...merged,
    filesReviewed,
    pagesReviewed: reviews.length,
    hitPageLimit,
    body: formatCommentBody({ ...merged, hitPageLimit, filesReviewed, maxPages }),
  };
}
