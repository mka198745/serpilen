import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff } from "@/lib/auth";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { canStillAccessPos } from "@/lib/pos-access";
import { validateCrmWriteAccess } from "@/lib/crm-write-access";
import { readCrmJson } from "@/lib/crm-write";
import { crmEmailKey, crmPhoneKey, crmPhoneSql } from "@/lib/crm-duplicates";
import { isValidReviewEmail } from "@/lib/review-email";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers });

/** Explicit POS-only search; query stays out of URL and audit details. */
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const invalid = await validateCrmWriteAccess(request, gate.user);
  if (invalid) return invalid;
  try {
    if (!roleCanAccessModule(await readRoleMatrix(), gate.user.role, "pos")) return fail(403, "POS yetkiniz bulunmuyor.");
    const parsed = await readCrmJson(request);
    if (!parsed.ok) return parsed.response;
    const input = parsed.value;
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail(422, "Geçersiz arama.");
    const body = input as Record<string, unknown>;
    if (Object.keys(body).some(key => !["query", "page"].includes(key)) || typeof body.query !== "string" || !Number.isSafeInteger(body.page) || Number(body.page) < 1 || Number(body.page) > 1000) return fail(422, "Geçersiz arama veya sayfa.");
    const query = body.query.trim();
    if (query.length > 254 || /[\p{Cc}\p{Cf}]/u.test(query)) return fail(422, "Geçersiz arama.");
    let where: string, param: string | number;
    if (/^#[1-9]\d{0,14}$/.test(query) && Number.isSafeInteger(Number(query.slice(1)))) {
      where = "id = ?"; param = Number(query.slice(1));
    } else if (query.includes("@")) {
      if (!isValidReviewEmail(query)) return fail(422, "E-posta adresinin tamamını girin.");
      where = "lower(trim(email)) = ?"; param = crmEmailKey(query);
    } else if (/^\+?[\d ().-]+$/.test(query)) {
      const digits = crmPhoneKey(query);
      if (digits.length < 4 || digits.length > 15) return fail(422, "Telefon araması en az 4 rakam içermelidir.");
      where = `${crmPhoneSql} LIKE ? ESCAPE '\\'`; param = `%${digits}%`;
    } else {
      if ((query.match(/\p{L}/gu)?.length ?? 0) < 3) return fail(422, "Ad araması en az 3 harf içermelidir.");
      where = "name LIKE ? ESCAPE '\\'"; param = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    }
    const page = Number(body.page), limit = 20;
    const result = sqlite.transaction(() => {
      if (!canStillAccessPos(gate.user)) return null;
      const rows = sqlite.prepare(`SELECT id,name,phone,company_name AS companyName,loyalty_points AS loyaltyPoints FROM customers WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(param, limit + 1, (page - 1) * limit);
      sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'POS_CUSTOMER_SEARCH','Customer',NULL,?)").run(String(gate.user.id),gate.user.name,`POS müşteri arama; sayfa ${page}`);
      return { data: rows.slice(0, limit), pagination: { page, hasMore: rows.length > limit } };
    }).immediate();
    if (!result) return fail(403, "POS yetkiniz bulunmuyor.");
    return NextResponse.json({ success: true, ...result }, { headers });
  } catch (error) {
    console.error("POS müşteri araması başarısız", error instanceof Error ? error.name : "UnknownError");
    return fail(500, "Müşteri araması tamamlanamadı.");
  }
}
