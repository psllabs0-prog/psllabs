/** Render synthetic previews only. This script never calls a sender or a database. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCustomerOrderConfirmationEmail } from "../lib/email/order-confirmation";
import { buildOrderShippedEmail } from "../lib/email/order-shipped";
import { buildDeliveryFollowupEmail } from "../lib/email/delivery-followup";
import { buildRetention30dEmail } from "../lib/retention/email";
import { buildNewsletterWelcomeEmail } from "../lib/newsletter/templates";
import { escapeHtml } from "../lib/email/shared";
import { documentationPreviewOrder } from "./fixtures/customer-documentation";

process.env.MARKETING_UNSUB_SECRET = "offline-preview-only-not-a-live-unsubscribe-key";
process.env.MARKETING_POSTAL_ADDRESS = "PREVIEW ONLY — configured postal address appears in sent marketing emails";
const directory = resolve(process.argv[2] || "work/customer-documentation-previews");
mkdirSync(directory, { recursive: true });
const previews = [
  { name: "order-confirmation", ...buildCustomerOrderConfirmationEmail(documentationPreviewOrder) },
  { name: "order-shipped", ...buildOrderShippedEmail(documentationPreviewOrder) },
  { name: "order-followup", ...buildDeliveryFollowupEmail(documentationPreviewOrder) },
  { name: "retention-opted-in", ...buildRetention30dEmail({ email: documentationPreviewOrder.email }) },
  ...(["welcome_1", "welcome_2", "welcome_3"] as const).map((kind) => ({ name: kind, ...buildNewsletterWelcomeEmail({ kind, siteUrl: "https://www.psllabs.org", unsubscribeToken: "PREVIEW-NOT-A-VALID-TOKEN", postalAddress: process.env.MARKETING_POSTAL_ADDRESS! }) })),
];
for (const preview of previews) {
  writeFileSync(resolve(directory, `${preview.name}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(preview.subject)}</title></head><body style="margin:0;background:#0B0C0E;"><div style="max-width:640px;margin:auto;">${preview.html}</div></body></html>`);
  writeFileSync(resolve(directory, `${preview.name}.txt`), `Subject: ${preview.subject}\n\n${preview.text}\n`);
}
console.log(`Rendered ${previews.length} synthetic email previews into ${directory}; nothing sent.`);
