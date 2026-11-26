import { NextResponse } from "next/server";
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings";

import { requireStaff, getUserByToken } from "@/lib/auth";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
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

  const bad = validateCrmWrite(request);
  if (bad) return bad;
  if (!request.headers.get("origin")) {
    const auth = request.headers.get("authorization") || "";
    const actor = auth.startsWith("Bearer ") ? await getUserByToken(auth.slice(7).trim()) : null;
    if (!actor || actor.id !== __gate.user.id) return NextResponse.json({success:false,error:{message:"İstek kaynağı doğrulanamadı."}},{status:403});
  }
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return NextResponse.json({success:false,error:{message:"Geçersiz istek."}},{status:400});
  const body = parsed.value as Record<string, unknown>;
  const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch) ? body.patch as Record<string,unknown> : body;
  const cartKeys = Object.keys(patch).filter(k => k.startsWith("site.cart.") || k.startsWith("site.checkout."));
  if (cartKeys.length && !roleCanAccessModule(await readRoleMatrix(), __gate.user.role, "siteCart")) return NextResponse.json({success:false,error:{message:"Sepet ayarlarını değiştirme yetkiniz bulunmuyor."}},{status:403});
  const protectedKeys = ["site.checkout.eft_iban", "site.checkout.eft_account_name", "site.checkout.eft_bank"];
  if (__gate.user.role !== "SUPER_ADMIN" && protectedKeys.some(k => k in patch)) {
    const existing = await getSiteSettings();
    if (protectedKeys.some(k => k in patch && String(patch[k]) !== existing[k])) return NextResponse.json({success:false,error:{message:"Banka hesap bilgilerini yalnız Süper Admin değiştirebilir."}},{status:403});
    // Never let an unchanged/stale manager form overwrite a concurrent admin bank update.
    for (const key of protectedKeys) delete patch[key];
  }
  try {
    await saveSiteSettings(patch);
    const settings = await getSiteSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (err: any) {
    console.error("Site settings save error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Ayarlar kaydedilemedi." } }, { status: 500 });
  }
}
