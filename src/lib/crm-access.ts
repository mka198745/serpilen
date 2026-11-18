import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";

export async function requireCrmAccess(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate;
  if (!roleCanAccessModule(await readRoleMatrix(), gate.user.role, "crm")) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: "CRM erişim yetkiniz bulunmuyor." }, { status: 403 }) };
  }
  return gate;
}
