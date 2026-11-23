import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { hashPassword } from "@/lib/password";
import { isValidReviewEmail } from "@/lib/review-email";
import { readCrmJson } from "@/lib/crm-write";
import { publicBaseUrl, ROLE_LABELS_TR, SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status, headers });

/** Public B2C registration: new card, account, session and audit commit together. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== publicBaseUrl(request)) || request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "FORBIDDEN", "İstek kaynağı doğrulanamadı.");
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") || "")) return fail(415, "VALIDATION_ERROR", "Geçersiz istek türü.");
  if (Number(request.headers.get("content-length") || 0) > 16384) return fail(413, "VALIDATION_ERROR", "İstek çok büyük.");
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return fail(parsed.response.status, "VALIDATION_ERROR", parsed.response.status === 413 ? "İstek çok büyük." : "Geçersiz istek gövdesi.");
  const value = parsed.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(422, "VALIDATION_ERROR", "Geçersiz kayıt bilgileri.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["name", "email", "phone", "password", "city"].includes(key)) || typeof body.name !== "string" || typeof body.email !== "string" || typeof body.phone !== "string" || typeof body.password !== "string" || (body.city != null && typeof body.city !== "string")) return fail(422, "VALIDATION_ERROR", "Geçersiz kayıt bilgileri.");
  const name = body.name.trim(), email = body.email.trim().toLowerCase(), phone = body.phone.trim(), password = body.password;
  const city = typeof body.city === "string" ? body.city.trim() || null : null;
  const digits = phone.replace(/\D/g, "");
  if (name.length < 2 || name.length > 120) return fail(422, "VALIDATION_ERROR", "Ad Soyad 2–120 karakter olmalıdır.");
  if (!isValidReviewEmail(email)) return fail(422, "VALIDATION_ERROR", "Geçerli bir e-posta girin.");
  if (!/^\+?[\d ().-]+$/.test(phone) || phone.length > 40 || digits.length < 10 || digits.length > 15) return fail(422, "VALIDATION_ERROR", "Telefon 10–15 rakam içermelidir.");
  if (password.length < 6 || password.length > 256) return fail(422, "VALIDATION_ERROR", "Şifre 6–256 karakter olmalıdır.");
  if ((city?.length ?? 0) > 100) return fail(422, "VALIDATION_ERROR", "Şehir en fazla 100 karakter olmalıdır.");

  try {
    const passwordHash = hashPassword(password);
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 100) || null;
    const userAgent = request.headers.get("user-agent")?.slice(0, 500) || null;
    const register = sqlite.transaction(() => {
      // Protect case/whitespace variants in older accounts as well as current writes.
      if (sqlite.prepare("SELECT 1 FROM users WHERE lower(trim(email))=? LIMIT 1").get(email)) return null;
      // Never infer that an existing CRM card belongs to this unverified registrant.
      const customerId = Number(sqlite.prepare("INSERT INTO customers(type,name,email,phone,city,segment,notes) VALUES('B2C',?,?,?,?,'YENİ','Web sitesi üyeliği ile oluşturuldu.')").run(name,email,phone,city).lastInsertRowid);
      const userId = Number(sqlite.prepare("INSERT INTO users(name,email,phone,password_hash,role,customer_id) VALUES(?,?,?,?,'B2C_CUSTOMER',?)").run(name,email,phone,passwordHash,customerId).lastInsertRowid);
      sqlite.prepare("INSERT INTO admin_sessions(user_id,jti,ip,user_agent,expires_at) VALUES(?,?,?,?,?)").run(userId,tokenHash,ip,userAgent,Math.floor(expiresAt.getTime()/1000));
      sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,'Web üyesi','WEB_CUSTOMER_REGISTERED','Customer',?,'Web üyeliğiyle yeni müşteri kartı oluşturuldu')").run(String(userId),String(customerId));
      return { userId, customerId };
    }).immediate();
    if (!register) return fail(409, "DUPLICATE", "Bu e-posta ile zaten bir üyelik var. Giriş yapmayı deneyin.");
    const user = { id: register.userId, name, email, role: "B2C_CUSTOMER", roleLabel: ROLE_LABELS_TR.B2C_CUSTOMER, isStaff: false };
    const res = NextResponse.json({ success: true, data: { user, customerId: register.customerId, token, expiresAt: expiresAt.toISOString() } }, { headers });
    res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(request), maxAge: SESSION_TTL_SECONDS });
    return res;
  } catch (error) {
    console.error("Web üyeliği oluşturulamadı", error instanceof Error ? error.name : "UnknownError");
    return fail(500, "INTERNAL_ERROR", "Kayıt oluşturulamadı. Tekrar denemeden önce giriş yapmayı deneyin.");
  }
}
