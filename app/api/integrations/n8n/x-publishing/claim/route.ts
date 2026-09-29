import { handleXMachineRequest } from "@/lib/x-publishing/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleXMachineRequest(request, { kind: "claim" });
}
