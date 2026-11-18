import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { requireCrmAccess } from "@/lib/crm-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const invalid = validateCrmWrite(request);
  if (invalid) return invalid;
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d{0,14}$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası." }, { status: 422 });
  }
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const input = parsed.value as { body?: unknown } | null;
  if (typeof input?.body !== "string" || !input.body.trim() || input.body.trim().length > 2000) {
    return NextResponse.json({ success: false, error: "Not 1–2000 karakter olmalıdır." }, { status: 422 });
  }
  const body = input.body.trim();
  try {
    const save = sqlite.transaction(() => {
      if (!sqlite.prepare("SELECT 1 FROM customers WHERE id = ?").get(Number(rawId))) return null;
      const result = sqlite.prepare("INSERT INTO crm_customer_notes (customer_id,body,created_by_id,created_by_name) VALUES (?,?,?,?)").run(Number(rawId), body, gate.user.id, gate.user.name);
      sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?, 'CRM_NOTE_CREATED', 'Customer', ?, ?)").run(String(gate.user.id), gate.user.name, rawId, `CRM notu #${result.lastInsertRowid} eklendi`);
      return sqlite.prepare("SELECT id, body, created_by_name AS createdByName, created_at AS createdAt FROM crm_customer_notes WHERE id = ?").get(result.lastInsertRowid);
    });
    const created = save();
    if (!created) return NextResponse.json({ success: false, error: "Müşteri bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true, data: created }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM note creation failed", error);
    return NextResponse.json({ success: false, error: "Not kaydedilemedi." }, { status: 500 });
  }
}
