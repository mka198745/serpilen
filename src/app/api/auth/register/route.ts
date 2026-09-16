import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSession,
  getUserByToken,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/register — B2C üye kaydı (cari kart + kullanıcı oluşturur, otomatik giriş yapar). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    city?: string;
  };
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const phone = String(body?.phone || "").trim();
  const password = String(body?.password || "");
  const city = body?.city ? String(body.city).trim() : null;

  if (!name || name.length < 2) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Ad Soyad zorunludur." } },
      { status: 422 }
    );
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir e-posta girin." } },
      { status: 422 }
    );
  }
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir telefon numarası girin." } },
      { status: 422 }
    );
  }
  if (!password || password.length < 6) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Şifre en az 6 karakter olmalı." } },
      { status: 422 }
    );
  }

  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (exists) {
    return NextResponse.json(
      { success: false, error: { code: "DUPLICATE", message: "Bu e-posta ile zaten bir üyelik var. Giriş yapmayı deneyin." } },
      { status: 409 }
    );
  }

  // 1. Cari kart
  const [{ id: customerId }] = await db
    .insert(customers)
    .values({ type: "B2C", name, email, phone, city, segment: "YENİ", notes: "Web sitesi üyeliği ile oluşturuldu." })
    .$returningId();
  // 2. Kullanıcı
  const [{ id: userId }] = await db
    .insert(users)
    .values({
      name,
      email,
      phone,
      passwordHash: hashPassword(password),
      role: "B2C_CUSTOMER",
      customerId,
    })
    .$returningId();

  const { token, expiresAt } = await createSession(userId, {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: request.headers.get("user-agent"),
  });
  const sessionUser = await getUserByToken(token);

  const res = NextResponse.json({
    success: true,
    data: { user: sessionUser, customerId, expiresAt: expiresAt.toISOString() },
  });
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_SECONDS });
  return res;
}
