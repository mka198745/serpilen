import { NextResponse } from "next/server";
import { db } from "@/db";
import { coupons } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  try {
    const all = await db.select().from(coupons);
    return NextResponse.json({ success: true, data: all });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { action = "CREATE" } = body;

    if (action === "TOGGLE") {
      await db.update(coupons).set({ isActive: Boolean(body.isActive) }).where(eq(coupons.id, Number(body.id)));
      const [u] = await db.select().from(coupons).where(eq(coupons.id, Number(body.id)));
      return NextResponse.json({ success: true, data: u });
    }

    if (action === "INCREMENT_USE") {
      await db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.code, String(body.code || "").toUpperCase().trim()));
      return NextResponse.json({ success: true });
    }

    // CREATE
    if (!body.code?.trim()) return NextResponse.json({ success: false, error: "Kupon kodu zorunludur." }, { status: 422 });
    const code = String(body.code).toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "");
    const exists = (await db.select().from(coupons)).find((c) => c.code === code);
    if (exists) return NextResponse.json({ success: false, error: "Bu kod zaten mevcut." }, { status: 409 });

    const [{ id: __created_id }] = await db.insert(coupons).values({
        code,
        discountType: body.discountType === "FIXED" ? "FIXED" : "PERCENT",
        discountValue: String(body.discountValue || "10.00"),
        minCartAmount: String(body.minCartAmount || "0.00"),
        maxDiscount: body.maxDiscount ? String(body.maxDiscount) : null,
        usageLimit: Number(body.usageLimit || 100),
      }).$returningId();
    const [created] = await db.select().from(coupons).where(eq(coupons.id, __created_id));

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { code, cartTotal = 0 } = await request.json();

    if (!code) {
      return NextResponse.json({ success: false, error: "Kupon kodu giriniz." }, { status: 400 });
    }

    const [coupon] = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.code, code.toUpperCase().trim()), eq(coupons.isActive, true)))
      .limit(1);

    if (!coupon) {
      return NextResponse.json({ success: false, error: "Geçersiz veya süresi dolmuş kupon kodu." }, { status: 404 });
    }

    if (coupon.minCartAmount && Number(cartTotal) < Number(coupon.minCartAmount)) {
      return NextResponse.json(
        {
          success: false,
          error: `Bu kupon en az ${coupon.minCartAmount} TL tutarındaki sepetlerde geçerlidir.`,
        },
        { status: 400 }
      );
    }

    let discountAmount = 0;
    if (coupon.discountType === "PERCENT") {
      discountAmount = (Number(cartTotal) * Number(coupon.discountValue)) / 100;
      if (coupon.maxDiscount && discountAmount > Number(coupon.maxDiscount)) {
        discountAmount = Number(coupon.maxDiscount);
      }
    } else {
      discountAmount = Number(coupon.discountValue);
    }

    return NextResponse.json({
      success: true,
      message: `%${coupon.discountValue} kupon indirimi uygulandı.`,
      discountAmount: Number(discountAmount.toFixed(2)),
      coupon,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
