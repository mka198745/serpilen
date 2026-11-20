import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getUserByToken } from "@/lib/auth";
import { requireCrmAccess } from "@/lib/crm-access";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { roleCanAccessModule } from "@/lib/role-matrix-server";
import { crmNoteColumns, crmNoteFrom } from "@/lib/crm-note-query";

export const dynamic = "force-dynamic";
const validId = (value: string) => /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value));
const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status });

/** Note edits are scoped to the actual customer and serialized with revision and audit. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string; noteId: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const invalid = validateCrmWrite(request);
  if (invalid) return invalid;
  // A forged bearer header must not grant a cookie-authenticated request an Origin exemption.
  if (!request.headers.get("origin")) {
    const actor = await getUserByToken(request.headers.get("authorization")?.slice(7).trim());
    if (!actor || actor.id !== gate.user.id) return fail(403, "İstek kaynağı doğrulanamadı.");
  }
  const { id, noteId } = await context.params;
  if (!validId(id) || !validId(noteId)) return fail(422, "Geçersiz müşteri veya not numarası.");
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const input = parsed.value as Record<string, unknown> | null;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["body", "expectedRevision"].includes(key)) || typeof input.body !== "string" || !input.body.trim() || input.body.trim().length > 2000 || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) return fail(422, "Geçerli not ve sürüm gereklidir. Not 1–2000 karakter olmalıdır.");
  const body = (input.body as string).trim(), expected = Number(input.expectedRevision);
  try {
    const save = sqlite.transaction(() => {
      // Check the current actor and matrix under the same write lock as the update.
      const actor = sqlite.prepare("SELECT role,is_active AS isActive FROM users WHERE id=?").get(gate.user.id) as { role: string; isActive: number } | undefined;
      const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as { value: string } | undefined;
      let savedMatrix: unknown = null;
      try { if (setting?.value) savedMatrix = JSON.parse(setting.value); } catch { /* defaults */ }
      const matrix = normalizeRoleMatrix(savedMatrix);
      if (!actor?.isActive || actor.role !== gate.user.role || !roleCanAccessModule(matrix, actor.role, "crm") || !roleCanAccessModule(matrix, actor.role, "crmWrite")) return { status: 403, error: "CRM değiştirme yetkiniz bulunmuyor." } as const;
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
