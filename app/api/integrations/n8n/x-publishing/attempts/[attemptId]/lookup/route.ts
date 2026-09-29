import { handleXMachineRequest } from "@/lib/x-publishing/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;
  return handleXMachineRequest(request, { kind: "lookup", attemptId });
}
