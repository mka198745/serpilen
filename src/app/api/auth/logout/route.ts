import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getRequestToken, revokeSessionByToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — Oturumu kapatır (çerez veya Bearer token iptali + çerez temizleme). */
export async function POST(request: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value || getRequestToken(request);
  await revokeSessionByToken(token).catch(() => undefined);
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
