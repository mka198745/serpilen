import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, adminSessions } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";

export const SESSION_COOKIE = "ipek_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 3600; // 7 gün

/** Mağaza içi yetkili roller (POS / B2B / Admin sekmelerini görebilir). */
export const STAFF_ROLES = ["SUPER_ADMIN", "STORE_MANAGER", "WAREHOUSE_KEEPER", "CASHIER", "B2B_MANAGER"] as const;

export const ROLE_LABELS_TR: Record<string, string> = {
  SUPER_ADMIN: "Süper Admin",
  STORE_MANAGER: "Mağaza Müdürü",
  WAREHOUSE_KEEPER: "Depo Sorumlusu",
  CASHIER: "POS Kasiyeri",
  B2B_MANAGER: "B2B Satış Temsilcisi",
  B2B_CUSTOMER: "B2B Müşteri",
  B2C_CUSTOMER: "Üye",
};

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  isStaff: boolean;
}

export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role.toUpperCase());
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Yeni oturum açar, ham token döndürür (cookie'ye yazılır; DB'ye özeti yazılır). */
export async function createSession(userId: number, opts?: { ip?: string | null; userAgent?: string | null }) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const [{ id: jtiId }] = await db
    .insert(adminSessions)
    .values({
      userId,
      jti: hashToken(token),
      ip: opts?.ip || null,
      userAgent: opts?.userAgent ? String(opts.userAgent).slice(0, 500) : null,
      expiresAt,
    })
    .$returningId();
  const [session] = await db.select().from(adminSessions).where(eq(adminSessions.id, jtiId));
  void session;
  return { token, expiresAt };
}

export async function revokeSessionByToken(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db.update(adminSessions).set({ revokedAt: new Date() }).where(eq(adminSessions.jti, hashToken(token)));
}

export async function getUserByToken(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [session] = await db
    .select()
    .from(adminSessions)
    .where(
      and(
        eq(adminSessions.jti, hashToken(token)),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.isActive === false) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS_TR[user.role] || user.role,
    isStaff: isStaffRole(user.role),
  };
}

/** Server Component / Route Handler içinden o anki giriş yapmış kullanıcı. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getUserByToken(store.get(SESSION_COOKIE)?.value);
}

/** Kısa sunucu günlüğü: giriş sorunlarını teşhis için (şifre/token değeri yazılmaz). */
export function authLog(...args: unknown[]) {
  console.log("[auth]", new Date().toISOString(), ...args);
}

/** İstek gerçekten HTTPS üzerinden mi geldi? (proxy arkasında x-forwarded-proto'ya bakılır) */
export function isHttpsRequest(request?: Request): boolean {
  if (!request) return false;
  const fwd = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (fwd === "https") return true;
  if (fwd === "http") return false;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Yerel (TLS'siz) erişim mi? Boş/host yok, localhost, IP veya .local → evet. */
function isLocalHostname(host: string | null): boolean {
  const h = (host || "").split(":")[0].trim().toLowerCase();
  return (
    h === "" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h === "::1" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ||
    h.endsWith(".local")
  );
}

export function sessionCookieOptions(request?: Request) {
  // Uyarlanabilir strateji:
  // - Localhost DIŞI host'larda (ör. *.e2b.app, gerçek alan adları) tarayıcı HTTPS
  //   kabul edilir: SameSite=None + Secure + Partitioned (CHIPS). None ŞARTTIR
  //   çünkü Lax çerezler iframe içinden ASLA gönderilmez; Partitioned ise
  //   Chrome'un üçüncü-taraf engeline takılmadan saklanmayı sağlar (üst siteye
  //   çift-anahtarlı olduğundan CSRF riski de taşımaz).
  // - Localhost/IP erişiminde proto'ya bakılır (HTTP → sade Lax çerez).
  // COOKIE_SECURE=1 zorla açar, =0 zorla kapatır.
  const override = process.env.COOKIE_SECURE;
  const host = request?.headers.get("host") || null;
  const secure =
    override === "1" ? true : override === "0" ? false : isHttpsRequest(request) || !isLocalHostname(host);
  const partitioned = secure && !isLocalHostname(host);
  const sameSite = (partitioned ? "none" : "lax") as "none" | "lax";
  return {
    httpOnly: true as const,
    sameSite,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure,
    ...(partitioned ? { partitioned: true as const } : {}),
  };
}

/**
 * Başlıktan token okur: önce Authorization: Bearer, sonra X-Auth-Token.
 * (Bazı proxy'ler Authorization başlığını düşürür; X-Auth-Token yedek taşıyıcıdır.)
 */
export function getRequestToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (h && h.toLowerCase().startsWith("bearer ")) {
    const t = h.slice(7).trim();
    if (t) return t;
  }
  return request.headers.get("x-auth-token")?.trim() || null;
}

/** Token hangi başlıkla geldi? (tanı günlükleri için) */
export function getRequestTokenSource(request: Request): "auth" | "xtoken" | null {
  const h = request.headers.get("authorization");
  if (h && h.toLowerCase().startsWith("bearer ") && h.slice(7).trim()) return "auth";
  if (request.headers.get("x-auth-token")?.trim()) return "xtoken";
  return null;
}

/** Route Handler içinden: önce çerez, yoksa Bearer başlığı ile kullanıcı. */
export async function getSessionUserFromRequest(request: Request): Promise<SessionUser | null> {
  const byCookie = await getSessionUser();
  if (byCookie) return byCookie;
  return getUserByToken(getRequestToken(request));
}

/**
 * Güvenli geçiş (handoff) jetonları: kısa ömürlü (120 sn), sınırlı kullanımlı
 * (en fazla 5), bellekte saklanır. Jetonun kendisi oturum token'ı DEĞİLDİR;
 * yalnızca claim anında tek oturuma çözülür.
 */
const HANDOFF_TTL_MS = 120_000;
const HANDOFF_MAX_USES = 5;
const handoffNonces = new Map<string, { token: string; expiresAt: number; uses: number }>();

export function mintHandoffNonce(token: string): string {
  const nonce = crypto.randomBytes(24).toString("base64url");
  handoffNonces.set(nonce, { token, expiresAt: Date.now() + HANDOFF_TTL_MS, uses: 0 });
  if (handoffNonces.size > 500) {
    const now = Date.now();
    for (const [k, v] of handoffNonces) if (v.expiresAt < now) handoffNonces.delete(k);
  }
  return nonce;
}

export function consumeHandoffNonce(nonce: string | null): string | null {
  if (!nonce) return null;
  const rec = handoffNonces.get(nonce);
  if (!rec) return null;
  if (rec.expiresAt < Date.now() || rec.uses >= HANDOFF_MAX_USES) {
    handoffNonces.delete(nonce);
    return null;
  }
  rec.uses += 1;
  return rec.token;
}
