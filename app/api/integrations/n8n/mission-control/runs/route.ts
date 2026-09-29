import { handleN8nRequest } from "@/lib/ops/mission-control/n8n/handlers";

export async function POST(request: Request) {
  return handleN8nRequest(request, { kind: "register" });
}
