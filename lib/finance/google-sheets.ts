import crypto from "crypto";

type ServiceAccountCreds = {
  clientEmail: string;
  privateKey: string;
};

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

export function getGoogleSheetsConfig(): {
  spreadsheetId: string;
  sheetName: string;
  creds: ServiceAccountCreds;
} | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) return null;

  const sheetName =
    process.env.GOOGLE_SHEETS_REVENUE_TAB?.trim() || "Revenue_Orders";

  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as {
        client_email?: string;
        private_key?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return {
          spreadsheetId,
          sheetName,
          creds: {
            clientEmail: parsed.client_email,
            privateKey: normalizePrivateKey(parsed.private_key),
          },
        };
      }
    } catch {
      console.error("[finance/sheets] GOOGLE_SERVICE_ACCOUNT_JSON is invalid JSON");
      return null;
    }
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) return null;

  return {
    spreadsheetId,
    sheetName,
    creds: {
      clientEmail,
      privateKey: normalizePrivateKey(privateKey),
    },
  };
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(creds: ServiceAccountCreds): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: creds.clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(creds.privateKey));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth token failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google OAuth token response missing access_token");
  }
  return data.access_token;
}

export const REVENUE_SHEET_HEADERS = [
  "Date",
  "PSL Order ID",
  "Provider",
  "Provider Payment ID",
  "Payment Method",
  "Gross Revenue",
  "Currency",
  "Products",
  "Quantities",
  "UTM Source",
  "UTM Medium",
  "Campaign",
  "Creative",
  "Landing Page",
  "Sync Status",
  "Last Synced",
] as const;

async function sheetsFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`https://sheets.googleapis.com/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function ensureRevenueSheetHeaderRow(): Promise<void> {
  const config = getGoogleSheetsConfig();
  if (!config) throw new Error("Google Sheets is not configured");

  const token = await getAccessToken(config.creds);
  const range = encodeURIComponent(`${config.sheetName}!A1:P1`);
  const getRes = await sheetsFetch(
    token,
    `/spreadsheets/${config.spreadsheetId}/values/${range}`
  );
  if (!getRes.ok) {
    const text = await getRes.text();
    throw new Error(`Sheets read header failed (${getRes.status}): ${text.slice(0, 200)}`);
  }
  const data = (await getRes.json()) as { values?: string[][] };
  const first = data.values?.[0]?.[0];
  if (first === REVENUE_SHEET_HEADERS[0]) return;

  const putRes = await sheetsFetch(
    token,
    `/spreadsheets/${config.spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [Array.from(REVENUE_SHEET_HEADERS)] }),
    }
  );
  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`Sheets write header failed (${putRes.status}): ${text.slice(0, 200)}`);
  }
}

export async function findSheetRowByOrderId(
  orderId: string
): Promise<number | null> {
  const config = getGoogleSheetsConfig();
  if (!config) throw new Error("Google Sheets is not configured");

  const token = await getAccessToken(config.creds);
  const range = encodeURIComponent(`${config.sheetName}!B:B`);
  const res = await sheetsFetch(
    token,
    `/spreadsheets/${config.spreadsheetId}/values/${range}`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets lookup failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values ?? [];
  for (let i = 0; i < values.length; i += 1) {
    if ((values[i]?.[0] ?? "").trim() === orderId) {
      return i + 1; // 1-indexed sheet row
    }
  }
  return null;
}

export type RevenueSheetRowValues = {
  date: string;
  pslOrderId: string;
  provider: string;
  providerPaymentId: string;
  paymentMethod: string;
  grossRevenue: string;
  currency: string;
  products: string;
  quantities: string;
  utmSource: string;
  utmMedium: string;
  campaign: string;
  creative: string;
  landingPage: string;
  syncStatus: string;
  lastSynced: string;
};

function toSheetValues(row: RevenueSheetRowValues): string[] {
  return [
    row.date,
    row.pslOrderId,
    row.provider,
    row.providerPaymentId,
    row.paymentMethod,
    row.grossRevenue,
    row.currency,
    row.products,
    row.quantities,
    row.utmSource,
    row.utmMedium,
    row.campaign,
    row.creative,
    row.landingPage,
    row.syncStatus,
    row.lastSynced,
  ];
}

export async function appendRevenueSheetRow(
  row: RevenueSheetRowValues
): Promise<void> {
  const config = getGoogleSheetsConfig();
  if (!config) throw new Error("Google Sheets is not configured");

  await ensureRevenueSheetHeaderRow();
  const token = await getAccessToken(config.creds);
  const range = encodeURIComponent(`${config.sheetName}!A:P`);
  const res = await sheetsFetch(
    token,
    `/spreadsheets/${config.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [toSheetValues(row)] }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets append failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function updateRevenueSheetRow(
  sheetRowNumber: number,
  row: RevenueSheetRowValues
): Promise<void> {
  const config = getGoogleSheetsConfig();
  if (!config) throw new Error("Google Sheets is not configured");

  const token = await getAccessToken(config.creds);
  const range = encodeURIComponent(
    `${config.sheetName}!A${sheetRowNumber}:P${sheetRowNumber}`
  );
  const res = await sheetsFetch(
    token,
    `/spreadsheets/${config.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [toSheetValues(row)] }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets update failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export function isGoogleSheetsConfigured(): boolean {
  return getGoogleSheetsConfig() !== null;
}
