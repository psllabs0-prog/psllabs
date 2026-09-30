# n8n → X draft assistant (proposes unapproved drafts)

`psl-x-draft-assistant.workflow.json` asks a model to propose up to five
educational X posts, using only a fixed set of approved PSL sources. PSL
validates every proposal server-side. Proposals that pass are saved as
**unapproved drafts** in the existing `/admin-social` queue, labelled
**AI-assisted — owner review required**.

- The workflow imports **inactive** and has a **Manual Trigger only**.
- It contains no credentials, credential IDs, tokens, or keys.
- **Status:** built for review. Not enabled in any environment, never run
  against a real model, and no drafts have been created.

## Flow

The run is triggered manually. There are no agents, loops, or rewrites:

1. **Request source packet.** n8n → `POST /api/integrations/n8n/x-drafts/packet`.
   PSL returns the fixed prompt and a signed `batchToken`.
2. **Generate candidates.** n8n → Anthropic Messages API. This is one call,
   with at most one retry on a transport or HTTP error.
3. **Submit candidates.** n8n → `POST /api/integrations/n8n/x-drafts/batches`.
   PSL validates the output and inserts the passing candidates as new drafts.
   The response reports what was saved or blocked.
4. **Review.** The owner reviews in `/admin-social`: edit, approve, or cancel,
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

The n8n side holds only two credentials: the PSL draft token and the model
API key. It has no admin password, no database access, no X OAuth
credential, no B1 token, and no `X_PUBLISHER_TOKEN`.

## Approved sources (allowlist)

The model sees **only** these sources. The list is defined in
`lib/x-drafts/sources.ts`. Their exact text is committed in
`lib/x-drafts/source-snapshot.ts`, so the endpoint never reads other
repository files at runtime.

> **Owner confirmation needed before first run.** This list is a proposal
> based on published PSL pages and the approved compliance guidance. It is
> not a claim that every "approved" document is suitable evidence. Remove
> anything you do not want cited.

| Source ID | Kind | From | Why included |
|---|---|---|---|
| `science:how-to-read-a-coa` | evidence | `content/science/how-to-read-a-coa.mdx` (title, description, body; no date) | Published documentation article |
| `science:third-party-testing-explained` | evidence | `content/science/third-party-testing-explained.mdx` | Published documentation article |
| `guide:peptide-identity-vs-purity-vs-content` | evidence | `lib/content/guides-data.ts` (title and description only) | Published analytical guide |
| `guide:verify-peptide-laboratory-report` | evidence | same | Published analytical guide |
| `guide:peptide-purity-vs-content` | evidence | same | Published analytical guide |
| `guide:batch-specific-vs-generic-coa` | evidence | same | Published analytical guide |
| `guide:what-peptide-testing-can-establish` | evidence | same | Published analytical guide |
| `guide:verify-peptide-coa` | evidence | same | Published analytical guide |
| `guide:peptide-purity-percentages` | evidence | same | Published analytical guide |
| `statement:testing-scope` | evidence | `lib/content/testing-scope.ts` `TESTING_SCOPE_STATEMENT` | Canonical testing-scope statement |
| `guidance:claims-rules` | guidance (never citable) | `ops-knowledge/compliance/claims-rules.md`: only the "Research-use / FDA framing (live)" and "Testing-scope claim limit (live)" sections | Rules only |
| `guidance:prohibited-content` | guidance (never citable) | `ops-knowledge/compliance/prohibited-content.md`: only the public-output sections | Rules only |

**Deliberately excluded:**
- Guide page bodies. They are React components, not text.
- The storage guide.
- The legacy "structure/function" claims list, and the draft brand voice.
- Support knowledge.
- All customer messages, orders, and support threads.
- Old chats, and every other repository file.

Science articles contain example report values (for example a batch name,
task number, and strength). Posts that repeat them are allowed only
verbatim, and are flagged for review.

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
| **Blocked** (never stored) | Malformed or unparsable output. More than 5 candidates (the extras). A source ID that is not on the list. Citing guidance as evidence. No evidence source. An excerpt that is missing, too short or long, not from a cited source, or not verbatim in that source (markdown and whitespace are ignored). No purpose. Any `checkPostText` error: human use, dosing, treat/cure, weight loss, drug comparison, "you will…", length, mentions, link rules, and so on. A number not present in the cited evidence, including years and dates. A link that is not a cited source's page. Engagement bait. Testimonials or claims about customer behaviour. Sales or discount language. "We/PSL test…" and "our lab" claims. Credentials, accreditations, or test methods (ISO, GMP, PhD, scientists, NMR, endotoxin, …) that the cited evidence does not contain. An exact duplicate of any queue post in the same partition (any status, including published or cancelled) or of another item in the batch. The daily cap |
| **Saved with review warnings** | `checkPostText` warnings (the same per-warning acknowledgement is still required at approval). Near-duplicates (word overlap ≥ 60 % with a recent queue post or another item). Any number. Named products or compounds. Named laboratories. Hashtags. The model's own warnings |

**Provenance stored with each draft** (`source_refs`, internal, never posted):
1. The AI-assisted label, batch ID, item number, packet version, and model.
2. Purpose (the reader question).
3. Source IDs with their URL or origin.
4. The verbatim excerpt.
5. Review warnings.

`/admin-social` shows these as a list under an **AI-assisted — owner review
required** badge. Editing the draft keeps them.

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
| `PSL X Draft Model` | Header Auth. Name `x-api-key`, Value = a **dedicated** Anthropic API key | Generate candidates (model) only |

- Never attach `PSL X Queue`, `PSL X Publishing`, or `PSL Mission Control n8n`
  to this workflow.
- Never attach these two credentials to the publisher.

## Model / provider

- **Provider:** Anthropic Messages API (`https://api.anthropic.com/v1/messages`,
  header `anthropic-version: 2023-06-01`), called from a plain HTTP Request
  node. There are no AI Agent, LangChain, or Code nodes, so there are no tools
  and no recursion.
- **Model:** set `Config.modelId` to a current Anthropic model ID from
  Anthropic's model documentation. A mid-tier model is enough for short
  posts. The file ships with a placeholder, and **Config valid?** stops the
  run until it is replaced.
- **Key:** create a dedicated key used only by this workflow, ideally in its
  own Anthropic workspace. **Set a monthly spend limit in the Anthropic
  Console**: that is the hard cost ceiling. Rotate the key if n8n access
  changes.
- The live-model test (below) uses the same request shape. It needs its own
  key in the local environment only; never commit it.

## Cost controls

| Control | Where | Limit |
|---|---|---|
| Trigger | n8n | Manual only; no schedule |
| Model calls per run | n8n | 1, plus at most 1 retry on failure (`maxTries: 2`); no loop back to the model |
| Output size | n8n Config → request | `max_tokens` = `Config.maxTokens` (default 2000); **Config valid?** refuses values above 4000 |
| Candidates | PSL | At most 5 considered per batch |
| Drafts per day | PSL | 10 assistant drafts per Phoenix day per partition, counted under the queue lock. When reached, the **packet is refused**, so the model is not called |
| Request rate | PSL | 6 per minute per endpoint |
| Model output accepted | PSL | 20,000 characters |
| Spend ceiling | Anthropic Console | Your monthly limit on the dedicated key/workspace |

**Estimating the cost of a run:**
- **Input:** about 13,400 characters with an empty queue and about 17,700 with
  15 recent posts. That is roughly 3,500–4,500 input tokens. This is an
  estimate; the provider reports actual usage, and the submission records
  `usage`.
- **Worst-case cost per run** is
  `2 × (input_tokens × input_price + maxTokens × output_price)`, using the
  model's current per-token prices from Anthropic's pricing page.
- A normal run is one call, and output is usually well under `maxTokens`.

The daily cap counts **saved** drafts. A run whose candidates are all blocked
still costs one call. Repeated manual runs are limited only by the rate limit
and your provider spend limit.

## Import and bind

1. **Workflows → Import from File** → `psl-x-draft-assistant.workflow.json`.
   It imports inactive. Do not add a Schedule trigger yet.
2. **Config**:
   - `pslBaseUrl`: the Production HTTPS origin (no path).
   - `modelId`: a current Anthropic model ID.
   - `maxTokens`: an integer from 256 to 4000.
3. Bind `PSL X Drafts` on the two PSL nodes and `PSL X Draft Model` on the
   model node.

### Nodes (17 total: 3 HTTP Request, 4 IF, 5 Stop and Error, 1 Set, 2 No-Op, 1 Manual Trigger, 1 Sticky Note)

| # | Node | Type | Credential | Notes |
|---|---|---|---|---|
| 1 | Setup notes | Sticky Note | — | |
| 2 | Manual Trigger | Manual Trigger | — | Only trigger |
| 3 | Config | Set | — | `pslBaseUrl`, `modelId`, `maxTokens` |
| 4 | Config valid? | IF | — | HTTPS origin, real model ID, 256 ≤ maxTokens ≤ 4000 |
| 5 | Stop: invalid config | Stop and Error | — | No request made |
| 6 | Request source packet | HTTP POST `/x-drafts/packet` | **PSL X Drafts** | No retry; no redirects |
| 7 | Stop: no source packet | Stop and Error | — | Disabled, unauthorized, capped, or unexpected response. No model call |
| 8 | Packet issued? | IF | — | Token and prompt present, cap = 5 |
| 9 | Generate candidates (model) | HTTP POST `https://api.anthropic.com/v1/messages` | **PSL X Draft Model** | `maxTries: 2`, 120 s timeout, no redirects |
| 10 | Stop: model call failed | Stop and Error | — | Nothing saved |
| 11 | Model output received? | IF | — | At least one text block |
| 12 | Stop: no usable model output | Stop and Error | — | Nothing saved |
| 13 | Submit candidates | HTTP POST `/x-drafts/batches` | **PSL X Drafts** | Retries allowed (idempotent per batch) |
| 14 | Stop: submission not confirmed | Stop and Error | — | Some drafts may exist; check `/admin-social` |
| 15 | Any drafts saved? | IF | — | `saved + alreadySaved > 0` |
| 16 | Drafts saved - review in /admin-social | No-Op | — | Output shows saved, blocked, and reasons |
| 17 | Nothing saved - see blocked reasons | No-Op | — | |

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

1. Confirm or trim the source list above.
2. Set the two Vercel variables (Production), redeploy, and create the n8n
   credentials, including the provider spend limit.
3. Import, set Config, bind credentials, and click **Execute workflow**
   once.
4. Read the Submit node's output (saved, blocked, and reasons). Then review
   each draft in `/admin-social`: check the excerpt against the source, and
   edit, approve, or cancel.

**Weekly generation later:** after the first batch has been reviewed, a
Schedule Trigger (for example weekly) can be added in n8n in place of the
Manual Trigger. The server caps stay the same. Drafts still require
approval, and the separate scheduled publisher is unaffected.

## Tests

| Command | Kind | What it proves |
|---|---|---|
| `npm run test:x-drafts` | **Mocked.** Recording fake SQL, no database, no model, no network | Snapshot matches the allowlisted files. Source hygiene. Token separation and config gates. Batch-token signing. Prompt framing and injection resistance. Every validator rule. Handler gate order. The only write is one draft `INSERT … ON CONFLICT (id) DO NOTHING` under the queue lock, with no attempts, control, or approval access. Counts-only event. Static workflow checks and README counts |
| `npm run test:x-drafts-db` | **Real database.** Disposable Neon DB only (`X_DRAFTS_DB_TEST=1`, `N8N_TEST_DATABASE_URL`); model output is a fixture | Drafts inserted as unapproved TEST rows. Replay creates nothing. A conflicting item is not overwritten. Exact duplicate blocked and near-duplicate flagged. An approved post is untouched and its text cannot be re-proposed. Daily cap in SQL, and the packet is refused at the cap. Live and TEST partitions are separate. `/admin-social` lists the drafts. Events deduplicated. No attempts. Control untouched. Cleanup verified. Refuses application databases and databases with business tables; network guarded |
| `npm run test:x-drafts-live-model` | **Live model.** Opt-in (`X_DRAFTS_LIVE_MODEL_TEST=1`, `X_DRAFTS_LIVE_MODEL_ID`, `ANTHROPIC_API_KEY`); **spends credit** | Sends the real prompt once, validates the reply, and prints what would be saved or blocked. The database client throws, so nothing is written. **Not run as part of this change** |

## Turning it off

- Unset `X_DRAFT_ASSISTANT_ENABLED`: both endpoints return 503.
- Or unset `X_DRAFT_ASSISTANT_TOKEN`.
- Or revoke the provider key.

Existing drafts stay in `/admin-social` until the owner edits or cancels them.

## Limitations

- These checks are keyword and source-matching heuristics. They cannot judge
  tone, context, or whether a paraphrase changes meaning.
- Only evidence text that is on the list is checked. A true statement from
  outside the list is blocked, not verified.
- The near-duplicate threshold is approximate.
- Model output varies from run to run. The owner is the reviewer of record.
