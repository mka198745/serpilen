import "dotenv/config";
import { db } from "../src/db/index";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/password";

/**
 * Kullanım: npm run db:set-password -- <e-posta> <yeni-şifre>
 * Örn:     npm run db:set-password -- admin@ipektuhafiye.com Admin123!
 */
async function main() {
  const [emailRaw, password] = process.argv.slice(2);
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!email || !email.includes("@") || !password || password.length < 6) {
    console.error("Kullanım: npm run db:set-password -- <e-posta> <yeni-şifre(min. 6 karakter)>");
    process.exit(1);
  }
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) {
    console.error("Kullanıcı bulunamadı:", email);
    process.exit(1);
  }
  await db
    .update(users)
    .set({ passwordHash: hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, u.id));
  console.log(`Şifre güncellendi: ${u.email} (${u.role})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
