import { NextResponse } from "next/server";
import { db } from "@/db";
import { priceLists, priceListItems, priceTiers, products, customers, auditLogs } from "@/db/schema";
import { getTierLadder, quoteCart } from "@/lib/pricing-engine";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ladderProductId = searchParams.get("ladderProductId");
    const customerId = searchParams.get("customerId");

    if (ladderProductId) {
      const ladder = await getTierLadder(Number(ladderProductId), null, customerId ? Number(customerId) : null);
      return NextResponse.json({ success: true, data: ladder });
    }

    const lists = await db.select().from(priceLists).orderBy(desc(priceLists.isDefault), priceLists.id);
    const items = await db.select().from(priceListItems);
    const tiers = await db.select().from(priceTiers);
    const prods = await db.select({ id: products.id, name: products.name, sku: products.sku, retailPrice: products.retailPrice }).from(products);
    const custs = await db.select().from(customers);

    return NextResponse.json({
      success: true,
      data: lists.map((l) => ({
        ...l,
        customerCount: custs.filter((c) => c.priceListId === l.id).length,
        items: items
          .filter((i) => i.priceListId === l.id)
          .map((i) => ({ ...i, productName: prods.find((p) => p.id === i.productId)?.name || "?", sku: prods.find((p) => p.id === i.productId)?.sku || "" })),
        tiers: tiers
          .filter((t) => t.priceListId === l.id)
          .sort((a, b) => a.minQty - b.minQty)
          .map((t) => ({ ...t, productName: t.productId ? prods.find((p) => p.id === t.productId)?.name || "?" : "Tüm ürünler" })),
      })),
      products: prods,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action = "CREATE_LIST" } = body;

    if (action === "CREATE_LIST") {
      const code = String(body.code || "").toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "");
      if (!code || !body.name?.trim()) return NextResponse.json({ success: false, error: "Kod ve ad zorunludur." }, { status: 422 });
      const exists = (await db.select().from(priceLists)).find((l) => l.code === code);
      if (exists) return NextResponse.json({ success: false, error: "Bu kod zaten var." }, { status: 409 });

      const [{ id: __created_id_3 }] = await db.insert(priceLists).values({
          code,
          name: String(body.name).trim(),
          description: body.description || null,
          defaultDiscountRate: String(body.defaultDiscountRate || "0.00"),
          isDefault: Boolean(body.isDefault),
        }).$returningId();
      const [created] = await db.select().from(priceLists).where(eq(priceLists.id, __created_id_3));

      if (created.isDefault) {
        // tek varsayılan
        const all = await db.select().from(priceLists);
        for (const l of all) if (l.id !== created.id && l.isDefault) await db.update(priceLists).set({ isDefault: false }).where(eq(priceLists.id, l.id));
      }
      await db.insert(auditLogs).values({ userName: "Yönetici", action: "PRICE_LIST_CREATED", entity: "PriceList", entityId: String(created.id), details: `${created.code} — ${created.name}` });
      return NextResponse.json({ success: true, data: created });
    }

    if (action === "UPDATE_LIST") {
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.defaultDiscountRate !== undefined) updates.defaultDiscountRate = String(body.defaultDiscountRate);
      if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
      await db.update(priceLists).set(updates).where(eq(priceLists.id, Number(body.id)));
      const [u] = await db.select().from(priceLists).where(eq(priceLists.id, Number(body.id)));
      return NextResponse.json({ success: true, data: u });
    }

    if (action === "ADD_ITEM") {
      const [{ id: __created_id_2 }] = await db.insert(priceListItems).values({
          priceListId: Number(body.priceListId),
          productId: Number(body.productId),
          variantId: body.variantId ? Number(body.variantId) : null,
          unitPrice: String(body.unitPrice),
          minQty: Number(body.minQty || 1),
        }).$returningId();
      const [created] = await db.select().from(priceListItems).where(eq(priceListItems.id, __created_id_2));
      return NextResponse.json({ success: true, data: created });
    }

    if (action === "DELETE_ITEM") {
      await db.delete(priceListItems).where(eq(priceListItems.id, Number(body.id)));
      return NextResponse.json({ success: true });
    }

    if (action === "ADD_TIER") {
      const [{ id: __created_id }] = await db.insert(priceTiers).values({
          priceListId: Number(body.priceListId),
          productId: body.productId ? Number(body.productId) : null,
          minQty: Number(body.minQty),
          maxQty: body.maxQty ? Number(body.maxQty) : null,
          discountRate: body.discountRate ? String(body.discountRate) : null,
          unitPrice: body.unitPrice ? String(body.unitPrice) : null,
        }).$returningId();
      const [created] = await db.select().from(priceTiers).where(eq(priceTiers.id, __created_id));
      return NextResponse.json({ success: true, data: created });
    }

    if (action === "DELETE_TIER") {
      await db.delete(priceTiers).where(eq(priceTiers.id, Number(body.id)));
      return NextResponse.json({ success: true });
    }

    if (action === "QUOTE") {
      const res = await quoteCart(body.lines || [], body.customerId ? Number(body.customerId) : null);
      return NextResponse.json({ success: true, data: res });
    }

    return NextResponse.json({ success: false, error: "Bilinmeyen eylem." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
