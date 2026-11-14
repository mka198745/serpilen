import crypto from "node:crypto";

/** scrypt tabanlı şifre özeti. Format: `scrypt$saltHex$hashHex` */
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  try {
    if (!password || !stored) return false;
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(expectedHex, "hex");
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
