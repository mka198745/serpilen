import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";

export async function requireCrmAccess(request: Request, access: "read" | "write" = "read") {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate;
  const matrix = await readRoleMatrix();
  if (!roleCanAccessModule(matrix, gate.user.role, "crm") || (access === "write" && !roleCanAccessModule(matrix, gate.user.role, "crmWrite"))) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: "CRM erişim yetkiniz bulunmuyor." }, { status: 403 }) };
  }
  return gate;
}
