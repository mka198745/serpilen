import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";
import { canStillWriteCrm } from "@/lib/crm-write-access";
import { isValidReviewEmail } from "@/lib/review-email";
import { crmPhoneSql as phoneExpression } from "@/lib/crm-duplicates";

export const dynamic = "force-dynamic";
const validId = (value: string) => /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value));

/** Read-only candidate discovery; a match is not proof of identity. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const pageText = new URL(request.url).searchParams.get("page") || "1";
  if (!validId(id) || !/^[1-9]\d{0,5}$/.test(pageText)) return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası veya sayfa." }, { status: 422 });
  const page = Number(pageText), limit = 20;
  try {
    const result = sqlite.transaction(() => {
      if (!canStillWriteCrm(gate.user)) return { status: 403 } as const;
      const source = sqlite.prepare(`SELECT lower(trim(email)) AS email, ${phoneExpression} AS phone FROM customers WHERE id=?`).get(Number(id)) as { email: string | null; phone: string } | undefined;
      if (!source) return { status: 404 } as const;
      const email = source.email && isValidReviewEmail(source.email) ? source.email : null;
      const phone = /^\d{7,15}$/.test(source.phone) ? source.phone : null;
      const args = { id: Number(id), email, phone, limit: limit + 1, offset: (page - 1) * limit };
      // Each branch can use its expression index, UNION removes dual matches.
      const rows = sqlite.prepare(`WITH candidates AS (
        SELECT id FROM customers WHERE @email IS NOT NULL AND lower(trim(email)) = @email AND id <> @id
        UNION
        SELECT id FROM customers WHERE @phone IS NOT NULL AND ${phoneExpression} = @phone AND id <> @id
      ) SELECT c.id, c.name, c.email, c.phone,
        CASE WHEN @email IS NOT NULL AND lower(trim(c.email)) = @email THEN 1 ELSE 0 END AS emailMatch,
        CASE WHEN @phone IS NOT NULL AND ${phoneExpression.replaceAll("phone", "c.phone")} = @phone THEN 1 ELSE 0 END AS phoneMatch
        FROM candidates d JOIN customers c ON c.id=d.id ORDER BY c.id ASC LIMIT @limit OFFSET @offset`).all(args);
      sqlite.prepare(`INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?, 'CRM_DUPLICATE_CANDIDATES', 'Customer', ?, ?)`).run(String(gate.user.id), gate.user.name, id, `Yinelenen aday incelemesi, sayfa ${page}`);
      return { status: 200, data: rows.slice(0, limit), pagination: { page, limit, hasMore: rows.length > limit }, criteria: { email: !!email, phone: !!phone } } as const;
    }).immediate();
    if (result.status === 403) return NextResponse.json({ success: false, error: "CRM değiştirme yetkiniz bulunmuyor." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    if (result.status === 404) return NextResponse.json({ success: false, error: "Müşteri bulunamadı." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ success: true, data: result.data, pagination: result.pagination, criteria: result.criteria }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM duplicate candidates failed", error);
    return NextResponse.json({ success: false, error: "Adaylar yüklenemedi." }, { status: 500 });
  }
}
