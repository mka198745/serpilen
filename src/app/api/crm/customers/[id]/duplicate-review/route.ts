import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { validateCrmWriteAccess, canStillWriteCrm } from "@/lib/crm-write-access";
import { requireCrmAccess } from "@/lib/crm-access";
import { readCrmJson } from "@/lib/crm-write";
import { customerEditVersion } from "@/lib/crm-customer";
import { readDuplicateReview, reviewCustomerSql, reviewPair, type ReviewCustomer, type ReviewStatus } from "@/lib/crm-duplicate-review";

export const dynamic = "force-dynamic";
const validId = (value: string) => /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value));
const validVersion = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Save only a human assessment; customer records and relations remain unchanged. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAccess(request, "write");
  if (!gate.ok) return gate.response;
  const invalid = await validateCrmWriteAccess(request, gate.user);
  if (invalid) return invalid;
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ success: false, error: "Geçersiz müşteri numarası." }, { status: 422 });
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown> | null;
  const allowed = ["targetId", "status", "sourceVersion", "targetVersion", "expectedRevision"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || !Number.isSafeInteger(body.targetId) || !validId(String(body.targetId)) || Number(body.targetId) === Number(id) || !["DISTINCT", "UNSURE"].includes(String(body.status)) || !validVersion(body.sourceVersion) || !validVersion(body.targetVersion) || !(body.expectedRevision === null || (Number.isSafeInteger(body.expectedRevision) && Number(body.expectedRevision) > 0))) {
    return NextResponse.json({ success: false, error: "Geçersiz değerlendirme bilgisi." }, { status: 422 });
  }
  const targetId = Number(body.targetId), status = body.status as ReviewStatus;
  try {
    const save = sqlite.transaction(() => {
      if (!canStillWriteCrm(gate.user)) return { status: 403, error: "CRM değiştirme yetkiniz bulunmuyor." } as const;
      const query = sqlite.prepare(reviewCustomerSql);
      const source = query.get(Number(id)) as ReviewCustomer | undefined;
      const target = query.get(targetId) as ReviewCustomer | undefined;
      if (!source || !target) return { status: 404, error: "Müşteri kartlarından biri bulunamadı." } as const;
      if (customerEditVersion(source) !== body.sourceVersion || customerEditVersion(target) !== body.targetVersion) return { status: 409, error: "Müşteri kartı değişti. Yeniden karşılaştırıp değerlendirin." } as const;
      const current = readDuplicateReview(source, target);
      if ((current?.revision ?? null) !== body.expectedRevision) return { status: 409, error: "Değerlendirme başka bir işlemle değişti. Yeniden karşılaştırın." } as const;
      const [low, high] = reviewPair(source.id, target.id);
      const lowVersion = customerEditVersion(source.id === low ? source : target), highVersion = customerEditVersion(source.id === high ? source : target);
      sqlite.prepare(`INSERT INTO crm_duplicate_reviews (customer_low_id,customer_high_id,status,low_version,high_version,revision,reviewed_by_id,reviewed_by_name,reviewed_at)
        VALUES (?,?,?,?,?,1,?,?,unixepoch())
        ON CONFLICT(customer_low_id,customer_high_id) DO UPDATE SET status=excluded.status,low_version=excluded.low_version,high_version=excluded.high_version,revision=crm_duplicate_reviews.revision+1,reviewed_by_id=excluded.reviewed_by_id,reviewed_by_name=excluded.reviewed_by_name,reviewed_at=excluded.reviewed_at`).run(low,high,status,lowVersion,highVersion,gate.user.id,gate.user.name);
      sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,'CRM_DUPLICATE_REVIEWED','Customer',?,?)").run(String(gate.user.id),gate.user.name,id,`Hedef müşteri #${targetId}; değerlendirme: ${status}`);
      return { status: 200, review: readDuplicateReview(source,target) } as const;
    });
    const result = save.immediate();
    if (result.status !== 200) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, review: result.review }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CRM duplicate review failed", error);
    return NextResponse.json({ success: false, error: "Değerlendirme kaydedilemedi." }, { status: 500 });
  }
}
