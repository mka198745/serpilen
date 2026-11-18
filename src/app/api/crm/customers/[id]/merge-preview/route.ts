import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";

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
      const customer = sqlite.prepare(`SELECT id,name,email,phone,company_name AS companyName,balance,loyalty_points AS loyaltyPoints,is_blocked AS isBlocked FROM customers WHERE id=?`);
      const source = customer.get(Number(id));
      const destination = customer.get(Number(target));
      if (!source || !destination) return null;
      const counts = sqlite.prepare(`SELECT
        (SELECT COUNT(*) FROM users WHERE customer_id=@id) AS accounts,
        (SELECT COUNT(*) FROM orders WHERE customer_id=@id) AS orders,
        (SELECT COUNT(*) FROM account_transactions WHERE customer_id=@id) AS accountTransactions,
        (SELECT COUNT(*) FROM loyalty_transactions WHERE customer_id=@id) AS loyaltyTransactions,
        (SELECT COUNT(*) FROM crm_customer_notes WHERE customer_id=@id) AS notes,
        (SELECT COUNT(*) FROM crm_customer_tags WHERE customer_id=@id) AS tags,
        (SELECT COUNT(*) FROM rfm_scores WHERE customer_id=@id) AS rfmScores`);
      const data = { source: { customer: source, counts: counts.get({ id: Number(id) }) }, target: { customer: destination, counts: counts.get({ id: Number(target) }) } };
      sqlite.prepare(`INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?, 'CRM_MERGE_PREVIEW', 'Customer', ?, ?)`).run(String(gate.user.id), gate.user.name, id, `Birleştirme ön incelemesi, hedef müşteri #${target}`);
      return data;
    })();
    if (!snapshot) return NextResponse.json({ success: false, error: "Müşteri kartlarından biri bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true, data: snapshot, canMerge: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM merge preview failed", error);
    return NextResponse.json({ success: false, error: "Birleştirme ön incelemesi yüklenemedi." }, { status: 500 });
  }
}
