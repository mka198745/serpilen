import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, revokeSessionByToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — Oturumu kapatır (token iptal + çerez temizleme). */
export async function POST() {
  const store = await cookies();
  await revokeSessionByToken(store.get(SESSION_COOKIE)?.value).catch(() => undefined);
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
