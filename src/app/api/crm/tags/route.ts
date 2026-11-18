import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireCrmAccess } from "@/lib/crm-access";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const gate = await requireCrmAccess(request);
  if (!gate.ok) return gate.response;
  try {
    const data = sqlite.prepare(`SELECT t.id, t.name, COUNT(ct.customer_id) AS customerCount FROM crm_tags t LEFT JOIN crm_customer_tags ct ON ct.tag_id=t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE LIMIT 1000`).all();
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { console.error("CRM tags failed", error); return NextResponse.json({ success: false, error: "Etiketler yüklenemedi." }, { status: 500 }); }
}
