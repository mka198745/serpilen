import React from "react";
import { db } from "@/db";
import {
  products,
  productVariants,
  categories,
  brands,
  warehouses,
  inventory,
  inventoryLedger,
  orders,
  orderItems,
  customers,
  suppliers,
  purchaseOrders,
  coupons,
  erpSyncLogs,
  posShifts,
} from "@/db/schema";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminDashboardClient } from "./AdminDashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.isStaff) redirect("/?giris=1&next=/admin");
  const allProds = await db.select().from(products).orderBy(desc(products.id));
  const allVars = await db.select().from(productVariants);
  const allCats = await db.select().from(categories);
  const allBrands = await db.select().from(brands);
  const allWh = await db.select().from(warehouses);
  const allInv = await db.select().from(inventory);
  const allLedger = await db.select().from(inventoryLedger).orderBy(desc(inventoryLedger.id)).limit(30);
  const allOrders = await db.select().from(orders).orderBy(desc(orders.id)).limit(50);
  const allOrderItems = await db.select().from(orderItems);
  const allCustomers = await db.select().from(customers).orderBy(desc(customers.id));
  const allSuppliers = await db.select().from(suppliers).orderBy(desc(suppliers.id));
  const allPOs = await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.id));
  const allCoupons = await db.select().from(coupons);
  const allErpLogs = await db.select().from(erpSyncLogs).orderBy(desc(erpSyncLogs.id)).limit(30);
  const allShifts = await db.select().from(posShifts).orderBy(desc(posShifts.id)).limit(10);

  const enrichedProducts = allProds.map((p) => {
    const vars = allVars.filter((v) => v.productId === p.id);
    const cat = allCats.find((c) => c.id === p.categoryId);
    const br = allBrands.find((b) => b.id === p.brandId);
    const pStocks = allInv.filter((i) => i.productId === p.id);
    const totalPhysical = pStocks.reduce((sum, s) => sum + s.physicalQty, 0);
    const totalReserved = pStocks.reduce((sum, s) => sum + s.reservedQty, 0);
    return {
      ...p,
      variants: vars,
      categoryName: cat?.name || "Kategori",
      brandName: br?.name || "Marka",
      totalPhysical,
      totalAvailable: Math.max(0, totalPhysical - totalReserved),
    };
  });

  const enrichedInventory = allInv.map((inv) => {
    const p = allProds.find((prod) => prod.id === inv.productId);
    const v = inv.variantId ? allVars.find((vr) => vr.id === inv.variantId) : null;
    const wh = allWh.find((w) => w.id === inv.warehouseId);
    const available = Math.max(0, inv.physicalQty - inv.reservedQty);
    return {
      ...inv,
      productName: p?.name || "Ürün",
      variantName: v ? `${v.colorName || ""} ${v.size || ""}`.trim() : null,
      sku: v?.sku || p?.sku || "",
      barcode: v?.barcode || p?.barcode || "",
      warehouseName: wh?.name || "Depo",
      warehouseCode: wh?.code || "",
      available,
      isCritical: available <= inv.reorderPoint,
    };
  });

  const enrichedOrders = allOrders.map((ord) => ({
    ...ord,
    items: allOrderItems.filter((it) => it.orderId === ord.id),
  }));

  return (
    <AdminDashboardClient
      products={enrichedProducts}
      categories={allCats}
      brands={allBrands}
      warehouses={allWh}
      inventory={enrichedInventory}
      ledger={allLedger}
      orders={enrichedOrders}
      customers={allCustomers}
      suppliers={allSuppliers}
      purchaseOrders={allPOs}
      coupons={allCoupons}
      erpLogs={allErpLogs}
      shifts={allShifts}
    />
  );
}
