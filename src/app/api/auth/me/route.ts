import { NextResponse } from "next/server";
import { authLog, getRequestToken, getSessionUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — Oturumdaki kullanıcı (çerez veya Authorization: Bearer). */
export async function GET(request: Request) {
  const user = await getSessionUserFromRequest(request);
  const via = user
    ? request.headers.get("cookie")?.includes("ipek_session=")
      ? "cookie"
      : getRequestToken(request)
        ? "bearer"
        : "?"
    : request.headers.get("cookie")?.includes("ipek_session=")
      ? "cookie-invalid"
      : getRequestToken(request)
        ? "bearer-invalid"
        : "none";
  authLog("me", user ? `OK user=${user.email}` : "401", `via=${via}`, {
    proto: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
  });
  if (!user) {
    return NextResponse.json({ success: false, data: { user: null } }, { status: 401 });
  }
  return NextResponse.json({ success: true, data: { user } });
}
