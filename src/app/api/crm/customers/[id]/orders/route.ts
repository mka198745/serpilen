import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const pageText = new URL(request.url).searchParams.get("page") || "1";
  if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id)) || !/^[1-9]\d{0,5}$/.test(pageText)) return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası veya sayfa." }, { status: 422 });
  try {
    const customerId = Number(id), page = Number(pageText), limit = 20;
    if (!sqlite.prepare("SELECT 1 FROM customers WHERE id=?").get(customerId)) return NextResponse.json({ success: false, error: "Müşteri bulunamadı." }, { status: 404 });
    const total = (sqlite.prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id=?").get(customerId) as { n: number }).n;
    const orders = sqlite.prepare(`SELECT id, order_number AS orderNumber, order_type AS orderType, status, payment_status AS paymentStatus, payment_method AS paymentMethod, grand_total AS grandTotal, created_at AS createdAt FROM orders WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).all(customerId, limit, (page - 1) * limit) as { id: number }[];
    const itemsFor = sqlite.prepare(`SELECT product_name AS productName, variant_name AS variantName, quantity, unit_price AS unitPrice, total_price AS totalPrice FROM order_items WHERE order_id=? ORDER BY id LIMIT 200`);
    const data = orders.map(order => ({ ...order, items: itemsFor.all(order.id) }));
    return NextResponse.json({ success: true, data, pagination: { page, limit, total } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM orders failed", error);
    return NextResponse.json({ success: false, error: "Siparişler yüklenemedi." }, { status: 500 });
  }
}
