/**
 * Offline revenue writer regression. No Google requests leave this process.
 * Exercises actual append/update serialization with generated fixture credentials.
 * Run: npx tsx scripts/test-revenue-sheet-values.ts
 */
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  appendRevenueSheetRow,
  updateRevenueSheetRow,
  toSheetValues,
  type RevenueSheetRowValues,
} from "../lib/finance/google-sheets";

const fixture: RevenueSheetRowValues = {
  date: "2026-10-03",
  pslOrderId: "psl_fixture",
  provider: "tagada",
  providerPaymentId: "pay_fixture",
  paymentMethod: "card",
  grossRevenue: "82.97",
  currency: "USD",
  products: "PSL-RT-10MG, PSL-RS-5ML",
  quantities: "1, 1",
  utmSource: "=IMPORTDATA(\"https://example.invalid/fixture\")",
  utmMedium: "+123",
  campaign: "-123",
  creative: "@SUM(A1:A2)",
  landingPage: "'literal-leading-apostrophe",
  syncStatus: "synced",
  lastSynced: "2026-10-04T19:30:00.000Z",
};

const textColumns: Array<[keyof RevenueSheetRowValues, number]> = [
  ["pslOrderId", 1], ["provider", 2], ["providerPaymentId", 3],
  ["paymentMethod", 4], ["currency", 6], ["products", 7], ["quantities", 8],
  ["utmSource", 9], ["utmMedium", 10], ["campaign", 11], ["creative", 12],
  ["landingPage", 13], ["syncStatus", 14],
];

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks++;
}

async function main() {
  const priorFetch = globalThis.fetch;
  const envKeys = [
    "GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SHEETS_REVENUE_TAB",
    "GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  ] as const;
  const priorEnv = envKeys.map((key) => [key, process.env[key]] as const);
  const capturedWrites: Array<{ method: string; url: URL; body: unknown }> = [];
  const deniedRequests: string[] = [];
  const expectedValues = [
    "2026-10-03", "'psl_fixture", "'tagada", "'pay_fixture", "'card", "82.97", "'USD",
    "'PSL-RT-10MG, PSL-RS-5ML", "'1, 1",
    "'=IMPORTDATA(\"https://example.invalid/fixture\")", "'+123", "'-123", "'@SUM(A1:A2)",
    "''literal-leading-apostrophe", "'synced", "2026-10-04T19:30:00.000Z",
  ];

  // Replace fetch before executing any production writer function. Unknown
  // URLs are denied and asserted afterward even if caller code swallows errors.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    if (url.href === "https://oauth2.googleapis.com/token" && method === "POST") {
      if (!(init?.body instanceof URLSearchParams) ||
          init.body.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") {
        throw new Error("Unexpected fixture OAuth request");
      }
      return Response.json({ access_token: "offline_fixture_access_token" });
    }
    const base = "/v4/spreadsheets/offline_fixture_sheet/values/";
    if (url.origin === "https://sheets.googleapis.com" && url.pathname.startsWith(base)) {
      const range = decodeURIComponent(url.pathname.slice(base.length));
      if (method === "GET" && range === "Revenue_Orders!A1:P1") {
        return Response.json({ values: [["Date"]] });
      }
      if ((method === "POST" && range === "Revenue_Orders!A:P:append") ||
          (method === "PUT" && range === "Revenue_Orders!A7:P7")) {
        if (typeof init?.body !== "string") throw new Error("Missing fixture write body");
        capturedWrites.push({ method, url, body: JSON.parse(init.body) });
        return Response.json({ updates: { updatedRows: 1 } });
      }
    }
    deniedRequests.push(`${method} ${url.origin}${url.pathname}`);
    throw new Error("Non-fixture network request blocked");
  }) as typeof fetch;

  try {
    check(toSheetValues(fixture), expectedValues, "Complete row preserves column order and escapes text");
    for (const [field, column] of textColumns) {
      for (const [input, output] of [
        ["", ""], ["1, 1", "'1, 1"], ["1", "'1"], ["1, 2", "'1, 2"],
        ["1,2", "'1,2"], ["1/2", "'1/2"],
        ["2026-09-22", "'2026-09-22"], ["=1+1", "'=1+1"], ["+1", "'+1"],
        ["-1", "'-1"], ["@SUM(A1:A2)", "'@SUM(A1:A2)"], ["'original", "''original"],
        [" normal text ", "' normal text "],
      ]) {
        const values = toSheetValues({ ...fixture, [field]: input });
        check(values[column], output, `${field}: text/date/formula-like input stays literal`);
      }
    }
    const blankText = { ...fixture };
    for (const [field] of textColumns) blankText[field] = "";
    check(toSheetValues(blankText).filter((_, column) => textColumns.some(([, index]) => index === column)),
      Array(textColumns.length).fill(""), "Blank attribution/payment fields stay empty");
    for (const [date, grossRevenue, lastSynced] of [
      ["2026-09-22", "0.00", "2026-10-04T00:00:00Z"],
      ["2026-10-03", "82.97", "2026-10-04T19:30:00.000Z"],
    ]) {
      const values = toSheetValues({ ...fixture, date, grossRevenue, lastSynced });
      check([values[0], values[5], values[15]], [date, grossRevenue, lastSynced],
        "Date, numeric gross, and sync time keep existing USER_ENTERED behavior");
    }

    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "offline_fixture_sheet";
    process.env.GOOGLE_SHEETS_REVENUE_TAB = "Revenue_Orders";
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "offline-fixture@example.invalid", private_key: privateKey,
    });
    await appendRevenueSheetRow(fixture);
    await updateRevenueSheetRow(7, fixture);
    check(capturedWrites.length, 2, "Actual append and update both reached the guarded fixture");
    check(capturedWrites.map((write) => write.method), ["POST", "PUT"], "Existing write methods retained");
    for (const write of capturedWrites) {
      check(write.url.searchParams.get("valueInputOption"), "USER_ENTERED", "Existing API parsing mode retained");
      check(write.body, { values: [expectedValues] }, "Actual request uses literal-safe row serialization");
    }
    check(capturedWrites[0].url.searchParams.get("insertDataOption"), "INSERT_ROWS", "Append still inserts rows");
    check(deniedRequests, [], "No non-fixture request attempted");
    console.log(`Revenue Sheets values: ${checks} offline literal-text and writer-request checks passed.`);
  } finally {
    globalThis.fetch = priorFetch;
    for (const [key, value] of priorEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
