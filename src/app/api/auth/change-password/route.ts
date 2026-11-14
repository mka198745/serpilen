import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUserFromRequest } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

const MIN_LEN = 8;

function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_LEN) return `Şifre en az ${MIN_LEN} karakter olmalıdır.`;
  if (pw.length > 128) return "Şifre en fazla 128 karakter olabilir.";
  if (!/[A-Za-z]/.test(pw)) return "Şifre en az bir harf içermelidir.";
  if (!/[0-9]/.test(pw)) return "Şifre en az bir rakam içermelidir.";
  return null;
}

/** POST /api/auth/change-password — kullanıcı kendi şifresini değiştirir. */
export async function POST(request: Request) {
  const session = await getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Oturum gerekli." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
  };
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");

  if (!currentPassword) {
    return NextResponse.json({ success: false, error: "Mevcut şifrenizi girin." }, { status: 400 });
  }
  const problem = passwordProblem(newPassword);
  if (problem) {
    return NextResponse.json({ success: false, error: problem }, { status: 400 });
  }

  const [row] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ success: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }
  if (!verifyPassword(currentPassword, row.passwordHash)) {
    return NextResponse.json({ success: false, error: "Mevcut şifreniz hatalı." }, { status: 403 });
  }
  if (verifyPassword(newPassword, row.passwordHash)) {
    return NextResponse.json({ success: false, error: "Yeni şifre mevcut şifreyle aynı olamaz." }, { status: 400 });
  }

  await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword), passwordChangedAt: new Date() })
    .where(eq(users.id, row.id));

  return NextResponse.json({ success: true, message: "Şifreniz başarıyla güncellendi." });
}
