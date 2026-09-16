import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ROLES = ["SUPER_ADMIN", "STORE_MANAGER", "WAREHOUSE_KEEPER", "CASHIER", "B2B_MANAGER"] as const;

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Süper Admin",
  STORE_MANAGER: "Mağaza Müdürü",
  WAREHOUSE_KEEPER: "Depo Sorumlusu",
  CASHIER: "POS Kasiyeri",
  B2B_MANAGER: "B2B Satış Temsilcisi",
};

export async function GET() {
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

  return NextResponse.json({
    success: true,
    data: all.map((u) => ({
      ...u,
      roleLabel: ROLE_LABELS[u.role] || u.role,
      lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
      createdAt: new Date(u.createdAt).toISOString(),
    })),
  });
}

/** POST /api/users — Yeni personel kaydı. Parola doğrudan üretilir (giriş modülü kapalı olduğundan yedek tutulur). */
export async function POST(request: Request) {
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

  const [{ id: __created_id }] = await db.insert(users).values({ name, email, phone, role, passwordHash: placeholderHash }).$returningId();
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

  const updates: Record<string, unknown> = {};
  if (body?.role && ROLES.includes(String(body.role).toUpperCase() as (typeof ROLES)[number])) {
    updates.role = String(body.role).toUpperCase();
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
