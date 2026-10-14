import { getRepoForUser as dbGetRepoForUser } from './db.js';
import {
  collectAllPullFiles,
  createIssueComment as ghCreateComment,
  getPullDetail as ghGetPullDetail,
  listOpenPulls as ghListOpenPulls,
  listPullFiles as ghListPullFiles,
  parseRepoUrl,
} from './github.js';
import { draftReview as runDraftReview, formatCommentBody, reviewGate } from './review.js';

function fail(status, error) {
  return { status, body: { error } };
}

async function loadOnShelf(url, getRepoForUser, { requireReady = false } = {}) {
  const parsed = parseRepoUrl(url);
  if (!parsed) return { error: fail(400, 'a GitHub repository url is required') };

  const repo = await getRepoForUser(parsed.url);
  if (!repo) return { error: fail(403, 'Shelve that repository first') };
  if (requireReady) {
    const gate = reviewGate(repo);
    if (!gate.ok) return { error: fail(gate.status, gate.error) };
  }

  return { repo, parsed };
}

export async function handleListPulls({
  url,
  token,
  getRepoForUser = dbGetRepoForUser,
  listOpenPulls = ghListOpenPulls,
} = {}) {
  const loaded = await loadOnShelf(url, getRepoForUser);
  if (loaded.error) return loaded.error;

  const pulls = await listOpenPulls(loaded.repo.owner, loaded.repo.name, token);
  return { status: 200, body: { pulls } };
}

export async function handleInspectPull({
  url,
  number,
  token,
  getRepoForUser = dbGetRepoForUser,
  getPullDetail = ghGetPullDetail,
  listPullFiles = ghListPullFiles,
} = {}) {
  if (!Number(number)) return fail(400, 'number is required');

  const loaded = await loadOnShelf(url, getRepoForUser);
  if (loaded.error) return loaded.error;

  const pull = await getPullDetail(loaded.repo.owner, loaded.repo.name, Number(number), token);
  if (!pull) return fail(404, 'Pull request not found');

  const files = await collectAllPullFiles(
    (page, perPage) =>
      listPullFiles(loaded.repo.owner, loaded.repo.name, Number(number), page, perPage, token),
    { perPage: 100 },
  );

  return { status: 200, body: { pull, files } };
}

export async function handleDraftReview({
  url,
  number,
  token,
  getRepoForUser = dbGetRepoForUser,
  getPullDetail = ghGetPullDetail,
  listPullFiles = ghListPullFiles,
  draftReview = runDraftReview,
} = {}) {
  if (!Number(number)) return fail(400, 'number is required');

  const loaded = await loadOnShelf(url, getRepoForUser, { requireReady: true });
  if (loaded.error) return loaded.error;

  const pr = await getPullDetail(loaded.repo.owner, loaded.repo.name, Number(number), token);
  if (!pr) return fail(404, 'Pull request not found');
  if (pr.state !== 'open') return fail(409, 'PR is not open');

  const preview = await draftReview({
    repoUrl: loaded.repo.url,
    pr,
    listFiles: (page, perPage) =>
      listPullFiles(loaded.repo.owner, loaded.repo.name, Number(number), page, perPage, token),
  });

  return { status: 200, body: { ...preview, number: Number(number), repo: loaded.repo.url } };
}

export async function handlePublishReview({
  url,
  number,
  body,
  content,
  critical_fixes,
  suggested_fixes,
  token,
  getRepoForUser = dbGetRepoForUser,
  createIssueComment = ghCreateComment,
} = {}) {
  if (!Number(number)) return fail(400, 'number is required');

  const commentBody =
    body ||
    formatCommentBody({
      content,
      critical_fixes: critical_fixes ?? [],
      suggested_fixes: suggested_fixes ?? [],
    });
  if (!commentBody) return fail(400, 'body is required');

  const loaded = await loadOnShelf(url, getRepoForUser);
  if (loaded.error) return loaded.error;

  const comment = await createIssueComment(
    loaded.repo.owner,
    loaded.repo.name,
    Number(number),
    commentBody,
    token,
  );

  return {
    status: 201,
    body: {
      comment: {
        id: comment.id,
        url: comment.html_url,
      },
    },
  };
}
