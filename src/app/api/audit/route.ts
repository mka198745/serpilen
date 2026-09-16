import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

const SECURITY_SCOPED_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "ACCOUNT_LOCKED",
  "LOGOUT",
  "SESSION_REVOKED",
  "SESSIONS_REVOKED",
  "SESSIONS_REVOKED_ALL",
  "POS_SHIFT_OPENED",
  "MFA_ENABLED",
];

/** GET /api/audit?scope=security — denetim kayıtları (koruma kaldırıldı; açık erişim). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");

  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(scope === "security" ? 25 : 40);

  const data = (scope === "security" ? rows.filter((r) => SECURITY_SCOPED_ACTIONS.some((a) => r.action.startsWith(a.slice(0, 8)))) : rows).map(
    (r) => ({
      id: r.id,
      userName: r.userName,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      details: r.details,
      ipAddress: r.ipAddress,
      createdAt: new Date(r.createdAt).toISOString(),
    })
  );

  return NextResponse.json({ success: true, count: data.length, data });
}

/** POST /api/audit — manuel denetim kaydı. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string; entity?: string; details?: string; userName?: string };
  if (!body.action || !body.entity) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "action ve entity zorunludur." } }, { status: 422 });
  }
  await db.insert(auditLogs).values({
    userId: "1",
    userName: (body.userName || "Sistem").slice(0, 80),
    action: body.action.toUpperCase().slice(0, 60),
    entity: body.entity.slice(0, 60),
    details: (body.details || "").slice(0, 500),
  });
  return NextResponse.json({ success: true });
}
