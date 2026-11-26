import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getUserByToken, type SessionUser } from "@/lib/auth";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { roleCanAccessModule } from "@/lib/role-matrix-server";
import { validateCrmWrite } from "@/lib/crm-write";

/** Cookie requests require same origin; an originless request must authenticate as this actor with Bearer. */
export async function validateCrmWriteAccess(request: Request, user: SessionUser): Promise<NextResponse | null> {
  const invalid = validateCrmWrite(request);
  if (invalid) return invalid;
  if (!request.headers.get("origin")) {
    const bearer = request.headers.get("authorization");
    const actor = bearer?.startsWith("Bearer ") ? await getUserByToken(bearer.slice(7).trim()) : null;
    if (!actor || actor.id !== user.id) return NextResponse.json({ success: false, error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
  }
  return null;
}

/** Call under an immediate SQLite transaction, before reading or changing CRM data. */
function currentCrmAccess(user: SessionUser, write: boolean): boolean {
  const actor = sqlite.prepare("SELECT role,is_active AS active FROM users WHERE id=?").get(user.id) as { role: string; active: number } | undefined;
  if (!actor?.active || actor.role !== user.role) return false;
  const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as { value: string } | undefined;
  let saved: unknown = null;
  try { if (setting?.value) saved = JSON.parse(setting.value); } catch { /* existing role-matrix defaults */ }
  const matrix = normalizeRoleMatrix(saved);
  return roleCanAccessModule(matrix, actor.role, "crm") && (!write || roleCanAccessModule(matrix, actor.role, "crmWrite"));
}

export function canStillReadCrm(user: SessionUser): boolean {
  return currentCrmAccess(user, false);
}

export function canStillWriteCrm(user: SessionUser): boolean {
  return currentCrmAccess(user, true);
}
