/** Monte Carlo çalıştırma kaydı — büyük ham örnekler saklanmaz; yalnız parametreler + özet. */
import { db } from "@/db";
import { monteCarloRuns, auditLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { McRequest, McResults } from "./engine";
import { MONTE_CARLO_ALGORITHM_VERSION } from "../core/confidence";

export async function persistMonteCarloRun(opts: { request: McRequest; result: McResults; actor: string }): Promise<number> {
  const r = opts.result;
  const [row] = await db.insert(monteCarloRuns).values({
    name: opts.request.name,
    scenarioId: null,
    kind: opts.request.kind,
    parameters: JSON.stringify({
      variables: opts.request.variables.map((v) => ({
        name: v.name,
        distribution: { type: v.distribution.type, params: v.distribution.params, sampleCount: v.distribution.samples?.length ?? null },
        observationCount: v.observationCount ?? null,
        rationale: v.rationale ?? null,
        nonNegative: v.nonNegative ?? false,
      })),
      outputFormula: opts.request.outputFormula,
      target: opts.request.target ?? null,
      correlationProvided: Array.isArray(opts.request.correlation) && opts.request.correlation.length > 0,
      algorithmVersion: MONTE_CARLO_ALGORITHM_VERSION,
    }),
    seed: opts.request.seed,
    iterations: opts.request.iterations,
    results: JSON.stringify({
      mean: round4(r.mean), median: round4(r.median), stddev: round4(r.stddev),
      min: round4(r.min), max: round4(r.max),
      p5: round4(r.p5), p10: round4(r.p10), p25: round4(r.p25), p50: round4(r.p50), p75: round4(r.p75), p90: round4(r.p90), p95: round4(r.p95),
      probLoss: r.probLoss, probTarget: r.probTarget,
    }),
    sensitivity: JSON.stringify(r.sensitivity.map((s) => ({ variable: s.variable, pearson: round4(s.pearson) }))),
    reliability: JSON.stringify(r.reliability),
    createdBy: opts.actor,
  }).returning({ id: monteCarloRuns.id });
  await db.insert(auditLogs).values({
    userId: opts.actor, userName: opts.actor, action: "MONTE_CARLO_RUN",
    entity: "MonteCarloRun", entityId: String(row.id),
    details: `${opts.request.kind} — ${opts.request.iterations} iter, seed ${opts.request.seed}`,
  });
  return row.id;
}

export async function listMonteCarloRuns(limit = 30) {
  const rows = await db.select().from(monteCarloRuns).orderBy(desc(monteCarloRuns.createdAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    seed: r.seed,
    iterations: r.iterations,
    parameters: safeJson(r.parameters, {}),
    results: safeJson(r.results, {}),
    sensitivity: r.sensitivity ? safeJson(r.sensitivity, null) : null,
    reliability: r.reliability ? safeJson(r.reliability, null) : null,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }));
}

export async function getMonteCarloRun(id: number) {
  const [r] = await db.select().from(monteCarloRuns).where(eq(monteCarloRuns.id, id)).limit(1);
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    seed: r.seed,
    iterations: r.iterations,
    parameters: safeJson(r.parameters, {}),
    results: safeJson(r.results, {}),
    sensitivity: r.sensitivity ? safeJson(r.sensitivity, null) : null,
    reliability: r.reliability ? safeJson(r.reliability, null) : null,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}

const round4 = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(4)) : n);
function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
