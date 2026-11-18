import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request);
  if (!gate.ok) return gate.response;
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d{0,14}$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası." }, { status: 422 });
  const id = Number(rawId);
  try {
    const customer = sqlite.prepare(`SELECT id, name, email, phone, type, company_name AS companyName, city, address, segment, loyalty_points AS loyaltyPoints, is_blocked AS isBlocked, created_at AS createdAt FROM customers WHERE id = ?`).get(id);
    if (!customer) return NextResponse.json({ success: false, error: "Müşteri bulunamadı." }, { status: 404 });
    const orders = sqlite.prepare(`SELECT id, order_number AS orderNumber, order_type AS orderType, status, payment_status AS paymentStatus, payment_method AS paymentMethod, grand_total AS grandTotal, created_at AS createdAt FROM orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`).all(id);
    const summary = sqlite.prepare(`SELECT COUNT(*) AS orderCount, COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND status NOT IN ('CANCELLED','REFUNDED','RETURNED') THEN CAST(grand_total AS REAL) ELSE 0 END), 0) AS paidOrderTotal, MIN(created_at) AS firstOrderAt, MAX(created_at) AS lastOrderAt FROM orders WHERE customer_id = ?`).get(id);
    const notes = sqlite.prepare(`SELECT id, body, created_by_name AS createdByName, created_at AS createdAt FROM crm_customer_notes WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`).all(id);
    sqlite.prepare(`INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?, 'CRM_CUSTOMER_VIEW', 'Customer', ?, 'CRM profil görüntüleme')`).run(String(gate.user.id), gate.user.name, rawId);
    return NextResponse.json({ success: true, data: { customer, orders, summary, notes } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM customer detail failed", error);
    return NextResponse.json({ success: false, error: "Müşteri profili yüklenemedi." }, { status: 500 });
  }
}
