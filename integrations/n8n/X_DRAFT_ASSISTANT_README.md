# n8n → X draft assistant (proposes unapproved drafts)

`psl-x-draft-assistant.workflow.json` asks a model to propose up to five
educational X posts, using only a fixed set of approved PSL sources. PSL
validates every proposal server-side. Proposals that pass are saved as
**unapproved drafts** in the existing `/admin-social` queue, labelled
**AI-assisted — owner review required**.

**What a saved draft means, and what it does not.** Three separate states are
recorded, and none of them is verification or approval:

| State | Meaning | Not |
|---|---|---|
| **Source excerpt present** | The draft cites an allowlisted evidence source, and its quoted excerpt appears word-for-word in that source's approved packet text | Not a check that the post is accurate, or that the post's wording says the same thing as the excerpt |
| **Heuristic checks passed** | No keyword, number, link, credential, duplicate, or content rule blocked it | Not factual, legal, or regulatory verification |
| **Owner review still required** | The draft is `status = 'draft'`, unscheduled and unapproved | Nothing is approved, scheduled, or published until the owner does so in `/admin-social` |

- The workflow imports **inactive** and has a **Manual Trigger only**.
- It contains no credentials, credential IDs, tokens, or keys.
- **Status:** built for review. Not enabled in any environment, never run
  against a real model, and no drafts have been created.

## Flow

The run is triggered manually. There are no agents, loops, or rewrites:

1. **Request source packet.** n8n → `POST /api/integrations/n8n/x-drafts/packet`.
   PSL returns the fixed prompt, the strict output schema, and a signed
   `batchToken`.
2. **Generate candidates.** n8n → OpenAI Chat Completions
   (`POST https://api.openai.com/v1/chat/completions`, model `gpt-4o-mini`).
   This is one call. A second call is made only after a transient failure
   (see "Model retries").
3. **Check the response.** Only a single complete completion
   (`finish_reason: "stop"`, no refusal, non-empty content, returned model
   matching `gpt-4o-mini`) continues. Refused, truncated, or otherwise
   incomplete output stops the run, and nothing is submitted.
4. **Submit candidates.** n8n → `POST /api/integrations/n8n/x-drafts/batches`.
   PSL validates the output and inserts the passing candidates as new drafts.
   The response reports what was saved or blocked.
5. **Review.** The owner reviews in `/admin-social`: edit, approve, or cancel,
   exactly like any other draft.

Nothing in this workflow approves, schedules, or publishes. Approved posts
are published only by the separate X publisher (`X_PUBLISHER_README.md`).
The publisher only claims `approved` rows, so these drafts are never picked up
until the owner approves them.

## Permissions (enforced by PSL, not by the workflow)

| | Draft assistant |
|---|---|
| Token | `X_DRAFT_ASSISTANT_TOKEN`, its own. The server refuses to enable it if the value equals or is contained in `X_PUBLISHER_TOKEN`, `MISSION_CONTROL_N8N_TOKEN`, `ADMIN_PASSWORD`, `CRON_SECRET`, database URLs, or any other secret-like variable. The publisher token is rejected on these endpoints, and this token is rejected on the publisher's |
| Can | Fetch the fixed packet. Submit model output. PSL then inserts new rows with `status = 'draft'`, `revision = 1`, no schedule, `created_by = 'x-draft-assistant'`, using `INSERT … ON CONFLICT (id) DO NOTHING` |
| Cannot | Edit, approve, schedule, claim, cancel, pause or resume, publish, reconcile, or resolve anything. It cannot update or delete any row, touch `x_publishing_attempts` or `x_publishing_control`, or run arbitrary SQL. No request field can ask for those |
| Environment | Production writes live-partition drafts. Local or non-Vercel runs write **TEST** drafts, which never reach X. Preview deployments are refused, with no override. Queries, cookies, and plain HTTP (on Vercel) are refused. Rate limit: 6 requests per minute per endpoint |

The n8n side holds only two credentials: the PSL draft token and the OpenAI
project API key. It has no admin password, no database access, no X OAuth
credential, no B1 token, and no `X_PUBLISHER_TOKEN`.

## Approved sources (allowlist)

The model sees **only** these sources. The list is defined in
`lib/x-drafts/sources.ts`. Their exact text is committed in
`lib/x-drafts/source-snapshot.ts`, so the endpoint never reads other
repository files at runtime.

The first-run packet is deliberately narrow: documentation-workflow passages
only.

| Source ID | Kind | From | Included text |
|---|---|---|---|
| `science:how-to-read-a-coa` | evidence | `content/science/how-to-read-a-coa.mdx`, selected verbatim passages | Intro (report is for a specific sample and batch). "Locate the lot number" steps 1–3. "Open the original report": where reports are linked, and "open the original laboratory report" sentence. "Read the fields on the report": only the two "review only the fields on your report" sentences. "Scope of results": both paragraphs |
| `science:third-party-testing-explained` | evidence | `content/science/third-party-testing-explained.mdx`, selected verbatim passages | Intro (original third-party report). "What “original report” means". "Find your report on PSL" steps 1–4 and the support line. "Verify with the testing laboratory" (lead-in, steps 1–3, what verification confirms). The scope sentence under "What to record". "Results apply only to the tested batch" |
| `statement:testing-scope` | evidence | `lib/content/testing-scope.ts` `TESTING_SCOPE_STATEMENT` | Canonical testing-scope statement |
| `guidance:claims-rules` | guidance (never citable) | `ops-knowledge/compliance/claims-rules.md`: only the "Research-use / FDA framing (live)" and "Testing-scope claim limit (live)" sections | Rules only |
| `guidance:prohibited-content` | guidance (never citable) | `ops-knowledge/compliance/prohibited-content.md`: only the public-output sections | Rules only |

**How passages are selected.**
- Each passage is listed word-for-word in `lib/x-drafts/sources.ts` together
  with the section heading it belongs to.
- The snapshot builder refuses to run if any passage is not found verbatim in
  that section of the published article, or is out of order.
- Section headings are kept for context. Omitted article text appears as
  `[…]`. The prompt tells the model never to quote across `[…]` or guess what
  it hides, and PSL blocks any excerpt that contains it.
- The underlying articles are not edited. Nothing is added from model memory.

**Deliberately excluded:**
- The seven analytical-guide entries (`guide:*`). Their titles and
  descriptions only identify a topic; they are not the guides' substantive
  explanations. A candidate that cites any `guide:*` ID is blocked as an
  unrecognized source.
- The "Read the fields on the report" example list: the compound name, batch
  name, task number, and strength examples.
- The "PSL documentation workflow" and "What to record" lists, the
  Janoshik verification-button sentence in the COA article, the article
  titles and descriptions, and publication dates.
- The storage guide.
- The legacy "structure/function" claims list, and the draft brand voice.
- Support knowledge.
- All customer messages, orders, and support threads.
- Old chats, and every other repository file.

Because the packet contains no product names and no numbers other than step
numbering, a candidate that names a product or compound, or uses a value such
as a historical task number, is blocked. The one laboratory name left in the
evidence is in the verification lead-in ("Janoshik reports include a
verification key on the document"). It is kept verbatim for context and still
raises a `names_laboratory` review warning when a post uses it.

**To change the list:**
1. Edit `lib/x-drafts/sources.ts`.
2. Run `npm run x-drafts:snapshot`.
3. Review the text diff in `source-snapshot.ts` and commit both.

`npm run test:x-drafts` fails while the snapshot is stale. Any change to the
sources, prompt, or content-policy version changes the packet version, and
PSL then refuses batches issued before the change (409).

**Prompt handling:**
- Source text is placed in `<source>` blocks. The system prompt states that
  this text is evidence, never instructions.
- Recent queue text is included only so the model avoids repeats. It is
  neutralized so it cannot open or close a block.

## What PSL checks on every candidate

These are heuristics, as the table heading says. **Passing them does not
establish that a post is accurate or legally compliant.** They keep clearly
unsupported or restricted text out of the queue and flag the rest for the
owner. Every saved draft still needs owner review.

| Result | Checks |
|---|---|
| **Refused whole batch** (HTTP 422, nothing stored) | Any submission whose `stopReason` is not `stop`: a refusal, truncation (`length`), `content_filter`, any other finish reason, or none. The workflow never submits these; PSL refuses them anyway |
| **Blocked** (never stored) | Malformed or unparsable output. More than 5 candidates (the extras). A source ID that is not on the list, including the removed `guide:*` IDs. Citing guidance as evidence. No evidence source. An excerpt that is missing, too short or long, not from a cited source, crosses an omission (`[…]`), or is not verbatim in that source (markdown and whitespace are ignored). No purpose. A product or compound name that the cited evidence does not contain. Any `checkPostText` error: human use, dosing, treat/cure, weight loss, drug comparison, "you will…", length, mentions, link rules, and so on. A number not present in the cited evidence, including years and dates. A link that is not a cited source's page. Engagement bait. Testimonials or claims about customer behaviour. Sales or discount language. "We/PSL test…" and "our lab" claims. Credentials, accreditations, or test methods (ISO, GMP, PhD, scientists, NMR, endotoxin, …) that the cited evidence does not contain. An exact duplicate of any queue post in the same partition (any status, including published or cancelled) or of another item in the batch. The daily cap |
| **Saved with review warnings** | `checkPostText` warnings (the same per-warning acknowledgement is still required at approval). Near-duplicates (word overlap ≥ 60 % with a recent queue post or another item). Any number. Named products or compounds (only if the cited evidence names them). Named laboratories. Hashtags. The model's own warnings |

**Provenance stored with each draft** (`source_refs`, internal, never posted):
1. The label "AI-assisted draft (x-draft-assistant): source excerpt present;
   heuristic checks passed; owner review required — not verified, not
   approved.", then batch ID, item number, packet version, and model.
2. Purpose (the reader question).
3. Source IDs with their URL or origin.
4. The excerpt, as quoted.
5. Review warnings, labelled as automated heuristics, not a factual or legal
   review.

`/admin-social` shows an **AI-assisted — owner review required** badge and,
above the provenance list, the three states separately: source excerpt
present (not a factual check), heuristic checks passed (not factual, legal,
or regulatory verification), and owner review still required (not approved,
nothing scheduled). Editing the draft keeps the provenance.

## Server settings (Vercel)

No migration is needed. Drafts use the existing `x_publishing_posts` table.

| Variable | Value |
|---|---|
| `X_DRAFT_ASSISTANT_ENABLED` | `true` only when you want to run it (default off) |
| `X_DRAFT_ASSISTANT_TOKEN` | New random value, at least 32 characters, different from every other secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

- It also requires the existing `X_EXPECTED_ACCOUNT_ID`, which decides the
  partition in the same way `/admin-social` does.
- Set these in **Production scope only**, and redeploy.
- Do not set them in Preview.
- `X_PUBLISHING_ENABLED` is not needed and is unaffected.

## n8n credentials

| Credential | Type | Used by |
|---|---|---|
| `PSL X Drafts` | Header Auth. Name `Authorization`, Value `Bearer <X_DRAFT_ASSISTANT_TOKEN>` | Request source packet, Submit candidates |
| `PSL X Draft Model — OpenAI` | Header Auth. Name `Authorization`, Value `Bearer <OpenAI project API key>` | Model call (attempt 1), Model call (attempt 2) only |

- The two model-call nodes are the same request. The second runs only after
  a transient failure of the first. No other node may use the OpenAI
  credential, and the OpenAI key must never be attached to the PSL nodes.
- The exported JSON contains no credentials or credential IDs. Bind them after
  import.
- Never attach `PSL X Queue`, `PSL X Publishing`, or `PSL Mission Control n8n`
  to this workflow.
- Never attach these two credentials to the publisher. The scheduled X
  publisher and its credentials are unchanged.

## Model / provider

- **Provider:** OpenAI Chat Completions,
  `POST https://api.openai.com/v1/chat/completions`, called from plain HTTP
  Request nodes. There are no AI Agent, LangChain, OpenAI, or Code nodes, so
  there are no tools and no recursion.
- **Model:** `gpt-4o-mini`, preconfigured in `Config.modelId`. There is no
  fallback model: if OpenAI reports a different model in the response, the
  run stops and nothing is submitted.
- **Request:**

  | Field | Value |
  |---|---|
  | `model` | `Config.modelId` (`gpt-4o-mini`) |
  | `messages` | `system` = the packet's system prompt; `user` = the packet's user prompt |
  | `max_completion_tokens` | `Config.maxCompletionTokens` (2000; **Config valid?** allows 256 to 4000) |
  | `n` | `1` (one completion per request) |
  | `stream` | `false` |
  | `store` | `false` (the completion is not stored by OpenAI for later retrieval) |
  | `temperature` | `0.3` |
  | `response_format` | `{ "type": "json_schema", "json_schema": <packet outputSchema> }`, strict Structured Outputs |

- **Output schema:** PSL issues it in the packet (`outputSchema`, defined in
  `lib/x-drafts/packet.ts`). It is the existing candidates contract in strict
  mode: every field is required, no additional properties are allowed, and
  `sourceIds` / `excerpt.sourceId` may only be the evidence source IDs.
  **Packet issued?** refuses a packet without a strict schema. The schema is
  part of the packet version, so changing it invalidates older batches. PSL
  still validates everything that is submitted; the schema does not replace
  those checks.
- **Response handling** (in the workflow; the same rules are in
  `lib/x-drafts/openai.ts` and compared in tests):

  | OpenAI field | Use |
  |---|---|
  | `choices` | Exactly one choice is required |
  | `choices[0].message.refusal` | If present: run stops, nothing submitted |
  | `choices[0].finish_reason` | Must be `stop`. `length` (truncated), `content_filter`, or anything else: run stops, nothing submitted |
  | `choices[0].message.content` | Becomes `modelOutput` (must be non-empty, at most 20,000 characters) |
  | `model` | Becomes `model`; must start with `Config.modelId` |
  | `usage.prompt_tokens`, `usage.completion_tokens` | Become `usage.inputTokens`, `usage.outputTokens` |

  PSL additionally refuses (HTTP 422) any submission whose `stopReason` is not
  `stop`, so a refused or incomplete completion cannot become a draft even if
  it were submitted.

### Model retries

At most **two model HTTP attempts** per execution. n8n's built-in retry is
off on both model nodes. The second attempt is a separate node reached only
through **Retry model call?**, and nothing leads back to either model node.

| Attempt-1 outcome | Retried once? |
|---|---|
| Timeout, connection failure, or an unreadable response body | Yes |
| HTTP 408, 500, 502, 503, 504 | Yes |
| HTTP 429 `rate_limit_exceeded` (request or token rate limit) | Yes, after the `Retry-After` delay (5–30 s; default 10 s) |
| HTTP 429 `insufficient_quota`, `credit_balance_exhausted`, `project_spend_limit_exceeded`, `organization_spend_limit_exceeded`, `organization_usage_limit_exceeded`, or any other 429 | **No** |
| HTTP 401 (authentication), 403, 400, 404, or other 4xx | **No** |
| HTTP 200 (including refusals and truncation) | **No** |

If attempt 2 fails for any reason, the run stops with nothing saved.

A timed-out request may still have been processed and billed by OpenAI. The
retry can therefore cost a second call. The two-attempt maximum bounds this.

### OpenAI project spending controls (set up before the first run)

1. **Dedicated project.** In the OpenAI platform, create a dedicated,
   non-default OpenAI project used only by this workflow, for example
   `psl-x-draft-assistant`. Do not use the Default project.
2. **Project API key.** Create the key in that project (project settings →
   API keys), and use it only in the `PSL X Draft Model — OpenAI` credential.
   If the key you already created belongs to another project, create a new one
   here instead. Restricting the key's permissions to the model endpoints is
   optional hardening.
3. **Model allowlist (optional).** In the project's Limits, allow only
   `gpt-4o-mini`.
4. **Enforced monthly hard limit.** In the project's Limits, set a
   **monthly spend limit** and turn on **Enforce a hard limit**. Once tracked
   spend reaches it, OpenAI rejects the project's requests with HTTP 429
   `project_spend_limit_exceeded`. The workflow does not retry that error. The
   organization's own limits still apply.
5. **Alerts are not a limit.** Spend alerts (notification thresholds) only
   notify: requests continue after an alert fires. A monthly spend limit that
   is **not** enforced as a hard limit is also just an alert. Only the
   enforced hard limit stops traffic.
6. **Enforcement delay.** Enforcement is not instantaneous. OpenAI can
   process a small amount of extra usage while the limit propagates, so
   recorded spend can slightly exceed the configured amount. Set the hard
   limit with that margin in mind.

Spend limits apply to the project and the organization, not on individual API
keys. There is no per-key spend limit to configure.

## Cost controls

| Control | Where | Limit |
|---|---|---|
| Trigger | n8n | Manual only; no schedule |
| Model calls per run | n8n | 1, plus at most 1 retry, and only for transient failures; no loop back to either model node |
| Output size | n8n Config → request | `max_completion_tokens` = `Config.maxCompletionTokens` (2000); **Config valid?** refuses values above 4000 |
| Candidates | PSL | At most 5 considered per batch |
| Drafts per day | PSL | 10 assistant drafts per Phoenix day per partition, counted under the queue lock. When reached, the **packet is refused**, so the model is not called |
| Request rate | PSL | 6 per minute per endpoint |
| Model output accepted | PSL | 20,000 characters |
| Spend ceiling | OpenAI, dedicated project | The project's **enforced** monthly hard limit (alerts alone do not stop requests) |

**The 10-drafts cap is not a spending limit.**
- PSL's cap counts drafts **saved** to the queue. PSL cannot see or limit
  what the provider charges.
- It stops model calls only indirectly: once 10 drafts are saved that day, the
  packet is refused and n8n never calls the model.
- Below the cap, every run costs one or two model calls, even if every
  candidate is blocked, refused, or truncated and nothing is saved.
- Model spending is bounded only by the manual trigger, the two-attempt
  maximum per run, `max_completion_tokens`, the request rate limit, and the
  OpenAI project's enforced hard limit.

**Estimating the cost of a run:**
- **Input:** about 8,900 characters with an empty queue and about 13,200 with
  15 full-length recent posts (system prompt plus user prompt). The strict
  schema is sent too. That is roughly 2,300–3,500 prompt tokens. This is an
  estimate; OpenAI reports actual usage, and the submission records it as
  `usage`.
- **Worst-case cost per run** is
  `2 × (prompt_tokens × input_price + max_completion_tokens × output_price)`,
  using the current `gpt-4o-mini` prices from OpenAI's pricing page.
- A normal run is one call, and output is usually well under
  `max_completion_tokens`.

Repeated manual runs below the draft cap are limited only by the rate limit
and the project's enforced hard limit.

## Import and bind

1. **Workflows → Import from File** → `psl-x-draft-assistant.workflow.json`.
   It imports inactive. Do not add a Schedule trigger.
2. **Config**:
   - `pslBaseUrl`: the Production HTTPS origin (no path).
   - `modelId`: preconfigured as `gpt-4o-mini`; leave it.
   - `maxCompletionTokens`: preconfigured as 2000 (allowed: 256 to 4000).
3. Bind `PSL X Drafts` on **Request source packet** and **Submit candidates**.
   Bind `PSL X Draft Model — OpenAI` on **Model call (attempt 1)** and
   **Model call (attempt 2)** only.

### Nodes (21 total: 4 HTTP Request, 6 IF, 5 Stop and Error, 1 Set, 1 Wait, 2 No-Op, 1 Manual Trigger, 1 Sticky Note)

| # | Node | Type | Credential | Notes |
|---|---|---|---|---|
| 1 | Setup notes | Sticky Note | — | |
| 2 | Manual Trigger | Manual Trigger | — | Only trigger |
| 3 | Config | Set | — | `pslBaseUrl`, `modelId` = `gpt-4o-mini`, `maxCompletionTokens` = 2000 |
| 4 | Config valid? | IF | — | HTTPS origin, model ID set, 256 ≤ maxCompletionTokens ≤ 4000 |
| 5 | Stop: invalid config | Stop and Error | — | No request made |
| 6 | Request source packet | HTTP POST `/x-drafts/packet` | **PSL X Drafts** | No retry; no redirects |
| 7 | Stop: no source packet | Stop and Error | — | Disabled, unauthorized, capped, or unexpected response. No model call |
| 8 | Packet issued? | IF | — | Token, prompt, and strict output schema present, cap = 5 |
| 9 | Model call (attempt 1) | HTTP POST `https://api.openai.com/v1/chat/completions` | **PSL X Draft Model — OpenAI** | No built-in retry; returns status and body; 120 s timeout; no redirects |
| 10 | Retry model call? | IF | — | True only for transient failures (see "Model retries") |
| 11 | Wait before retry | Wait | — | `Retry-After`, bounded to 5–30 s (default 10 s) |
| 12 | Model call (attempt 2) | HTTP POST `https://api.openai.com/v1/chat/completions` | **PSL X Draft Model — OpenAI** | Same request; no further retry |
| 13 | Model response OK? | IF | — | HTTP 200 with a JSON body |
| 14 | Stop: model call failed | Stop and Error | — | Shows HTTP status and OpenAI error code. Nothing saved |
| 15 | Model output usable? | IF | — | One choice, no refusal, `finish_reason` = `stop`, returned model matches, content present and ≤ 20,000 characters |
| 16 | Stop: model output not usable | Stop and Error | — | Refused, truncated, filtered, or unexpected. Nothing submitted or saved |
| 17 | Submit candidates | HTTP POST `/x-drafts/batches` | **PSL X Drafts** | Retries allowed (idempotent per batch) |
| 18 | Stop: submission not confirmed | Stop and Error | — | Some drafts may exist; check `/admin-social` |
| 19 | Any drafts saved? | IF | — | `saved + alreadySaved > 0` |
| 20 | Drafts saved - review in /admin-social | No-Op | — | Output shows saved, blocked, and reasons |
| 21 | Nothing saved - see blocked reasons | No-Op | — | |

## Retry safety

- Each candidate's queue ID is derived from the server-issued batch ID and
  its item number.
- Re-submitting the same batch (for example, n8n retrying the submission)
  inserts nothing new and reports those items as `alreadySaved`.
- If the same batch item arrives with different text, it is reported as
  `batch_item_conflict` and the existing row is not changed.
- Batches expire after 3 hours, and are tied to the partition they were
  issued for.
- Re-running the whole workflow is a new batch and a new model call. Exact
  duplicates are still blocked.

## First batch (owner, after reviewing this change)

1. Review the source passages in `lib/x-drafts/source-snapshot.ts`.
2. Make sure your OpenAI key belongs to a dedicated, non-default project whose
   monthly spend limit is **enforced as a hard limit** (see "OpenAI project
   spending controls"). Paste the key only into the n8n credential, never into
   chat, the repository, or Vercel.
3. Set the two Vercel variables (Production), redeploy, and create the two
   n8n credentials.
4. Import, set Config, bind credentials, and click **Execute workflow**
   once.
5. Read the Submit node's output (saved, blocked, and reasons). Then review
   each draft in `/admin-social`. Compare the post with the cited source, not
   only with the excerpt: a present excerpt shows where wording came from and
   does not mean the post is accurate. Then edit, approve, or cancel.

**Manual-only pilot.** Generation stays manual for this pilot. Adding a
schedule is out of scope and would need its own reviewed change.

## Tests

| Command | Kind | What it proves |
|---|---|---|
| `npm run test:x-drafts` | **Mocked.** Recording fake SQL, no database, no model, no network | Snapshot matches the allowlisted files. Source hygiene. Token separation and config gates. Batch-token signing. Prompt framing and injection resistance. Every validator rule. Handler gate order, including 422 for any `stopReason` other than `stop`. The only write is one draft `INSERT … ON CONFLICT (id) DO NOTHING` under the queue lock, with no attempts, control, or approval access. Counts-only event. Strict output schema. **OpenAI provider responses:** the workflow's own n8n expressions are evaluated against OpenAI fixtures (complete, refusal, truncated, content filter, other endings, wrong model, 401/403/400, every quota and spend-limit 429, rate-limit 429, 408/5xx, transport errors). Their routing and submission must match `lib/x-drafts/openai.ts`, and a complete completion is carried end-to-end into an unapproved draft. Static workflow checks (only the OpenAI endpoint and fields, two model nodes, no loop) and README counts |
| `npm run test:x-drafts-db` | **Real database.** Disposable Neon DB only (`X_DRAFTS_DB_TEST=1`, `N8N_TEST_DATABASE_URL`); model output is a fixture | Drafts inserted as unapproved TEST rows. Replay creates nothing. A conflicting item is not overwritten. Exact duplicate blocked and near-duplicate flagged. An approved post is untouched and its text cannot be re-proposed. Daily cap in SQL, and the packet is refused at the cap. Live and TEST partitions are separate. `/admin-social` lists the drafts. Events deduplicated. No attempts. Control untouched. Cleanup verified. Refuses application databases and databases with business tables; network guarded |
| `npm run test:x-drafts-live-model` | **Live model.** Opt-in (`X_DRAFTS_LIVE_MODEL_TEST=1`, `OPENAI_API_KEY` from the dedicated project, local environment only); **spends OpenAI credit** | Sends the real prompt and strict schema to `gpt-4o-mini` once (no retry), applies the same response rules as the workflow, validates the reply, and prints what would be saved or blocked. The database client throws, so nothing is written. **Not run as part of this change** |

## Turning it off

- Unset `X_DRAFT_ASSISTANT_ENABLED`: both endpoints return 503.
- Or unset `X_DRAFT_ASSISTANT_TOKEN`.
- Or revoke the OpenAI project API key.

Existing drafts stay in `/admin-social` until the owner edits or cancels them.

## Limitations

- These checks are keyword and source-matching heuristics. They cannot judge
  tone, context, or whether a paraphrase changes meaning.
- A present excerpt proves only that the quoted words are in the cited
  passage. The post around it can still misstate, overgeneralize, or change
  the meaning of the source.
- Only evidence text that is on the list is checked. A true statement from
  outside the list is blocked, not verified.
- The near-duplicate threshold is approximate.
- Model output varies from run to run. The owner is the reviewer of record.
