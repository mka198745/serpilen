export const REVIEW_EMAIL_ERROR = "Doğru e-posta adresi giriniz.";

/** E-posta biçimini kontrol eder; posta kutusunun gerçekten var olduğunu doğrulamaz. */
export function isValidReviewEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (!email || email.length > 254) return false;
  const pieces = email.split("@");
  if (pieces.length !== 2) return false;
  const [local, domain] = pieces;
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) return false;
  return /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/i.test(labels[labels.length - 1]);
}
