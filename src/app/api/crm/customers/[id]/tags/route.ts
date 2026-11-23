import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { validateCrmWriteAccess, canStillWriteCrm } from "@/lib/crm-write-access";
import { requireCrmAccess } from "@/lib/crm-access";
import { readCrmJson } from "@/lib/crm-write";
export const dynamic = "force-dynamic";
const validId = (x: string) => /^[1-9]\d{0,14}$/.test(x) && Number.isSafeInteger(Number(x));

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const invalid = await validateCrmWriteAccess(request, gate.user);
  if (invalid) return invalid;
  const { id: rawId } = await context.params;
  if (!validId(rawId)) return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası." }, { status: 422 });
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const input = parsed.value as { action?: unknown; name?: unknown; tagId?: unknown } | null;
  const add = input?.action === "ADD" && typeof input.name === "string" && Object.keys(input).every(k => ["action", "name"].includes(k));
  const remove = input?.action === "REMOVE" && typeof input.tagId === "number" && Number.isSafeInteger(input.tagId) && input.tagId > 0 && Object.keys(input).every(k => ["action", "tagId"].includes(k));
  const name = add ? (input!.name as string).trim().replace(/\s+/g, " ").normalize("NFC") : "";
  if ((!add && !remove) || (add && (name.length < 1 || name.length > 40 || /[\p{Cc}\p{Cf}]/u.test(name)))) return NextResponse.json({ success: false, error: "Etiket 1–40 karakter olmalıdır." }, { status: 422 });
  try {
    const change = sqlite.transaction(() => {
      if (!canStillWriteCrm(gate.user)) return { status: 403, error: "CRM değiştirme yetkiniz bulunmuyor." } as const;
      const customerId = Number(rawId);
      if (!sqlite.prepare("SELECT 1 FROM customers WHERE id=?").get(customerId)) return { status: 404, error: "Müşteri bulunamadı." } as const;
      let changed = false;
      let tagId: number;
      if (add) {
        const normalized = name.toLocaleLowerCase("tr-TR");
        const existing = sqlite.prepare("SELECT id FROM crm_tags WHERE normalized_name=?").get(normalized) as { id: number } | undefined;
        if (!existing) {
          const total = (sqlite.prepare("SELECT COUNT(*) AS n FROM crm_tags").get() as {n: number}).n;
          if (total >= 1000) return { status: 422, error: "Etiket sınırına ulaşıldı." } as const;
        }
        const count = (sqlite.prepare("SELECT COUNT(*) AS n FROM crm_customer_tags WHERE customer_id=?").get(customerId) as {n: number}).n;
        if (count >= 30 && (!existing || !sqlite.prepare("SELECT 1 FROM crm_customer_tags WHERE customer_id=? AND tag_id=?").get(customerId,existing.id))) return { status: 422, error: "Bir müşteriye en fazla 30 etiket eklenebilir." } as const;
        if (existing) tagId = existing.id;
        else tagId = Number(sqlite.prepare("INSERT INTO crm_tags (name,normalized_name) VALUES (?,?)").run(name,normalized).lastInsertRowid);
        changed = sqlite.prepare("INSERT OR IGNORE INTO crm_customer_tags (customer_id,tag_id) VALUES (?,?)").run(customerId,tagId).changes > 0;
      } else {
        tagId = input!.tagId as number;
        changed = sqlite.prepare("DELETE FROM crm_customer_tags WHERE customer_id=? AND tag_id=?").run(customerId,tagId).changes > 0;
      }
      if (changed) sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,?, 'Customer', ?, ?)").run(String(gate.user.id),gate.user.name,add ? "CRM_TAG_ADDED" : "CRM_TAG_REMOVED",rawId,`Etiket #${tagId}`);
      const tags = sqlite.prepare("SELECT t.id,t.name FROM crm_tags t JOIN crm_customer_tags ct ON ct.tag_id=t.id WHERE ct.customer_id=? ORDER BY t.name COLLATE NOCASE").all(customerId);
      return { status: 200, tags } as const;
    });
    const result = change.immediate();
    if (result.status !== 200) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, data: result.tags }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { console.error("CRM tag change failed",error); return NextResponse.json({ success: false, error: "Etiket güncellenemedi." }, { status: 500 }); }
}
