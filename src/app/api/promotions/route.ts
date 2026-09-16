import { NextResponse } from "next/server";
import { db } from "@/db";
import { promotions, categories, brands, auditLogs } from "@/db/schema";
import { applyPromotions } from "@/lib/promotion-engine";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(promotions).orderBy(desc(promotions.priority), desc(promotions.id));
    const cats = await db.select().from(categories);
    const brs = await db.select().from(brands);

    const RULE_LABELS: Record<string, string> = {
      PERCENT_CATEGORY: "Kategori %İndirim",
      PERCENT_BRAND: "Marka %İndirim",
      THRESHOLD_DISCOUNT: "Sepet Eşiği İndirimi",
      BUY_X_PAY_Y: "X Al Y Öde",
      FREE_SHIPPING: "Ücretsiz Kargo",
      BUNDLE_PERCENT: "Paket (Çoklu Adet) İndirimi",
    };

    return NextResponse.json({
      success: true,
      data: rows.map((p) => ({
        ...p,
        ruleLabel: RULE_LABELS[p.ruleType] || p.ruleType,
        categoryName: p.categoryId ? cats.find((c) => c.id === p.categoryId)?.name || null : null,
        brandName: p.brandId ? brs.find((b) => b.id === p.brandId)?.name || null : null,
        startDate: new Date(p.startDate).toISOString(),
        endDate: p.endDate ? new Date(p.endDate).toISOString() : null,
        createdAt: new Date(p.createdAt).toISOString(),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      action = "CREATE",
      id,
      name,
      description,
      ruleType = "PERCENT_CATEGORY",
      categoryId,
      brandId,
      percentValue,
      fixedValue,
      thresholdAmount,
      buyQty,
      payQty,
      minQty,
      maxDiscount,
      freeShipping,
      priority,
      startDate,
      endDate,
      isActive,
    } = body;

    if (action === "DELETE") {
      await db.update(promotions).set({ isActive: false }).where(eq(promotions.id, Number(id)));
      await db.insert(auditLogs).values({ userName: "Yönetici", action: "PROMOTION_DISABLED", entity: "Promotion", entityId: String(id), details: "Kampanya pasifleştirildi" });
      return NextResponse.json({ success: true });
    }

    if (action === "UPDATE" || action === "TOGGLE") {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = String(name).trim();
      if (description !== undefined) updates.description = description;
      if (percentValue !== undefined) updates.percentValue = percentValue ? String(percentValue) : null;
      if (fixedValue !== undefined) updates.fixedValue = fixedValue ? String(fixedValue) : null;
      if (thresholdAmount !== undefined) updates.thresholdAmount = thresholdAmount ? String(thresholdAmount) : null;
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      if (priority !== undefined) updates.priority = Number(priority);
      await db.update(promotions).set(updates).where(eq(promotions.id, Number(id)));
      await db.insert(auditLogs).values({ userName: "Yönetici", action: "PROMOTION_UPDATED", entity: "Promotion", entityId: String(id), details: `Güncellenen alanlar: ${Object.keys(updates).join(", ")}` });
      const [u] = await db.select().from(promotions).where(eq(promotions.id, Number(id))).limit(1);
      return NextResponse.json({ success: true, data: u });
    }

    // CREATE
    if (!name?.trim()) return NextResponse.json({ success: false, error: "Kampanya adı zorunlu." }, { status: 422 });

    const [{ id: __created_id }] = await db.insert(promotions).values({
        name: name.trim(),
        description: description || null,
        ruleType,
        categoryId: categoryId ? Number(categoryId) : null,
        brandId: brandId ? Number(brandId) : null,
        percentValue: percentValue ? String(percentValue) : null,
        fixedValue: fixedValue ? String(fixedValue) : null,
        thresholdAmount: thresholdAmount ? String(thresholdAmount) : null,
        buyQty: buyQty ? Number(buyQty) : null,
        payQty: payQty ? Number(payQty) : null,
        minQty: minQty ? Number(minQty) : 1,
        maxDiscount: maxDiscount ? String(maxDiscount) : null,
        freeShipping: Boolean(freeShipping),
        priority: Number(priority ?? 50),
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
      }).$returningId();
    const [created] = await db.select().from(promotions).where(eq(promotions.id, __created_id));

    await db.insert(auditLogs).values({ userName: "Yönetici", action: "PROMOTION_CREATED", entity: "Promotion", entityId: String(created.id), details: `${created.name} (${ruleType})` });
    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/** POST /api/promotions/preview gövdesi için hesap ucu (sepet önizleme). */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const lines = (body.lines || []).map((l: any) => ({
      productId: Number(l.productId),
      unitPrice: Number(l.unitPrice),
      quantity: Number(l.quantity),
      categoryId: l.categoryId ? Number(l.categoryId) : null,
      brandId: l.brandId ? Number(l.brandId) : null,
    }));
    const res = await applyPromotions(lines);
    return NextResponse.json({ success: true, data: res });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
