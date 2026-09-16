import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authLog,
  consumeHandoffNonce,
  getUserByToken,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") && !raw.includes("://")) return raw;
  return "/";
}

/**
 * GET /api/auth/claim?nonce=...&next=/admin — Geçiş jetonunu oturum çerezine
 * çevirip hedefe (302) yönlendirir. Jeton geçersizse giriş penceresine döner.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const token = consumeHandoffNonce(url.searchParams.get("nonce"));
  const user = token ? await getUserByToken(token) : null;
  if (!token || !user) {
    authLog("claim", "REJECT", `next=${next}`);
    return NextResponse.redirect(new URL(`/?giris=1&next=${encodeURIComponent(next)}`, request.url));
  }
  authLog("claim", "OK", `${user.email} -> ${next}`);
  const res = NextResponse.redirect(new URL(next, request.url));
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(request) });
  return res;
}
