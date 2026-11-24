import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";
import { canStillReadCrm } from "@/lib/crm-write-access";
import { crmUtcDayStart } from "@/lib/crm-date";

export const dynamic = "force-dynamic";
const kinds = ["CUSTOMER_CREATED", "ORDER_CREATED", "ORDER_STATUS", "NOTE_CREATED", "NOTE_UPDATED", "PROFILE_UPDATED", "RETURN_CREATED", "LOYALTY_TRANSACTION"];
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  const pageText = params.get("page") || "1", kind = params.get("kind") || "", channel = params.get("channel") || "", actor = (params.get("actor") || "").trim();
  const from = params.get("from") || "", to = params.get("to") || "";
  const fromTime = from ? crmUtcDayStart(from) : null, toTime = to ? crmUtcDayStart(to) : null;
  if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id)) || !/^[1-9]\d{0,5}$/.test(pageText) || (kind && !kinds.includes(kind)) || !["", "POS", "ONLINE_B2C"].includes(channel) || actor.length > 100 || (from && fromTime === null) || (to && toTime === null) || (fromTime !== null && toTime !== null && fromTime > toTime)) {
    return NextResponse.json({ success: false, error: "Geçersiz zaman çizelgesi filtresi." }, { status: 422 });
  }
  try {
    const customerId = Number(id), page = Number(pageText), limit = 20;
    const result = sqlite.transaction(() => {
      if (!canStillReadCrm(gate.user)) return { status: 403 } as const;
      if (!sqlite.prepare("SELECT 1 FROM customers WHERE id=?").get(customerId)) return { status: 404 } as const;
      // Puan kaydı başka bir müşterinin siparişine işaret ediyorsa o siparişin
      // numarası/kanalı gösterilmez. İade durumu olay zamanı değil, güncel durumdur.
      const events = `SELECT 'CUSTOMER_CREATED' AS kind,c.id AS eventId,c.created_at AS occurredAt,NULL AS orderNumber,NULL AS channel,NULL AS actor,NULL AS fromStatus,NULL AS toStatus,NULL AS returnNumber,NULL AS returnStatus,NULL AS loyaltyType,NULL AS points FROM customers c WHERE c.id=@id
        UNION ALL SELECT 'ORDER_CREATED',o.id,o.created_at,o.order_number,o.order_type,NULL,NULL,NULL,NULL,NULL,NULL,NULL FROM orders o WHERE o.customer_id=@id
        UNION ALL SELECT 'ORDER_STATUS',h.id,h.created_at,o.order_number,o.order_type,h.changed_by,h.from_status,h.to_status,NULL,NULL,NULL,NULL FROM orders o JOIN order_status_history h ON h.order_id=o.id WHERE o.customer_id=@id AND h.from_status IS NOT NULL
        UNION ALL SELECT 'NOTE_CREATED',n.id,n.created_at,NULL,NULL,n.created_by_name,NULL,NULL,NULL,NULL,NULL,NULL FROM crm_customer_notes n WHERE n.customer_id=@id
        UNION ALL SELECT 'PROFILE_UPDATED',a.id,a.created_at,NULL,NULL,a.user_name,NULL,NULL,NULL,NULL,NULL,NULL FROM audit_logs a WHERE a.entity='Customer' AND a.entity_id=@rawId AND a.action='CRM_CUSTOMER_UPDATED'
        UNION ALL SELECT 'NOTE_UPDATED',a.id,a.created_at,NULL,NULL,a.user_name,NULL,NULL,NULL,NULL,NULL,NULL FROM audit_logs a WHERE a.entity='Customer' AND a.entity_id=@rawId AND a.action='CRM_NOTE_UPDATED'
        UNION ALL SELECT 'RETURN_CREATED',r.id,r.created_at,o.order_number,o.order_type,r.created_by,NULL,NULL,r.return_number,r.status,NULL,NULL FROM orders o JOIN order_returns r ON r.order_id=o.id WHERE o.customer_id=@id
        UNION ALL SELECT 'LOYALTY_TRANSACTION',t.id,t.created_at,o.order_number,o.order_type,NULL,NULL,NULL,NULL,NULL,t.type,t.points FROM loyalty_transactions t LEFT JOIN orders o ON o.id=t.order_id AND o.customer_id=t.customer_id WHERE t.customer_id=@id`;
      const filter = `(@kind='' OR kind=@kind) AND (@channel='' OR channel=@channel) AND (@actor='' OR actor LIKE @actorLike ESCAPE '\\') AND (@fromTime IS NULL OR occurredAt>=@fromTime) AND (@toTime IS NULL OR occurredAt<@toTime)`;
      const args = { id: customerId, rawId: id, kind, channel, actor, actorLike: `%${actor.replace(/[\\%_]/g, "\\$&")}%`, fromTime, toTime: toTime === null ? null : toTime + 86400 };
      const total = (sqlite.prepare(`SELECT COUNT(*) AS n FROM (${events}) WHERE ${filter}`).get(args) as { n: number }).n;
      const data = sqlite.prepare(`SELECT * FROM (${events}) WHERE ${filter} ORDER BY occurredAt DESC,kind ASC,eventId DESC LIMIT @limit OFFSET @offset`).all({ ...args, limit, offset: (page - 1) * limit });
      sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'CRM_TIMELINE_VIEW','Customer',?,?)").run(String(gate.user.id), gate.user.name, id, `CRM zaman çizelgesi, sayfa ${page}`);
      return { status: 200, data, pagination: { page, limit, total } } as const;
    }).immediate();
    if (result.status === 403) return NextResponse.json({ success: false, error: "CRM erişim yetkiniz bulunmuyor." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    if (result.status === 404) return NextResponse.json({ success: false, error: "Müşteri bulunamadı." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ success: true, data: result.data, pagination: result.pagination }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM timeline failed", error);
    return NextResponse.json({ success: false, error: "Zaman çizelgesi yüklenemedi." }, { status: 500 });
  }
}
