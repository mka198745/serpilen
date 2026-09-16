import { NextResponse } from "next/server";
import { db } from "@/db";
import { productVariants, products, inventory } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");

  let rows = await db.select().from(productVariants).orderBy(desc(productVariants.id));
  if (productId) {
    rows = rows.filter((v) => v.productId === Number(productId));
  }

  const allProds = await db.select({ id: products.id, name: products.name, sku: products.sku }).from(products);
  const stocks = await db.select().from(inventory);

  const data = rows.map((v) => {
    const p = allProds.find((prod) => prod.id === v.productId);
    const vStocks = stocks.filter((s) => s.variantId === v.id);
    const physical = vStocks.reduce((sum, s) => sum + s.physicalQty, 0);
    const reserved = vStocks.reduce((sum, s) => sum + s.reservedQty, 0);
    return {
      ...v,
      productName: p?.name || "Ürün",
      productSku: p?.sku || "",
      availableQty: Math.max(0, physical - reserved),
    };
  });

  return NextResponse.json({ success: true, count: data.length, data });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    productId?: number;
    sku?: string;
    barcode?: string;
    colorName?: string;
    colorHex?: string;
    size?: string;
    length?: string;
    buyPrice?: string;
    retailPrice?: string;
    b2bPrice?: string;
    imageUrl?: string;
    initialStock?: number;
    warehouseId?: number;
  };

  const productId = Number(body.productId);
  if (!productId) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Ürün ID zorunludur." } }, { status: 422 });
  }

  const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!prod) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Ürün bulunamadı." } }, { status: 404 });
  }

  const colorPart = (body.colorName || "GENEL").toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 12);
  const sizePart = (body.size || body.length || "STD").toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 8);
  const sku = (body.sku || `${prod.sku}-${colorPart}-${sizePart}`).slice(0, 40);
  const barcode = body.barcode || `869${Date.now().toString().slice(-10)}`;
  const retailPrice = String(body.retailPrice || prod.retailPrice);

  try {
    const [{ id: __created_id }] = await db.insert(productVariants).values({
        productId,
        sku,
        barcode,
        colorName: body.colorName?.trim() || null,
        colorHex: body.colorHex?.trim() || null,
        size: body.size?.trim() || null,
        length: body.length?.trim() || null,
        buyPrice: body.buyPrice ? String(body.buyPrice) : prod.buyPrice,
        retailPrice,
        b2bPrice: body.b2bPrice ? String(body.b2bPrice) : prod.b2bPrice,
        imageUrl: body.imageUrl || prod.imageUrl,
      }).$returningId();
    const [created] = await db.select().from(productVariants).where(eq(productVariants.id, __created_id));

    await db.update(products).set({ hasVariants: true }).where(eq(products.id, productId));

    const stockQty = Number(body.initialStock || 0);
    if (stockQty > 0) {
      await db.insert(inventory).values({
        warehouseId: Number(body.warehouseId || 1),
        productId,
        variantId: created.id,
        physicalQty: stockQty,
        reservedQty: 0,
        locationCode: "MRK-A-01-01",
      });
    }

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: number;
    retailPrice?: string;
    b2bPrice?: string;
    buyPrice?: string;
    colorName?: string;
    colorHex?: string;
    size?: string;
    length?: string;
    isActive?: boolean;
    imageUrl?: string;
  };

  const id = Number(body.id);
  if (!id) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Varyant ID zorunludur." } }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};
  if (body.retailPrice !== undefined) updates.retailPrice = String(body.retailPrice);
  if (body.b2bPrice !== undefined) updates.b2bPrice = String(body.b2bPrice);
  if (body.buyPrice !== undefined) updates.buyPrice = String(body.buyPrice);
  if (body.colorName !== undefined) updates.colorName = body.colorName;
  if (body.colorHex !== undefined) updates.colorHex = body.colorHex;
  if (body.size !== undefined) updates.size = body.size;
  if (body.length !== undefined) updates.length = body.length;
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
  if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Güncellenecek alan yok." } }, { status: 422 });
  }

  await db.update(productVariants).set(updates).where(eq(productVariants.id, id));
  const [updated] = await db.select().from(productVariants).where(eq(productVariants.id, id));
  if (!updated) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Varyant bulunamadı." } }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: updated });
}
