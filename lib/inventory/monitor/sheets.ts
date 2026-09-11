import {
  getGoogleSheetsAccessToken,
  getGoogleSheetsConfig,
  googleSheetsFetch,
  isGoogleSheetsConfigured,
} from "@/lib/finance/google-sheets";

import { INVENTORY_MONITOR_SHEET_TAB } from "./constants";
import type { SkuMonitorMetrics } from "./metrics";

export const INVENTORY_MONITOR_HEADERS = [
  "As Of",
  "SKU",
  "Product",
  "Sellable Stock",
  "Ordered",
  "In Transit",
  "Awaiting Testing",
  "Sold 7d",
  "Sold 14d",
  "Sold 28d",
  "Avg/Day 7d",
  "Avg/Day 14d",
  "Avg/Day 28d",
  "Planning Velocity",
  "Forecast Confidence",
  "Current Days Supply",
  "Risk Adjusted Days Supply",
  "Projected Stockout",
  "Reorder Review Date",
  "Baseline Stock",
  "Depletion %",
  "Monitor Status",
  "MOQ",
  "Test Cost/Unit @10",
  "Test Cost/Unit @25",
  "Test Cost/Unit @50",
  "Test Cost/Unit @100",
  "Last Updated",
] as const;

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return n.toFixed(digits);
}

function rowValues(m: SkuMonitorMetrics, asOf: string): string[] {
  const econ = Object.fromEntries(
    m.testingEconomics.map((e) => [e.quantity, e])
  );
  return [
    asOf,
    m.sku,
    m.productName,
    String(m.sellableStock),
    String(m.orderedInbound),
    String(m.inTransit),
    String(m.awaitingTesting),
    String(m.sold7d),
    String(m.sold14d),
    String(m.sold28d),
    fmtNum(m.avg7d, 3),
    fmtNum(m.avg14d, 3),
    fmtNum(m.avg28d, 3),
    m.forecastConfidence === "INSUFFICIENT_SALES_DATA"
      ? "INSUFFICIENT SALES DATA"
      : fmtNum(m.planningVelocity, 3),
    m.forecastConfidence,
    m.forecastConfidence === "INSUFFICIENT_SALES_DATA"
      ? "INSUFFICIENT SALES DATA"
      : fmtNum(m.daysSupply, 1),
    m.forecastConfidence === "INSUFFICIENT_SALES_DATA"
      ? "INSUFFICIENT SALES DATA"
      : fmtNum(m.riskAdjustedDaysSupply, 1),
    m.projectedStockoutAt ?? "",
    m.reorderReviewAt ?? "",
    String(m.baselineStock),
    m.depletionPct === null ? "" : fmtNum(m.depletionPct * 100, 1),
    m.monitorStatus,
    "10",
    fmtNum(econ[10]?.costPerUnitLow, 2) + "–" + fmtNum(econ[10]?.costPerUnitHigh, 2),
    fmtNum(econ[25]?.costPerUnitLow, 2) + "–" + fmtNum(econ[25]?.costPerUnitHigh, 2),
    fmtNum(econ[50]?.costPerUnitLow, 2) + "–" + fmtNum(econ[50]?.costPerUnitHigh, 2),
    fmtNum(econ[100]?.costPerUnitLow, 2) + "–" + fmtNum(econ[100]?.costPerUnitHigh, 2),
    new Date().toISOString(),
  ];
}

async function ensureSheetTab(token: string, spreadsheetId: string): Promise<void> {
  const metaRes = await googleSheetsFetch(
    token,
    `/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`
  );
  if (!metaRes.ok) {
    const text = await metaRes.text();
    throw new Error(`Spreadsheet meta failed (${metaRes.status}): ${text.slice(0, 200)}`);
  }
  const meta = (await metaRes.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const titles = new Set(
    (meta.sheets ?? []).map((s) => s.properties?.title).filter(Boolean)
  );
  if (titles.has(INVENTORY_MONITOR_SHEET_TAB)) return;

  const createRes = await googleSheetsFetch(
    token,
    `/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: { title: INVENTORY_MONITOR_SHEET_TAB },
            },
          },
        ],
      }),
    }
  );
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(
      `Create Inventory_Monitor tab failed (${createRes.status}): ${text.slice(0, 200)}`
    );
  }
}

async function ensureHeader(token: string, spreadsheetId: string): Promise<void> {
  await ensureSheetTab(token, spreadsheetId);
  const tab = INVENTORY_MONITOR_SHEET_TAB;
  const range = encodeURIComponent(`${tab}!A1:AB1`);
  const getRes = await googleSheetsFetch(
    token,
    `/spreadsheets/${spreadsheetId}/values/${range}`
  );
  if (!getRes.ok) {
    const text = await getRes.text();
    throw new Error(`Inventory sheet header read failed (${getRes.status}): ${text.slice(0, 200)}`);
  }
  const data = (await getRes.json()) as { values?: string[][] };
  if (data.values?.[0]?.[0] === INVENTORY_MONITOR_HEADERS[0]) return;

  const putRes = await googleSheetsFetch(
    token,
    `/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [Array.from(INVENTORY_MONITOR_HEADERS)] }),
    }
  );
  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`Inventory sheet header write failed (${putRes.status}): ${text.slice(0, 200)}`);
  }
}

async function findSkuRow(
  token: string,
  spreadsheetId: string,
  sku: string
): Promise<number | null> {
  const tab = INVENTORY_MONITOR_SHEET_TAB;
  const range = encodeURIComponent(`${tab}!B:B`);
  const res = await googleSheetsFetch(
    token,
    `/spreadsheets/${spreadsheetId}/values/${range}`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Inventory sheet SKU lookup failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values ?? [];
  for (let i = 0; i < values.length; i += 1) {
    if ((values[i]?.[0] ?? "").trim() === sku) return i + 1;
  }
  return null;
}

/** Upsert current-state Inventory_Monitor rows by SKU. Failures must not affect inventory. */
export async function syncInventoryMonitorSheet(
  metrics: SkuMonitorMetrics[],
  asOf: string
): Promise<{ synced: number; failed: boolean; error?: string }> {
  if (!isGoogleSheetsConfigured()) {
    return { synced: 0, failed: false, error: "Google Sheets not configured" };
  }

  try {
    const config = getGoogleSheetsConfig();
    if (!config) {
      return { synced: 0, failed: false, error: "Google Sheets not configured" };
    }
    const token = await getGoogleSheetsAccessToken(config.creds);
    await ensureHeader(token, config.spreadsheetId);

    let synced = 0;
    for (const m of metrics) {
      const values = rowValues(m, asOf);
      const existing = await findSkuRow(token, config.spreadsheetId, m.sku);
      if (existing) {
        const range = encodeURIComponent(
          `${INVENTORY_MONITOR_SHEET_TAB}!A${existing}:AB${existing}`
        );
        const res = await googleSheetsFetch(
          token,
          `/spreadsheets/${config.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            body: JSON.stringify({ values: [values] }),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Update failed for ${m.sku}: ${text.slice(0, 200)}`);
        }
      } else {
        const range = encodeURIComponent(`${INVENTORY_MONITOR_SHEET_TAB}!A:AB`);
        const res = await googleSheetsFetch(
          token,
          `/spreadsheets/${config.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: "POST",
            body: JSON.stringify({ values: [values] }),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Append failed for ${m.sku}: ${text.slice(0, 200)}`);
        }
      }
      synced += 1;
    }
    return { synced, failed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sheets sync failed";
    console.error("[inventory-monitor/sheets]", message);
    return { synced: 0, failed: true, error: message };
  }
}
