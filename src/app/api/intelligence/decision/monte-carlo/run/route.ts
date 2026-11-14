import { requireStaff } from "@/lib/auth";
import { runMonteCarlo, type McVariable } from "@/lib/intelligence/decision/monte-carlo/engine";
import { persistMonteCarloRun } from "@/lib/intelligence/decision/monte-carlo/store";
import { db } from "@/db";
import { intelligenceSettings } from "@/db/schema";
import { mergeFaz3Settings, parseNumSetting } from "@/lib/intelligence/decision/core/settings";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Monte Carlo çalıştır (seed'li; histogram veritabanına yazılmaz — yalnız özet)
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Monte Carlo yalnız Süper Admin veya Mağaza Müdürü tarafından çalıştırılabilir.");
  }
  try {
    const body = await request.json().catch(() => null);
    if (!body) return fail(400, "VALIDATION", "JSON gövde gerekli.");
    const rows = await db.select({ key: intelligenceSettings.key, value: intelligenceSettings.value }).from(intelligenceSettings);
    const settings = mergeFaz3Settings(rows);
    const maxIter = parseNumSetting(settings, "faz3.montecarlo.max_iterations");
    const minIter = parseNumSetting(settings, "faz3.montecarlo.min_iterations");
    const clip = parseNumSetting(settings, "faz3.montecarlo.outlier_clip_pct") / 100;

    const variables = body.variables as McVariable[] | undefined;
    if (!Array.isArray(variables) || variables.length === 0) return fail(400, "VALIDATION", "variables dizisi gerekli.");
    // Değişken adı/tür kontrolü — motor zaten doğruluyor; burada yalnız tip yüzeyi
    for (const v of variables) {
      if (!v.name || typeof v.name !== "string") return fail(400, "VALIDATION", "Her değişkende geçerli name gerekli.");
      if (!v.distribution || typeof v.distribution.type !== "string") return fail(400, "VALIDATION", `"${v.name}": distribution.type gerekli (normal|lognormal|uniform|triangular|poisson|empirical).`);
    }
    const outputFormula = String(body.outputFormula ?? "").trim();
    if (!outputFormula) return fail(400, "VALIDATION", "outputFormula gerekli (örn. \"(price - cost) * units\").");
    const iterations = Math.floor(Number(body.iterations ?? 1000));
    if (!Number.isFinite(iterations)) return fail(400, "VALIDATION", "iterations sayı olmalı.");
    const seedRaw = body.seed == null ? Math.floor(Math.random() * 2 ** 31) : Number(body.seed);
    if (!Number.isFinite(seedRaw)) return fail(400, "VALIDATION", "seed sayı olmalı.");
    const seed = Math.abs(Math.floor(seedRaw));

    const result = runMonteCarlo({
      name: String(body.name ?? "Monte Carlo koşusu").slice(0, 255),
      kind: String(body.kind ?? "CONTRIBUTION").toUpperCase(),
      variables,
      outputFormula,
      iterations,
      seed,
      correlation: Array.isArray(body.correlation) ? body.correlation : null,
      target: body.target && Number.isFinite(Number(body.target.value))
        ? { value: Number(body.target.value), direction: body.target.direction === "BELOW" ? "BELOW" : "ABOVE" }
        : null,
      clipFraction: clip,
      lossThreshold: body.lossThreshold != null && Number.isFinite(Number(body.lossThreshold)) ? Number(body.lossThreshold) : 0,
    }, { minIterations: minIter, maxIterations: maxIter });

    const id = await persistMonteCarloRun({
      request: {
        name: String(body.name ?? "Monte Carlo koşusu").slice(0, 255),
        kind: String(body.kind ?? "CONTRIBUTION").toUpperCase(),
        variables,
        outputFormula,
        iterations,
        seed,
        correlation: Array.isArray(body.correlation) ? body.correlation : null,
        target: body.target ?? null,
        clipFraction: clip,
      },
      result,
      actor: gate.user.name,
    });
    return ok({ id, seed, iterations, result });
  } catch (err) {
    console.error("[intelligence/decision/monte-carlo/run]", err);
    const message = err instanceof Error ? err.message : "Monte Carlo çalıştırılamadı.";
    return fail(400, "MC_RUN_FAILED", message);
  }
}
