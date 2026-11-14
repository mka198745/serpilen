import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { normalizeRoleMatrix, MATRIX_ROLES, ADMIN_MODULES } from "@/lib/admin-modules";

export const dynamic = "force-dynamic";

const KEY = "admin.role_matrix";

async function readMatrix() {
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

/** GET /api/role-matrix — her personel okuyabilir (menüyü çizmek için). */
export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const matrix = await readMatrix();
  return NextResponse.json({ success: true, data: { matrix } });
}

/** POST /api/role-matrix — yalnız Süper Admin kaydedebilir. Body: { matrix } (tam nesne). */
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  if (gate.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Rol matrisini yalnız Süper Admin değiştirebilir." } },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { matrix?: unknown };
  if (!body || typeof body !== "object" || body.matrix == null) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "matrix alanı zorunludur." } },
      { status: 422 }
    );
  }

  // Tanınan roller/modüller dışındaki girdiler yutulur; eksikler varsayılanla dolar; kilitler uygulanır
  const matrix = normalizeRoleMatrix(body.matrix);

  const value = JSON.stringify(matrix);
  const [exists] = await db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(eq(appSettings.key, KEY))
    .limit(1);
  if (exists) {
    await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, KEY));
  } else {
    await db.insert(appSettings).values({ key: KEY, value, description: "Admin sekme görünürlük matrisi (rol × modül)" });
  }

  return NextResponse.json({ success: true, data: { matrix } });
}
