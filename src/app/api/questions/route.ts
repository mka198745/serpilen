import { NextResponse } from "next/server";
import { db } from "@/db";
import { productQuestions, products, auditLogs } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireProductFeedbackAccess } from "@/lib/product-feedback-auth";

export const dynamic = "force-dynamic";
const validId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0;

/** Mağaza yalnız onaylanmış veya yanıtlanmış soruları gösterir. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const all = searchParams.get("all") === "1";
  if (productId !== null && !validId(productId)) return NextResponse.json({ success: false, error: "Geçersiz ürün." }, { status: 422 });
  if (all) {
    const gate = await requireProductFeedbackAccess(request);
    if (!gate.ok) return gate.response;
  }
  const rows = await db.select().from(productQuestions).where(and(
    productId ? eq(productQuestions.productId, Number(productId)) : undefined,
    all ? undefined : inArray(productQuestions.status, ["APPROVED", "ANSWERED"]),
  )).orderBy(desc(productQuestions.id));
  const productRows = all ? await db.select({ id: products.id, name: products.name, slug: products.slug }).from(products) : [];
  const productMap = new Map(productRows.map((p) => [p.id, p]));
  return NextResponse.json({ success: true, data: rows.map((q) => ({
    ...q, createdAt: new Date(q.createdAt).toISOString(), ...(all ? { product: productMap.get(q.productId) ?? null } : {}),
  })) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action ?? "ASK";
    if (["APPROVE", "ANSWER", "HIDE"].includes(action)) {
      const gate = await requireProductFeedbackAccess(request);
      if (!gate.ok) return gate.response;
      if (!validId(body.id)) return NextResponse.json({ success: false, error: "Geçersiz soru." }, { status: 422 });
      const answer = String(body?.answer ?? "").trim().slice(0, 1200);
      if (action === "ANSWER" && !answer) return NextResponse.json({ success: false, error: "Yanıt boş olamaz." }, { status: 422 });
      const updated = db.transaction((tx) => {
        const existing = tx.select().from(productQuestions).where(eq(productQuestions.id, Number(body.id))).get();
        if (!existing) return undefined;
        const updates = action === "HIDE" ? { status: "HIDDEN" }
          : action === "ANSWER" ? { answer, answeredBy: "Serpilen Collection Uzman Ekibi", status: "ANSWERED" }
          : { status: existing.answer ? "ANSWERED" : "APPROVED" };
        const row = tx.update(productQuestions).set(updates).where(eq(productQuestions.id, existing.id)).returning().get();
        tx.insert(auditLogs).values({ userId: String(gate.user.id), userName: gate.user.name, action: `QUESTION_${action}`, entity: "ProductQuestion", entityId: String(row.id), details: `Soru durumu: ${row.status}` }).run();
        return row;
      });
      if (!updated) return NextResponse.json({ success: false, error: "Soru bulunamadı." }, { status: 404 });
      return NextResponse.json({ success: true, data: updated });
    }
    if (action !== "ASK") return NextResponse.json({ success: false, error: "Geçersiz işlem." }, { status: 422 });
    const askerName = String(body?.askerName ?? "").trim().slice(0, 80);
    const question = String(body?.question ?? "").trim().slice(0, 800);
    if (!validId(body?.productId) || !askerName || !question) {
      return NextResponse.json({ success: false, error: "Ürün, isim ve soru zorunludur." }, { status: 422 });
    }
    const [product] = await db.select({ id: products.id, isActive: products.isActive }).from(products).where(eq(products.id, Number(body.productId)));
    if (!product || !product.isActive) return NextResponse.json({ success: false, error: "Ürün bulunamadı." }, { status: 404 });
    const [created] = await db.insert(productQuestions).values({ productId: product.id, askerName, question, status: "OPEN" }).returning({ id: productQuestions.id });
    return NextResponse.json({ success: true, message: "Sorunuz alındı. Onaylandıktan sonra yayınlanacak.", data: created });
  } catch (error: unknown) {
    console.error("Question operation failed:", error);
    return NextResponse.json({ success: false, error: "Soru işlemi tamamlanamadı." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireProductFeedbackAccess(request);
  if (!gate.ok) return gate.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return NextResponse.json({ success: false, error: "Geçersiz soru." }, { status: 422 });
  const deleted = db.transaction((tx) => {
    const row = tx.delete(productQuestions).where(eq(productQuestions.id, Number(id))).returning({ id: productQuestions.id }).get();
    if (row) tx.insert(auditLogs).values({ userId: String(gate.user.id), userName: gate.user.name, action: "QUESTION_DELETED", entity: "ProductQuestion", entityId: String(row.id), details: "Soru silindi" }).run();
    return row;
  });
  if (!deleted) return NextResponse.json({ success: false, error: "Soru bulunamadı." }, { status: 404 });
  return NextResponse.json({ success: true });
}
