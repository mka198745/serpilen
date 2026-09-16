import { NextResponse } from "next/server";
import { db } from "@/db";
import { productReviews, orders, orderItems, auditLogs } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/reviews?productId=5 — onaylı yorumlar (mağaza) veya tümü (admin ?all=1) */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const all = searchParams.get("all") === "1";

  let rows = await db.select().from(productReviews).orderBy(desc(productReviews.id));
  if (productId) rows = rows.filter((r) => r.productId === Number(productId));
  if (!all) rows = rows.filter((r) => r.status === "APPROVED");

  const stats = productId
    ? (() => {
        const list = rows;
        const cnt = list.length;
        const avg = cnt ? list.reduce((s, r) => s + r.rating, 0) / cnt : 0;
        const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: list.filter((r) => r.rating === star).length }));
        return { count: cnt, avg: Number(avg.toFixed(1)), distribution: dist };
      })()
    : null;

  return NextResponse.json({
    success: true,
    stats,
    data: rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })),
  });
}

/** POST — yeni yorum (müşteri) veya moderasyon kararı (admin) */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action = "CREATE" } = body;

    if (action === "MODERATE") {
      await db.update(productReviews).set({ status: body.status === "REJECT" ? "REJECTED" : "APPROVED" }).where(eq(productReviews.id, Number(body.id)));
      const [u] = await db.select().from(productReviews).where(eq(productReviews.id, Number(body.id)));
      await db.insert(auditLogs).values({ userName: "Yönetici", action: "REVIEW_MODERATED", entity: "ProductReview", entityId: String(body.id), details: `Yorum ${u?.status}` });
      return NextResponse.json({ success: true, data: u });
    }

    // CREATE — sipariş geçmişi varsa "Doğrulanmış Alıcı" rozeti
    const { productId, customerName, customerEmail, rating, title, comment } = body;
    if (!productId || !customerName || !comment || !rating) {
      return NextResponse.json({ success: false, error: "Ürün, isim, puan ve yorum zorunludur." }, { status: 422 });
    }

    let verified = false;
    if (customerEmail) {
      const myOrders = await db.select().from(orders);
      const myItems = await db.select().from(orderItems);
      verified = myOrders.some(
        (o) => (o.customerEmail || "").toLowerCase() === String(customerEmail).toLowerCase() &&
          myItems.some((it) => it.orderId === o.id && it.productId === Number(productId))
      );
    }

    const [{ id: __created_id }] = await db.insert(productReviews).values({
        productId: Number(productId),
        customerName: String(customerName).trim().slice(0, 80),
        customerEmail: customerEmail || null,
        rating: Math.max(1, Math.min(5, Number(rating))),
        title: title ? String(title).slice(0, 120) : null,
        comment: String(comment).slice(0, 1500),
        verifiedPurchase: verified,
        status: "PENDING",
      }).$returningId();
    const [created] = await db.select().from(productReviews).where(eq(productReviews.id, __created_id));

    return NextResponse.json({ success: true, message: "Yorumunuz alındı. Moderasyon onayıyla yayınlanacak.", data: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
