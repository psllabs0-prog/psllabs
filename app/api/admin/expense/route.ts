import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { insertExpense } from "@/lib/ledger/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  let body: { expense_name?: unknown; cost_usd?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const expenseName =
    typeof body.expense_name === "string" ? body.expense_name.trim() : "";
  const costUsd =
    typeof body.cost_usd === "number" ? body.cost_usd : Number(body.cost_usd);
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;

  if (!expenseName || !Number.isFinite(costUsd) || costUsd <= 0) {
    return NextResponse.json(
      { error: "Expense name and a positive cost are required." },
      { status: 400 }
    );
  }

  try {
    const row = await insertExpense({
      expenseName,
      costUsd,
      notes,
    });
    return NextResponse.json({ ok: true, row });
  } catch (error) {
    console.error("[admin/expense]", error);
    return NextResponse.json(
      { error: "Unable to record expense." },
      { status: 500 }
    );
  }
}
