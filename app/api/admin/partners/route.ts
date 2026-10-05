import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/require-auth";
import { checkPartnerOrigin, PartnerInputError, transitionPartner, validPartnerId, validatePartnerInput, validateStatus } from "@/lib/partners/logic";
import { assertPartnersAvailable, createPartner, getPartner, loadPartnerDashboard, PartnersUnavailableError, savePartner } from "@/lib/partners/store";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: noStore }); }
function failed(error: unknown) {
  if (error instanceof PartnerInputError) return json({ error: error.message }, 400);
  if (error instanceof PartnersUnavailableError) return json({ available: false, code: "PARTNERS_NOT_MIGRATED", error: error.message }, 503);
  if (error && typeof error === "object" && "code" in error && error.code === "23505") return json({ error: "A partner with this email already exists. Refresh and edit that record." }, 409);
  // Database errors can include contact data; never expose or log the raw error.
  console.error("[admin/partners] Partner request failed.");
  return json({ error: "Unable to load or save partners. Try again." }, 500);
}
export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) { authError.headers.set("Cache-Control", "no-store"); return authError; }
  try { await assertPartnersAvailable(); return json(await loadPartnerDashboard()); } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) { authError.headers.set("Cache-Control", "no-store"); return authError; }
  if (!checkPartnerOrigin(request)) return json({ error: "Same-origin admin request required." }, 403);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return json({ error: "JSON is required." }, 415);
  if (Number(request.headers.get("content-length")) > 12000) return json({ error: "Request is too large." }, 413);
  try {
    const text = await request.text();
    if (text.length > 12000) return json({ error: "Request is too large." }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { throw new PartnerInputError("Invalid JSON."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PartnerInputError("Invalid request.");
    await assertPartnersAvailable();
    if (body.action === "create") return json({ partner: await createPartner(validatePartnerInput(body)), outboundSendingEnabled: false }, 201);
    if (!["update", "mark_contacted", "mark_replied", "pause"].includes(String(body.action))) throw new PartnerInputError("Unknown partner action.");
    if (!validPartnerId(body.id)) throw new PartnerInputError("Invalid partner ID.");
    const current = await getPartner(body.id);
    if (!current) return json({ error: "Partner not found." }, 404);
    let next;
    if (body.action === "update") {
      const input = validatePartnerInput({ ...current, ...body });
      const status = body.status === undefined ? current.status : validateStatus(body.status);
      next = { ...current, ...input, status, followUpDueAt: status !== current.status ? null : current.followUpDueAt };
    } else {
      next = transitionPartner(current, body.action as "mark_contacted" | "mark_replied" | "pause", new Date());
    }
    const partner = await savePartner(next, current.updatedAt);
    return partner ? json({ partner, outboundSendingEnabled: false }) : json({ error: "This partner changed. Refresh and try again." }, 409);
  } catch (error) { return failed(error); }
}
