import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff } from "@/lib/auth";
import { canStillAccessPos } from "@/lib/pos-access";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { readCrmJson } from "@/lib/crm-write";
import { validateCrmWriteAccess } from "@/lib/crm-write-access";
import { crmEmailKey, crmPhoneKey, hasCrmContactDuplicate } from "@/lib/crm-duplicates";
import { isValidReviewEmail } from "@/lib/review-email";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers });

/** POS quick creation: no web account, inferred linking or duplicate disclosure. */
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const invalid = await validateCrmWriteAccess(request, gate.user);
  if (invalid) return invalid;
  if (!roleCanAccessModule(await readRoleMatrix(), gate.user.role, "pos")) return fail(403, "POS yetkiniz bulunmuyor.");
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(422, "Geçersiz müşteri bilgileri.");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !["name", "phone", "email", "city"].includes(key)) || typeof input.name !== "string" || typeof input.phone !== "string" || (input.email != null && typeof input.email !== "string") || (input.city != null && typeof input.city !== "string")) return fail(422, "Geçersiz müşteri bilgileri.");
  const name = input.name.trim(), phone = input.phone.trim();
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() || null : null;
  const city = typeof input.city === "string" ? input.city.trim() || null : null;
  const digits = phone.replace(/\D/g, "");
  if (!name || name.length > 120 || !/^\+?[\d ().-]+$/.test(phone) || phone.length > 40 || digits.length < 7 || digits.length > 15 || (email && !isValidReviewEmail(email)) || (city?.length ?? 0) > 100) return fail(422, "Ad ve 7–15 rakamlı telefon zorunludur; e-posta varsa geçerli olmalıdır.");
  try {
    const result = sqlite.transaction(() => {
      if (!canStillAccessPos(gate.user)) return { status: 403 } as const;
      if (hasCrmContactDuplicate(email ? crmEmailKey(email) : null, crmPhoneKey(phone), 0)) return { status: 409 } as const;
      const inserted = sqlite.prepare("INSERT INTO customers(name,phone,email,city,type,segment) VALUES(?,?,?,?,'B2C','YENİ')").run(name,phone,email,city);
      const id = Number(inserted.lastInsertRowid);
      sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'POS_CUSTOMER_CREATED','Customer',?,'POS hızlı müşteri kartı oluşturuldu')").run(String(gate.user.id),gate.user.name,String(id));
      const customer = sqlite.prepare("SELECT id,name,phone,company_name AS companyName,loyalty_points AS loyaltyPoints FROM customers WHERE id=?").get(id);
      return { status: 201, customer } as const;
    }).immediate();
    if (result.status === 403) return fail(403, "POS yetkiniz bulunmuyor.");
    if (result.status === 409) return fail(409, "Bu e-posta veya telefonla bir müşteri kartı mevcut. Önce mevcut kayıtları kontrol edin.");
    return NextResponse.json({ success: true, data: result.customer }, { status: 201, headers });
  } catch (error) {
    console.error("POS müşteri oluşturma başarısız", error instanceof Error ? error.name : "UnknownError");
    return fail(500, "Müşteri kartı oluşturulamadı.");
  }
}
