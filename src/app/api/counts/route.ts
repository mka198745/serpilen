import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  stockCountSessions,
  stockCountItems,
  inventory,
  warehouses,
  products,
  productVariants,
  auditLogs,
} from "@/db/schema";
import { adjustInventory } from "@/lib/inventory-engine";
import { and, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Barkod/SKU'dan ürün + varyant çözümler. */
async function resolveByBarcode(code: string) {
  const clean = code.trim();
  const vars = await db.select().from(productVariants);
  const v = vars.find((x) => x.barcode === clean || x.sku.toUpperCase() === clean.toUpperCase());
  const allProds = await db.select().from(products);
  if (v) {
    const p = allProds.find((prod) => prod.id === v.productId);
    return p ? { product: p, variant: v } : null;
  }
  const p = allProds.find((prod) => prod.barcode === clean || prod.sku.toUpperCase() === clean.toUpperCase());
  return p ? { product: p, variant: null } : null;
}

async function currentExpected(warehouseId: number, productId: number, variantId: number | null) {
  const conds = [eq(inventory.warehouseId, warehouseId), eq(inventory.productId, productId)];
  if (variantId) conds.push(eq(inventory.variantId, variantId));
  else conds.push(sql`${inventory.variantId} IS NULL`);
  const rows = await db.select().from(inventory).where(and(...conds)).limit(1);
  return rows[0]?.physicalQty ?? 0;
}

export async function GET() {
  const sessions = await db.select().from(stockCountSessions).orderBy(desc(stockCountSessions.id)).limit(20);
  const items = await db.select().from(stockCountItems).orderBy(desc(stockCountItems.id));
  const allWh = await db.select().from(warehouses);
  const allProds = await db.select({ id: products.id, name: products.name, sku: products.sku }).from(products);
  const allVars = await db.select().from(productVariants);

  return NextResponse.json({
    success: true,
    data: sessions.map((s) => ({
      ...s,
      warehouseName: allWh.find((w) => w.id === s.warehouseId)?.name || "Depo",
      items: items
        .filter((i) => i.sessionId === s.id)
        .map((i) => {
          const v = allVars.find((x) => x.id === i.variantId);
          return {
            ...i,
            productName: allProds.find((p) => p.id === i.productId)?.name || "Ürün",
            variantName: v ? `${v.colorName || ""} ${v.size || ""}`.trim() : null,
            sku: v?.sku || allProds.find((p) => p.id === i.productId)?.sku || "",
            difference: i.countedQty - i.expectedQty,
          };
        }),
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    warehouseId?: number;
    sessionId?: number;
    barcode?: string;
    countedQty?: number;
    startedBy?: string;
  };
  const action = body.action || "START";
  const user = body.startedBy || "Sayım Ekibi";

  try {
    if (action === "START") {
      const whId = Number(body.warehouseId);
      if (!whId) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Depo seçin." } }, { status: 422 });

      const countNumber = `COUNT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const [{ id: __session_id }] = await db.insert(stockCountSessions).values({ countNumber, warehouseId: whId, status: "IN_PROGRESS", startedBy: user }).$returningId();
      const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, __session_id));
      return NextResponse.json({ success: true, data: session });
    }

    if (action === "ADD_ITEM") {
      const sessionId = Number(body.sessionId);
      const barcode = String(body.barcode || "").trim();
      const counted = Number(body.countedQty);
      if (!sessionId || !barcode) {
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Oturum ve barkod zorunludur." } }, { status: 422 });
      }

      const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, sessionId)).limit(1);
      if (!session || session.status !== "IN_PROGRESS") {
        return NextResponse.json({ success: false, error: { code: "BAD_STATE", message: "Sayım oturumu kapalı." } }, { status: 409 });
      }

      const resolved = await resolveByBarcode(barcode);
      if (!resolved) {
        return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: `'${barcode}' barkodlu ürün bulunamadı.` } }, { status: 404 });
      }

      const expected = await currentExpected(session.warehouseId, resolved.product.id, resolved.variant?.id ?? null);
      const [{ id: __item_id }] = await db.insert(stockCountItems).values({
          sessionId,
          productId: resolved.product.id,
          variantId: resolved.variant?.id ?? null,
          expectedQty: expected,
          countedQty: counted,
          scannedBarcode: barcode,
        }).$returningId();
      const [item] = await db.select().from(stockCountItems).where(eq(stockCountItems.id, __item_id));

      return NextResponse.json({
        success: true,
        data: {
          ...item,
          productName: resolved.product.name,
          variantName: resolved.variant ? `${resolved.variant.colorName || ""} ${resolved.variant.size || ""}`.trim() : null,
          difference: counted - expected,
        },
      });
    }

    if (action === "COMPLETE") {
      const sessionId = Number(body.sessionId);
      const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, sessionId)).limit(1);
      if (!session || session.status !== "IN_PROGRESS") {
        return NextResponse.json({ success: false, error: { code: "BAD_STATE", message: "Sayım oturumu zaten kapalı." } }, { status: 409 });
      }

      const items = await db.select().from(stockCountItems).where(eq(stockCountItems.sessionId, sessionId));
      let adjustments = 0;
      for (const it of items) {
        const diff = it.countedQty - it.expectedQty;
        if (diff !== 0) {
          await adjustInventory({
            warehouseId: session.warehouseId,
            productId: it.productId,
            variantId: it.variantId,
            quantityDelta: diff,
            transactionType: "COUNT_DIFF",
            referenceType: "COUNT",
            referenceId: session.countNumber,
            note: `Sayım farkı (${session.countNumber}): beklenen ${it.expectedQty}, sayılan ${it.countedQty}`,
            createdBy: user,
          });
          adjustments++;
        }
      }

      await db.update(stockCountSessions).set({ status: "COMPLETED", completedAt: new Date() }).where(eq(stockCountSessions.id, sessionId));
      const [finished] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, sessionId));

      await db.insert(auditLogs).values({
        userId: user,
        userName: user,
        action: "COUNT_COMPLETED",
        entity: "StockCountSession",
        entityId: String(sessionId),
        details: `${session.countNumber}: ${items.length} kalem, ${adjustments} düzeltme`,
      });

      return NextResponse.json({ success: true, data: { ...finished, itemCount: items.length, adjustments } });
    }

    if (action === "CANCEL") {
      const sessionId = Number(body.sessionId);
      await db.update(stockCountSessions).set({ status: "CANCELLED", completedAt: new Date() }).where(eq(stockCountSessions.id, sessionId));
      const [finished] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, sessionId));
      return NextResponse.json({ success: true, data: finished });
    }

    return NextResponse.json({ success: false, error: { code: "UNKNOWN_ACTION", message: "Bilinmeyen eylem." } }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } }, { status: 500 });
  }
}
