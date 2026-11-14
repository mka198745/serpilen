import { requireStaff } from "@/lib/auth";
import { ok, fail } from "@/lib/intelligence/http";
import { db } from "@/db";
import { decisionConflicts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") ?? "OPEN").toUpperCase();
    const rows = await db.select().from(decisionConflicts)
      .where(status === "ALL" ? undefined : eq(decisionConflicts.status, status))
      .orderBy(desc(decisionConflicts.createdAt))
      .limit(100);
    return ok({
      items: rows.map((r) => ({
        ...r,
        items: safeJson(r.items, []),
        resolutionOptions: safeJson(r.resolutionOptions, []),
        financialImpactDifference: r.financialImpactDifference != null ? Number(r.financialImpactDifference) : null,
      })),
    });
  } catch (err) {
    console.error("[intelligence/decision/conflicts]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Çelişki listesi alınamadı.");
  }
}

// Çelişki çözüm durumu (OPEN → RESOLVED/DISMISSED)
export async function PATCH(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Çelişki çözümü yalnız Süper Admin veya Mağaza Müdürü tarafından yapılabilir.");
  }
  try {
    const body = await request.json().catch(() => null);
    const id = Number(body?.id);
    const status = String(body?.status ?? "").toUpperCase();
    if (!Number.isFinite(id) || id < 1) return fail(400, "VALIDATION", "id gerekli.");
    if (!["RESOLVED", "DISMISSED"].includes(status)) return fail(400, "VALIDATION", "status RESOLVED|DISMISSED olmalı.");
    await db.update(decisionConflicts).set({ status }).where(eq(decisionConflicts.id, id));
    return ok({ id, status });
  } catch (err) {
    console.error("[intelligence/decision/conflicts PATCH]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Çelişki güncellenemedi.");
  }
}
const safeJson = <T,>(raw: string | null | undefined, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
