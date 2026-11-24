import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { validateCrmWriteAccess, canStillReadCrm, canStillWriteCrm } from "@/lib/crm-write-access";
import { requireCrmAccess } from "@/lib/crm-access";
import { readCrmJson } from "@/lib/crm-write";
import { crmEmailKey, crmPhoneKey, hasCrmContactDuplicate } from "@/lib/crm-duplicates";
import { customerEditVersion, type EditableCustomer } from "@/lib/crm-customer";
import { isValidReviewEmail } from "@/lib/review-email";
import { crmNoteColumns, crmNoteFrom } from "@/lib/crm-note-query";

const customerSelect = `SELECT id, name, email, phone, type, company_name AS companyName, city, address, segment, loyalty_points AS loyaltyPoints, is_blocked AS isBlocked, created_at AS createdAt FROM customers WHERE id = ?`;
const validId = (id: string) => /^[1-9]\d{0,14}$/.test(id) && Number.isSafeInteger(Number(id));

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request);
  if (!gate.ok) return gate.response;
  const { id: rawId } = await context.params;
  if (!validId(rawId)) return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası." }, { status: 422 });
  const id = Number(rawId);
  try {
    // The permission check, profile snapshot and content-free audit share one write lock.
    const result = sqlite.transaction(() => {
      if (!canStillReadCrm(gate.user)) return { status: 403 } as const;
      const customer = sqlite.prepare(customerSelect).get(id) as (EditableCustomer & { id: number }) | undefined;
      if (!customer) return { status: 404 } as const;
      const orders = sqlite.prepare(`SELECT id, order_number AS orderNumber, order_type AS orderType, status, payment_status AS paymentStatus, payment_method AS paymentMethod, grand_total AS grandTotal, created_at AS createdAt FROM orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`).all(id);
      const summary = sqlite.prepare(`SELECT COUNT(*) AS orderCount, COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND status NOT IN ('CANCELLED','REFUNDED','RETURNED') THEN CAST(grand_total AS REAL) ELSE 0 END), 0) AS paidOrderTotal, MIN(created_at) AS firstOrderAt, MAX(created_at) AS lastOrderAt FROM orders WHERE customer_id = ?`).get(id);
      const notes = sqlite.prepare(`SELECT ${crmNoteColumns} FROM ${crmNoteFrom} WHERE n.customer_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 50`).all(id);
      const tags = sqlite.prepare("SELECT t.id,t.name FROM crm_tags t JOIN crm_customer_tags ct ON ct.tag_id=t.id WHERE ct.customer_id=? ORDER BY t.name COLLATE NOCASE").all(id);
      // Counts only: never return account identifiers, emails, authentication fields or inferred matches.
      const identityLinks = sqlite.prepare(`SELECT
        (SELECT COUNT(*) FROM users WHERE customer_id=@id AND role='B2C_CUSTOMER' AND is_active=1) AS activeWebAccounts,
        (SELECT COUNT(*) FROM users WHERE customer_id=@id AND role='B2C_CUSTOMER' AND is_active=0) AS inactiveWebAccounts,
        (SELECT COUNT(*) FROM users WHERE customer_id=@id AND role='B2C_CUSTOMER' AND is_active NOT IN (0,1)) AS unknownWebAccounts,
        (SELECT COUNT(*) FROM users WHERE customer_id=@id AND role<>'B2C_CUSTOMER') AS otherRoleAccounts,
        (SELECT COUNT(*) FROM orders WHERE customer_id=@id AND order_type='ONLINE_B2C') AS onlineOrders,
        (SELECT COUNT(*) FROM orders WHERE customer_id=@id AND order_type='POS') AS posOrders,
        (SELECT COUNT(*) FROM orders WHERE customer_id=@id AND order_type NOT IN ('ONLINE_B2C','POS')) AS otherOrders`).get({ id });
      const timeline = sqlite.prepare(`
        SELECT * FROM (
          SELECT 'CUSTOMER_CREATED' AS kind, c.id AS eventId, c.created_at AS occurredAt, NULL AS orderNumber, NULL AS channel, NULL AS actor, NULL AS fromStatus, NULL AS toStatus FROM customers c WHERE c.id = @id
          UNION ALL
          SELECT 'ORDER_CREATED', o.id, o.created_at, o.order_number, o.order_type, NULL, NULL, NULL FROM orders o WHERE o.customer_id = @id
          UNION ALL
          SELECT 'ORDER_STATUS', h.id, h.created_at, o.order_number, o.order_type, h.changed_by, h.from_status, h.to_status FROM orders o JOIN order_status_history h ON h.order_id = o.id WHERE o.customer_id = @id AND h.from_status IS NOT NULL
          UNION ALL
          SELECT 'NOTE_CREATED', n.id, n.created_at, NULL, NULL, n.created_by_name, NULL, NULL FROM crm_customer_notes n WHERE n.customer_id = @id
          UNION ALL
          SELECT 'PROFILE_UPDATED', a.id, a.created_at, NULL, NULL, a.user_name, NULL, NULL FROM audit_logs a WHERE a.entity = 'Customer' AND a.entity_id = @rawId AND a.action = 'CRM_CUSTOMER_UPDATED'
          UNION ALL
          SELECT 'NOTE_UPDATED', a.id, a.created_at, NULL, NULL, a.user_name, NULL, NULL FROM audit_logs a WHERE a.entity = 'Customer' AND a.entity_id = @rawId AND a.action = 'CRM_NOTE_UPDATED'
        ) ORDER BY occurredAt DESC, kind ASC, eventId DESC LIMIT 100`).all({ id, rawId });
      sqlite.prepare(`INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?, 'CRM_CUSTOMER_VIEW', 'Customer', ?, 'CRM profil görüntüleme')`).run(String(gate.user.id), gate.user.name, rawId);
      return { status: 200, data: { customer, editVersion: customerEditVersion(customer), orders, summary, notes, tags, identityLinks, timeline } } as const;
    }).immediate();
    if (result.status === 403) return NextResponse.json({ success: false, error: "CRM erişim yetkiniz bulunmuyor." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    if (result.status === 404) return NextResponse.json({ success: false, error: "Müşteri bulunamadı." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ success: true, data: result.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM customer detail failed", error);
    return NextResponse.json({ success: false, error: "Müşteri profili yüklenemedi." }, { status: 500 });
  }
}

/** CRM kartını düzenler; bağlı hesap giriş bilgileri ve tarihî siparişler değiştirilmez. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const invalid = await validateCrmWriteAccess(request, gate.user);
  if (invalid) return invalid;
  const { id: rawId } = await context.params;
  if (!validId(rawId)) return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası." }, { status: 422 });
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown> | null;
  const keys = ["name", "phone", "email", "city", "address", "companyName"] as const;
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.editVersion !== "string" || !/^[a-f0-9]{64}$/.test(body.editVersion) || Object.keys(body).some(key => key !== "editVersion" && !keys.includes(key as typeof keys[number])) || keys.some(key => typeof body[key] !== "string")) {
    return NextResponse.json({ success: false, error: "Geçersiz müşteri bilgileri." }, { status: 422 });
  }
  const values = body as Record<typeof keys[number] | "editVersion", string>;
  try {
    const update = sqlite.transaction(() => {
      if (!canStillWriteCrm(gate.user)) return { status: 403, error: "CRM değiştirme yetkiniz bulunmuyor." } as const;
      const current = sqlite.prepare(customerSelect).get(Number(rawId)) as (EditableCustomer & { id: number }) | undefined;
      if (!current) return { status: 404, error: "Müşteri bulunamadı." } as const;
      if (customerEditVersion(current) !== values.editVersion) return { status: 409, error: "Müşteri bilgileri başka bir işlemle değişti. Profili yenileyip tekrar deneyin." } as const;
      const input: EditableCustomer = {
        name: values.name === current.name ? current.name : values.name.trim(),
        phone: values.phone === current.phone ? current.phone : values.phone.trim(),
        email: values.email === (current.email ?? "") ? current.email : values.email.trim().toLowerCase() || null,
        city: values.city === (current.city ?? "") ? current.city : values.city.trim() || null,
        address: values.address === (current.address ?? "") ? current.address : values.address.trim() || null,
        companyName: values.companyName === (current.companyName ?? "") ? current.companyName : values.companyName.trim() || null,
      };
      const changed = keys.filter(key => current[key] !== input[key]);
      if ((changed.includes("name") && (!input.name || input.name.length > 120)) ||
          (changed.includes("phone") && (!/^\+?[\d ().-]+$/.test(input.phone) || input.phone.length > 40 || input.phone.replace(/\D/g, "").length < 7 || input.phone.replace(/\D/g, "").length > 15)) ||
          (changed.includes("email") && input.email !== null && !isValidReviewEmail(input.email)) ||
          (changed.includes("city") && (input.city?.length ?? 0) > 100) ||
          (changed.includes("address") && (input.address?.length ?? 0) > 500) ||
          (changed.includes("companyName") && (input.companyName?.length ?? 0) > 160)) {
        return { status: 422, error: "Ad, telefon veya diğer alanlar geçersiz. Telefon 7–15 rakam içermelidir; e-posta isteğe bağlıdır." } as const;
      }
      // Existing legacy duplicates do not block unrelated edits or a formatting-only change.
      const emailKey = crmEmailKey(input.email), phoneKey = crmPhoneKey(input.phone);
      const checkEmail = emailKey && emailKey !== crmEmailKey(current.email) ? emailKey : null;
      const checkPhone = phoneKey !== crmPhoneKey(current.phone) ? phoneKey : null;
      if ((checkEmail || checkPhone) && hasCrmContactDuplicate(checkEmail, checkPhone, Number(rawId))) {
        return { status: 409, error: "Bu e-posta veya telefonla başka bir müşteri kartı mevcut. Önce mevcut kayıtları kontrol edin." } as const;
      }
      if (changed.length) {
        sqlite.prepare("UPDATE customers SET name=@name, phone=@phone, email=@email, city=@city, address=@address, company_name=@companyName WHERE id=@id").run({ ...input, id: Number(rawId) });
        sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?, 'CRM_CUSTOMER_UPDATED', 'Customer', ?, ?)").run(String(gate.user.id), gate.user.name, rawId, `Değişen alanlar: ${changed.join(", ")}`);
      }
      return { status: 200, customer: sqlite.prepare(customerSelect).get(Number(rawId)) as EditableCustomer & { id: number } } as const;
    });
    const result = update.immediate();
    if (result.status !== 200) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, data: { customer: result.customer, editVersion: customerEditVersion(result.customer) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM customer update failed", error);
    return NextResponse.json({ success: false, error: "Müşteri kaydedilemedi." }, { status: 500 });
  }
}
