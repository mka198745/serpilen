import { NextResponse } from "next/server";
import { db } from "@/db";
import { productQuestions, auditLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const all = searchParams.get("all") === "1";

  let rows = await db.select().from(productQuestions).orderBy(desc(productQuestions.id));
  if (productId) rows = rows.filter((q) => q.productId === Number(productId));
  if (!all) rows = rows.filter((q) => q.status !== "HIDDEN");

  return NextResponse.json({
    success: true,
    data: rows.map((q) => ({ ...q, createdAt: new Date(q.createdAt).toISOString() })),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action = "ASK" } = body;

    if (action === "ANSWER") {
      await db.update(productQuestions).set({
          answer: String(body.answer || "").slice(0, 1200),
          answeredBy: body.answeredBy || "İpek Tuhafiye Uzman Ekibi",
          status: "ANSWERED",
        }).where(eq(productQuestions.id, Number(body.id)));
      const [u] = await db.select().from(productQuestions).where(eq(productQuestions.id, Number(body.id)));
      return NextResponse.json({ success: true, data: u });
    }

    if (action === "HIDE") {
      await db.update(productQuestions).set({ status: "HIDDEN" }).where(eq(productQuestions.id, Number(body.id)));
      const [u] = await db.select().from(productQuestions).where(eq(productQuestions.id, Number(body.id)));
      await db.insert(auditLogs).values({ userName: "Yönetici", action: "QUESTION_HIDDEN", entity: "ProductQuestion", entityId: String(body.id), details: "Soru gizlendi" });
      return NextResponse.json({ success: true, data: u });
    }

    // ASK
    if (!body.productId || !body.askerName || !body.question) {
      return NextResponse.json({ success: false, error: "Ürün, isim ve soru zorunludur." }, { status: 422 });
    }
    const [{ id: __created_id }] = await db.insert(productQuestions).values({
        productId: Number(body.productId),
        askerName: String(body.askerName).slice(0, 80),
        question: String(body.question).slice(0, 800),
      }).$returningId();
    const [created] = await db.select().from(productQuestions).where(eq(productQuestions.id, __created_id));
    return NextResponse.json({ success: true, message: "Sorunuz iletildi. Uzman ekibimiz en kısa sürede yanıtlayacak.", data: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
