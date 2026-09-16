import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authLog,
  consumeHandoffNonce,
  getUserByToken,
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
  const token = consumeHandoffNonce(url.searchParams.get("nonce"));
  const user = token ? await getUserByToken(token) : null;
  if (!token || !user) {
    authLog("claim", "REJECT", `next=${next}`);
    return NextResponse.redirect(new URL(`/?giris=1&next=${encodeURIComponent(next)}`, base));
  }
  authLog("claim", "OK", `${user.email} -> ${next}`);
  const res = NextResponse.redirect(new URL(next, base));
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(request) });
  return res;
}
