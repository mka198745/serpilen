import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/db";
import { users, auditLogs, adminSessions, authNonces } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";

import { requireStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";

const ROLES = ["SUPER_ADMIN", "STORE_MANAGER", "WAREHOUSE_KEEPER", "CASHIER"] as const;

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Süper Admin",
  STORE_MANAGER: "Mağaza Müdürü",
  WAREHOUSE_KEEPER: "Depo Sorumlusu",
  CASHIER: "POS Kasiyeri",
  B2C_CUSTOMER: "Müşteri Üye",
};

export async function GET(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const type = (new URL(request.url).searchParams.get("type") || "staff").toLowerCase();
  const STAFF: readonly string[] = ROLES;

  const all = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      phone: users.phone,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.id));

  const filtered =
    type === "all"
      ? all
      : type === "customers"
      ? all.filter((u) => !STAFF.includes((u.role || "").toUpperCase()))
      : all.filter((u) => STAFF.includes((u.role || "").toUpperCase())); // varsayılan: staff

  return NextResponse.json({
    success: true,
    data: filtered.map((u) => ({
      ...u,
      roleLabel: ROLE_LABELS[u.role] || u.role,
      lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
      createdAt: new Date(u.createdAt).toISOString(),
    })),
  });
}

/** POST /api/users — Yeni personel kaydı. Parola doğrudan üretilir (giriş modülü kapalı olduğundan yedek tutulur). */
export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
  };

  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const phone = body?.phone ? String(body.phone).trim() : null;
  const role = String(body?.role || "CASHIER").toUpperCase();

  if (!name || !email || !email.includes("@")) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Ad Soyad ve geçerli e-posta zorunludur." } },
      { status: 422 }
    );
  }
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: `Geçersiz rol. İzinli: ${ROLES.join(", ")}` } },
      { status: 422 }
    );
  }

  const [exists] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (exists) {
    return NextResponse.json(
      { success: false, error: { code: "DUPLICATE", message: "Bu e-posta ile kayıtlı kullanıcı zaten var." } },
      { status: 409 }
    );
  }

  // Giriş modülü devre dışı; parola alanı schema gereği dolu tutulur (scrypt özet).
  const placeholderHash = `scrypt$${crypto.scryptSync(crypto.randomUUID(), "ipek-tuhafiye", 64).toString("hex")}`;

  const [{ id: __created_id }] = await db.insert(users).values({ name, email, phone, role, passwordHash: placeholderHash }).returning({ id: users.id });
  const [created] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, phone: users.phone, isActive: users.isActive }).from(users).where(eq(users.id, __created_id));

  await db.insert(auditLogs).values({
    userId: "1",
    userName: "Yönetici",
    action: "USER_CREATED",
    entity: "User",
    entityId: String(created.id),
    details: `Yeni personel eklendi: ${name} (${role})`,
  });

  return NextResponse.json({ success: true, data: { ...created, roleLabel: ROLE_LABELS[created.role] || created.role } });
}

/** PATCH /api/users — Rol, durum ve iletişim güncellemesi. */
export async function PATCH(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const body = (await request.json().catch(() => ({}))) as {
    id?: number;
    role?: string;
    isActive?: boolean;
    name?: string;
    phone?: string;
  };

  const id = Number(body?.id);
  if (!id) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Kullanıcı ID zorunludur." } }, { status: 422 });
  }

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Kullanıcı bulunamadı." } }, { status: 404 });
  }

  const targetIsStaff = ROLES.includes(String(target.role || "").toUpperCase() as (typeof ROLES)[number]);
  const updates: Record<string, unknown> = {};
  if (body?.role) {
    const wanted = String(body.role).toUpperCase();
    if (!targetIsStaff) {
      return NextResponse.json(
        { success: false, error: { code: "ROLE_FROZEN", message: "Kayıtlı müşteri hesaplarına rol atanamaz. Müşteri kayıtları ayrı sekmede takip edilir." } },
        { status: 422 }
      );
    }
    if (!ROLES.includes(wanted as (typeof ROLES)[number])) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Geçersiz rol. İzinli: ${ROLES.join(", ")}` } },
        { status: 422 }
      );
    }
    updates.role = wanted;
  }
  if (typeof body?.isActive === "boolean") updates.isActive = body.isActive;
  if (body?.name && String(body.name).trim()) updates.name = String(body.name).trim();
  if (body?.phone !== undefined) updates.phone = String(body.phone || "").trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Güncellenecek alan yok." } }, { status: 422 });
  }

  await db.update(users).set(updates).where(eq(users.id, id));
  const [updated] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, phone: users.phone, isActive: users.isActive }).from(users).where(eq(users.id, id));

  await db.insert(auditLogs).values({
    userId: "1",
    userName: "Yönetici",
    action: "USER_UPDATED",
    entity: "User",
    entityId: String(id),
    details: `Kullanıcı güncellendi: ${JSON.stringify(updates)}`,
  });

  return NextResponse.json({ success: true, data: { ...updated, roleLabel: ROLE_LABELS[updated.role] || updated.role } });
}

/** DELETE /api/users?id=123 — Kullanıcıyı siler. Yalnız Süper Admin.
 *  Kendi hesabınızı ve son Süper Admin'i silemezsiniz.
 *  Bağlı oturumlar (admin_sessions) ve giriş nonce'ları da temizlenir. */
export async function DELETE(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  if (gate.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Kullanıcı silme işlemi yalnız Süper Admin yetkisindedir." } },
      { status: 403 }
    );
  }

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir kullanıcı ID zorunludur (?id=)." } },
      { status: 422 }
    );
  }

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Kullanıcı bulunamadı." } }, { status: 404 });
  }
  if (target.id === gate.user.id) {
    return NextResponse.json(
      { success: false, error: { code: "SELF_DELETE", message: "Kendi hesabınızı silemezsiniz." } },
      { status: 422 }
    );
  }
  if (target.role === "SUPER_ADMIN") {
    const [{ c }] = await db.select({ c: count(users.id) }).from(users).where(eq(users.role, "SUPER_ADMIN"));
    if (Number(c) <= 1) {
      return NextResponse.json(
        { success: false, error: { code: "LAST_SUPER_ADMIN", message: "Son Süper Admin hesabı silinemez." } },
        { status: 422 }
      );
    }
  }

  // Önce bağlı kimlik kayıtlarını, sonra kullanıcıyı sil (kullanıcı kalırsa tutarlı)
  await db.delete(adminSessions).where(eq(adminSessions.userId, id));
  await db.delete(authNonces).where(eq(authNonces.userId, id));
  await db.delete(users).where(eq(users.id, id));

  await db.insert(auditLogs).values({
    userId: String(gate.user.id),
    userName: gate.user.name,
    action: "USER_DELETED",
    entity: "User",
    entityId: String(id),
    details: `Kullanıcı silindi: ${target.name} (${target.email}, ${target.role})`,
  });

  return NextResponse.json({ success: true, data: { id } });
}
