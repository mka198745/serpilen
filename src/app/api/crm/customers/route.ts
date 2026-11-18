import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const gate = await requireCrmAccess(request);
  if (!gate.ok) return gate.response;
  const params = new URL(request.url).searchParams;
  const search = (params.get("q") || "").trim();
  const pageText = params.get("page") || "1";
  if (search.length > 100 || !/^[1-9]\d{0,5}$/.test(pageText)) {
    return NextResponse.json({ success: false, error: "Geçersiz arama veya sayfa." }, { status: 422 });
  }
  const page = Number(pageText), limit = 20;
  const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = `(? = '' OR c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR CAST(c.id AS TEXT) = ?)`;
  const args = [search, term, term, term, search];
  try {
    const total = (sqlite.prepare(`SELECT COUNT(*) AS n FROM customers c WHERE ${where}`).get(...args) as { n: number }).n;
    const data = sqlite.prepare(`SELECT c.id, c.name, c.email, c.phone, c.type, c.segment, c.city, c.loyalty_points AS loyaltyPoints, c.created_at AS createdAt,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orderCount,
      (SELECT COALESCE(SUM(CAST(o.grand_total AS REAL)), 0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'PAID' AND o.status NOT IN ('CANCELLED','REFUNDED','RETURNED')) AS paidOrderTotal,
      (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS lastOrderAt
      FROM customers c WHERE ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
    return NextResponse.json({ success: true, data, pagination: { page, limit, total } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM customer list failed", error);
    return NextResponse.json({ success: false, error: "Müşteriler yüklenemedi." }, { status: 500 });
  }
}
