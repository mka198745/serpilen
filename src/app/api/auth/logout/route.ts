import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getRequestToken, revokeSessionByToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — Oturumu kapatır (çerez / token başlığı / { token } gövdesi).
 *  Claim akışının ürettiği YENİ çerez oturumu da kapatmak için tüm taşıyıcılar
 *  ayrı ayrı iptal edilir. */
export async function POST(request: Request) {
  const store = await cookies();
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const bodyToken = typeof body?.token === "string" && body.token ? body.token : null;
  const candidates = new Set<string>(
    [store.get(SESSION_COOKIE)?.value || null, getRequestToken(request), bodyToken].filter(
      (t): t is string => !!t
    )
  );
  for (const t of candidates) {
    await revokeSessionByToken(t).catch(() => undefined);
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
