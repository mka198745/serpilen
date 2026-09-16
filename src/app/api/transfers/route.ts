import { NextResponse } from "next/server";
import { db } from "@/db";
import { stockTransfers, stockTransferItems, warehouses, products, productVariants, auditLogs } from "@/db/schema";
import { adjustInventory } from "@/lib/inventory-engine";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(stockTransfers).orderBy(desc(stockTransfers.id)).limit(50);
  const items = await db.select().from(stockTransferItems);
  const allWh = await db.select().from(warehouses);
  const allProds = await db.select({ id: products.id, name: products.name, sku: products.sku }).from(products);
  const allVars = await db.select().from(productVariants);

  return NextResponse.json({
    success: true,
    data: rows.map((t) => ({
      ...t,
      fromWarehouseName: allWh.find((w) => w.id === t.fromWarehouseId)?.name || "?",
      toWarehouseName: allWh.find((w) => w.id === t.toWarehouseId)?.name || "?",
      items: items
        .filter((i) => i.transferId === t.id)
        .map((i) => {
          const v = allVars.find((x) => x.id === i.variantId);
          return {
            ...i,
            productName: allProds.find((p) => p.id === i.productId)?.name || "Ürün",
            variantName: v ? `${v.colorName || ""} ${v.size || ""}`.trim() : null,
            sku: v?.sku || allProds.find((p) => p.id === i.productId)?.sku || "",
          };
        }),
    })),
  });
}

async function markTransfer(id: number, patch: Record<string, unknown>) {
  await db.update(stockTransfers).set(patch).where(eq(stockTransfers.id, id));
  const [updated] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
  return updated;
}

/**
 * İş akışı:
 *  CREATE    → REQUESTED (stok etkilenmez)
 *  APPROVE   → APPROVED  (stok etkilenmez, onay tarihi)
 *  SHIP      → SHIPPED   (TRANSFER_OUT: kaynak depodan düşer)
 *  RECEIVE   → RECEIVED  (TRANSFER_IN : hedef depoya girer)
 *  CANCEL    → CANCELLED (yalnızca SHIPPED öncesi)
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    transferId?: number;
    fromWarehouseId?: number;
    toWarehouseId?: number;
    note?: string;
    items?: Array<{ productId: number; variantId: number | null; qty: number }>;
  };

  const action = body.action || "CREATE";
  const user = "Depo Sorumlusu";

  try {
    if (action === "CREATE") {
      const fromId = Number(body.fromWarehouseId);
      const toId = Number(body.toWarehouseId);
      if (!fromId || !toId || fromId === toId) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Farklı iki depo seçin." } },
          { status: 422 }
        );
      }
      const items = body.items?.filter((i) => Number(i.qty) > 0) || [];
      if (items.length === 0) {
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "En az bir kalem ekleyin." } }, { status: 422 });
      }

      const transferNumber = `TRF-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const [{ id: __t_id }] = await db.insert(stockTransfers).values({ transferNumber, fromWarehouseId: fromId, toWarehouseId: toId, status: "REQUESTED", note: body.note || null, createdBy: user }).$returningId();
      const [t] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, __t_id));

      for (const it of items) {
        await db.insert(stockTransferItems).values({
          transferId: t.id,
          productId: Number(it.productId),
          variantId: it.variantId ?? null,
          qty: Number(it.qty),
        });
      }

      await db.insert(auditLogs).values({ userId: user, userName: user, action: "TRANSFER_CREATED", entity: "StockTransfer", entityId: String(t.id), details: `${transferNumber}: ${items.length} kalem` });

      return NextResponse.json({ success: true, data: t });
    }

    const id = Number(body.transferId);
    if (!id) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "transferId zorunludur." } }, { status: 422 });
    }

    const [t] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id)).limit(1);
    if (!t) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Transfer bulunamadı." } }, { status: 404 });

    const items = await db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));

    if (action === "APPROVE") {
      if (t.status !== "REQUESTED") return NextResponse.json({ success: false, error: { code: "BAD_STATE", message: `Durum ${t.status} iken onaylanamaz.` } }, { status: 409 });
      const updated = await markTransfer(id, { status: "APPROVED", approvedAt: new Date() });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "SHIP") {
      if (!["REQUESTED", "APPROVED"].includes(t.status)) {
        return NextResponse.json({ success: false, error: { code: "BAD_STATE", message: `Durum ${t.status} iken sevk edilemez.` } }, { status: 409 });
      }
      for (const it of items) {
        await adjustInventory({
          warehouseId: t.fromWarehouseId,
          productId: it.productId,
          variantId: it.variantId,
          quantityDelta: -it.qty,
          transactionType: "TRANSFER_OUT",
          referenceType: "TRANSFER",
          referenceId: t.transferNumber,
          note: `Sevk (${t.transferNumber}) → Depo #${t.toWarehouseId}`,
          createdBy: user,
        });
      }
      const updated = await markTransfer(id, { status: "SHIPPED", shippedAt: new Date() });
      await db.insert(auditLogs).values({ userId: user, userName: user, action: "TRANSFER_SHIPPED", entity: "StockTransfer", entityId: String(t.id), details: `${t.transferNumber}: ${items.length} kalem sevk edildi` });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "RECEIVE") {
      if (t.status !== "SHIPPED") return NextResponse.json({ success: false, error: { code: "BAD_STATE", message: `Durum ${t.status} iken teslim alınamaz (önce sevk edin).` } }, { status: 409 });
      for (const it of items) {
        await adjustInventory({
          warehouseId: t.toWarehouseId,
          productId: it.productId,
          variantId: it.variantId,
          quantityDelta: it.qty,
          transactionType: "TRANSFER_IN",
          referenceType: "TRANSFER",
          referenceId: t.transferNumber,
          note: `Teslim alma (${t.transferNumber}) ← Depo #${t.fromWarehouseId}`,
          createdBy: user,
        });
      }
      const updated = await markTransfer(id, { status: "RECEIVED", receivedAt: new Date() });
      await db.insert(auditLogs).values({ userId: user, userName: user, action: "TRANSFER_RECEIVED", entity: "StockTransfer", entityId: String(t.id), details: `${t.transferNumber}: ${items.length} kalem teslim alındı` });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "CANCEL") {
      if (["SHIPPED", "RECEIVED"].includes(t.status)) {
        return NextResponse.json({ success: false, error: { code: "BAD_STATE", message: "Sevk edilmiş/teslim alınmış transfer iptal edilemez." } }, { status: 409 });
      }
      const updated = await markTransfer(id, { status: "CANCELLED" });
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: { code: "UNKNOWN_ACTION", message: "Bilinmeyen eylem." } }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } }, { status: 500 });
  }
}
