import assert from "node:assert/strict";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { __setSqlClientForTests } from "../lib/db/sql";
import {
  checkPartnerOrigin, createPartnerCode, isFollowUpDue, parsePartnerMetrics, partnerDestination,
  partnerDrafts, trackingUrl, transitionPartner, validPartnerCode, validPartnerId, validateDestination,
  validatePartnerInput, validateStatus,
} from "../lib/partners/logic";
import {
  assertPartnersAvailable, createPartner, getActivePartnerByCode, loadPartnerDashboard,
  migratePartners, PartnersUnavailableError, savePartner,
} from "../lib/partners/store";
import type { Partner } from "../lib/partners/types";
import { collectPartnerSnapshot, partnerBriefLines } from "../lib/ceo-brief/partners";
import { getLastCompletedWeekUtc } from "../lib/ceo-brief/period";

let checks = 0;
function check(value: unknown, message: string) { checks++; assert.ok(value, message); }
function rejects(action: () => unknown) { checks++; assert.throws(action); }
const now = new Date("2026-10-05T12:00:00Z");
const base = validatePartnerInput({ businessName: "Fixture Lab", contactName: "Pat", email: "PAT@example.test", website: "https://example.test/", source: "Direct inquiry" });
const partner: Partner = {
  ...base, id: "11111111-1111-4111-a111-111111111111", code: "fixture-lab-1234abcd", status: "prospect",
  createdAt: now.toISOString(), updatedAt: now.toISOString(), lastContactedAt: null, lastRepliedAt: null, followUpDueAt: null,
};

async function main() {
  const previousFetch = globalThis.fetch;
  const previousDatabase = process.env.DATABASE_URL;
  const previousPostgres = process.env.POSTGRES_URL;
  globalThis.fetch = async () => { throw new Error("No network allowed in partner tests"); };
  try {
    check(base.email === "pat@example.test" && base.destination === "/products", "normalized email and real catalog default");
    for (const input of [null, [], {}, { ...base, email: "a\r\nb@example.test" }, { ...base, businessName: "<script>" }, { ...base, email: "a b@example.test" }, { ...base, notes: "a".repeat(2001) }, { ...base, website: "javascript:alert(1)" }, { ...base, website: "https://user:pass@example.test" }]) rejects(() => validatePartnerInput(input));
    for (const path of ["/products", "/products/psl-rt-10mg", "/coa", "/science", "/science/read-a-coa"]) check(validateDestination(path) === path, "allowed destination");
    for (const path of ["//evil.test", "https://evil.test", "/\\evil.test", "/products/../admin", "/products/%2e%2e/admin", "/products?url=https://evil.test", "/products#injection", "/r/loop", "/api/admin", "/catalog", "/science//evil.test", "/products\n"]) rejects(() => validateDestination(path));
    check(createPartnerCode(" Café Lab! ", "1234abcd") === "cafe-lab-1234abcd", "stable normalized business prefix");
    check(createPartnerCode("研究", "1234abcd") === "partner-1234abcd", "safe nonlatin fallback");
    check(validPartnerCode(createPartnerCode("a".repeat(200), "1234abcd")), "bounded code");
    rejects(() => createPartnerCode("Lab", "bad-suffix"));
    check(!validPartnerCode("../admin") && !validPartnerCode("x@customer.test"), "no path or email code");
    check(validPartnerId(partner.id) && !validPartnerId("1; DROP TABLE"), "strict identifier");
    check(validateStatus("reviewing") === "reviewing", "review status supported");
    rejects(() => validateStatus("approved"));
    const destination = new URL(partnerDestination({ ...partner, status: "active" })!);
    check(destination.origin === "https://www.psllabs.org" && destination.pathname === "/products", "canonical same-site redirect");
    check(destination.searchParams.get("utm_content") === partner.code && destination.searchParams.get("utm_medium") === "affiliate", "tracking parameters intact");
    check(!destination.href.includes(partner.email) && !trackingUrl(partner.code).includes(partner.email), "no email in public links");
    for (const status of ["prospect", "awaiting_reply", "reviewing", "paused", "declined"] as const) check(partnerDestination({ ...partner, status }) === null, "only active links redirect");
    const contacted = transitionPartner(partner, "mark_contacted", now);
    check(contacted.status === "awaiting_reply" && contacted.lastContactedAt === now.toISOString(), "manual contact recorded");
    check(Date.parse(contacted.followUpDueAt!) - now.getTime() === 7 * 86400000, "seven-day due date");
    check(!isFollowUpDue(contacted, now) && isFollowUpDue(contacted, new Date(now.getTime() + 7 * 86400000)), "due-date boundary");
    const replied = transitionPartner(contacted, "mark_replied", now);
    check(replied.status === "reviewing" && replied.followUpDueAt === null && replied.lastRepliedAt === now.toISOString(), "reply stops reminders and enters review");
    for (const status of ["active", "paused", "declined"] as const) check(transitionPartner({ ...contacted, status }, "mark_replied", now).status === status, "reply preserves terminal and live status");
    check(transitionPartner(contacted, "pause", now).followUpDueAt === null, "pause clears due date");
    for (const status of ["paused", "declined"] as const) {
      rejects(() => transitionPartner({ ...partner, status }, "mark_contacted", now));
      check(!isFollowUpDue({ ...contacted, status }, new Date("2030-01-01")), "suppressed partners never due");
    }
    const drafts = partnerDrafts(partner);
    check(drafts.qualification.body.includes("Hi Pat") && drafts.qualification.body.includes("Fixture Lab"), "personalized plain-text draft");
    check(drafts.qualification.body.includes("not human or animal use") && drafts.qualification.body.includes("disclosure"), "research-only and disclosure context");
    check(drafts.followUp.body.includes("No terms are agreed") && drafts.followUp.body.includes("no further contact"), "no promised commission and opt-out respected");
    const request = (headers: Record<string, string>) => new Request("https://www.psllabs.org/api/admin/partners", { headers });
    check(checkPartnerOrigin(request({ "x-psl-partners-action": "1", origin: "https://www.psllabs.org" })), "matching origin");
    check(checkPartnerOrigin(request({ "x-psl-partners-action": "1", "sec-fetch-site": "same-origin" })), "same-origin browser fallback");
    const unsafeHeaders: Record<string, string>[] = [{ origin: "https://www.psllabs.org" }, { "x-psl-partners-action": "1" }, { "x-psl-partners-action": "1", origin: "https://evil.test" }, { "x-psl-partners-action": "1", origin: "https://www.psllabs.org.evil.test" }, { "x-psl-partners-action": "1", origin: "https://www.psllabs.org", "sec-fetch-site": "cross-site" }];
    for (const headers of unsafeHeaders) check(!checkPartnerOrigin(request(headers)), "unsafe cross-origin mutation rejected");
    const metric = parsePartnerMetrics([{ code: partner.code, paid_orders: "2", paid_revenue: "89.98" }, { code: "bad", paid_orders: 99, paid_revenue: 50 }, { code: "other-1234abcd", paid_orders: -1, paid_revenue: 9 }]);
    check(metric.size === 1 && metric.get(partner.code)?.paidOrderRevenueUsd === 89.98, "bounded aggregate parsing");

    const statements: string[] = [];
    const row = { id: partner.id, code: partner.code, business_name: base.businessName, contact_name: base.contactName, email: base.email, website: base.website, source: base.source, destination: base.destination, status: "prospect", notes: "", created_at: now.toISOString(), updated_at: now.toISOString(), last_contacted_at: null, last_replied_at: null, follow_up_due_at: null };
    let ready = true;
    __setSqlClientForTests((async (parts: TemplateStringsArray) => {
      const query = parts.join("?"); statements.push(query);
      if (query.includes("to_regclass")) return [{ ready }];
      if (query.includes("COUNT(*) FILTER")) return [{ active: 3, due: 1 }];
      if (query.includes("COUNT(o.order_id)")) return [{ code: partner.code, paid_orders: 2, paid_revenue: "89.98" }];
      if (query.includes("SELECT code, destination")) return [{ code: partner.code, destination: "/products", status: "active" }];
      return query.includes("CREATE TABLE") ? [] : [row];
    }) as unknown as NeonQueryFunction<false, false>);
    process.env.DATABASE_URL = "fixture://unused";
    await assertPartnersAvailable();
    const dashboard = await loadPartnerDashboard(now);
    check(dashboard.summary.paidOrders === 2 && dashboard.summary.paidOrderRevenueUsd === 89.98, "database aggregates included");
    check(dashboard.outboundSendingEnabled === false && dashboard.partners[0].drafts.qualification.body.includes("Hi Pat"), "draft-only dashboard");
    const publicPartner = await getActivePartnerByCode(partner.code);
    check(publicPartner?.status === "active" && !("email" in publicPartner), "public lookup does not select contact data");
    await createPartner(base);
    await savePartner(contacted, partner.updatedAt);
    check(statements.every((q) => !/\b(CREATE|ALTER|DELETE|DROP)\b/i.test(q)), "request paths have no DDL or deletes");
    const aggregate = statements.find((q) => q.includes("COUNT(o.order_id)"))!;
    check(aggregate.includes("o.status IN ('paid', 'shipped')") && aggregate.includes("o.paid_at IS NOT NULL") && aggregate.includes("o.currency = 'USD'") && aggregate.includes("'lastAffiliate'"), "SQL excludes pending, failed, and unpaid orders and keeps affiliate touch separate");
    check(statements.some((q) => q.includes("date_trunc('milliseconds', updated_at)")), "updates check record version");
    check(aggregate.includes("ft.reporting_excluded = true"), "test or otherwise excluded finance records do not count");
    const weekly = await collectPartnerSnapshot(getLastCompletedWeekUtc(now), now);
    check(weekly?.activePartners === 3 && weekly?.followUpsDue === 1 && weekly?.paidOrders === 2, "weekly owner review uses current partner work and period sales");
    check(statements.at(-1)?.includes("o.paid_at >=") && statements.at(-1)?.includes("o.paid_at <"), "weekly referrals use completed-week boundaries");
    const lines = partnerBriefLines(weekly);
    check(lines.length === 3 && lines.join(" ").includes("admin-partners") && lines.join(" ").includes("before fees or refund"), "owner review includes link and gross total scope");
    ready = false;
    await assert.rejects(assertPartnersAvailable, PartnersUnavailableError); checks++;
    check(await collectPartnerSnapshot(getLastCompletedWeekUtc(now), now) === undefined && partnerBriefLines(undefined).length === 0, "unmigrated partners absent without blocking weekly review");
    delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
    await assert.rejects(assertPartnersAvailable, PartnersUnavailableError); checks++;
    const beforeMigration = statements.length;
    await migratePartners();
    check(statements.slice(beforeMigration).length === 1 && statements.at(-1)!.includes("CREATE TABLE IF NOT EXISTS acquisition_partners"), "explicit migration adds only partner table");
    console.log(`Partners: ${checks} offline checks passed; no network, emails, or database changes.`);
  } finally {
    globalThis.fetch = previousFetch;
    __setSqlClientForTests(null);
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
    if (previousPostgres === undefined) delete process.env.POSTGRES_URL; else process.env.POSTGRES_URL = previousPostgres;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
