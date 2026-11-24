import { NextResponse } from "next/server";
import { requireStaff, getUserByToken } from "@/lib/auth";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { readCrmJson, validateCrmWrite } from "@/lib/crm-write";
import { fetchPublicProductPage, publicHttpsUrl, resolvePublicHost, ProductImportError } from "@/lib/product-import/safe-fetch";
import { extractProduct } from "@/lib/product-import/extract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const fail = (status: number, message: string) => NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
// Best-effort per-process safeguards; not a distributed production rate limiter.
const recent = new Map<number, number[]>();
let inFlight = 0;

async function hasImportAccess(role: string): Promise<boolean> {
  const matrix = await readRoleMatrix();
  return roleCanAccessModule(matrix, role, "catalog") && roleCanAccessModule(matrix, role, "productLinkImport");
}

/** The form checks the current session and saved permission, never the draft matrix. */
export async function GET(request: Request) {
  try {
    const gate = await requireStaff(request);
    if (!gate.ok) {
      gate.response.headers.set("Cache-Control", "private, no-store");
      return gate.response;
    }
    const allowed = await hasImportAccess(gate.user.role);
    return NextResponse.json({ success: true, allowed }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return fail(500, "Ürün bağlantısı yetkisi doğrulanamadı.");
  }
}

export async function POST(request: Request) {
  try {
    return await handleImport(request);
  } catch (error) {
    // Failures in authorization, role settings or body reading must not become an HTML 500 page.
    console.error("[product-import] Beklenmeyen servis hatası:", error instanceof Error ? error.name : "UnknownError");
    return fail(500, "Ürün getirme servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.");
  }
}

async function handleImport(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  if (!(await hasImportAccess(gate.user.role))) return fail(403,"Ürün bağlantısından bilgi getirmek için katalog ve ürün linki yetkileri gerekir.");
  const invalid = validateCrmWrite(request);
  if (invalid) return invalid;
  if (!request.headers.get("origin")) {
    const actor = await getUserByToken(request.headers.get("authorization")?.slice(7).trim());
    if (!actor || actor.id !== gate.user.id) return fail(403,"İstek kaynağı doğrulanamadı.");
  }
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const input = parsed.value as Record<string, unknown> | null;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => k !== "url") || typeof input.url !== "string" || input.url.length > 2048 || !input.url.trim()) return fail(422,"Geçerli bir ürün bağlantısı girin.");
  try { publicHttpsUrl(input.url.trim()); } catch (err) { return fail(422, err instanceof ProductImportError ? err.message : "Geçersiz bağlantı."); }
  const now = Date.now();
  for (const [id, times] of recent) if (times.every(time => now - time >= 60000)) recent.delete(id);
  const times = (recent.get(gate.user.id) || []).filter(time => now - time < 60000);
  if (times.length >= 8 || inFlight >= 4) return fail(429,"Çok fazla istek var. Lütfen biraz sonra tekrar deneyin.");
  recent.set(gate.user.id,[...times, now]); inFlight++;
  try {
    const page = await fetchPublicProductPage(input.url.trim());
    const data = extractProduct(page.html,page.url);
    if (page.warnings) data.warnings.push(...page.warnings);
    // Check every unique image host, including variant images, without fetching the images.
    const signal = AbortSignal.timeout(4000);
    const hosts = new Map<string, Promise<boolean>>();
    const safe = (url: string) => {
      try {
        const host = publicHttpsUrl(url).hostname;
        if (!hosts.has(host)) hosts.set(host, resolvePublicHost(host, signal).then(() => true, () => false));
        return hosts.get(host)!;
      } catch { return Promise.resolve(false); }
    };
    const checks = await Promise.all(data.images.map(safe));
    const images = data.images.filter((_url,index) => checks[index]);
    const variants = await Promise.all((data.variants || []).map(async variant => ({ ...variant, imageUrl: variant.imageUrl && await safe(variant.imageUrl) ? variant.imageUrl : "" })));
    if (images.length < data.images.length || variants.some((v, i) => !!data.variants?.[i].imageUrl && !v.imageUrl)) data.warnings.push("Bazı görsel adresleri güvenlik veya erişim nedeniyle aktarılmadı.");
    // Permission, role or account status may have changed during the network request.
    const current = await requireStaff(request);
    if (!current.ok || current.user.id !== gate.user.id || !(await hasImportAccess(current.user.role))) return fail(403, "Ürün bağlantısı yetkiniz değişti; bilgiler aktarılmadı.");
    return NextResponse.json({ success: true, data: { ...data, images, variants } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ProductImportError) return fail(["NO_PRODUCT","AMBIGUOUS","INVALID_URL","UNSAFE_HOST"].includes(error.code) ? 422 : 502, error.message);
    return fail(502,"Ürün sayfası okunamadı.");
  } finally { inFlight--; }
}
