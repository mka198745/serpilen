import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff, type SessionUser } from "@/lib/auth";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { roleCanAccessModule } from "@/lib/role-matrix-server";
import { validateCrmWriteAccess } from "@/lib/crm-write-access";
import { readCrmJson } from "@/lib/crm-write";
import { analyzeSales, analyzeInventory, recommendPurchases, analyzeCustomers, generateProductContent, chat } from "@/lib/ai-engine";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers });
const permissions: Record<string, readonly string[]> = {
  sales_analyst: ["ai", "orders"],
  inventory_assistant: ["ai", "wms", "orders"],
  purchasing_advisor: ["ai", "purchasing", "wms", "orders"],
  crm_assistant: ["ai", "crm"],
  content_generator: ["ai", "catalog"],
  apply_content: ["ai", "catalog"],
  // Chat routes dynamically to several domains; deny before dispatch unless all are authorized.
  chat: ["ai", "crm", "orders", "catalog", "wms", "purchasing", "coupons", "intelligence"],
};
const GUARDRAILS = {
  default: "Kural tabanlı öneriler doğrulanmış tahmin değildir; hiçbir kampanya kendiliğinden gönderilmez. İşlem yapmadan verileri ve izinleri kontrol edin.",
  crm: "Müşteri analizi kural tabanlı ve deneysel bir tahmindir; risk, harcama ve segmentler doğrulanmış değildir. İletişim izni ayrıca doğrulanmalıdır.",
  content: "Üretilen içerik önizlemedir; doğrulamadan yayımlamayın. Uygula onayı verilmeden ürüne yazılmaz.",
};

/** Read current role and matrix under an immediate transaction for audits and writes. */
function currentAccess(user: SessionUser, required: readonly string[]): boolean {
  const actor = sqlite.prepare("SELECT role,is_active AS active FROM users WHERE id=?").get(user.id) as { role: string; active: number } | undefined;
  if (!actor?.active || actor.role !== user.role) return false;
  const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as { value: string } | undefined;
  let value: unknown = null;
  try { if (setting?.value) value = JSON.parse(setting.value); } catch { /* existing matrix defaults */ }
  const matrix = normalizeRoleMatrix(value);
  return required.every(module => roleCanAccessModule(matrix, actor.role, module));
}
function allowedNow(user: SessionUser, required: readonly string[]): boolean {
  return sqlite.transaction(() => currentAccess(user, required)).deferred();
}
function recordView(user: SessionUser, module: string, required: readonly string[]): boolean {
  return sqlite.transaction(() => {
    if (!currentAccess(user, required)) return false;
    sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'AI_MODULE_VIEW','AiModule',NULL,?)").run(String(user.id), user.name, `Modül: ${module}`);
    return true;
  }).immediate();
}

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) { gate.response.headers.set("Cache-Control", "private, no-store"); return gate.response; }
  try {
    if (!allowedNow(gate.user, ["ai"])) return fail(403, "AI yönetim asistanı yetkiniz bulunmuyor.");
    const modules = [
      { id: "sales_analyst", label: "AI Satış & Ciro Analisti", description: "Kanal bazlı kural tabanlı analiz." },
      { id: "inventory_assistant", label: "AI Stok & Envanter Asistanı", description: "Stok ve satış verilerine dayalı öneriler." },
      { id: "purchasing_advisor", label: "AI Satın Alma Danışmanı", description: "Tedarikçi ve maliyet önerileri." },
      { id: "crm_assistant", label: "AI CRM Asistanı", description: "Doğrulanmamış kural tabanlı müşteri analizi." },
      { id: "content_generator", label: "AI Ürün İçerik & SEO Asistanı", description: "Ürün metni önizlemesi." },
      { id: "chat", label: "AI Sohbet Asistanı", description: "Birden fazla veri alanında kural tabanlı sohbet." },
    ].filter(module => allowedNow(gate.user, permissions[module.id]));
    return NextResponse.json({ success: true, modules, guardrails: GUARDRAILS, chatSuggestions: modules.some(module => module.id === "chat") ? ["Bugünkü satışlar nasıl?", "Hangi ürünlerin stoğu kritik?", "Satın alma önerisi ver", "VIP müşterilerim kimler?"] : [] }, { headers });
  } catch {
    return fail(500, "AI yetkisi doğrulanamadı.");
  }
}

export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) { gate.response.headers.set("Cache-Control", "private, no-store"); return gate.response; }
  try {
    const invalid = await validateCrmWriteAccess(request, gate.user);
    if (invalid) { invalid.headers.set("Cache-Control", "private, no-store"); return invalid; }
    const parsed = await readCrmJson(request);
    if (!parsed.ok) { parsed.response.headers.set("Cache-Control", "private, no-store"); return parsed.response; }
    if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return fail(422, "Geçersiz AI isteği.");
    const body = parsed.value as Record<string, unknown>;
    const moduleId = typeof body.module === "string" ? body.module : "";
    const required = Object.hasOwn(permissions, moduleId) ? permissions[moduleId] : undefined;
    if (!required) return fail(400, "Bilinmeyen AI modülü.");
    if (!allowedNow(gate.user, required)) return fail(403, "Bu AI işlemi için gerekli modül yetkileriniz bulunmuyor.");

    if (moduleId === "apply_content") return applyContent(body, gate.user, required);
    let data: unknown;
    if (moduleId === "chat") {
      if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 1000) return fail(422, "Sohbet mesajı 1–1000 karakter olmalıdır.");
      data = await chat(body.prompt.trim());
    } else if (moduleId === "content_generator") {
      if (!Number.isSafeInteger(body.productId) || Number(body.productId) <= 0 || (body.tone !== undefined && (typeof body.tone !== "string" || body.tone.length > 40)) || (body.keywords !== undefined && (!Array.isArray(body.keywords) || body.keywords.length > 10 || body.keywords.some(x => typeof x !== "string" || x.length > 80)))) return fail(422, "Geçerli ürün ve içerik seçenekleri girin.");
      if (!sqlite.prepare("SELECT 1 FROM products WHERE id=?").get(body.productId)) return fail(404, "Ürün bulunamadı.");
      data = await generateProductContent(Number(body.productId), { tone: body.tone as string | undefined, keywords: body.keywords as string[] | undefined });
    } else if (moduleId === "sales_analyst") data = await analyzeSales();
    else if (moduleId === "inventory_assistant") data = await analyzeInventory();
    else if (moduleId === "purchasing_advisor") data = await recommendPurchases();
    else data = await analyzeCustomers();

    // Long computations may outlive the original session or role permissions.
    const current = await requireStaff(request);
    if (!current.ok || current.user.id !== gate.user.id || !recordView(current.user, moduleId, required)) return fail(403, "AI yetkiniz veya oturumunuz değişti; sonuç gösterilmedi.");
    const guardrail = moduleId === "crm_assistant" || moduleId === "chat" ? GUARDRAILS.crm : moduleId === "content_generator" ? GUARDRAILS.content : GUARDRAILS.default;
    return NextResponse.json({ success: true, guardrail, data }, { headers });
  } catch (error) {
    console.error("AI module error:", error instanceof Error ? error.name : "UnknownError");
    return fail(500, "AI işlemi tamamlanamadı.");
  }
}

function applyContent(body: Record<string, unknown>, actor: SessionUser, required: readonly string[]) {
  if (!Number.isSafeInteger(body.productId) || Number(body.productId) <= 0 || !body.content || typeof body.content !== "object" || Array.isArray(body.content)) return fail(422, "Geçerli ürün ve içerik girin.");
  const content = body.content as Record<string, unknown>;
  const limits: Record<string, number> = { seoTitle: 200, metaDescription: 300, seoDescription: 8000, longDescription: 8000, suggestedTags: 1000 };
  if (Object.keys(content).some(key => !(key in limits) || typeof content[key] !== "string" || (content[key] as string).length > limits[key])) return fail(422, "İçerik alanları veya uzunlukları geçersiz.");
  const title = typeof content.seoTitle === "string" ? content.seoTitle.trim() : "";
  const meta = typeof content.metaDescription === "string" ? content.metaDescription.trim() : "";
  const description = typeof content.longDescription === "string" ? content.longDescription.trim() : "";
  const tags = typeof content.suggestedTags === "string" ? content.suggestedTags.trim() : "";
  if (!title && !meta && !description && !tags) return fail(422, "Uygulanacak içerik bulunamadı.");
  const result = sqlite.transaction(() => {
    if (!currentAccess(actor, required)) return 403;
    if (!sqlite.prepare("SELECT 1 FROM products WHERE id=?").get(body.productId)) return 404;
    sqlite.prepare(`UPDATE products SET seo_title=CASE WHEN @title<>'' THEN @title ELSE seo_title END,
      seo_description=CASE WHEN @meta<>'' THEN @meta ELSE seo_description END,
      description=CASE WHEN @description<>'' THEN @description ELSE description END,
      tags=CASE WHEN @tags<>'' THEN @tags ELSE tags END WHERE id=@id`).run({ title, meta, description, tags, id: body.productId });
    sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'AI_CONTENT_APPLIED','Product',?,'Ürün içerik alanları uygulandı')").run(String(actor.id), actor.name, String(body.productId));
    return 200;
  }).immediate();
  if (result === 403) return fail(403, "AI veya katalog yetkiniz bulunmuyor.");
  if (result === 404) return fail(404, "Ürün bulunamadı.");
  return NextResponse.json({ success: true, message: "İçerik kullanıcı onayıyla ürüne uygulandı." }, { headers });
}
