import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { getSql } from "../lib/db/sql";
import { isDesignPreview } from "../lib/design-preview";
import { createPrivacyService, createConsentToken } from "../lib/privacy/service";
import { designPreviewConsentStore } from "../lib/privacy/design-preview-store";
import { NO_PRIVACY_CAPABILITIES } from "../lib/privacy/types";
import { GET as inventoryGET } from "../app/api/inventory/availability/route";

async function main() {
  const previous = { PSL_VISUAL_PREVIEW: process.env.PSL_VISUAL_PREVIEW, VERCEL_ENV: process.env.VERCEL_ENV };
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => { requests++; throw new Error("Preview checks prohibit external requests"); }) as typeof fetch;
  try {
    delete process.env.PSL_VISUAL_PREVIEW;
    process.env.VERCEL_ENV = "production";
    assert.equal(isDesignPreview(), false);
    process.env.VERCEL_ENV = "preview";
    assert.equal(isDesignPreview(), false, "other existing previews are not reconfigured");
    process.env.PSL_VISUAL_PREVIEW = "1";
    assert.equal(isDesignPreview(), true);
    assert.throws(() => getSql(), /no access to operational databases/);
    const inventoryResponse = await inventoryGET(new Request("https://preview.invalid/api/inventory/availability?handles=ghk-cu,mots-c,unknown"));
    const previewInventory = await inventoryResponse.json();
    assert.equal(previewInventory.previewOnly, true);
    assert.deepEqual(previewInventory.availability.map((row: { handle: string; tracked: boolean }) => [row.handle, row.tracked]),
      [["ghk-cu", false]], "preview inventory is only source fallback, never operational stock or unreleased products");
    const blocked = ["/api/checkout", "/api/checkout/card/session", "/api/contact", "/api/newsletter",
      "/api/meta/events", "/api/tiktok/events", "/api/admin/orders", "/api/cron/finance-reconcile",
      "/api/webhooks/tagada", "/api/track", "/admin-ledger.01", "/admin", "/success", "/unsubscribe"];
    for (const path of blocked) {
      for (const method of ["GET", "POST"]) {
        const response = await proxy(new NextRequest(`https://preview.invalid${path}`, { method }));
        assert.equal(response.status, 403, `${method} ${path} must be blocked`);
      }
    }
    for (const path of ["/", "/products", "/products/psl-ghkcu-50mg", "/checkout", "/api/inventory/availability", "/api/privacy/consent"]) {
      const response = await proxy(new NextRequest(`https://preview.invalid${path}`));
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
    }
    const token = createConsentToken();
    const service = createPrivacyService({ store: designPreviewConsentStore, capabilities: () => NO_PRIVACY_CAPABILITIES });
    const unknown = await service.read(token, { admin: false, gpc: false });
    assert.equal(unknown.consent.choice, "unknown");
    const saved = await service.save(token, { measurement: true, personalization: true }, { admin: false, gpc: false });
    assert.equal(saved.consent.choice, "saved");
    assert.equal(saved.consent.measurement, false);
    assert.equal(saved.consent.personalization, false);
    assert.equal(saved.binding, null);
    assert.deepEqual(saved.consent.capabilities, NO_PRIVACY_CAPABILITIES);
    for (const provider of ["meta", "tiktok", "google", "openai"] as const) assert.equal(await service.current(saved.binding, provider), false);
    const withdrawn = await service.save(token, { measurement: false, personalization: false }, { admin: false, gpc: false });
    assert.equal(withdrawn.consent.measurement, false);
    assert((await service.read(token, { admin: false, gpc: true })).consent.gpc);
    assert.equal(requests, 0);
    console.log("Preview: production database denied, mutations/private routes blocked, isolated consent/GPC/withdrawal and all advertising permissions off; zero external requests.");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
