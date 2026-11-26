import { sqlite } from "@/db";
import { type SessionUser } from "@/lib/auth";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { roleCanAccessModule } from "@/lib/role-matrix-server";

/** Call within a SQLite IMMEDIATE transaction. */
export function canStillAccessPos(user: SessionUser): boolean {
  const actor = sqlite.prepare("SELECT role,is_active AS active FROM users WHERE id=?").get(user.id) as { role: string; active: number } | undefined;
  if (!actor?.active || actor.role !== user.role) return false;
  const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as { value: string } | undefined;
  let saved: unknown = null;
  try { if (setting?.value) saved = JSON.parse(setting.value); } catch { /* existing defaults */ }
  return roleCanAccessModule(normalizeRoleMatrix(saved), actor.role, "pos");
}
