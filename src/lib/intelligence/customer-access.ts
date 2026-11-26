import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";

/** This guard is intentionally limited to customer analytics and profitability routes. */
export async function requireIntelligenceRead(request: Request, needsCrm = false) {
  const gate = await requireStaff(request);
  if (!gate.ok) {
    gate.response.headers.set("Cache-Control", "private, no-store");
    return gate;
  }
  try {
    const matrix = await readRoleMatrix();
    if (!roleCanAccessModule(matrix, gate.user.role, "intelligence")) return denied("Intelligence Center erişim yetkisi gerekir.");
    if (needsCrm && !roleCanAccessModule(matrix, gate.user.role, "crm")) return denied("Bu müşteri analizi için Intelligence Center ve CRM okuma yetkileri birlikte gerekir.");
    return { ok: true as const, user: gate.user, matrix };
  } catch {
    return { ok: false as const, response: NextResponse.json({ success: false, error: { code: "ACCESS_ERROR", message: "Yetkiler doğrulanamadı." } }, { status: 500, headers: { "Cache-Control": "private, no-store" } }) };
  }
}

function denied(message: string) {
  return { ok: false as const, response: NextResponse.json({ success: false, error: { code: "FORBIDDEN", message } }, { status: 403, headers: { "Cache-Control": "private, no-store" } }) };
}

export function privateIntelligenceResponse(data: unknown) {
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}
