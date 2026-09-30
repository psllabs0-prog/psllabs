import { handleXDraftRequest } from "@/lib/x-drafts/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleXDraftRequest(request, "packet");
}
