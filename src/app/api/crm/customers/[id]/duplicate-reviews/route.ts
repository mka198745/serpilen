import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";
import { canStillWriteCrm } from "@/lib/crm-write-access";
import { customerEditVersion } from "@/lib/crm-customer";
import { reviewCustomerSql, type ReviewCustomer, type ReviewStatus } from "@/lib/crm-duplicate-review";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const validId = (value: string) => /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value));
type Row = ReviewCustomer & { status: ReviewStatus; lowVersion: string; highVersion: string; revision: number; reviewedByName: string; reviewedAt: number };

/** Saved human reviews, independent of current contact matches; never merges customers. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  const pageText = params.get("page") || "1", status = params.get("status") || "";
  if (!validId(id) || !/^[1-9]\d{0,5}$/.test(pageText) || !["", "UNSURE", "DISTINCT"].includes(status)) {
    return NextResponse.json({ success: false, error: "Geçersiz müşteri, değerlendirme veya sayfa." }, { status: 422, headers });
  }
  const customerId = Number(id), page = Number(pageText), limit = 20;
  try {
    const result = sqlite.transaction(() => {
      if (!canStillWriteCrm(gate.user)) return { status: 403 } as const;
      const source = sqlite.prepare(reviewCustomerSql).get(customerId) as ReviewCustomer | undefined;
      if (!source) return { status: 404 } as const;
      // Both branches use the pair indexes. Missing related customer rows are excluded.
      const rows = sqlite.prepare(`WITH reviews AS (
        SELECT customer_high_id AS targetId, status, low_version AS lowVersion, high_version AS highVersion, revision, reviewed_by_name AS reviewedByName, reviewed_at AS reviewedAt FROM crm_duplicate_reviews WHERE customer_low_id=@id AND (@status='' OR status=@status)
        UNION ALL
        SELECT customer_low_id, status, low_version, high_version, revision, reviewed_by_name, reviewed_at FROM crm_duplicate_reviews WHERE customer_high_id=@id AND (@status='' OR status=@status)
      ) SELECT c.id,c.name,c.email,c.phone,c.city,c.address,c.company_name AS companyName, r.status,r.lowVersion,r.highVersion,r.revision,r.reviewedByName,r.reviewedAt
        FROM reviews r JOIN customers c ON c.id=r.targetId ORDER BY r.reviewedAt DESC,c.id ASC LIMIT @limit OFFSET @offset`).all({ id: customerId, status, limit: limit + 1, offset: (page - 1) * limit }) as Row[];
      const sourceVersion = customerEditVersion(source);
      const data = rows.slice(0, limit).map(row => {
        const targetVersion = customerEditVersion(row);
        const stale = customerId < row.id ? sourceVersion !== row.lowVersion || targetVersion !== row.highVersion : targetVersion !== row.lowVersion || sourceVersion !== row.highVersion;
        return { customer: { id: row.id, name: row.name }, status: row.status, revision: row.revision, reviewedByName: row.reviewedByName, reviewedAt: row.reviewedAt, stale };
      });
      sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'CRM_DUPLICATE_REVIEWS_VIEW','Customer',?,?)").run(String(gate.user.id), gate.user.name, id, `Aday değerlendirmeleri, sayfa ${page}; durum ${status || 'ALL'}`);
      return { status: 200, data, pagination: { page, limit, hasMore: rows.length > limit } } as const;
    }).immediate();
    if (result.status === 403) return NextResponse.json({ success: false, error: "CRM değiştirme yetkiniz bulunmuyor." }, { status: 403, headers });
    if (result.status === 404) return NextResponse.json({ success: false, error: "Müşteri bulunamadı." }, { status: 404, headers });
    return NextResponse.json({ success: true, data: result.data, pagination: result.pagination }, { headers });
  } catch (error) {
    console.error("CRM duplicate reviews listing failed", error);
    return NextResponse.json({ success: false, error: "Değerlendirmeler yüklenemedi." }, { status: 500, headers });
  }
}
