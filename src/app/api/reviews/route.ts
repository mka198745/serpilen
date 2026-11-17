import { NextResponse } from "next/server";
import { db } from "@/db";
import { productReviews, products, orders, orderItems, auditLogs } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireProductFeedbackAccess } from "@/lib/product-feedback-auth";

export const dynamic = "force-dynamic";
const validId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0;

/** Mağaza yalnız onaylı yorumları; yetkili moderatör ?all=1 ile tümünü görür. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const all = searchParams.get("all") === "1";
  if (productId !== null && !validId(productId)) {
    return NextResponse.json({ success: false, error: "Geçersiz ürün." }, { status: 422 });
  }
  if (all) {
    const gate = await requireProductFeedbackAccess(request);
    if (!gate.ok) return gate.response;
  }

  const rows = await db.select().from(productReviews).where(and(
    productId ? eq(productReviews.productId, Number(productId)) : undefined,
    all ? undefined : eq(productReviews.status, "APPROVED"),
  )).orderBy(desc(productReviews.id));
  const productRows = all ? await db.select({ id: products.id, name: products.name, slug: products.slug }).from(products) : [];
  const productMap = new Map(productRows.map((p) => [p.id, p]));
  const stats = productId ? {
    count: rows.length,
    avg: rows.length ? Number((rows.reduce((sum, r) => sum + r.rating, 0) / rows.length).toFixed(1)) : 0,
    distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: rows.filter((r) => r.rating === star).length })),
  } : null;

  return NextResponse.json({
    success: true,
    stats,
    data: rows.map(({ customerEmail, ...r }) => ({
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
      ...(all ? { customerEmail, product: productMap.get(r.productId) ?? null } : {}),
    })),
  });
}

/** Herkese açık yorum gönderimi; moderasyon yalnız yetkili personel içindir. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action ?? "CREATE";
    if (action === "MODERATE") {
      const gate = await requireProductFeedbackAccess(request);
      if (!gate.ok) return gate.response;
      if (!validId(body.id) || !["APPROVE", "REJECT"].includes(body.status)) {
        return NextResponse.json({ success: false, error: "Geçersiz yorum veya moderasyon işlemi." }, { status: 422 });
      }
      const status = body.status === "APPROVE" ? "APPROVED" : "REJECTED";
      const updated = db.transaction((tx) => {
        const row = tx.update(productReviews).set({ status }).where(eq(productReviews.id, Number(body.id))).returning().get();
        if (row) tx.insert(auditLogs).values({ userId: String(gate.user.id), userName: gate.user.name, action: "REVIEW_MODERATED", entity: "ProductReview", entityId: String(row.id), details: `Yorum durumu: ${status}` }).run();
        return row;
      });
      if (!updated) return NextResponse.json({ success: false, error: "Yorum bulunamadı." }, { status: 404 });
      return NextResponse.json({ success: true, data: updated });
    }
    if (action !== "CREATE") return NextResponse.json({ success: false, error: "Geçersiz işlem." }, { status: 422 });

    const name = String(body?.customerName ?? "").trim().slice(0, 80);
    const comment = String(body?.comment ?? "").trim().slice(0, 1500);
    const rating = Number(body?.rating);
    if (!validId(body?.productId) || !name || !comment || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ success: false, error: "Ürün, isim, 1–5 arası puan ve yorum zorunludur." }, { status: 422 });
    }
    const [product] = await db.select({ id: products.id, isActive: products.isActive }).from(products).where(eq(products.id, Number(body.productId)));
    if (!product || !product.isActive) return NextResponse.json({ success: false, error: "Ürün bulunamadı." }, { status: 404 });

    const email = String(body?.customerEmail ?? "").trim().slice(0, 254).toLowerCase();
    let verified = false;
    if (email) {
      const myOrders = await db.select().from(orders);
      const myItems = await db.select().from(orderItems);
      verified = myOrders.some((o) => (o.customerEmail || "").toLowerCase() === email &&
        myItems.some((it) => it.orderId === o.id && it.productId === product.id));
    }
    const [created] = await db.insert(productReviews).values({
      productId: product.id, customerName: name, customerEmail: email || null, rating,
      title: body?.title ? String(body.title).trim().slice(0, 120) || null : null,
      comment, verifiedPurchase: verified, status: "PENDING",
    }).returning({ id: productReviews.id });
    return NextResponse.json({ success: true, message: "Yorumunuz alındı. Moderasyon onayıyla yayınlanacak.", data: created });
  } catch (error: unknown) {
    console.error("Review operation failed:", error);
    return NextResponse.json({ success: false, error: "Yorum işlemi tamamlanamadı." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireProductFeedbackAccess(request);
  if (!gate.ok) return gate.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return NextResponse.json({ success: false, error: "Geçersiz yorum." }, { status: 422 });
  const deleted = db.transaction((tx) => {
    const row = tx.delete(productReviews).where(eq(productReviews.id, Number(id))).returning({ id: productReviews.id }).get();
    if (row) tx.insert(auditLogs).values({ userId: String(gate.user.id), userName: gate.user.name, action: "REVIEW_DELETED", entity: "ProductReview", entityId: String(row.id), details: "Yorum silindi" }).run();
    return row;
  });
  if (!deleted) return NextResponse.json({ success: false, error: "Yorum bulunamadı." }, { status: 404 });
  return NextResponse.json({ success: true });
}
