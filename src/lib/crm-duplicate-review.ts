import { sqlite } from "@/db";
import { customerEditVersion, type EditableCustomer } from "@/lib/crm-customer";

export type ReviewCustomer = EditableCustomer & { id: number };
export type ReviewStatus = "DISTINCT" | "UNSURE";
type ReviewRow = { status: ReviewStatus; lowVersion: string; highVersion: string; revision: number; reviewedByName: string; reviewedAt: number };
export const reviewCustomerSql = "SELECT id,name,email,phone,city,address,company_name AS companyName FROM customers WHERE id=?";
export const reviewPair = (a: number, b: number) => a < b ? [a, b] as const : [b, a] as const;

/** Current fields only: related accounts/orders and external changes are not evaluated. */
export function readDuplicateReview(source: ReviewCustomer, target: ReviewCustomer) {
  const [low, high] = reviewPair(source.id, target.id);
  const row = sqlite.prepare(`SELECT status,low_version AS lowVersion,high_version AS highVersion,revision,reviewed_by_name AS reviewedByName,reviewed_at AS reviewedAt FROM crm_duplicate_reviews WHERE customer_low_id=? AND customer_high_id=?`).get(low, high) as ReviewRow | undefined;
  if (!row) return null;
  const lowCustomer = source.id === low ? source : target, highCustomer = source.id === high ? source : target;
  return { status: row.status, revision: row.revision, reviewedByName: row.reviewedByName, reviewedAt: row.reviewedAt, stale: row.lowVersion !== customerEditVersion(lowCustomer) || row.highVersion !== customerEditVersion(highCustomer) };
}
