import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { validateCrmWriteAccess, canStillWriteCrm } from "@/lib/crm-write-access";
import { requireCrmAccess } from "@/lib/crm-access";
import { readCrmJson } from "@/lib/crm-write";
import { crmNoteColumns, crmNoteFrom } from "@/lib/crm-note-query";

export const dynamic = "force-dynamic";
const validId = (value: string) => /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value));
const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status });

/** Note edits are scoped to the actual customer and serialized with revision and audit. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string; noteId: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const invalid = await validateCrmWriteAccess(request, gate.user);
  if (invalid) return invalid;
  const { id, noteId } = await context.params;
  if (!validId(id) || !validId(noteId)) return fail(422, "Geçersiz müşteri veya not numarası.");
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const input = parsed.value as Record<string, unknown> | null;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["body", "expectedRevision"].includes(key)) || typeof input.body !== "string" || !input.body.trim() || input.body.trim().length > 2000 || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) return fail(422, "Geçerli not ve sürüm gereklidir. Not 1–2000 karakter olmalıdır.");
  const body = (input.body as string).trim(), expected = Number(input.expectedRevision);
  try {
    const save = sqlite.transaction(() => {
      if (!canStillWriteCrm(gate.user)) return { status: 403, error: "CRM değiştirme yetkiniz bulunmuyor." } as const;
      const current = sqlite.prepare(`SELECT ${crmNoteColumns} FROM ${crmNoteFrom} WHERE n.customer_id=? AND n.id=?`).get(Number(id), Number(noteId)) as { body: string; revision: number } | undefined;
      if (!current) return { status: 404, error: "Not bulunamadı." } as const;
      if (current.revision !== expected) return { status: 409, error: "Not başka bir işlemle değişti. Taslağınızı kopyalayıp notları yenileyin ve tekrar düzenleyin." } as const;
      if (current.body !== body) {
        sqlite.prepare("UPDATE crm_customer_notes SET body=? WHERE customer_id=? AND id=?").run(body,Number(id),Number(noteId));
        sqlite.prepare(`INSERT INTO crm_note_edit_state (note_id,revision,updated_by_id,updated_by_name,updated_at) VALUES (?,2,?,?,unixepoch())
          ON CONFLICT(note_id) DO UPDATE SET revision=crm_note_edit_state.revision+1,updated_by_id=excluded.updated_by_id,updated_by_name=excluded.updated_by_name,updated_at=excluded.updated_at`).run(Number(noteId),gate.user.id,gate.user.name);
        sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,'CRM_NOTE_UPDATED','Customer',?,?)").run(String(gate.user.id),gate.user.name,id,`CRM notu #${noteId} düzenlendi; sürüm ${current.revision + 1}`);
      }
      return { status: 200, data: sqlite.prepare(`SELECT ${crmNoteColumns} FROM ${crmNoteFrom} WHERE n.customer_id=? AND n.id=?`).get(Number(id),Number(noteId)) } as const;
    });
    const result = save.immediate();
    if (result.status !== 200) return fail(result.status,result.error);
    return NextResponse.json({ success: true, data: result.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM note update failed", error);
    return fail(500, "Not güncellenemedi.");
  }
}
