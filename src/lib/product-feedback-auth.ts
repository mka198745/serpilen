import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";

/** Yorum/soru moderasyonu yalnızca rol matrisinde yetkilendirilmiş personel içindir. */
export async function requireProductFeedbackAccess(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate;
  const matrix = await readRoleMatrix();
  if (!roleCanAccessModule(matrix, gate.user.role, "productFeedback")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Ürün yorumları ve soruları için yetkiniz bulunmuyor." },
        { status: 403 },
      ),
    };
  }
  return gate;
}
