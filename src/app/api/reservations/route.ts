import { NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryReservations, products, productVariants, warehouses } from "@/db/schema";
import {
  consumeReservation,
  expireReservations,
  releaseReservations,
  reserveStock,
} from "@/lib/inventory-engine";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  await expireReservations();
  const rows = await db.select().from(inventoryReservations).orderBy(desc(inventoryReservations.id)).limit(60);
  const allProds = await db.select({ id: products.id, name: products.name, sku: products.sku }).from(products);
  const allVars = await db.select().from(productVariants);
  const allWh = await db.select().from(warehouses);

  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      ...r,
      productName: allProds.find((p) => p.id === r.productId)?.name || "Ürün",
      variantName: r.variantId ? (() => { const v = allVars.find((x) => x.id === r.variantId); return v ? `${v.colorName || ""} ${v.size || ""}`.trim() : null; })() : null,
      sku: (() => { const v = allVars.find((x) => x.id === r.variantId); return v?.sku || allProds.find((p) => p.id === r.productId)?.sku || ""; })(),
      warehouseName: allWh.find((w) => w.id === r.warehouseId)?.name || "Depo",
      expiresAt: new Date(r.expiresAt).toISOString(),
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    warehouseId?: number;
    productId?: number;
    variantId?: number | null;
    qty?: number;
    referenceId?: string;
    referenceType?: "CART" | "CHECKOUT" | "ORDER";
    ttlMinutes?: number;
    saleReferenceId?: string;
    reason?: string;
    items?: Array<{ productId: number; variantId: number | null; qty: number }>;
  };

  const action = body.action || "RESERVE";

  if (action === "RESERVE") {
    const ref = String(body.referenceId || `CART-${Date.now().toString(36).toUpperCase()}`);
    const items = body.items?.length
      ? body.items
      : [{ productId: Number(body.productId), variantId: body.variantId ?? null, qty: Number(body.qty) }];

    const results = [];
    for (const it of items) {
      const res = await reserveStock({
        warehouseId: Number(body.warehouseId || 1),
        productId: Number(it.productId),
        variantId: it.variantId ?? null,
        qty: Number(it.qty),
        referenceType: body.referenceType || "CART",
        referenceId: ref,
        ttlMinutes: body.ttlMinutes,
      });
      if (!res.success) {
        await releaseReservations(ref, "Kısmi rezervasyon hatası");
        return NextResponse.json({ success: false, error: { code: "STOCK_SHORTAGE", message: res.error } }, { status: 409 });
      }
      results.push(res);
    }

    const [first] = results;
    return NextResponse.json({
      success: true,
      data: { referenceId: ref, count: results.length, expiresAt: first?.reservation?.expiresAt },
    });
  }

  if (action === "RELEASE") {
    const ref = String(body.referenceId || "");
    if (!ref) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "referenceId zorunludur." } }, { status: 422 });
    const res = await releaseReservations(ref, body.reason || "Manuel serbest bırakma");
    return NextResponse.json({ success: true, data: res });
  }

  if (action === "CONSUME") {
    const ref = String(body.referenceId || "");
    const saleRef = String(body.saleReferenceId || `SALE-${Date.now().toString(36).toUpperCase()}`);
    if (!ref) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "referenceId zorunludur." } }, { status: 422 });
    const res = await consumeReservation(ref, saleRef, "Depo Sorumlusu");
    return NextResponse.json({ success: true, data: { saleReferenceId: saleRef, ...res } });
  }

  if (action === "EXPIRE_ALL") {
    const res = await expireReservations();
    return NextResponse.json({ success: true, data: res });
  }

  return NextResponse.json({ success: false, error: { code: "UNKNOWN_ACTION", message: "Bilinmeyen eylem." } }, { status: 400 });
}
