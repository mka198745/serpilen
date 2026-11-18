import { NextResponse } from "next/server";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
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

/** GET /api/contact — Destek Masası listesi (personel). ?status=NEW|READ|ANSWERED */
export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;

  const status = (new URL(request.url).searchParams.get("status") || "").toUpperCase();
  const base = db.select().from(contactMessages);
  const rows =
    status && (STATUSES as readonly string[]).includes(status)
      ? await base.where(eq(contactMessages.status, status)).orderBy(desc(contactMessages.createdAt)).limit(200)
      : await base.orderBy(desc(contactMessages.createdAt)).limit(200);

  const all = await db.select({ status: contactMessages.status }).from(contactMessages);
  const counts = {
    total: all.length,
    NEW: all.filter((r) => r.status === "NEW").length,
    READ: all.filter((r) => r.status === "READ").length,
    ANSWERED: all.filter((r) => r.status === "ANSWERED").length,
  };

  return NextResponse.json({ success: true, data: rows, counts });
}

/** PATCH /api/contact — { id, status } ile mesaj durumunu günceller (personel). */
export async function PATCH(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => ({}))) as { id?: number; status?: string };
  const id = Number(body.id);
  const status = String(body.status || "").toUpperCase();
  if (!Number.isFinite(id) || !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz mesaj veya durum." } }, { status: 422 });
  }

  const [updated] = await db
    .update(contactMessages)
    .set({ status, readAt: status === "NEW" ? null : new Date() })
    .where(eq(contactMessages.id, id))
    .returning({ id: contactMessages.id, status: contactMessages.status });

  if (!updated) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Mesaj bulunamadı." } }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: updated });
}
