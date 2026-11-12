import { NextResponse } from "next/server";
import { getPaymentSettingsMasked, savePaymentSettings, PaymentValidationError } from "@/lib/payment-settings";

import { requireStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";

/** GET /api/payment-settings — Maskeli görünüm (gizli anahtarların DEĞERLERİ asla döndürülmez). */
export async function GET(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  try {
    const masked = await getPaymentSettingsMasked();
    return NextResponse.json({ success: true, data: masked });
  } catch (err: any) {
    console.error("Payment settings read error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Ayarlar okunamadı." } }, { status: 500 });
  }
}

/** POST /api/payment-settings — { patch: {...} } ya da düz nesne. Boş gizli alan = değiştirme. */
export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch =
    body && typeof body === "object" && body.patch && typeof body.patch === "object"
      ? (body.patch as Record<string, unknown>)
      : body;
  try {
    await savePaymentSettings(patch);
    const masked = await getPaymentSettingsMasked();
    return NextResponse.json({ success: true, data: masked });
  } catch (err: any) {
    if (err instanceof PaymentValidationError) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } }, { status: 422 });
    }
    console.error("Payment settings save error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Ayarlar kaydedilemedi." } }, { status: 500 });
  }
}
