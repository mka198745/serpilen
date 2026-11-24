import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { readCrmJson } from "@/lib/crm-write";
import { validateCrmWriteAccess, canStillReadCrm, canStillWriteCrm } from "@/lib/crm-write-access";
import { requireCrmAccess } from "@/lib/crm-access";
import { crmNoteColumns, crmNoteFrom } from "@/lib/crm-note-query";

export const dynamic = "force-dynamic";

/** CRM read access, per-customer pagination, audited without note contents. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const pageText = new URL(request.url).searchParams.get("page") || "1";
  if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id)) || !/^[1-9]\d{0,5}$/.test(pageText)) {
    return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası veya sayfa." }, { status: 422 });
  }
  const page = Number(pageText), limit = 20;
  try {
    const result = sqlite.transaction(() => {
      if (!canStillReadCrm(gate.user)) return { status: 403 } as const;
      if (!sqlite.prepare("SELECT 1 FROM customers WHERE id=?").get(Number(id))) return { status: 404 } as const;
      const total = (sqlite.prepare("SELECT COUNT(*) AS n FROM crm_customer_notes WHERE customer_id=?").get(Number(id)) as { n: number }).n;
      const data = sqlite.prepare(`SELECT ${crmNoteColumns} FROM ${crmNoteFrom} WHERE n.customer_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT ? OFFSET ?`).all(Number(id), limit, (page - 1) * limit);
      sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,'CRM_NOTES_VIEW','Customer',?,?)").run(String(gate.user.id), gate.user.name, id, `CRM notları, sayfa ${page}`);
      return { status: 200, data, pagination: { page, limit, total } } as const;
    }).immediate();
    if (result.status === 403) return NextResponse.json({ success: false, error: "CRM erişim yetkiniz bulunmuyor." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    if (result.status === 404) return NextResponse.json({ success: false, error: "Müşteri bulunamadı." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ success: true, data: result.data, pagination: result.pagination }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM notes listing failed", error);
    return NextResponse.json({ success: false, error: "Notlar yüklenemedi." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const invalid = await validateCrmWriteAccess(request, gate.user);
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
      if (!canStillWriteCrm(gate.user)) return { status: 403 } as const;
      if (!sqlite.prepare("SELECT 1 FROM customers WHERE id = ?").get(Number(rawId))) return { status: 404 } as const;
      const result = sqlite.prepare("INSERT INTO crm_customer_notes (customer_id,body,created_by_id,created_by_name) VALUES (?,?,?,?)").run(Number(rawId), body, gate.user.id, gate.user.name);
      sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?, 'CRM_NOTE_CREATED', 'Customer', ?, ?)").run(String(gate.user.id), gate.user.name, rawId, `CRM notu #${result.lastInsertRowid} eklendi`);
      return { status: 201, data: sqlite.prepare(`SELECT ${crmNoteColumns} FROM ${crmNoteFrom} WHERE n.id = ?`).get(result.lastInsertRowid) } as const;
    });
    const created = save.immediate();
    if (created.status === 403) return NextResponse.json({ success: false, error: "CRM değiştirme yetkiniz bulunmuyor." }, { status: 403 });
    if (created.status === 404) return NextResponse.json({ success: false, error: "Müşteri bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true, data: created.data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM note creation failed", error);
    return NextResponse.json({ success: false, error: "Not kaydedilemedi." }, { status: 500 });
  }
}
