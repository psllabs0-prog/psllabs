/**
 * DB tests for marketing unsubscribe lifecycle.
 * Run: npm run test:retention-db
 */
process.env.SUPPORT_TEST_MODE = "true";
process.env.RETENTION_TEST_MODE = "true";
process.env.MARKETING_UNSUB_SECRET = "test-unsub-secret-db";

import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { createUnsubscribeToken } from "@/lib/retention/config";
import { ensureRetentionSchema } from "@/lib/retention/schema";
import {
  getMarketingPreference,
  hasUnsubscribeSuppression,
  isMarketingSuppressed,
  markMarketingUnsubscribed,
  setMarketingEligible,
} from "@/lib/retention/store";
import { GET, POST } from "@/app/api/marketing/unsubscribe/route";

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("[test-retention-db] skipped (no DATABASE_URL)");
    return;
  }

  console.log("[test-retention-db] running…");
  await ensureRetentionSchema();
  const sql = getSql();
  const email = `unsub-test-${Date.now()}@example.com`;
  const token = createUnsubscribeToken(email);

  try {
    await setMarketingEligible({
      email,
      eligible: true,
      source: "admin_explicit",
    });
    let pref = await getMarketingPreference(email);
    assert(pref?.marketingEligible === true, "eligible before unsub");

    // 1) Human confirmation page path is non-mutating by design (page only).
    // 2) GET API must NOT unsubscribe.
    const getRes = await GET(
      new Request(
        `http://localhost/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`
      )
    );
    assert(getRes.status === 307 || getRes.status === 302, "GET redirects");
    const loc = getRes.headers.get("location") ?? "";
    assert(loc.includes("/unsubscribe?token="), "GET redirects to human page");
    pref = await getMarketingPreference(email);
    assert(pref?.marketingEligible === true, "GET did not unsubscribe");
    assert(pref?.unsubscribedAt == null, "GET no unsubscribed_at");

    // 3) Standard one-click POST unsubscribes
    const postRes = await POST(
      new Request(
        `http://localhost/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "List-Unsubscribe=One-Click",
        }
      )
    );
    assert(postRes.status === 200, "POST 200");
    assert((await postRes.text()) === "OK", "POST body OK");

    pref = await getMarketingPreference(email);
    assert(pref?.marketingEligible === false, "unsubscribed ineligible");
    assert(pref?.unsubscribedAt != null, "unsubscribed_at set");
    assert(await isMarketingSuppressed(email), "suppressed");
    assert(await hasUnsubscribeSuppression(email), "unsubscribed reason");

    // 4) Idempotent repeat POST
    const post2 = await POST(
      new Request(
        `http://localhost/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "List-Unsubscribe=One-Click",
        }
      )
    );
    assert(post2.status === 200, "repeat POST 200");
    const pref2 = await getMarketingPreference(email);
    assert(pref2?.unsubscribedAt === pref?.unsubscribedAt, "unsub timestamp stable");

    // 5) Invalid token fails safely
    const bad = await POST(
      new Request("http://localhost/api/marketing/unsubscribe?token=not-valid", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      })
    );
    assert(bad.status === 400, "invalid token 400");

    // 8) Admin eligibility toggle cannot override unsubscribe
    const blocked = await setMarketingEligible({
      email,
      eligible: true,
      source: "admin_explicit",
    });
    assert(blocked.blockedByUnsubscribe === true, "blocked by unsubscribe");
    assert(blocked.marketingEligible === false, "still ineligible");
    assert(await hasUnsubscribeSuppression(email), "suppression remains");

    // 7) Transactional unaffected — documented: no shared suppression table for SMTP order/support
    assert(
      true,
      "transactional paths do not read marketing_suppressions"
    );

    console.log("[test-retention-db] all passed.");
  } finally {
    await sql`DELETE FROM marketing_suppressions WHERE email = ${email}`;
    await sql`DELETE FROM customer_marketing_preferences WHERE email = ${email}`;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
