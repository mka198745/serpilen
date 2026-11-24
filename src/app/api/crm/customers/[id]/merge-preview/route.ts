import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";
import { canStillWriteCrm } from "@/lib/crm-write-access";
import { customerEditVersion } from "@/lib/crm-customer";
import { readDuplicateReview, type ReviewCustomer } from "@/lib/crm-duplicate-review";

export const dynamic = "force-dynamic";
const validId = (value: string) => /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value));

/** Salt okunur ön inceleme: hiçbir müşteri veya ilişkisi değiştirilmez. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const target = new URL(request.url).searchParams.get("target") || "";
  if (!validId(id) || !validId(target) || id === target) return NextResponse.json({ success: false, error: "Birbirinden farklı iki geçerli müşteri numarası girin." }, { status: 422 });
  try {
    const snapshot = sqlite.transaction(() => {
      if (!canStillWriteCrm(gate.user)) return { status: 403 } as const;
      const customer = sqlite.prepare(`SELECT id,name,email,phone,city,address,company_name AS companyName,balance,loyalty_points AS loyaltyPoints,is_blocked AS isBlocked FROM customers WHERE id=?`);
      const source = customer.get(Number(id)) as ReviewCustomer | undefined;
      const destination = customer.get(Number(target)) as ReviewCustomer | undefined;
      if (!source || !destination) return { status: 404 } as const;
      const counts = sqlite.prepare(`SELECT
        (SELECT COUNT(*) FROM users WHERE customer_id=@id) AS accounts,
        (SELECT COUNT(*) FROM orders WHERE customer_id=@id) AS orders,
        (SELECT COUNT(*) FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.customer_id=@id) AS orderItems,
        (SELECT COUNT(*) FROM orders o JOIN order_status_history h ON h.order_id=o.id WHERE o.customer_id=@id) AS orderStatusEvents,
        (SELECT COUNT(*) FROM orders o JOIN order_returns r ON r.order_id=o.id WHERE o.customer_id=@id) AS returns,
        (SELECT COUNT(*) FROM orders o JOIN order_returns r ON r.order_id=o.id JOIN order_return_items ri ON ri.return_id=r.id WHERE o.customer_id=@id) AS returnItems,
        (SELECT COUNT(*) FROM account_transactions WHERE customer_id=@id) AS accountTransactions,
        (SELECT COUNT(*) FROM loyalty_transactions WHERE customer_id=@id) AS loyaltyTransactions,
        (SELECT COUNT(*) FROM loyalty_transactions t LEFT JOIN orders o ON o.id=t.order_id WHERE t.customer_id=@id AND t.order_id IS NOT NULL AND (o.id IS NULL OR o.customer_id IS NULL OR o.customer_id<>@id)) AS mismatchedLoyaltyOrders,
        (SELECT COUNT(*) FROM orders o JOIN loyalty_transactions t ON t.order_id=o.id WHERE o.customer_id=@id AND t.customer_id<>@id) AS foreignLoyaltyForOrders,
        (SELECT CASE WHEN length(trim(COALESCE(notes,'')))>0 THEN 1 ELSE 0 END FROM customers WHERE id=@id) AS legacyNotePresent,
        (SELECT COUNT(*) FROM crm_customer_notes WHERE customer_id=@id) AS notes,
        (SELECT COUNT(*) FROM crm_customer_notes n JOIN crm_note_edit_state e ON e.note_id=n.id WHERE n.customer_id=@id) AS editedNotes,
        (SELECT COUNT(*) FROM crm_customer_tags WHERE customer_id=@id) AS tags,
        (SELECT COUNT(*) FROM rfm_scores WHERE customer_id=@id) AS rfmScores,
        (SELECT COUNT(*) FROM crm_duplicate_reviews WHERE customer_low_id=@id) +
        (SELECT COUNT(*) FROM crm_duplicate_reviews WHERE customer_high_id=@id) AS duplicateReviews`);
      const comparison = sqlite.prepare(`SELECT
        (SELECT COUNT(*) FROM crm_customer_tags a JOIN crm_customer_tags b ON b.tag_id=a.tag_id AND b.customer_id=@target WHERE a.customer_id=@source) AS sharedTags,
        (SELECT COUNT(DISTINCT a.period_days) FROM rfm_scores a WHERE a.customer_id=@source AND EXISTS
          (SELECT 1 FROM rfm_scores b WHERE b.customer_id=@target AND b.period_days=a.period_days)) AS sharedRfmPeriods`).get({ source: Number(id), target: Number(target) });
      // Return only conflict labels, never private tax identifiers or legacy note contents.
      const fields = sqlite.prepare(`SELECT
        NOT (a.type IS b.type) AS type, NOT (a.tax_office IS b.tax_office) AS taxOffice,
        NOT (a.tax_number IS b.tax_number) AS taxNumber, NOT (a.credit_limit IS b.credit_limit) AS creditLimit,
        NOT (a.discount_rate IS b.discount_rate) AS discountRate, NOT (a.segment IS b.segment) AS segment,
        NOT (a.approval_status IS b.approval_status) AS approvalStatus, NOT (a.is_blocked IS b.is_blocked) AS blocked,
        NOT (a.balance IS b.balance) AS balance, NOT (a.loyalty_points IS b.loyalty_points) AS loyaltyPoints
        FROM customers a CROSS JOIN customers b WHERE a.id=@source AND b.id=@target`).get({ source: Number(id), target: Number(target) }) as Record<string, number>;
      const fieldConflicts = Object.entries(fields).filter(([, different]) => different === 1).map(([key]) => key);
      const data = { source: { customer: source, counts: counts.get({ id: Number(id) }) }, target: { customer: destination, counts: counts.get({ id: Number(target) }) }, comparison: { ...(comparison as { sharedTags: number; sharedRfmPeriods: number }), fieldConflicts } };
      sqlite.prepare(`INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?, 'CRM_MERGE_PREVIEW', 'Customer', ?, ?)`).run(String(gate.user.id), gate.user.name, id, `Birleştirme ön incelemesi, hedef müşteri #${target}`);
      return { status: 200, data, versions: { source: customerEditVersion(source), target: customerEditVersion(destination) }, review: readDuplicateReview(source, destination) } as const;
    }).immediate();
    if (snapshot.status === 403) return NextResponse.json({ success: false, error: "CRM değiştirme yetkiniz bulunmuyor." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    if (snapshot.status === 404) return NextResponse.json({ success: false, error: "Müşteri kartlarından biri bulunamadı." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ success: true, data: snapshot.data, versions: snapshot.versions, review: snapshot.review, canMerge: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM merge preview failed", error);
    return NextResponse.json({ success: false, error: "Birleştirme ön incelemesi yüklenemedi." }, { status: 500 });
  }
}
