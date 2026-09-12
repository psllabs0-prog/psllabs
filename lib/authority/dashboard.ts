import {
  aggregateSearchConsolePeriod,
  countSearchConsoleRows,
  getLatestSuccessfulExternalMetricSyncRun,
} from "@/lib/external-metrics/store";
import { ensureExternalMetricsSchema } from "@/lib/external-metrics/schema";

import { runAuthorityOpportunityScan } from "./engine";
import {
  getContentBrief,
  insertContentBrief,
  listAuthorityOpportunities,
  listBriefsForOpportunity,
  updateOpportunityStatus,
  getAuthorityOpportunity,
} from "./store";
import { generateDeterministicBrief, formatBriefForExport } from "./briefs";
import { recommendInternalLinks, getKnownSitePages } from "./pages";
import { ensureAuthoritySchema } from "./schema";

export async function buildAuthorityDashboard() {
  await ensureAuthoritySchema();
  await ensureExternalMetricsSchema();

  const end = new Date();
  const endStr = end.toISOString().slice(0, 10);
  const start28 = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [rowCount, lastOk, health, opportunities] = await Promise.all([
    countSearchConsoleRows(),
    getLatestSuccessfulExternalMetricSyncRun("search_console"),
    aggregateSearchConsolePeriod({ startDate: start28, endDate: endStr }).catch(
      () => null
    ),
    listAuthorityOpportunities({ limit: 100 }),
  ]);

  const internalLinks = getKnownSitePages()
    .filter((p) => p.kind === "guide")
    .flatMap((p) => recommendInternalLinks(p.path))
    .filter((l, i, arr) =>
      arr.findIndex((x) => x.from === l.from && x.to === l.to) === i
    );

  return {
    searchHealth: {
      clicks: health?.clicks ?? null,
      impressions: health?.impressions ?? null,
      nonBrandClicks: health?.nonBrandClicks ?? null,
      nonBrandImpressions: health?.nonBrandImpressions ?? null,
      latestSync: lastOk?.completedAt ?? lastOk?.startedAt ?? null,
      rowsSynced: rowCount,
      note:
        rowCount === 0
          ? "Insufficient SEO evidence for new action."
          : null,
    },
    opportunities,
    knownPages: getKnownSitePages().map((p) => ({
      path: p.path,
      title: p.title,
      kind: p.kind,
    })),
    internalLinkOpportunities: internalLinks,
  };
}

export async function authorityAdminAction(input: {
  action: string;
  opportunityId?: number;
  briefId?: number;
}): Promise<Record<string, unknown>> {
  await ensureAuthoritySchema();

  if (input.action === "scan") {
    return runAuthorityOpportunityScan();
  }

  if (input.action === "approve" && input.opportunityId) {
    const row = await updateOpportunityStatus({
      id: input.opportunityId,
      status: "approved",
    });
    return { ok: true, opportunity: row };
  }
  if (input.action === "dismiss" && input.opportunityId) {
    const row = await updateOpportunityStatus({
      id: input.opportunityId,
      status: "dismissed",
    });
    return { ok: true, opportunity: row };
  }
  if (input.action === "in_progress" && input.opportunityId) {
    const row = await updateOpportunityStatus({
      id: input.opportunityId,
      status: "in_progress",
    });
    return { ok: true, opportunity: row };
  }
  if (input.action === "drafted" && input.opportunityId) {
    const row = await updateOpportunityStatus({
      id: input.opportunityId,
      status: "drafted",
    });
    return { ok: true, opportunity: row };
  }
  if (input.action === "published" && input.opportunityId) {
    // Recording only — does not deploy/edit public content.
    const row = await updateOpportunityStatus({
      id: input.opportunityId,
      status: "published",
    });
    return {
      ok: true,
      opportunity: row,
      note: "Status recorded only. No public content was published or edited.",
    };
  }

  if (input.action === "generate_brief" && input.opportunityId) {
    const op = await getAuthorityOpportunity(input.opportunityId);
    if (!op) return { ok: false, error: "Opportunity not found" };
    if (op.status === "suggested") {
      await updateOpportunityStatus({
        id: op.id,
        status: "approved",
      });
    }
    const generated = generateDeterministicBrief({
      opportunity: {
        type: op.type,
        primaryQuery: op.primaryQuery,
        page: op.page,
        intent: op.intent,
        riskLevel: op.riskLevel as "LOW" | "CLAIMS_REVIEW" | "COUNSEL_REVIEW",
        evidence: op.evidenceJson,
        existingPagePath:
          typeof op.evidenceJson.existingPagePath === "string"
            ? op.evidenceJson.existingPagePath
            : null,
      },
    });
    const brief = await insertContentBrief({
      opportunityId: op.id,
      title: generated.title,
      slugOrTargetPage: generated.slugOrTargetPage,
      briefJson: generated.brief,
      riskLevel: generated.riskLevel,
      claimsReviewRequired: generated.claimsReviewRequired,
    });
    return { ok: true, brief };
  }

  if (input.action === "export_brief" && input.briefId) {
    const brief = await getContentBrief(input.briefId);
    if (!brief) return { ok: false, error: "Brief not found" };
    const exportPayload = formatBriefForExport({
      title: brief.title,
      slugOrTargetPage: brief.slugOrTargetPage,
      riskLevel: brief.riskLevel,
      claimsReviewRequired: brief.claimsReviewRequired,
      brief: brief.briefJson,
    });
    return { ok: true, export: exportPayload, brief };
  }

  if (input.action === "list_briefs" && input.opportunityId) {
    const briefs = await listBriefsForOpportunity(input.opportunityId);
    return { ok: true, briefs };
  }

  return { ok: false, error: "Unknown action" };
}
