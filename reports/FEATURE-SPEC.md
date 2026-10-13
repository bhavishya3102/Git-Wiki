# Feature: PR review desk in Git Wiki

Locked from the grill-me session. Chat/ask and existing indexing stay as they are.

## Product

1. User shelves their own public repo, then switches desk mode **Ask | Review**.
2. Review lists **open** PRs for the selected shelved repo, **including drafts**.
3. Row click **inspects** the PR (stats + every file diff). **Mark review** then drafts. **Confirm** posts a new GitHub issue comment via `GITHUB_TOKEN`.
4. Review is **blocked** until the shelf status is `ready`.
5. Every Confirm posts a **new** comment (no update/dedupe).
6. Retrieval uses **existing wiki Pinecone vectors** (`repo` + `source`). No Prisma indexer, no webhook.

## Endpoints

| Method | Path | Auth | Done when |
| --- | --- | --- | --- |
| GET | `/pulls?url=` | session | `200 { pulls[] }` for a shelved repo (queued allowed) |
| GET | `/pulls/inspect?url=&number=` | session | `200 { pull, files[] }` with unified diffs; no LLM |
| POST | `/reviews` | session | `200` draft `{ content, critical_fixes, suggested_fixes, body, ... }` |
| POST | `/reviews/publish` | session | `201 { comment }` after `issues.createComment` |

## UI

- `DeskToggle` Ask | Review on the selected volume
- `ReviewDesk` PR list → inspect (stats + all diffs) → Mark review → Confirm
- Existing `Composer` / `AnswerPlate` unchanged in Ask mode
