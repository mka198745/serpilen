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

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    // HTTPS üretimde COOKIE_SECURE=1 ile açılmalı; yerel HTTP testinde kapalı kalır.
    secure: process.env.COOKIE_SECURE === "1",
  };
}
