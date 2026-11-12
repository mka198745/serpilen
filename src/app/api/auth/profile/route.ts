import { NextResponse } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUserFromRequest, ROLE_LABELS_TR } from "@/lib/auth";

export const dynamic = "force-dynamic";

function profilePayload(u: {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: Date | null;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "",
    role: u.role,
    roleLabel: ROLE_LABELS_TR[u.role] || u.role,
    isStaff: ["SUPER_ADMIN", "STORE_MANAGER", "WAREHOUSE_KEEPER", "CASHIER"].includes(u.role),
    memberSince: u.createdAt ? u.createdAt.toISOString() : null,
  };
}

/** GET /api/auth/profile — oturumdaki kullanıcının kendi profili. */
export async function GET(request: Request) {
  const session = await getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Oturum gerekli." }, { status: 401 });
  }
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ success: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: profilePayload(row) });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9\s().-]{7,20}$/;

/** PATCH /api/auth/profile — kullanıcı kendi ad/e-posta/telefonunu günceller. */
export async function PATCH(request: Request) {
  const session = await getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Oturum gerekli." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    phone?: string;
  };

  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();

  if (name.length < 2 || name.length > 100) {
    return NextResponse.json({ success: false, error: "Ad Soyad en az 2 karakter olmalıdır." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ success: false, error: "Geçerli bir e-posta adresi girin." }, { status: 400 });
  }
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json({ success: false, error: "Geçerli bir telefon numarası girin (ör. 05xx xxx xx xx)." }, { status: 400 });
  }

  // E-posta başka bir kullanıcıda kayıtlı mı?
  const [conflict] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, session.id)))
    .limit(1);
  if (conflict) {
    return NextResponse.json({ success: false, error: "Bu e-posta adresi zaten başka bir kullanıcıda kayıtlı." }, { status: 409 });
  }

  await db.update(users).set({ name, email, phone }).where(eq(users.id, session.id));

  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  return NextResponse.json({ success: true, data: profilePayload(row) });
}
