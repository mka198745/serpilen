import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — Oturumdaki kullanıcı (yoksa 401 + user:null). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ success: false, data: { user: null } }, { status: 401 });
  }
  return NextResponse.json({ success: true, data: { user } });
}
