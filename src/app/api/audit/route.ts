import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff } from "@/lib/auth";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { roleCanAccessModule } from "@/lib/role-matrix-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status, headers });
const SECURITY_ACTIONS = ["LOGIN_SUCCESS", "LOGIN_FAILED", "ACCOUNT_LOCKED", "LOGOUT", "SESSION_REVOKED", "SESSIONS_REVOKED", "SESSIONS_REVOKED_ALL", "POS_SHIFT_OPENED", "MFA_ENABLED"];

type AuditRow = { id: number; userName: string | null; action: string; entity: string; entityId: string | null; details: string | null; ipAddress: string | null; createdAt: number };

/** Audit izni kayıt ayrıntılarının tamamına erişim verir; yalnız güvenilir personele açılmalı. */
export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) { gate.response.headers.set("Cache-Control", "private, no-store"); return gate.response; }
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "FORBIDDEN", "İstek kaynağı doğrulanamadı.");
  const url = new URL(request.url);
  const scopes = url.searchParams.getAll("scope");
  if (scopes.length > 1 || (scopes.length && scopes[0] !== "security")) return fail(400, "VALIDATION_ERROR", "Geçersiz denetim kapsamı.");
  const security = scopes[0] === "security";
  try {
    const data = sqlite.transaction(() => {
      const actor = sqlite.prepare("SELECT role,is_active AS active FROM users WHERE id=?").get(gate.user.id) as {role: string; active: number} | undefined;
      if (!actor?.active || actor.role !== gate.user.role) return null;
      const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value: string} | undefined;
      let saved: unknown = null;
      try { if (setting?.value) saved = JSON.parse(setting.value); } catch { /* match role matrix defaults */ }
      if (!roleCanAccessModule(normalizeRoleMatrix(saved), actor.role, "audit")) return null;
      const fields = "id, user_name AS userName, action, entity, entity_id AS entityId, details, ip_address AS ipAddress, created_at AS createdAt";
      const rows = (security
        ? sqlite.prepare(`SELECT ${fields} FROM audit_logs WHERE action IN (${SECURITY_ACTIONS.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 25`).all(...SECURITY_ACTIONS)
        : sqlite.prepare(`SELECT ${fields} FROM audit_logs ORDER BY id DESC LIMIT 40`).all()) as AuditRow[];
      // Query before recording the view so this request cannot displace its own results.
      const result = rows.map(row => ({ ...row, createdAt: new Date(row.createdAt * 1000).toISOString() }));
      sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,details,ip_address) VALUES(?,?,'AUDIT_LOG_VIEW','AuditLog',?,NULL)").run(String(gate.user.id), gate.user.name, security ? "Kapsam: security" : "Kapsam: tüm kayıtlar");
      return result;
    }).immediate();
    if (!data) return fail(403, "FORBIDDEN", "Denetim kayıtlarını görüntüleme yetkiniz bulunmuyor.");
    return NextResponse.json({ success: true, count: data.length, data }, { headers });
  } catch (error) {
    console.error("Audit read error:", error instanceof Error ? error.name : "UnknownError");
    return fail(500, "AUDIT_READ_FAILED", "Denetim kayıtları yüklenemedi.");
  }
}

/** Serbest istemci verisiyle resmi denetim olayı yazılamaz. */
export async function POST() {
  return NextResponse.json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Manuel denetim kaydı oluşturma desteklenmiyor." } }, { status: 405, headers: { ...headers, Allow: "GET" } });
}
