import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authLog,
  createSession,
  getUserByToken,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const looksLikeScryptHash = (v: string | null | undefined) => !!v && v.startsWith("scrypt$") && v.split("$").length === 3;

/** POST /api/auth/login — E-posta + şifre ile giriş, httpOnly çerez yazar. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");

  const reqMeta = {
    proto: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
    ua: request.headers.get("user-agent")?.slice(0, 100),
  };

  if (!email || !email.includes("@") || !password) {
    authLog("login", "VALIDATION_ERROR", email || "(boş)", reqMeta);
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "E-posta ve şifre zorunludur." } },
      { status: 422 }
    );
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Zamanlama bilgisizliği için kullanıcı yoksa da sahte doğrulama yap.
  const ok = user ? verifyPassword(password, user.passwordHash) : verifyPassword(password, hashPassword("dummy"));
  if (!user || !ok) {
    authLog("login", "INVALID_CREDENTIALS", email, reqMeta);
    return NextResponse.json(
      { success: false, error: { code: "INVALID_CREDENTIALS", message: "E-posta veya şifre hatalı." } },
      { status: 401 }
    );
  }
  if (user.isActive === false) {
    authLog("login", "ACCOUNT_DISABLED", email, reqMeta);
    return NextResponse.json(
      { success: false, error: { code: "ACCOUNT_DISABLED", message: "Bu hesap pasife alınmış. Lütfen yöneticiyle iletişime geçin." } },
      { status: 403 }
    );
  }
  // Eski/sahte özet formatı gerçek girişe kapatıldı (güvenlik).
  if (!looksLikeScryptHash(user.passwordHash)) {
    authLog("login", "PASSWORD_RESET_REQUIRED", email, reqMeta);
    return NextResponse.json(
      { success: false, error: { code: "PASSWORD_RESET_REQUIRED", message: "Bu hesap için yeni şifre tanımlanması gerekiyor." } },
      { status: 403 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    (request as unknown as { ip?: string }).ip ||
    null;
  const { token, expiresAt } = await createSession(user.id, {
    ip,
    userAgent: request.headers.get("user-agent"),
  });
  await db.update(users).set({ lastLoginAt: new Date(), failedLoginCount: 0 }).where(eq(users.id, user.id));

  const sessionUser = await getUserByToken(token);
  const cookieOpts = sessionCookieOptions(request);
  authLog("login", "OK", email, { ...reqMeta, role: sessionUser?.role, cookieSecure: !!cookieOpts.secure, sameSite: cookieOpts.sameSite });
  const res = NextResponse.json({
    success: true,
    data: { user: sessionUser, token, expiresAt: expiresAt.toISOString() },
  });
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(request), maxAge: SESSION_TTL_SECONDS });
  return res;
}
