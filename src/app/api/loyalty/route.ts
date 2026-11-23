import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getUserByToken, requireStaff } from "@/lib/auth";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { DEFAULT_SETTINGS } from "@/lib/settings";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers });
const allowedKeys = ["loyalty.earn_rate_tl", "loyalty.earn_points", "loyalty.point_value_tl", "loyalty.expire_days", "reservation.minutes", "shipping.free_threshold"];
const systemKeys = new Set(["reservation.minutes", "shipping.free_threshold"]);
const settingKeySet = new Set(allowedKeys);

function validSetting(key: string, value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) return false;
  const number = Number(value);
  if (!["loyalty.earn_rate_tl", "loyalty.point_value_tl", "shipping.free_threshold"].includes(key) && !Number.isInteger(number)) return false;
  if (key === "loyalty.earn_rate_tl" && number <= 0) return false;
  if (["loyalty.earn_points", "reservation.minutes"].includes(key) && number < 1) return false;
  return number >= 0 && number <= 100000000;
}

/** Recheck the active user's role and current matrix under the write lock. */
function canWrite(userId: number, expectedRole: string, customerChange: boolean): boolean {
  const actor = sqlite.prepare("SELECT role,is_active AS active FROM users WHERE id=?").get(userId) as { role: string; active: number } | undefined;
  if (!actor?.active || actor.role !== expectedRole) return false;
  const row = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as { value: string } | undefined;
  let saved: unknown = null;
  try { if (row?.value) saved = JSON.parse(row.value); } catch { /* existing defaults */ }
  const matrix = normalizeRoleMatrix(saved);
  return roleCanAccessModule(matrix, actor.role, "coupons") && (!customerChange || (roleCanAccessModule(matrix, actor.role, "crm") && roleCanAccessModule(matrix, actor.role, "crmWrite")));
}

/** Settings are restricted to the six displayed keys; personal loyalty data also needs CRM read. */
export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const matrix = await readRoleMatrix();
    if (!roleCanAccessModule(matrix, gate.user.role, "coupons")) return fail(403, "Sadakat ekranı için pazarlama yetkisi gerekir.");
    const crmAllowed = roleCanAccessModule(matrix, gate.user.role, "crm");
    const defaults = Object.fromEntries(allowedKeys.map(key => [key, DEFAULT_SETTINGS[key].value]));
    const descriptions = Object.fromEntries(allowedKeys.map(key => [key, DEFAULT_SETTINGS[key].description]));
    const settings = { ...defaults };
    const placeholders = allowedKeys.map(() => "?").join(",");
    const rows = sqlite.prepare(`SELECT key,value FROM app_settings WHERE key IN (${placeholders})`).all(...allowedKeys) as Array<{key: string; value: string}>;
    for (const row of rows) settings[row.key] = row.value;
    let members: unknown[] | null = null, transactions: unknown[] | null = null;
    if (crmAllowed) {
      const memberRows = sqlite.prepare(`SELECT c.id,c.name,c.type,c.loyalty_points AS points,
        COALESCE((SELECT SUM(t.points) FROM loyalty_transactions t WHERE t.customer_id=c.id AND t.type IN ('EARN','BONUS')),0) AS earned,
        COALESCE((SELECT SUM(ABS(t.points)) FROM loyalty_transactions t WHERE t.customer_id=c.id AND t.type='SPEND'),0) AS spent
        FROM customers c ORDER BY c.loyalty_points DESC,c.id ASC LIMIT 20`).all() as Array<{id: number; name: string; type: string; points: number; earned: number; spent: number}>;
      members = memberRows.map(c => ({ ...c, tier: c.points >= 1000 ? "VIP PLATİN" : c.points >= 500 ? "ALTIN" : c.points >= 100 ? "GÜMÜŞ" : "BRONZ" }));
      const txs = sqlite.prepare(`SELECT t.id,t.customer_id AS customerId,t.points,t.type,t.description,t.order_id AS orderId,t.created_at AS createdAt,COALESCE(c.name,'?') AS customerName FROM loyalty_transactions t LEFT JOIN customers c ON c.id=t.customer_id ORDER BY t.id DESC LIMIT 30`).all() as Array<{ createdAt: number }>;
      transactions = txs.map(t => ({ ...t, createdAt: new Date(t.createdAt * 1000).toISOString() }));
    }
    const settingsWriteKeys = allowedKeys.filter(key => !systemKeys.has(key) || gate.user.role === "SUPER_ADMIN");
    return NextResponse.json({ success: true, settings, defaults, descriptions, settingsWriteKeys, crmAllowed, members, transactions }, { headers });
  } catch (error) {
    console.error("Sadakat ekranı yüklenemedi", error instanceof Error ? error.name : "UnknownError");
    return fail(500, "Sadakat bilgileri yüklenemedi.");
  }
}

export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const invalid = validateCrmWrite(request);
  if (invalid) return invalid;
  if (!request.headers.get("origin")) {
    const bearer = request.headers.get("authorization");
    const actor = bearer?.startsWith("Bearer ") ? await getUserByToken(bearer.slice(7).trim()) : null;
    if (!actor || actor.id !== gate.user.id) return fail(403, "İstek kaynağı doğrulanamadı.");
  }
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(422, "Geçersiz istek.");
  const input = body as Record<string, unknown>;
  try {
    if (input.action === "SAVE_SETTINGS") {
      if (Object.keys(input).some(k => !["action", "settings"].includes(k)) || !input.settings || typeof input.settings !== "object" || Array.isArray(input.settings)) return fail(422, "Geçersiz ayarlar.");
      const entries = Object.entries(input.settings as Record<string, unknown>);
      if (!entries.length || entries.some(([key, value]) => !settingKeySet.has(key) || !validSetting(key, value))) return fail(422, "Yalnızca geçerli ekran ayarları kaydedilebilir; sayısal değerleri kontrol edin.");
      if (gate.user.role !== "SUPER_ADMIN" && entries.some(([key]) => systemKeys.has(key))) return fail(403, "Rezervasyon ve kargo ayarlarını yalnız Süper Admin değiştirebilir.");
      const update = sqlite.transaction(() => {
        if (!canWrite(gate.user.id, gate.user.role, false)) return false;
        const save = sqlite.prepare(`INSERT INTO app_settings(key,value,description,updated_at) VALUES(?,?,?,unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`);
        for (const [key, value] of entries) save.run(key, (value as string).trim(), DEFAULT_SETTINGS[key].description);
        sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'LOYALTY_SETTINGS','AppSettings',NULL,?)").run(String(gate.user.id),gate.user.name,`Ayar anahtarları: ${entries.map(([key]) => key).sort().join(', ')}`);
        return true;
      });
      if (!update.immediate()) return fail(403, "Ayarları değiştirmek için pazarlama yetkisi gerekir.");
      return NextResponse.json({ success: true, message: "Ayarlar kaydedildi." }, { headers });
    }
    if (input.action === "ADJUST") {
      if (Object.keys(input).some(k => !["action", "customerId", "points", "description"].includes(k)) || !Number.isSafeInteger(input.customerId) || Number(input.customerId) <= 0 || !Number.isSafeInteger(input.points) || Number(input.points) === 0 || Math.abs(Number(input.points)) > 1000000 || (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 500))) return fail(422, "Geçerli müşteri, tam sayı puan ve en fazla 500 karakter açıklama girin.");
      const customerId = Number(input.customerId), points = Number(input.points);
      const description = typeof input.description === "string" && input.description.trim() ? input.description.trim() : points > 0 ? "Yönetici bonus puanı" : "Yönetici düşümü";
      const adjust = sqlite.transaction(() => {
        if (!canWrite(gate.user.id, gate.user.role, true)) return { status: 403, error: "Puan değiştirmek için pazarlama ve CRM değiştirme yetkileri gerekir." } as const;
        const customer = sqlite.prepare("SELECT loyalty_points AS points FROM customers WHERE id=?").get(customerId) as {points: number} | undefined;
        if (!customer) return { status: 404, error: "Müşteri bulunamadı." } as const;
        const balance = customer.points + points;
        if (!Number.isSafeInteger(balance) || balance < 0) return { status: 422, error: "Puan bakiyesi sıfırın altına inemez." } as const;
        sqlite.prepare("UPDATE customers SET loyalty_points=? WHERE id=?").run(balance,customerId);
        const transaction = sqlite.prepare("INSERT INTO loyalty_transactions(customer_id,points,type,description) VALUES(?,?,?,?)").run(customerId,points,points > 0 ? "BONUS" : "SPEND",description);
        sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'LOYALTY_ADJUSTED','Customer',?,?)").run(String(gate.user.id),gate.user.name,String(customerId),`Sadakat hareketi #${transaction.lastInsertRowid}`);
        return { status: 200, balance } as const;
      });
      const result = adjust.immediate();
      if (result.status !== 200) return fail(result.status,result.error);
      return NextResponse.json({ success: true, data: { balance: result.balance } }, { headers });
    }
    return fail(400, "Bilinmeyen eylem.");
  } catch (error) {
    console.error("Sadakat işlemi başarısız", error instanceof Error ? error.name : "UnknownError");
    return fail(500, "Sadakat işlemi tamamlanamadı.");
  }
}
