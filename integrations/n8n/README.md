# n8n → PSL Mission Control connection test (TEST)

`psl-mission-control-connection-test.workflow.json` is a manual-only n8n
workflow that checks n8n can reach PSL Mission Control:

Manual Trigger → register a run → report started → fetch a read-only status
summary → report completed (or a fixed failure reason).

Every run is **TEST / EXCLUDED**. It is never business activity or customer
demand. "Completed" means the connection test received its expected response.
It does **not** mean every business system is healthy. The status summary
reports Mission Control's own observations, and stale or unavailable sources
stay stale or unavailable.

The workflow file contains no secrets and no credential IDs. Authentication
comes from the n8n credential store.

## 1. Create the credential value (outside n8n)

Generate a random token of at least 32 characters with a cryptographically
secure generator, and store it only in Vercel and in the n8n credential store.
Do not paste it into tickets, chat, commits, or this directory.

Use any one of these generators:

- Node.js: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- OpenSSL: `openssl rand -base64 48`
- Windows PowerShell 5.1:
  `$b = New-Object byte[] 48; $r = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $r.GetBytes($b); $r.Dispose(); [Convert]::ToBase64String($b)`

Rules:

- The token must be at least 32 characters.
- It must be different from `ADMIN_PASSWORD`, `CRON_SECRET`, database URLs,
  and payment secrets. The server refuses a token that copies another
  configured secret.
- Keep Production and Preview credentials separate. **No Preview token is
  needed** while Preview activation stays disabled.

## 2. Server configuration (Vercel, Production scope only)

| Variable | Value |
|---|---|
| `MISSION_CONTROL_N8N_TOKEN` | the token from step 1 |
| `MISSION_CONTROL_N8N_ENABLED` | `true` |
| `MISSION_CONTROL_SYNC_ENABLED` | `true` (the existing Mission Control write gate; already set in Production) |

Redeploy after changing environment variables. The integration is disabled by
default: if the flag, the token, or the Mission Control write gate is missing,
every endpoint returns 503. Do not set `MISSION_CONTROL_N8N_ALLOW_PREVIEW`.
No migration is needed; the integration uses the existing
`ops_activity_events` table.

## 3. Import the workflow

In n8n, go to **Workflows → Import from File** and choose
`psl-mission-control-connection-test.workflow.json`. The workflow imports
inactive with a Manual Trigger only. Do not add a Schedule, Cron, or Webhook
trigger.

## 4. Create and bind the credential

1. Go to **Credentials → Create credential → Header Auth**.
2. Set the credential name to `PSL Mission Control n8n`.
3. Set **Name** to `Authorization`.
4. Set **Value** to `Bearer ` followed by the token from step 1.

Then open **each** of the **seven** HTTP Request nodes and select this
credential under *Header Auth*. This includes the error-branch nodes. A node
without the credential fails with 401, and on an error branch that hides the
real outcome.

1. Register run
2. Report started
3. Get status summary
4. Report completed
5. Report failed: unexpected response (error branch)
6. Report failed: status request (error branch)
7. Report failed: workflow error (error branch)

## 5. Set the PSL base URL

Open the **Config** node and set `pslBaseUrl` to the Production HTTPS origin,
with no path and no trailing slash (for example `https://<your-production-domain>`).
Never put the token in the URL. The server rejects any query string.

## 6. Run the test

Save the workflow (no activation needed) and click **Execute workflow**.

- **Success:** the run ends at *Report completed*.
- **Reported failure:** the run ends at *Connection test failed*. The failure
  reason was confirmed by Mission Control.
- **"Registration could not be confirmed":** n8n did not receive a successful
  response. A run **may still exist**. Check Mission Control for the request
  ID shown in the error (`wf-<workflowId>-exec-<executionId>`) before running
  again.
- **"Result confirmation was not received":** the server may already have
  recorded the result before the response was lost. Check Mission Control
  before restarting. If no result was recorded, the run shows *outcome
  unknown* after the 10-minute timeout. The workflow does not convert an
  unconfirmed completion into a failure report.

Retries are safe. Every HTTP node retries up to 3 times, and the stable
request ID means a retried registration returns the same run instead of a new
one. Registrations are limited to 5 per 10 minutes.

## 7. Find the run in Mission Control

1. Open `/admin-ops?tab=mission-control` (admin sign-in required).
2. Scroll to the **n8n connection tests (TEST / EXCLUDED)** panel. Each run
   shows its state, run ID, request ID, n8n execution ID, and timestamps.
3. For the individual events, tick **Show test/excluded** in the Activity feed
   and pick the worker filter **n8n connection test (TEST)**.

## Turning it off

Unset `MISSION_CONTROL_N8N_ENABLED` (or the token) in Vercel and redeploy.
All endpoints then return 503. Rotating the token means updating Vercel and
the single n8n credential.
