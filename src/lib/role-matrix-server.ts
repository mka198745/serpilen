import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { normalizeRoleMatrix, type MatrixRole, type RoleMatrix } from "@/lib/admin-modules";

const KEY = "admin.role_matrix";

/** Yönetim arayüzü ve sunucu aynı kayıtlı/varsayılan rol matrisini kullanır. */
export async function readRoleMatrix(): Promise<RoleMatrix> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, KEY))
    .limit(1);
  let parsed: unknown = null;
  if (row?.value) {
    try {
      parsed = JSON.parse(row.value);
    } catch {
      parsed = null;
    }
  }
  return normalizeRoleMatrix(parsed);
}

/** Tanınmayan roller veya modüller için erişim verilmez. */
export function roleCanAccessModule(matrix: RoleMatrix, role: string, module: string): boolean {
  const row = matrix[role.toUpperCase() as MatrixRole];
  return row?.[module] === true;
}
