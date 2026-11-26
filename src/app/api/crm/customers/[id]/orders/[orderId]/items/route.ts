import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";
import { canStillReadCrm } from "@/lib/crm-write-access";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const validId = (value: string) => /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value));

/** Extra pages only for an order directly linked to this customer. */
export async function GET(request: Request, context: { params: Promise<{ id: string; orderId: string }> }) {
  const gate = await requireCrmAccess(request);
  if (!gate.ok) return gate.response;
  const { id, orderId } = await context.params;
  const pageText = new URL(request.url).searchParams.get("page") || "1";
  if (!validId(id) || !validId(orderId) || !/^[1-9]\d{0,5}$/.test(pageText)) {
    return NextResponse.json({ success: false, error: "Geçersiz müşteri, sipariş veya sayfa." }, { status: 422, headers });
  }
  const page = Number(pageText), limit = 50;
  try {
    const result = sqlite.transaction(() => {
      if (!canStillReadCrm(gate.user)) return { status: 403 } as const;
      if (!sqlite.prepare("SELECT 1 FROM orders WHERE id=? AND customer_id=?").get(Number(orderId), Number(id))) return { status: 404 } as const;
      const rows = sqlite.prepare(`SELECT product_name AS productName, variant_name AS variantName, quantity, unit_price AS unitPrice, total_price AS totalPrice FROM order_items WHERE order_id=? ORDER BY id LIMIT ? OFFSET ?`).all(Number(orderId), limit + 1, (page - 1) * limit);
      sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'CRM_ORDER_ITEMS_VIEW','Customer',?,?)").run(String(gate.user.id), gate.user.name, id, `CRM sipariş ürünleri #${orderId}, sayfa ${page}`);
      return { status: 200, data: rows.slice(0, limit), pagination: { page, limit, hasMore: rows.length > limit } } as const;
    }).immediate();
    if (result.status === 403) return NextResponse.json({ success: false, error: "CRM erişim yetkiniz bulunmuyor." }, { status: 403, headers });
    if (result.status === 404) return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404, headers });
    return NextResponse.json({ success: true, data: result.data, pagination: result.pagination }, { headers });
  } catch (error) {
    console.error("CRM order items failed", error);
    return NextResponse.json({ success: false, error: "Sipariş ürünleri yüklenemedi." }, { status: 500, headers });
  }
}
