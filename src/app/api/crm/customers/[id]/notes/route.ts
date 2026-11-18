import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { publicBaseUrl } from "@/lib/auth";
import { requireCrmAccess } from "@/lib/crm-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  // Cookie oturumları için same-origin koruması; Origin içermeyen API istemcisi
  // ancak açık bir Bearer oturumu ile not ekleyebilir.
  if ((origin && origin !== publicBaseUrl(request)) || fetchSite === "cross-site" || (!origin && !request.headers.get("authorization")?.startsWith("Bearer "))) {
    return NextResponse.json({ success: false, error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
  }
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") || "")) {
    return NextResponse.json({ success: false, error: "Geçersiz istek türü." }, { status: 415 });
  }
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d{0,14}$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası." }, { status: 422 });
  }
  if (Number(request.headers.get("content-length") || 0) > 16384) return NextResponse.json({ success: false, error: "Not çok uzun." }, { status: 413 });
  const input = await request.json().catch(() => null);
  if (typeof input?.body !== "string" || !input.body.trim() || input.body.trim().length > 2000) {
    return NextResponse.json({ success: false, error: "Not 1–2000 karakter olmalıdır." }, { status: 422 });
  }
  try {
    const save = sqlite.transaction(() => {
      if (!sqlite.prepare("SELECT 1 FROM customers WHERE id = ?").get(Number(rawId))) return null;
      const result = sqlite.prepare("INSERT INTO crm_customer_notes (customer_id,body,created_by_id,created_by_name) VALUES (?,?,?,?)").run(Number(rawId), input.body.trim(), gate.user.id, gate.user.name);
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
