import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  SESSION_COOKIE,
  authLog,
  consumeHandoffNonce,
  createSession,
  publicBaseUrl,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") && !raw.includes("://")) return raw;
  return "/";
}

/**
 * GET /api/auth/claim?nonce=...&next=/admin — Geçiş jetonunu oturum çerezine
 * çevirip hedefe yönlendirir. Yönlendirme MUTLAK adrestir (NextResponse göreli
 * kabul etmez) ama kök, Host başlığından türetilir: iç adres (0.0.0.0) asla
 * sızmaz, proxy arkasındaki genel adres korunur.
 * Jeton geçersizse giriş penceresine dönülür.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const base = publicBaseUrl(request);
  const nonce = url.searchParams.get("nonce");
  const userId = await consumeHandoffNonce(nonce);
  const [claimUser] = userId
    ? await db.select().from(users).where(eq(users.id, userId)).limit(1)
    : [];
  if (!nonce || !userId || !claimUser || claimUser.isActive === false) {
    authLog("claim", "REJECT", `next=${next}`);
    return NextResponse.redirect(new URL(`/?giris=1&next=${encodeURIComponent(next)}`, base));
  }
  authLog("claim", "OK", `${claimUser.email} -> ${next}`);
  // Claim YENİ bir oturum üretir (ham geçiş jetonu değil, taze token çereze yazılır).
  // Çerezi yaz (çalışırsa kayırma) VE hedefe ?kt= jetonu ekle: çerezleri
  // engellenen tarayıcılarda korumalı sayfa jetonu tüketerek sunucu oturumu görür.
  const { token } = await createSession(userId, {
    ip: request.headers.get("x-forwarded-for")?.slice(0, 60) || null,
    userAgent: request.headers.get("user-agent"),
  });
  const target = new URL(next, base);
  target.searchParams.set("kt", nonce);
  const res = NextResponse.redirect(target);
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(request) });
  return res;
}
