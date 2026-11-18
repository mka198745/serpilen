import { NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { users } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { requireStaff, publicBaseUrl, getUserByToken } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { readCrmJson } from "@/lib/crm-write";

export const dynamic = "force-dynamic";
const ROLES = ["SUPER_ADMIN", "STORE_MANAGER", "WAREHOUSE_KEEPER", "CASHIER"] as const;
const ROLE_LABELS: Record<string, string> = { SUPER_ADMIN: "Süper Admin", STORE_MANAGER: "Mağaza Müdürü", WAREHOUSE_KEEPER: "Depo Sorumlusu", CASHIER: "POS Kasiyeri", B2C_CUSTOMER: "Müşteri Üye" };
const isStaff = (role: string) => ROLES.includes(role.toUpperCase() as (typeof ROLES)[number]);
const failure = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status });
const forbidden = () => failure(403, "FORBIDDEN", "Bu işlem için yetkiniz bulunmuyor.");
const headers = { "Cache-Control": "private, no-store" };

async function validateMutation(request: Request, json: boolean, actorId: number) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== publicBaseUrl(request)) || request.headers.get("sec-fetch-site") === "cross-site" || (!origin && !request.headers.get("authorization")?.startsWith("Bearer "))) return failure(403, "FORBIDDEN", "İstek kaynağı doğrulanamadı.");
  if (!origin) {
    const bearer = request.headers.get("authorization")?.slice(7).trim();
    const bearerUser = await getUserByToken(bearer);
    if (!bearerUser || bearerUser.id !== actorId) return failure(403, "FORBIDDEN", "İstek kaynağı doğrulanamadı.");
  }
  if (json && !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") || "")) return failure(415, "INVALID_CONTENT_TYPE", "Geçersiz istek türü.");
  if (json && Number(request.headers.get("content-length") || 0) > 16384) return failure(413, "TOO_LARGE", "İstek çok büyük.");
  return null;
}

type PublicUser = { id: number; name: string; email: string; role: string; phone: string | null; isActive: number };
const userSelect = "SELECT id,name,email,role,phone,is_active AS isActive FROM users WHERE id=?";
const label = (role: string) => ROLE_LABELS[role] || role;
// Recheck active role inside each write transaction, after parsing the request body.
function actorStillAuthorized(id: number, role: string) {
  const actor = sqlite.prepare("SELECT role,is_active AS isActive FROM users WHERE id=?").get(id) as { role: string; isActive: number } | undefined;
  return !!actor && !!actor.isActive && actor.role === role;
}

/** Staff and web accounts are separately gated by their server-side matrix modules. */
export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const type = (new URL(request.url).searchParams.get("type") || "staff").toLowerCase();
  if (!["staff", "customers", "all"].includes(type)) return failure(422, "VALIDATION_ERROR", "Geçersiz kullanıcı türü.");
  const matrix = await readRoleMatrix();
  const staffAccess = roleCanAccessModule(matrix, gate.user.role, "users");
  const customerAccess = roleCanAccessModule(matrix, gate.user.role, "registeredCustomers");
  if ((type === "staff" && !staffAccess) || (type === "customers" && !customerAccess) || (type === "all" && (!staffAccess || !customerAccess))) return forbidden();
  const roleFilter = type === "all" ? sql`upper(${users.role}) IN ('SUPER_ADMIN','STORE_MANAGER','WAREHOUSE_KEEPER','CASHIER','B2C_CUSTOMER')` : type === "staff" ? sql`upper(${users.role}) IN ('SUPER_ADMIN','STORE_MANAGER','WAREHOUSE_KEEPER','CASHIER')` : sql`upper(${users.role}) = 'B2C_CUSTOMER'`;
  const selected = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, phone: users.phone, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt }).from(users).where(roleFilter).orderBy(desc(users.id));
  return NextResponse.json({ success: true, data: selected.map(user => ({ ...user, roleLabel: label(user.role), lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null, createdAt: new Date(user.createdAt).toISOString() })) }, { headers });
}

/** Only SUPER_ADMIN can create staff accounts, irrespective of UI visibility. */
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  if (gate.user.role !== "SUPER_ADMIN") return forbidden();
  const invalid = await validateMutation(request, true, gate.user.id);
  if (invalid) return invalid;
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown> | null;
  const allowed = ["name", "email", "phone", "role", "password"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || typeof body.name !== "string" || typeof body.email !== "string" || typeof body.password !== "string" || (body.phone !== undefined && typeof body.phone !== "string") || (body.role !== undefined && typeof body.role !== "string")) return failure(422, "VALIDATION_ERROR", "Geçersiz kullanıcı bilgileri.");
  const name = body.name.trim(), email = body.email.trim().toLowerCase(), phone = (body.phone as string | undefined)?.trim() || null, role = (body.role as string | undefined)?.toUpperCase() || "CASHIER", password = body.password;
  if (!name || name.length > 120 || !email.includes("@") || email.length > 254 || (phone?.length ?? 0) > 40 || !isStaff(role) || password.length < 8 || password.length > 256 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return failure(422, "VALIDATION_ERROR", "Geçerli ad, e-posta, rol ve en az 8 karakterli harf ve rakam içeren şifre gereklidir.");
  const passwordHash = hashPassword(password);
  try {
    const create = sqlite.transaction(() => {
      if (!actorStillAuthorized(gate.user.id, gate.user.role)) return { kind: "forbidden" } as const;
      if (sqlite.prepare("SELECT 1 FROM users WHERE email=?").get(email)) return { kind: "duplicate" } as const;
      // Use SQLite AUTOINCREMENT; do not recycle deleted user IDs or reset sqlite_sequence.
      const result = sqlite.prepare("INSERT INTO users (name,email,phone,role,password_hash) VALUES (?,?,?,?,?)").run(name,email,phone,role,passwordHash);
      sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,'USER_CREATED','User',?,?)").run(String(gate.user.id),gate.user.name,String(result.lastInsertRowid),`Personel oluşturuldu; rol: ${role}`);
      const user = sqlite.prepare("SELECT id,name,email,role,phone,is_active AS isActive,created_at AS createdAt FROM users WHERE id=?").get(Number(result.lastInsertRowid)) as PublicUser & { createdAt: number };
      return { kind: "created", user } as const;
    });
    const result = create.immediate();
    if (result.kind === "forbidden") return forbidden();
    if (result.kind === "duplicate") return failure(409, "DUPLICATE", "Bu e-posta ile kayıtlı kullanıcı zaten var.");
    const user = result.user;
    return NextResponse.json({ success: true, data: { ...user, isActive: !!user.isActive, createdAt: new Date(user.createdAt * 1000).toISOString(), roleLabel: label(user.role) } }, { headers });
  } catch (error) { console.error("User creation failed", error); return failure(500, "CREATE_FAILED", "Kullanıcı oluşturulamadı."); }
}

/** Only SUPER_ADMIN can modify staff; customer accounts require registeredCustomers. */
export async function PATCH(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const invalid = await validateMutation(request, true, gate.user.id);
  if (invalid) return invalid;
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown> | null;
  const allowed = ["id", "role", "isActive", "name", "phone"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || !Number.isSafeInteger(body.id) || Number(body.id) < 1 || (body.role !== undefined && typeof body.role !== "string") || (body.isActive !== undefined && typeof body.isActive !== "boolean") || (body.name !== undefined && typeof body.name !== "string") || (body.phone !== undefined && typeof body.phone !== "string")) return failure(422, "VALIDATION_ERROR", "Geçersiz kullanıcı bilgileri.");
  const id = Number(body.id), role = body.role === undefined ? undefined : (body.role as string).toUpperCase();
  const name = body.name === undefined ? undefined : (body.name as string).trim(), phone = body.phone === undefined ? undefined : ((body.phone as string).trim() || null);
  if ((role !== undefined && !isStaff(role)) || (name !== undefined && (!name || name.length > 120)) || (phone?.length ?? 0) > 40 || [role, body.isActive, name, phone].every(value => value === undefined)) return failure(422, "VALIDATION_ERROR", "Geçersiz güncelleme alanları.");
  try {
    const update = sqlite.transaction(() => {
      if (!actorStillAuthorized(gate.user.id, gate.user.role)) return { status: 403, code: "FORBIDDEN", error: "Bu işlem için yetkiniz bulunmuyor." } as const;
      const target = sqlite.prepare(userSelect).get(id) as PublicUser | undefined;
      if (!target) return { status: 404, code: "NOT_FOUND", error: "Kullanıcı bulunamadı." } as const;
      const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as { value: string } | undefined;
      let savedMatrix: unknown = null;
      try { if (setting?.value) savedMatrix = JSON.parse(setting.value); } catch { /* defaults */ }
      const customer = target.role.toUpperCase() === "B2C_CUSTOMER";
      if (isStaff(target.role) ? gate.user.role !== "SUPER_ADMIN" : !customer || !roleCanAccessModule(normalizeRoleMatrix(savedMatrix), gate.user.role, "registeredCustomers")) return { status: 403, code: "FORBIDDEN", error: "Bu işlem için yetkiniz bulunmuyor." } as const;
      if (!isStaff(target.role) && role !== undefined) return { status: 422, code: "ROLE_FROZEN", error: "Kayıtlı müşteri hesaplarına personel rolü atanamaz." } as const;
      const removesSuper = target.role.toUpperCase() === "SUPER_ADMIN" && !!target.isActive && ((role !== undefined && role !== "SUPER_ADMIN") || body.isActive === false);
      if (id === gate.user.id && removesSuper) return { status: 422, code: "SELF_DEMOTION", error: "Kendi Süper Admin hesabınızı pasife alamaz veya rolünü düşüremezsiniz." } as const;
      if (removesSuper && (sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE upper(role)='SUPER_ADMIN' AND is_active=1").get() as { n: number }).n <= 1) return { status: 422, code: "LAST_SUPER_ADMIN", error: "Son aktif Süper Admin pasife alınamaz veya rolü düşürülemez." } as const;
      const assignments: string[] = [], values: (string | number | null)[] = [], fields: string[] = [];
      if (role !== undefined && role !== target.role) { assignments.push("role=?"); values.push(role); fields.push("role"); }
      if (body.isActive !== undefined && Number(body.isActive) !== target.isActive) { assignments.push("is_active=?"); values.push(Number(body.isActive)); fields.push("isActive"); }
      if (name !== undefined && name !== target.name) { assignments.push("name=?"); values.push(name); fields.push("name"); }
      if (phone !== undefined && phone !== target.phone) { assignments.push("phone=?"); values.push(phone); fields.push("phone"); }
      if (assignments.length) {
        sqlite.prepare(`UPDATE users SET ${assignments.join(",")} WHERE id=?`).run(...values,id);
        sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,'USER_UPDATED','User',?,?)").run(String(gate.user.id),gate.user.name,String(id),`Değişen alanlar: ${fields.join(", ")}`);
      }
      return { status: 200, user: sqlite.prepare(userSelect).get(id) as PublicUser } as const;
    });
    const result = update.immediate();
    if (result.status !== 200) return failure(result.status,result.code,result.error);
    return NextResponse.json({ success: true, data: { ...result.user, isActive: !!result.user.isActive, roleLabel: label(result.user.role) } }, { headers });
  } catch (error) { console.error("User update failed",error); return failure(500,"UPDATE_FAILED","Kullanıcı güncellenemedi."); }
}

/** Only SUPER_ADMIN may delete; the actor and the last active admin are protected. */
export async function DELETE(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  if (gate.user.role !== "SUPER_ADMIN") return forbidden();
  const invalid = await validateMutation(request, false, gate.user.id);
  if (invalid) return invalid;
  const raw = new URL(request.url).searchParams.get("id") || "";
  if (!/^[1-9]\d{0,14}$/.test(raw) || !Number.isSafeInteger(Number(raw))) return failure(422,"VALIDATION_ERROR","Geçerli kullanıcı numarası gereklidir.");
  const id = Number(raw);
  try {
    const remove = sqlite.transaction(() => {
      if (!actorStillAuthorized(gate.user.id, gate.user.role)) return { status: 403, code: "FORBIDDEN", error: "Bu işlem için yetkiniz bulunmuyor." } as const;
      const target = sqlite.prepare(userSelect).get(id) as PublicUser | undefined;
      if (!target) return { status: 404, code: "NOT_FOUND", error: "Kullanıcı bulunamadı." } as const;
      if (target.id === gate.user.id) return { status: 422, code: "SELF_DELETE", error: "Kendi hesabınızı silemezsiniz." } as const;
      if (target.role.toUpperCase() === "SUPER_ADMIN" && target.isActive && (sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE upper(role)='SUPER_ADMIN' AND is_active=1").get() as { n: number }).n <= 1) return { status: 422, code: "LAST_SUPER_ADMIN", error: "Son aktif Süper Admin silinemez." } as const;
      sqlite.prepare("DELETE FROM admin_sessions WHERE user_id=?").run(id);
      sqlite.prepare("DELETE FROM auth_nonces WHERE user_id=?").run(id);
      sqlite.prepare("DELETE FROM users WHERE id=?").run(id);
      sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,'USER_DELETED','User',?,?)").run(String(gate.user.id),gate.user.name,String(id),`Kullanıcı silindi; rol: ${target.role}`);
      return { status: 200 } as const;
    });
    const result = remove.immediate();
    if (result.status !== 200) return failure(result.status,result.code,result.error);
    return NextResponse.json({ success: true, data: { id } }, { headers });
  } catch (error) { console.error("User deletion failed",error); return failure(500,"DELETE_FAILED","Kullanıcı silinemedi."); }
}
