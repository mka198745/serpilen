import { NextResponse } from "next/server";
import { db } from "@/db";
import { inventory, inventoryLedger, warehouses, products, productVariants } from "@/db/schema";
import { adjustInventory, transferBetweenWarehouses } from "@/lib/inventory-engine";
import { desc, eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get("warehouseId");

    const allWarehouses = await db.select().from(warehouses);
    const allProducts = await db.select().from(products);
    const allVariants = await db.select().from(productVariants);

    let stockQuery = db.select().from(inventory);
    let stockItems = await stockQuery;

    if (warehouseId) {
      stockItems = stockItems.filter((i) => i.warehouseId === Number(warehouseId));
    }

    const enrichedStock = stockItems.map((st) => {
      const prod = allProducts.find((p) => p.id === st.productId);
      const variant = st.variantId ? allVariants.find((v) => v.id === st.variantId) : null;
      const wh = allWarehouses.find((w) => w.id === st.warehouseId);

      const availableQty = Math.max(0, st.physicalQty - st.reservedQty);
      const isReorderNeeded = availableQty <= st.reorderPoint;

      return {
        ...st,
        productName: prod?.name || "Bilinmeyen Ürün",
        variantName: variant ? `${variant.colorName || ""} ${variant.size || ""}`.trim() : null,
        sku: variant?.sku || prod?.sku || "",
        barcode: variant?.barcode || prod?.barcode || "",
        warehouseName: wh?.name || "Depo",
        warehouseCode: wh?.code || "",
        unitPrice: variant?.retailPrice || prod?.retailPrice || "0.00",
        unit: prod?.unit || "Adet",
        availableQty,
        isReorderNeeded,
      };
    });

    // Recent 20 ledger movements
    const ledger = await db.select().from(inventoryLedger).orderBy(desc(inventoryLedger.id)).limit(20);
    const enrichedLedger = ledger.map((lg) => {
      const prod = allProducts.find((p) => p.id === lg.productId);
      const wh = allWarehouses.find((w) => w.id === lg.warehouseId);
      return {
        ...lg,
        productName: prod?.name || "Ürün",
        warehouseName: wh?.name || "Depo",
      };
    });

    // Reorder alert items
    const reorderItems = enrichedStock.filter((s) => s.isReorderNeeded);

    return NextResponse.json({
      success: true,
      warehouses: allWarehouses,
      inventory: enrichedStock,
      recentLedger: enrichedLedger,
      reorderAlerts: reorderItems,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "TRANSFER") {
      const { fromWarehouseId, toWarehouseId, productId, variantId = null, quantity, note = "Depolar Arası Sevk" } = body;
      const res = await transferBetweenWarehouses(
        Number(fromWarehouseId),
        Number(toWarehouseId),
        Number(productId),
        variantId ? Number(variantId) : null,
        Number(quantity),
        note
      );
      return NextResponse.json({ success: true, message: "Depolar arası transfer başarıyla tamamlandı", ref: res.transferRef });
    }

    if (action === "ADJUST") {
      const { warehouseId, productId, variantId = null, quantityDelta, reason = "SAYIM", note = "Stok Sayım Düzeltmesi" } = body;
      await adjustInventory({
        warehouseId: Number(warehouseId),
        productId: Number(productId),
        variantId: variantId ? Number(variantId) : null,
        quantityDelta: Number(quantityDelta),
        transactionType: reason === "DAMAGE" ? "DAMAGE" : "COUNT_DIFF",
        referenceType: "ADJUSTMENT",
        referenceId: `ADJ-${Date.now().toString().slice(-6)}`,
        note,
        createdBy: "Depo Sayım Ekibi",
      });
      return NextResponse.json({ success: true, message: "Stok düzeltmesi yapıldı ve Stok Defteri'ne işlendi." });
    }

    return NextResponse.json({ success: false, error: "Geçersiz işlem tipi" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
