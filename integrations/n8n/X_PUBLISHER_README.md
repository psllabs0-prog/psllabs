# n8n → X approved publishing (B2)

`psl-x-publisher.workflow.json` publishes **owner-approved** original text
posts to **@PSLLabspurity** (X user ID `"2094368418443280384"`, always a
string). It is imported **inactive**, has a **Manual Trigger only**, and
contains no credentials, credential IDs, tokens, or account IDs.

Owner flow: save draft in `/admin-social` → review the exact text, account,
and time → approve → n8n publishes the approved version when due → X's
response and a read-only lookup are recorded → `/admin-social` and Mission
Control show the result.

V1 scope: one original text post per run, optionally with fully written
`https://` links. No AI rewriting, media, threads, replies, mentions, DMs,
likes, follows, reposts, Reddit, or ads.

## Roles and trust boundary

| Part | Role |
|---|---|
| Neon + Next.js (`x_publishing_*` tables) | Authoritative queue: drafts, approvals, attempts, permits, results |
| n8n | The only executor. The only place the X OAuth2 credential lives |
| X | Authority on whether a post exists |
| Mission Control | Activity view only (`x_publishing` actor); never queue state |

- The X client secret and OAuth tokens stay in n8n. They are **never** copied
  into Vercel, the database, or this repo. PSL never calls X itself.
- **Anyone with admin access to n8n can bypass the queue** (for example by
  using the `PSL X Publishing` credential in another workflow or editing this
  one). The queue cannot prevent that. Mitigations: restrict n8n admin
  access, do not share the credential with other workflows or users, keep
  this workflow's history, and rotate the credential if n8n access changes.
- X's Create Post API has no idempotency key. PSL therefore issues a
  **one-time dispatch permit** per approved revision and marks the attempt
  dispatched **before** returning the text. If the permit response or the
  create response is lost, that delivery is sacrificed and the attempt goes
  to owner review. It is never retried automatically.
- Pause stops new permits. **Neither pause nor cancel can retract a request
  already sent to X**, and nothing is ever deleted automatically.

## 1. Server settings (Vercel, **Production scope only**)

| Variable | Value |
|---|---|
| `X_PUBLISHER_TOKEN` | New random token (≥ 32 chars). **Different** from `MISSION_CONTROL_N8N_TOKEN`, `ADMIN_PASSWORD`, `CRON_SECRET`, DB URLs, payment secrets; the server refuses a reused secret |
| `X_EXPECTED_ACCOUNT_ID` | `2094368418443280384` (exact string; missing or different → fails closed) |
| `X_PUBLISHING_ENABLED` | `true` only when you are ready for live posting (default off) |

Generate the token with a CSPRNG, e.g.
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

- Do **not** set these in Preview. Preview deployments refuse the X machine
  endpoints and admin queue changes; there is no Preview override.
- `X_PUBLISHING_DRY_RUN_ENABLED` is for isolated, non-Vercel environments
  only and is refused on any Vercel deployment. Never set it in Vercel.
- Mission Control activity events for X publishing use the existing
  `MISSION_CONTROL_SYNC_ENABLED` write gate. If events fail, queue state is
  unaffected.
- The B1 connection test (`MISSION_CONTROL_N8N_*`, `PSL Mission Control n8n`
  credential, `/api/integrations/n8n/mission-control/...`) is unchanged and
  separate.

## 2. Migration (owner-run, explicit)

`npm run migrate-x-publishing` creates `x_publishing_posts`,
`x_publishing_attempts`, and `x_publishing_control` (additive; no rows).
Nothing creates them automatically. Until migrated, `/admin-social` shows
"tables missing" and the machine endpoints return 503. With no control row
the queue is **paused**; resume it from `/admin-social` when ready.

## 3. Credentials in n8n

| Credential | Type | Used by |
|---|---|---|
| `PSL X Queue` | Header Auth. Name `Authorization`, Value `Bearer <X_PUBLISHER_TOKEN>` | the 5 PSL HTTP nodes |
| `PSL X Publishing` | Generic OAuth2 (already connected; `GET /2/users/me` returned @PSLLabspurity) | the 3 X HTTP nodes |

Do not reuse `PSL Mission Control n8n` (B1) here, and do not use
`PSL X Queue` in the B1 workflow.

## 4. Import and bind

1. **Workflows → Import from File** → `psl-x-publisher.workflow.json`. It
   imports inactive with a Manual Trigger. Do not add Schedule/Cron/Webhook
   triggers yet.
2. Open **Config** and set `pslBaseUrl` to the Production HTTPS origin (no
   path, no trailing slash). The **Config valid?** node stops the run
   otherwise.
3. Bind credentials node by node (table below). A PSL node without
   `PSL X Queue` fails with 401 and stops the run before any X call.

### Nodes (29 total: 8 HTTP Request, 6 IF, 9 Stop and Error, 2 Set, 2 No-Op, 1 Manual Trigger, 1 Sticky Note)

| # | Node | Type | Credential | Notes |
|---|---|---|---|---|
| 1 | Setup notes | Sticky Note | — | |
| 2 | Manual Trigger | Manual Trigger | — | Only trigger |
| 3 | Config | Set | — | `pslBaseUrl` |
| 4 | Config valid? | IF | — | HTTPS origin, no path |
| 5 | Stop: invalid config | Stop and Error | — | |
| 6 | Claim work | HTTP POST `/claim` | **PSL X Queue** | `mode: live`, `trigger: manual`; no retry; no redirects |
| 7 | Stop: claim failed | Stop and Error | — | No X call made |
| 8 | Publish work? | IF | — | `work.kind === 'publish'` |
| 9 | Lookup work? | IF | — | `work.kind === 'lookup'`, digits-only ID |
| 10 | Nothing due (no X calls) | No-Op | — | Empty queue ends here with **zero X API calls** |
| 11 | Get authenticated X account | HTTP GET `https://api.x.com/2/users/me` | **PSL X Publishing** | Full response, never error, no redirects, no retry |
| 12 | Report account check | HTTP POST `/attempts/{id}/identity` | **PSL X Queue** | Sends `accountId` as a **string**; PSL compares exactly |
| 13 | Stop: account check not recorded | Stop and Error | — | Nothing posted |
| 14 | Account confirmed? | IF | — | `proceed === true` |
| 15 | Stop: account check failed | Stop and Error | — | Mismatch pauses the queue server-side |
| 16 | Request dispatch permit | HTTP POST `/attempts/{id}/dispatch` | **PSL X Queue** | **No retry.** Returns the approved text once |
| 17 | Stop: permit not received | Stop and Error | — | Do not re-run to retry |
| 18 | Permit issued? | IF | — | `permit === 'issued'`, same attempt, text present |
| 19 | Stop: dispatch denied | Stop and Error | — | Paused / not due / expired / cap / edited |
| 20 | **Create Post on X** | HTTP POST `https://api.x.com/2/tweets` | **PSL X Publishing** | Body `{ text }` only. **Retry On Fail OFF**. Timeout → error branch → reported as uncertain |
| 21 | Report create result | HTTP POST `/attempts/{id}/result` | **PSL X Queue** | Retries (idempotent) |
| 22 | Stop: result not recorded | Stop and Error | — | Do not re-run; becomes uncertain after deadline |
| 23 | Verify now? | IF | — | Created with a digits-only post ID |
| 24 | Stop: not published | Stop and Error | — | Rejected or uncertain; no retry |
| 25 | Lookup target | Set | — | Attempt, token, post ID for the lookup |
| 26 | Look up post on X | HTTP GET `https://api.x.com/2/tweets/{id}?tweet.fields=author_id,created_at,entities,text` | **PSL X Publishing** | Read-only; no redirects |
| 27 | Report lookup evidence | HTTP POST `/attempts/{id}/lookup` | **PSL X Queue** | Retries (idempotent) |
| 28 | Stop: lookup not recorded | Stop and Error | — | ID retained; read-only retry later |
| 29 | Done | No-Op | — | |

There are no LLM/AI nodes and no Code nodes. X URLs are fixed literals on
`api.x.com`; the only dynamic part is the digits-only post ID in the lookup.

## 5. What the server enforces

- **Claim** runs housekeeping (expire overdue approvals, release expired
  unpermitted leases, turn dispatched-past-deadline into uncertain), then
  returns at most one unit of work: a due approved post or a pending
  read-only lookup. Nothing due → `work: null` → no X calls.
- A manual run never publishes a future scheduled post early (due means
  scheduled time ≤ now < expiry). "Approve for next manual run" items are
  only served to `trigger: manual`.
- **Account check**: `GET /2/users/me` happens only after a due item is
  claimed. The ID must equal `"2094368418443280384"` exactly. A mismatch
  pauses the queue and nothing is sent.
- **Dispatch permit**: all checks repeated in one serialized transaction
  (approval hash, revision, text, account, due window, pause, daily cap
  counting permits already issued that Phoenix day, X rate-limit reset,
  lease). The attempt is durably marked dispatched before the text is
  returned. At most one permit per approved revision (unique index); a retry
  gets `already_issued` without the text.
- **Result**: 200/201 with a digits-only ID → created (ID saved before any
  lookup). 400/401/403/404/422/429 → rejected (recorded, rate-limit reset
  respected, no retry). Anything else, timeouts, or a success without an ID →
  **uncertain** → owner review. A late success with a real ID can resolve
  an uncertain attempt; conflicting receipts are flagged for review.
- **Lookup**: `published / lookup_confirmed` only when post ID, author ID,
  and text all match (t.co links expanded from URL entities). Failures keep
  the ID and retry read-only with backoff (5 attempts), then flag review.
  Provenance is labelled "X API response observed by the configured n8n
  workflow".
- Machine access **cannot** create, edit, or approve drafts, unpause, change
  settings, or clear uncertainty.

## 6. Dry run / isolated acceptance (no reachable X write)

`psl-x-publisher-dry-run.workflow.json` (21 nodes: 5 HTTP Request, all to
PSL; **0 X nodes; no OAuth2 credential**) replaces the three X calls with
Set nodes. It claims with `mode: dry_run`, which PSL serves only for TEST
items, only outside Vercel, and only with `X_PUBLISHING_DRY_RUN_ENABLED=true`.
Use it only against an isolated PSL instance with its own token and its own
disposable database. Queued (later) lookups are not simulated.

The repo also has an isolated harness that exercises the same PSL endpoints
end to end against the disposable test database, with network access
disabled: `npm run test:x-publishing-db` (see `scripts/test-x-publishing-db.ts`).

## 7. First live post (manual acceptance)

1. Owner runs the migration against Production and sets the three Vercel
   variables above, then redeploys.
2. In `/admin-social`: confirm "Live publishing enabled", the account ID, and
   resume dispatch.
3. Save a short draft, review it, tick the confirmations, and choose
   **Approve for next manual run** (valid 15 minutes).
4. In n8n click **Execute workflow** once. Expected path: Claim → account
   check → permit → Create Post → result → lookup → Done.
5. Check `/admin-social` (published, X link, lookup confirmed) and Mission
   Control (X publisher panel and `x_publishing` events).
6. If any step says a result was not recorded or the post is uncertain,
   **do not re-run**. Check @PSLLabspurity on X, then either queue a
   read-only lookup of the post ID or resolve as not created.

## 8. Future schedule (not enabled)

A later change may add a Schedule Trigger every 30 minutes (matching the
slots) and send `trigger: 'schedule'`. That is about 48 runs a day, roughly
1,440 executions a month (a planning count only; most runs end at "Nothing
due" with zero X calls). There is no Vercel posting cron.

## Turning it off

Unset `X_PUBLISHING_ENABLED` (live claims and permits return 503), or pause
in `/admin-social` (no new permits). Result and lookup reports are still
accepted so in-flight evidence is not lost. Unset `X_PUBLISHER_TOKEN` to
disable every machine endpoint.
