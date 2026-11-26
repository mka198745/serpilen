import { NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { contactMessages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { getUserByToken } from "@/lib/auth";
import { requireStaff } from "@/lib/auth";
import { getSessionUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SUBJECTS = [
  "Sipariş Takibi & Kargo",
  "Ürün Teknik Bilgisi / İplik Seçimi",
  "İade veya Değişim Talebi",
  "Diğer",
] as const;

const STATUSES = ["NEW", "READ", "ANSWERED"] as const;

/**
 * POST /api/contact — "İletişim & Destek Masası" formundan gelen mesajı kaydeder.
 * Herkese açıktır (ziyaretçi/üye fark etmez); basit uzunluk doğrulamaları uygulanır.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => String(v ?? "").trim();

  const name = str(body.name).slice(0, 120);
  const phone = str(body.phone).slice(0, 40);
  const email = str(body.email).slice(0, 160).toLowerCase();
  const subjectRaw = str(body.subject).slice(0, 80);
  const subject = subjectRaw ? (SUBJECTS.includes(subjectRaw as (typeof SUBJECTS)[number]) ? subjectRaw : subjectRaw) : "Diğer";
  const message = str(body.message).slice(0, 4000);

  if (name.length < 2) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Adınızı ve soyadınızı yazın." } }, { status: 422 });
  }
  if (phone.length < 6) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir telefon numarası yazın." } }, { status: 422 });
  }
  if (email && !email.includes("@")) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir e-posta adresi yazın." } }, { status: 422 });
  }
  if (message.length < 5) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Mesajınız en az 5 karakter olmalı." } }, { status: 422 });
  }

  const user = await getSessionUserFromRequest(request);
  try {
    const [row] = await db
      .insert(contactMessages)
      .values({
        name,
        phone,
        email: email || null,
        subject,
        message,
        status: "NEW",
        source: "iletisim",
        createdBy: user?.email ?? null,
      })
      .returning({ id: contactMessages.id, createdAt: contactMessages.createdAt });

    return NextResponse.json({ success: true, data: { id: row.id, receivedAt: row.createdAt } }, { status: 201 });
  } catch (err: unknown) {
    console.error("Contact message save error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Mesajınız kaydedilemedi, lütfen tekrar deneyin." } }, { status: 500 });
  }
}

const privateHeaders = { "Cache-Control": "private, no-store" };
const failure = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status, headers: privateHeaders });

/** Independent support permission: these messages are not linked to CRM cards. */
export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) { gate.response.headers.set("Cache-Control", "private, no-store"); return gate.response; }
  try {
    const matrix = await readRoleMatrix();
    if (!roleCanAccessModule(matrix, gate.user.role, "support")) return failure(403, "FORBIDDEN", "Destek Masası erişim yetkiniz bulunmuyor.");
    const status = (new URL(request.url).searchParams.get("status") || "").toUpperCase();
    if (status && !(STATUSES as readonly string[]).includes(status)) return failure(422, "VALIDATION_ERROR", "Geçersiz durum filtresi.");
    const base = db.select().from(contactMessages);
    const rows = status
      ? await base.where(eq(contactMessages.status, status)).orderBy(desc(contactMessages.createdAt)).limit(200)
      : await base.orderBy(desc(contactMessages.createdAt)).limit(200);
    const all = await db.select({ status: contactMessages.status }).from(contactMessages);
    const counts = { total: all.length, NEW: all.filter(r => r.status === "NEW").length, READ: all.filter(r => r.status === "READ").length, ANSWERED: all.filter(r => r.status === "ANSWERED").length };
    return NextResponse.json({ success: true, data: rows, counts }, { headers: privateHeaders });
  } catch (error) {
    console.error("Destek mesajları yüklenemedi", error instanceof Error ? error.name : "UnknownError");
    return failure(500, "INTERNAL_ERROR", "Mesajlar yüklenemedi.");
  }
}

/** PATCH /api/contact — durum değişimi, destek yetkisi ve içeriksiz audit. */
export async function PATCH(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) { gate.response.headers.set("Cache-Control", "private, no-store"); return gate.response; }
  const invalid = validateCrmWrite(request);
  if (invalid) return invalid;
  if (!request.headers.get("origin")) {
    const bearer = request.headers.get("authorization");
    const actor = bearer?.startsWith("Bearer ") ? await getUserByToken(bearer.slice(7).trim()) : null;
    if (!actor || actor.id !== gate.user.id) return failure(403, "FORBIDDEN", "İstek kaynağı doğrulanamadı.");
  }
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return failure(422, "VALIDATION_ERROR", "Geçersiz mesaj veya durum.");
  const body = parsed.value as Record<string, unknown>;
  if (Object.keys(body).some(k => !["id", "status"].includes(k)) || !Number.isSafeInteger(body.id) || Number(body.id) <= 0 || typeof body.status !== "string" || !(STATUSES as readonly string[]).includes(body.status)) return failure(422, "VALIDATION_ERROR", "Geçersiz mesaj veya durum.");
  const id = body.id as number, status = body.status as string;
  try {
    const update = sqlite.transaction(() => {
      const actor = sqlite.prepare("SELECT role,is_active AS active FROM users WHERE id=?").get(gate.user.id) as { role: string; active: number } | undefined;
      const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as { value: string } | undefined;
      let saved: unknown = null;
      try { if (setting?.value) saved = JSON.parse(setting.value); } catch { /* use existing defaults */ }
      if (!actor?.active || actor.role !== gate.user.role || !roleCanAccessModule(normalizeRoleMatrix(saved), actor.role, "support")) return { status: 403 } as const;
      const existing = sqlite.prepare("SELECT status FROM contact_messages WHERE id=?").get(id) as { status: string } | undefined;
      if (!existing) return { status: 404 } as const;
      if (existing.status !== status) {
        sqlite.prepare("UPDATE contact_messages SET status=?,read_at=CASE WHEN ?='NEW' THEN NULL ELSE unixepoch() END WHERE id=?").run(status, status, id);
        sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'CONTACT_STATUS_CHANGED','ContactMessage',?,?)").run(String(gate.user.id),gate.user.name,String(id),`Durum: ${(STATUSES as readonly string[]).includes(existing.status) ? existing.status : "OTHER"} → ${status}`);
      }
      return { status: 200 } as const;
    }).immediate();
    if (update.status === 403) return failure(403, "FORBIDDEN", "Destek Masası erişim yetkiniz bulunmuyor.");
    if (update.status === 404) return failure(404, "NOT_FOUND", "Mesaj bulunamadı.");
    return NextResponse.json({ success: true, data: { id, status } }, { headers: privateHeaders });
  } catch (error) {
    console.error("Destek mesajı güncellenemedi", error instanceof Error ? error.name : "UnknownError");
    return failure(500, "INTERNAL_ERROR", "Durum güncellenemedi.");
  }
}
