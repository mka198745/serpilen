import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";
import { readCrmJson, validateCrmWrite } from "@/lib/crm-write";
import { isValidReviewEmail } from "@/lib/review-email";
import { crmEmailKey, hasCrmContactDuplicate } from "@/lib/crm-duplicates";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const gate = await requireCrmAccess(request);
  if (!gate.ok) return gate.response;
  const params = new URL(request.url).searchParams;
  const search = (params.get("q") || "").trim();
  const pageText = params.get("page") || "1";
  const tagText = params.get("tag") || "";
  const purchase = params.get("purchase") || "";
  const membership = params.get("membership") || "";
  if (search.length > 100 || !/^[1-9]\d{0,5}$/.test(pageText) || (tagText && !/^[1-9]\d{0,14}$/.test(tagText)) || (tagText && !Number.isSafeInteger(Number(tagText))) || !["", "none", "once", "repeat"].includes(purchase) || !["", "linked", "unlinked"].includes(membership)) {
    return NextResponse.json({ success: false, error: "Geçersiz arama, filtre veya sayfa." }, { status: 422 });
  }
  const page = Number(pageText), limit = 20;
  const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = `(? = '' OR c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR CAST(c.id AS TEXT) = ?) AND (? = 0 OR EXISTS (SELECT 1 FROM crm_customer_tags ct WHERE ct.customer_id = c.id AND ct.tag_id = ?))`;
  // Only fixed, allowlisted SQL fragments are added; user input remains bound.
  const paid = `(SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'PAID' AND o.status NOT IN ('CANCELLED','REFUNDED','RETURNED'))`;
  const linked = `EXISTS (SELECT 1 FROM users u WHERE u.customer_id = c.id AND u.role = 'B2C_CUSTOMER')`;
  const purchaseWhere: Record<string, string> = { none: `${paid} = 0`, once: `${paid} = 1`, repeat: `${paid} >= 2` };
  const membershipWhere: Record<string, string> = { linked, unlinked: `NOT ${linked}` };
  const filters = [where, purchaseWhere[purchase], membershipWhere[membership]].filter(Boolean).join(" AND ");
  const args = [search, term, term, term, search, Number(tagText), Number(tagText)];
  try {
    const metrics = sqlite.prepare(`WITH filtered AS (SELECT c.id FROM customers c WHERE ${filters}),
      paid AS (SELECT o.customer_id, COUNT(*) AS order_count, SUM(CAST(o.grand_total AS REAL)) AS amount
        FROM orders o JOIN filtered f ON f.id = o.customer_id
        WHERE o.payment_status = 'PAID' AND o.status NOT IN ('CANCELLED','REFUNDED','RETURNED') GROUP BY o.customer_id)
      SELECT COUNT(*) AS customerCount,
        COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.customer_id = f.id AND u.role = 'B2C_CUSTOMER') THEN 1 ELSE 0 END),0) AS registeredCount,
        COALESCE(SUM(CASE WHEN p.order_count > 0 THEN 1 ELSE 0 END),0) AS paidCustomers,
        COALESCE(SUM(CASE WHEN p.order_count > 1 THEN 1 ELSE 0 END),0) AS repeatCustomers,
        COALESCE(SUM(p.order_count),0) AS paidOrderCount,
        COALESCE(SUM(p.amount),0) AS paidOrderTotal
      FROM filtered f LEFT JOIN paid p ON p.customer_id = f.id`).get(...args) as { customerCount: number; registeredCount: number; paidCustomers: number; repeatCustomers: number; paidOrderCount: number; paidOrderTotal: number };
    const total = metrics.customerCount;
    const data = sqlite.prepare(`SELECT c.id, c.name, c.email, c.phone, c.type, c.segment, c.city, c.loyalty_points AS loyaltyPoints, c.created_at AS createdAt,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orderCount,
      (SELECT COALESCE(SUM(CAST(o.grand_total AS REAL)), 0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'PAID' AND o.status NOT IN ('CANCELLED','REFUNDED','RETURNED')) AS paidOrderTotal,
      (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS lastOrderAt
      FROM customers c WHERE ${filters} ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
    return NextResponse.json({ success: true, data, metrics: { ...metrics, averagePaidOrder: metrics.paidOrderCount ? metrics.paidOrderTotal / metrics.paidOrderCount : null }, pagination: { page, limit, total } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM customer list failed", error);
    return NextResponse.json({ success: false, error: "Müşteriler yüklenemedi." }, { status: 500 });
  }
}

/** Yeni cari kart açar; web üyeliği oluşturmaz veya mevcut hesaplara bağlamaz. */
export async function POST(request: Request) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const invalid = validateCrmWrite(request);
  if (invalid) return invalid;
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const input = parsed.value as Record<string, unknown> | null;
  const allowed = ["name", "phone", "email", "city", "address", "companyName"] as const;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key as typeof allowed[number])) || allowed.some(key => typeof input[key] !== "string")) {
    return NextResponse.json({ success: false, error: "Geçersiz müşteri bilgileri." }, { status: 422 });
  }
  const values = input as Record<typeof allowed[number], string>;
  const name = values.name.trim(), phone = values.phone.trim(), email = values.email.trim().toLowerCase() || null;
  const city = values.city.trim() || null, address = values.address.trim() || null, companyName = values.companyName.trim() || null;
  const digits = phone.replace(/\D/g, "");
  if (!name || name.length > 120 || !/^\+?[\d ().-]+$/.test(phone) || phone.length > 40 || digits.length < 7 || digits.length > 15 || (email && !isValidReviewEmail(email)) || (city?.length ?? 0) > 100 || (address?.length ?? 0) > 500 || (companyName?.length ?? 0) > 160) {
    return NextResponse.json({ success: false, error: "Ad ve 7–15 rakamlı telefon zorunludur; e-posta varsa geçerli olmalıdır." }, { status: 422 });
  }
  try {
    const create = sqlite.transaction(() => {
      if (hasCrmContactDuplicate(email ? crmEmailKey(email) : null, digits, 0)) return null;
      const result = sqlite.prepare(`INSERT INTO customers (name, phone, email, city, address, company_name, type, segment) VALUES (?,?,?,?,?,?, 'B2C', 'YENİ')`).run(name, phone, email, city, address, companyName);
      sqlite.prepare(`INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?, 'CRM_CUSTOMER_CREATED', 'Customer', ?, 'CRM müşteri kartı oluşturuldu')`).run(String(gate.user.id), gate.user.name, String(result.lastInsertRowid));
      return Number(result.lastInsertRowid);
    });
    const id = create.immediate();
    if (id === null) return NextResponse.json({ success: false, error: "Bu e-posta veya telefonla bir müşteri kartı mevcut. Önce mevcut kayıtları kontrol edin." }, { status: 409 });
    return NextResponse.json({ success: true, data: { id } }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM customer creation failed", error);
    return NextResponse.json({ success: false, error: "Müşteri kartı oluşturulamadı." }, { status: 500 });
  }
}
