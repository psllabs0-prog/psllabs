# n8n → X approved publishing (B2)

The X publisher posts **owner-approved** original text posts to
**@PSLLabspurity** (X user ID `"2094368418443280384"`, always a string).
Two exports are kept here. Neither contains credentials, credential IDs,
tokens, or account IDs:

| File | What it is |
|---|---|
| `PSL_X_Publisher_Scheduled.workflow.json` | The owner's export of the publisher **running in n8n**: Manual Trigger **and** a Schedule Trigger at :00 and :30 (America/Phoenix). Committed unchanged as the record of the production workflow. See [section 8](#8-scheduled-publisher-running-in-n8n) |
| `psl-x-publisher.workflow.json` | The original manual-only workflow (sections 3–7). It is the reference that the scheduled export was built from, and a manual fallback |

Both files import **inactive**. The running n8n copy is the live one. Do not
re-import either file over it.

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

The same command also creates the two documentation-autopilot tables
(`x_publishing_autopilot_authorizations`, `x_publishing_autopilot_slots`;
additive, no rows, no change to existing tables). Until they exist, owner
publishing works as before and the autopilot shows as unavailable. See
[section 9](#9-documentation-autopilot-standing-policy).

## 3. Credentials in n8n

| Credential | Type | Used by |
|---|---|---|
| `PSL X Queue` | Header Auth. Name `Authorization`, Value `Bearer <X_PUBLISHER_TOKEN>` | the 5 PSL HTTP nodes |
| `PSL X Publishing` | Generic OAuth2 (already connected; `GET /2/users/me` returned @PSLLabspurity) | the 3 X HTTP nodes |

Do not reuse `PSL Mission Control n8n` (B1) here, and do not use
`PSL X Queue` in the B1 workflow.

## 4. Import and bind

1. **Workflows → Import from File** → `psl-x-publisher.workflow.json`. It
   imports inactive with a Manual Trigger only. (Its sticky note predates the
   schedule. The scheduled version is a separate workflow; see section 8.
   Do not add a trigger to this one, and do not run two scheduled
   publishers.)
2. Open **Config** and set `pslBaseUrl` to the Production HTTPS origin (no
   path, no trailing slash). The **Config valid?** node stops the run
   otherwise.
3. Bind credentials node by node (table below). A PSL node without
   `PSL X Queue` fails with 401 and stops the run before any X call.

### Nodes (32 total: 8 HTTP Request, 8 IF, 9 Stop and Error, 3 Set, 2 No-Op, 1 Manual Trigger, 1 Sticky Note)

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
| 20 | **Create Post on X** | HTTP POST `https://api.x.com/2/tweets` | **PSL X Publishing** | Body `{ text }` only. **Retry On Fail OFF**. Timeout → error branch → evidence without an HTTP status |
| 21 | Create response evidence | Set | — | Keeps X's HTTP status, post ID, error title, and rate-limit reset for the report and every later message |
| 22 | Report create result | HTTP POST `/attempts/{id}/result` | **PSL X Queue** | Retries (idempotent). If PSL still does not confirm → outcome unknown |
| 23 | Verify now? | IF | — | PSL recorded *created* with a digits-only post ID |
| 24 | Rejected by X? | IF | — | PSL recorded a **confirmed** X rejection (`rejected`, no retry, not flagged) |
| 25 | Stop: X rejected the post (confirmed) | Stop and Error | — | X answered with a rejection; not posted. No automatic retry |
| 26 | Stop: outcome unknown (review required) | Stop and Error | — | Timeout, missing ID, flagged receipt, or PSL did not acknowledge the report. **The post may exist.** Message includes X's HTTP status, any post ID, and the attempt ID. Do not re-run |
| 27 | Lookup target | Set | — | Attempt, token, post ID for the lookup |
| 28 | Look up post on X | HTTP GET `https://api.x.com/2/tweets/{id}?tweet.fields=author_id,created_at,entities,text` | **PSL X Publishing** | Read-only; no redirects |
| 29 | Report lookup evidence | HTTP POST `/attempts/{id}/lookup` | **PSL X Queue** | Retries (idempotent). If PSL does not confirm → lookup not confirmed |
| 30 | Verified? | IF | — | PSL recorded `published` (lookup confirmed) |
| 31 | Stop: created on X (ID recorded), lookup not confirmed | Stop and Error | — | Not a failed post. ID retained and shown; read-only retry later or owner review. Never posts again |
| 32 | Published and verified | No-Op | — | |

### What each ending means

| Ending | Meaning | Owner action |
|---|---|---|
| Stop: X rejected the post (confirmed) | X returned a rejection (400/401/403/404/422/429) and PSL recorded it | Fix, edit, and re-approve if wanted |
| Stop: outcome unknown (review required) | Confirmation not received, or X's answer was not conclusive. The post may or may not exist | **Do not re-run.** Check @PSLLabspurity, then reconcile in `/admin-social` |
| Stop: created on X (ID recorded), lookup not confirmed | X returned a post ID; read-only verification has not confirmed it yet | Nothing, or open the ID on X. PSL retries the lookup read-only |
| Published and verified | Lookup confirmed ID, author, and text | None |

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
- **Daily cap: two Create Post dispatch attempts per Phoenix calendar day**,
  shared by owner approvals and the autopilot (`lib/x-publishing/capacity.ts`
  is the one definition used by approval, claim, and permit). Approval
  reserves a slot on its Phoenix day (pending reservations plus permits
  already issued that day must stay under two); a claim needs room among
  permits plus in-flight claims; the permit itself counts only permits
  issued that day. An issued permit stays counted even if its outcome is
  rejected or unknown. "Approve for next manual run" is refused if its
  15-minute window would cross Phoenix midnight. A refused approval names the
  Phoenix date, its usage, and the items holding it.
- **Dispatch permit**: all checks repeated in one serialized transaction
  (approval hash, revision, text, account, due window, pause, daily cap
  counting permits already issued that Phoenix day, X rate-limit reset,
  lease, and for autopilot posts the active standing-policy authorization). The attempt is durably marked dispatched before the text is
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
- **Overdue dispatch without another run.** Once an attempt's dispatch
  deadline passes with no result recorded, `/admin-social` and Mission
  Control show it as **Outcome unknown — owner review required** on the next
  page load, derived from that attempt's deadline and receipts. Page loads
  are read-only and never issue a permit or retry. The owner's reconcile and
  "resolve as not created" actions accept such an attempt directly (they
  record the uncertain state first in the same transaction). A candidate post
  ID still needs a later run so n8n can do the read-only lookup; "resolve as
  not created" needs no run. A late confirmed receipt still resolves the
  attempt, and a confirmed result is never downgraded because it is old.
- **Counts are exact.** Mission Control and `/admin-social` count every live
  item in the database (TEST items separately). Unresolved items are listed
  oldest first in their own section and are never pushed out by newer drafts
  or history; long lists are paged and show "Showing a–b of total".

## 6. Dry run / isolated acceptance (no reachable X write)

`psl-x-publisher-dry-run.workflow.json` (27 nodes: 5 HTTP Request, all to
PSL; **0 X nodes; no OAuth2 credential**) replaces the three X calls with
Set nodes and ends with the same four outcomes as the live workflow. It claims with `mode: dry_run`, which PSL serves only for TEST
items, only outside Vercel, and only with `X_PUBLISHING_DRY_RUN_ENABLED=true`.
Use it only against an isolated PSL instance with its own token and its own
disposable database. Queued (later) lookups are not simulated.

The repo also has an isolated harness that exercises the same PSL endpoints
end to end against the disposable test database, with network access
disabled: `npm run test:x-publishing-db` (see `scripts/test-x-publishing-db.ts`).

## 7. First live post (manual acceptance)

This acceptance has been completed: a manual run published to X. The steps
are kept for reference and for re-acceptance after major changes.

1. Owner runs the migration against Production and sets the three Vercel
   variables above, then redeploys.
2. In `/admin-social`: confirm "Live publishing enabled", the account ID, and
   resume dispatch.
3. Save a short draft, review it, tick the confirmations, and choose
   **Approve for next manual run** (valid 15 minutes).
4. In n8n click **Execute workflow** once. Expected path: Claim → account
   check → permit → Create Post → result → lookup → Published and verified.
5. Check `/admin-social` (published, X link, lookup confirmed) and Mission
   Control (X publisher panel and `x_publishing` events).
6. If the run ends at **outcome unknown**, **do not re-run**. Check
   @PSLLabspurity on X, then either reconcile with the post ID you found (a
   later run does the read-only lookup) or resolve as not created. If it ends
   at **created on X, lookup not confirmed**, the post ID is recorded; do not
   post again.

## 8. Scheduled publisher (running in n8n)

Source: `PSL_X_Publisher_Scheduled.workflow.json`, the owner's export of the
workflow that runs in n8n, committed byte for byte. Everything below is read
from that file. The running n8n copy is authoritative. Do not overwrite it
by re-importing, and change it only in n8n (then re-export here).

- **Name:** "PSL X publisher - scheduled + manual (Phoenix)". The export has
  `"active": false`. n8n always writes that into exports, and it does **not**
  mean the running copy is off.
- **Workflow settings:** `executionOrder: v1`, `timezone: America/Phoenix`.
- **Triggers:** a Manual Trigger, and a Schedule Trigger with cron
  expression `0,30 * * * *`. That runs at :00 and :30 every hour in the
  workflow time zone (Phoenix; no DST). This is 48 timer executions a day,
  about 1,440 per 30 days. Manual runs and other workflows are extra.
- **Run labelling:** each trigger goes to its own Set node before **Config**:
  - *Manual run type* sets `runTrigger = "manual"`.
  - *Scheduled run type* sets `runTrigger = "schedule"`.
  - **Config** carries `runTrigger` and sets `pslBaseUrl` to
    `https://www.psllabs.org`.
  - **Config valid?** also requires `runTrigger` to be `manual` or
    `schedule`.
  - **Claim work** sends `mode: 'live'` with
    `trigger: $('Config').first().json.runTrigger`.
- **Everything from Claim work onward is unchanged** from
  `psl-x-publisher.workflow.json`: the same nodes, parameters, connections,
  and retry settings. In particular, Create Post never retries, and permit and
  claim requests are not retried. Only the sticky note, **Config**,
  **Config valid?**, **Stop: invalid config** (its message), and the claim
  body differ.
- **Credentials:** the same two, selected in n8n on the 8 HTTP nodes:
  - **PSL X Queue** (Header Auth) on Claim work, Report account check, Request
    dispatch permit, Report create result, and Report lookup evidence.
  - **PSL X Publishing** (generic OAuth2) on Get authenticated X account,
    Create Post on X, and Look up post on X.

### Scheduled nodes (35 total: 8 HTTP Request, 8 IF, 9 Stop and Error, 5 Set, 2 No-Op, 1 Manual Trigger, 1 Schedule Trigger, 1 Sticky Note)

These are the 32 manual-workflow nodes plus three: Schedule Trigger, Manual
run type, and Scheduled run type.

### What the timer does and does not do

- Each run claims at most one unit of work under the server rules in section
  5. Most runs find nothing due and end at "Nothing due (no X calls)" with
  zero X API calls.
- **Server behaviour by trigger:**
  - A scheduled run (`trigger: schedule`) publishes only approved posts whose
    scheduled slot is due.
  - "Approve for next manual run" items are served only to
    `trigger: manual`.
  - Pause, approval, account, and daily-cap checks all stay on PSL.
- The timer checks the queue. n8n never creates, edits, or approves
  content. Proposed drafts from the draft assistant
  (`X_DRAFT_ASSISTANT_README.md`) are unapproved and are never claimed.
  If the owner has turned on the documentation autopilot (section 9), PSL
  itself may add one reviewed library post during a scheduled claim inside
  the 09:00 or 17:00 window; the workflow is unchanged.
- **Operating rules** (from the export's setup note):
  - Keep exactly one scheduled publisher.
  - Do not replay old executions, pin response data, or run Create Post by
    itself.
  - "Outcome unknown" means review, never a blind repost.
  - To change the workflow:
    1. Pause new dispatches in `/admin-social`.
    2. Import the change as a **new** workflow and attach the credentials.
    3. Unpublish the old workflow before publishing the new one.
    4. Check the first automatic execution with nothing due.

There is no Vercel posting cron.

## 9. Documentation autopilot (standing policy)

Default **off**. When the owner turns it on in `/admin-social`, PSL may
publish up to two documentation posts a day **without a per-post approval**,
under a standing authorization of one exact policy and content-library
version. No n8n change: it runs inside the existing scheduled claim, and
the single schedule stays the only publisher.

- **Policy** (`lib/x-publishing/autopilot/policy.ts`, id
  `psl-x-documentation-autopilot`, version 1): @PSLLabspurity
  (`"2094368418443280384"`), America/Phoenix, windows 09:00 and 17:00, each
  open 60 minutes (the existing publication window). At most one post per
  window, one per workflow run, and the shared two-per-day cap. No catch-up,
  no retry of an uncertain Create Post, and no automatic slot while any item
  needs owner review, the queue is paused, or an X rate limit is active.
- **Content** (`lib/x-publishing/autopilot/library.ts`): a fixed library of
  complete, reviewed post texts, each with its source ID, verbatim source
  excerpt, purpose, and limitations. Selection is deterministic (first
  eligible template in library order). No model output, draft, or free-form
  text is ever published automatically; the server supplies the exact text.
  Each template passes the normal content checks with no warnings; nothing is
  acknowledged on its behalf.
- **Authorization**: turning it on records the policy ID, version and hash,
  the library version, a hash per template (text, sources, excerpt, context,
  content-policy version, and the cited source texts), the owner actor, time,
  and a statement that posts are authorized by standing policy and not
  individually reviewed. Each automatic post records its template, hashes,
  selected text, slot, authorization, and the actor `x-autopilot`; it never
  claims owner review.
- **Invalidation**: a changed template or cited source makes only that
  template ineligible until the owner authorizes the new library version; a
  policy change stops the autopilot entirely. The permit re-checks the active
  authorization, so a change after scheduling withdraws the post
  (`autopilot_authorization_invalid`) instead of sending it.
- **Reuse and duplicates**: a template whose permit was issued is never used
  again, whatever the outcome. Exact duplicates of active or published posts
  are refused, and near-duplicates (word overlap ≥ 0.6) are skipped. When no
  eligible template remains, the slot is skipped and the shortfall reported;
  nothing is generated to fill it.
- **Idempotency**: each slot has a deterministic key
  (`psl-x-documentation-autopilot:<Phoenix date>T<window>`). The :00 and :30
  checks in the same window never add a second post; a skipped slot can still
  be decided later in its window (for example after a resume).
- **Off switch**: "Turn autopilot off" (or authorizing a new version)
  withdraws pending automatic posts and blocks their permits. Global Pause
  still blocks every dispatch. Owner approvals are unaffected.
- **Visibility**: `/admin-social` shows the mode, policy version, library
  review, remaining templates, next slots, decisions, skips, and
  uncertainties; Mission Control's X publisher panel shows a summary. Page
  loads are read-only.

### One-time activation (owner)

1. Review and merge the PR; deploy Production.
2. Run `npm run migrate-x-publishing` against the Production database
   (additive: creates the two autopilot tables only).
3. In `/admin-social` → **Documentation autopilot**, read every template in
   the library review. Tick the three confirmations and choose
   **Turn on autopilot with this policy and library**.
4. The queue must be resumed and `X_PUBLISHING_ENABLED=true` for anything
   to be sent (both unchanged by this feature). The next 09:00 or 17:00
   scheduled check then authorizes one post.

## Turning it off

- Unset `X_PUBLISHING_ENABLED`: live claims and permits return 503.
- Or pause in `/admin-social`: no new permits.
- To stop only automatic posts: **Turn autopilot off** in `/admin-social`.
- Or deactivate (unpublish) the scheduled workflow in n8n.

Result and lookup reports are still accepted so in-flight evidence is not
lost. Unset `X_PUBLISHER_TOKEN` to disable every machine endpoint.
