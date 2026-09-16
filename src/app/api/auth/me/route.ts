import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  authLog,
  getRequestToken,
  getRequestTokenSource,
  getUserByToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Oturum çözümleme (öncelik sırasıyla):
 * 1) ipek_session çerezi, 2) Authorization: Bearer, 3) X-Auth-Token başlığı,
 * 4) POST gövdesindeki { token } (başlık düşüren proxy'lere karşı son yedek).
 */
async function resolveSession(request: Request, bodyToken?: string | null) {
  const store = await cookies();
  const cookieToken = store.get(SESSION_COOKIE)?.value || null;
  if (cookieToken) {
    const user = await getUserByToken(cookieToken);
    return { user, via: user ? "cookie" : "cookie-invalid" };
  }
  const headerToken = getRequestToken(request);
  if (headerToken) {
    const user = await getUserByToken(headerToken);
    const src = getRequestTokenSource(request) || "auth";
    return { user, via: user ? src : `${src}-invalid` };
  }
  if (bodyToken) {
    const user = await getUserByToken(bodyToken);
    return { user, via: user ? "body" : "body-invalid" };
  }
  return { user: null, via: "none" };
}

function logMe(request: Request, userEmail: string | null, via: string) {
  authLog("me", userEmail ? `OK user=${userEmail}` : "401", `via=${via}`, {
    proto: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
  });
}

/** GET /api/auth/me — Oturumdaki kullanıcı (çerez veya token başlığı). */
export async function GET(request: Request) {
  const { user, via } = await resolveSession(request);
  logMe(request, user?.email || null, via);
  if (!user) {
    return NextResponse.json({ success: false, data: { user: null } }, { status: 401 });
  }
  return NextResponse.json({ success: true, data: { user } });
}

/** POST /api/auth/me — { token } gövdesiyle oturum doğrulama (başlık yedeği). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const bodyToken = typeof body?.token === "string" && body.token ? body.token : null;
  const { user, via } = await resolveSession(request, bodyToken);
  logMe(request, user?.email || null, via);
  if (!user) {
    return NextResponse.json({ success: false, data: { user: null } }, { status: 401 });
  }
  return NextResponse.json({ success: true, data: { user } });
}
