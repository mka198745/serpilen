import { NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — Oturumdaki kullanıcı (çerez veya Authorization: Bearer). */
export async function GET(request: Request) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, data: { user: null } }, { status: 401 });
  }
  return NextResponse.json({ success: true, data: { user } });
}
