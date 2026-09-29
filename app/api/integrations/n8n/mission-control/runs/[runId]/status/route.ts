import { handleN8nRequest } from "@/lib/ops/mission-control/n8n/handlers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  return handleN8nRequest(request, { kind: "status", runId });
}
