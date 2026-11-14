import { NextResponse } from "next/server";
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings";

import { requireStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";

/** GET /api/site-settings — Header/Footer ayarları (vars. defaults ile birleşik). */
export async function GET() {
  try {
    const settings = await getSiteSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (err: any) {
    console.error("Site settings read error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Ayarlar okunamadı." } }, { status: 500 });
  }
}

/** POST /api/site-settings — { patch: { key: value } } ya da düz nesne. */
export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch =
    body && typeof body === "object" && body.patch && typeof body.patch === "object"
      ? (body.patch as Record<string, unknown>)
      : body;
  try {
    await saveSiteSettings(patch);
    const settings = await getSiteSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (err: any) {
    console.error("Site settings save error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Ayarlar kaydedilemedi." } }, { status: 500 });
  }
}
