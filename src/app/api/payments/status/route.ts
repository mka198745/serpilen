import { NextResponse } from "next/server";
import { getPaymentSettingsMasked } from "@/lib/payment-settings";

export const dynamic = "force-dynamic";

/** GET /api/payments/status — Herkese açık güvenli özet: hangi sağlayıcı yapılandırılmış/etkin (gizli bilgi YOK). */
export async function GET() {
  try {
    const m = await getPaymentSettingsMasked();
    return NextResponse.json({
      success: true,
      data: {
        paytr: { enabled: m.paytr.enabled, configured: m.paytr.hasMerchantKey && m.paytr.hasMerchantSalt && Boolean(m.paytr.merchantId), mode: m.paytr.mode },
        iyzico: { enabled: m.iyzico.enabled, configured: m.iyzico.hasApiSecret && Boolean(m.iyzico.apiKey), mode: m.iyzico.mode },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Ödeme durumu alınamadı." } }, { status: 500 });
  }
}
