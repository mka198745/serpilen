import { sqlite } from "@/db";

// These expressions match the non-unique expression indexes in migration 0017.
// SQLite's lower() is ASCII-only; valid new CRM email addresses are ASCII.
export const crmPhoneSql = "replace(replace(replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','')";
export const crmPhoneKey = (value: string) => value.replace(/[ ().+\-]/g, "");
export const crmEmailKey = (value: string | null) => (value ?? "").replace(/^ +| +$/g, "").replace(/[A-Z]/g, char => char.toLowerCase());

/** Call inside the same write transaction as the insert/update. No candidate data is returned. */
export function hasCrmContactDuplicate(email: string | null, phone: string | null, excludeId: number): boolean {
  if (email && sqlite.prepare("SELECT 1 FROM customers WHERE lower(trim(email))=? AND id<>? LIMIT 1").get(email, excludeId)) return true;
  if (phone && sqlite.prepare(`SELECT 1 FROM customers WHERE ${crmPhoneSql}=? AND id<>? LIMIT 1`).get(phone, excludeId)) return true;
  return false;
}
