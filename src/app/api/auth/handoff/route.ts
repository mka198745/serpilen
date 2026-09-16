import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  authLog,
  getRequestToken,
  getUserByToken,
  mintHandoffNonce,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/handoff — Geçerli oturum için kısa ömürlü geçiş jetonu üretir.
 * Çerezsiz (token-only) istemciler korumalı sayfalara bu jetonla geçer:
 * istemci jetonu alıp /api/auth/claim?nonce=...&next=... adresine gider,
 * sunucu çerezi yazıp hedefe yönlendirir. Kimlik çerez / token başlığı /
 * { token } gövdesinden herhangi biriyle doğrulanır.
 */
export async function POST(request: Request) {
  const store = await cookies();
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const candidates = [
    store.get(SESSION_COOKIE)?.value || null,
    getRequestToken(request),
    typeof body?.token === "string" && body.token ? body.token : null,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const user = await getUserByToken(c);
    if (user) {
      const nonce = mintHandoffNonce(c);
      authLog("handoff", "OK", user.email);
      return NextResponse.json({ success: true, data: { nonce } });
    }
  }
  authLog("handoff", "401");
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Oturum bulunamadı." } },
    { status: 401 }
  );
}
