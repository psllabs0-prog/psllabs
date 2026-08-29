import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin/auth";

export async function requireAdminAuth(): Promise<NextResponse | null> {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
