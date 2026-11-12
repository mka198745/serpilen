import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, adminSessions, authNonces } from "@/db/schema";
import { and, eq, gt, isNull, lt } from "drizzle-orm";

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
    .returning({ id: adminSessions.id });
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

export type StaffGate =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Personel kapısı (route handler'lar için): giriş yoksa 401,
 * personel değilse 403 döner. Kullanım:
 *   const gate = await requireStaff(request);
 *   if (!gate.ok) return gate.response;
 */
export async function requireStaff(request: Request): Promise<StaffGate> {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Bu işlem için giriş yapmalısınız." } },
        { status: 401 }
      ),
    };
  }
  if (!user.isStaff) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Bu işlem için personel yetkisi gerekiyor." } },
        { status: 403 }
      ),
    };
  }
  return { ok: true, user };
}

/** Proxy arkasında tarayıcının gördüğü kök adres (mutlak yönlendirmeler için).
 *  request.url iç adresi (0.0.0.0) verir; Host başlığı genel adresi korur.
 *  Localhost dışı host'larda protokol her zaman https kabul edilir (çerez
 *  kuralıyla tutarlı: bu ortamlarda TLS sonlandırma vardır). */
export function publicBaseUrl(request: Request): string {
  const host = request.headers.get("host")?.trim() || "localhost:3000";
  const fwd = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const local = isLocalHostname(host);
  const proto = fwd === "https" ? "https" : fwd === "http" && local ? "http" : local ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * Güvenli geçiş (handoff) jetonları: 120 saniye ömürlü, veritabanında saklanır
 * (auth_nonces, scope='HANDOFF'). Jetonun kendisi oturum token'ı DEĞİLDİR;
 * yalnız kullanıcı kimliğine çözülür, claim anında YENİ bir oturum üretilir.
 * DB tabanlı olduğu için standalone sunucudaki tüm SSR/route chunk'ları ve
 * yeniden başlatmalar jetonu görür (bellek-içi Map parçalama yapmaz).
 */
const HANDOFF_TTL_MS = 120_000;

export async function mintHandoffNonce(userId: number): Promise<string> {
  const nonce = crypto.randomBytes(24).toString("base64url");
  await db.delete(authNonces).where(and(eq(authNonces.scope, "HANDOFF"), lt(authNonces.expiresAt, new Date())));
  await db.insert(authNonces).values({
    tokenHash: hashToken(nonce),
    userId,
    scope: "HANDOFF",
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
  });
  return nonce;
}

async function lookupHandoffNonce(
  nonce: string | null | undefined,
  opts: { consume: boolean }
): Promise<number | null> {
  if (!nonce) return null;
  const [row] = await db
    .select()
    .from(authNonces)
    .where(and(eq(authNonces.tokenHash, hashToken(nonce)), eq(authNonces.scope, "HANDOFF")))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (opts.consume) {
    await db.update(authNonces).set({ usedAt: new Date() }).where(eq(authNonces.id, row.id));
  }
  return row.userId;
}

/** Jetonu tüketerek kullanıcı kimliğini döner (claim ucu). */
export async function consumeHandoffNonce(nonce: string | null): Promise<number | null> {
  return lookupHandoffNonce(nonce, { consume: true });
}

/**
 * Jetonu TÜKETMEDEN doğrular — korumalı sayfaların ?kt= yedek girişi içindir.
 * (Sayfa yenilemesinde jetonun tekrar çalışması için kullanım sayacı tüketilmez;
 * 120 saniyelik ömür ve 192 bit rastgelelik ile sınırlıdır.)
 */
export async function peekHandoffNonce(nonce: string | null | undefined): Promise<number | null> {
  return lookupHandoffNonce(nonce, { consume: false });
}

/** id aramasıyla kullanıcıyı döner (çerez/token gerektirmez). */
async function getStaffUserById(userId: number): Promise<SessionUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.isActive === false) return null;
  if (!isStaffRole(user.role)) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS_TR[user.role] || user.role,
    isStaff: true,
  };
}

/**
 * ?kt=<handoff jetonu> ile korumalı sayfa girişi: çerez çalışmayan (üçüncü-taraf
 * çerezleri engellenmiş) tarayıcılarda sunucu sayfasının oturumu görmesi için.
 * Jeton 120 saniye geçerli, kısa ömürlüdür; ham oturum token'ı DEĞİLDİR.
 */
export async function getStaffUserFromKt(kt: string | string[] | undefined): Promise<SessionUser | null> {
  const nonce = Array.isArray(kt) ? kt[0] : kt;
  const userId = await peekHandoffNonce(nonce);
  return userId ? getStaffUserById(userId) : null;
}
