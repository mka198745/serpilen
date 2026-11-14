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
  posShifts,
} from "@/db/schema";
import { desc, sql, count, and, ne, gte, lt, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSessionUser, getStaffUserFromKt } from "@/lib/auth";
import { StripQueryParam } from "@/components/layout/StripQueryParam";
import { AUTH_ENABLED } from "@/lib/auth-flag";
import { AdminDashboardClient } from "./AdminDashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let currentUserName = "Yönetici";
  let currentRole = "SUPER_ADMIN";
  let currentRoleLabel = "Süper Admin";
  if (AUTH_ENABLED) {
    const sessionUser = await getSessionUser();
    let staffUser = sessionUser;
    if (!staffUser?.isStaff) {
      const { kt } = await searchParams;
      staffUser = await getStaffUserFromKt(kt);
    }
    if (!staffUser?.isStaff) redirect("/?giris=1&next=/admin");
    currentUserName = staffUser.name;
    currentRole = staffUser.role;
    currentRoleLabel = staffUser.roleLabel;
  }
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

  // ---- Gerçek KPI rakamları (tüm zamanlar, LIMIT 50'den bağımsız) ----
  const notCancelled = ne(orders.status, "CANCELLED");
  const sumGrand = sql<number>`coalesce(sum(${orders.grandTotal}), 0)`;

  const [totals] = await db
    .select({ totalOrders: count(orders.id), salesCount: count(sql`case when ${orders.status} != 'CANCELLED' then 1 end`) })
    .from(orders);
  const [revTotal] = await db.select({ v: sumGrand }).from(orders).where(notCancelled);

  const channelRows = await db
    .select({ orderType: orders.orderType, c: count(orders.id), revenue: sumGrand })
    .from(orders)
    .where(notCancelled)
    .groupBy(orders.orderType);
  const channelMap = new Map(channelRows.map((r) => [r.orderType, r]));

  // Maliyet toplamı (satılan malın maliyeti): yalnız iptal edilmemiş siparişler
  const [costRow] = await db
    .select({ cost: sql<number>`coalesce(sum(${orderItems.quantity} * cast(${products.buyPrice} as real)), 0)` })
    .from(orderItems)
    .innerJoin(orders, sql`${orderItems.orderId} = ${orders.id}`)
    .innerJoin(products, sql`${orderItems.productId} = ${products.id}`)
    .where(notCancelled);

  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [monthRow] = await db
    .select({ v: sumGrand })
    .from(orders)
    .where(and(notCancelled, gte(orders.createdAt, firstOfThisMonth)));
  const [lastMonthRow] = await db
    .select({ v: sumGrand })
    .from(orders)
    .where(and(notCancelled, gte(orders.createdAt, firstOfLastMonth), lt(orders.createdAt, firstOfThisMonth)));
  const monthRevenue = Number(monthRow?.v ?? 0);
  const lastMonthRevenue = Number(lastMonthRow?.v ?? 0);
  const monthGrowth = lastMonthRevenue > 0 ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : null;

  const [pendingRow] = await db
    .select({ c: count(orders.id) })
    .from(orders)
    .where(inArray(orders.status, ["PAID", "PREPARING", "READY_FOR_SHIPMENT"]));
  const [returnedRow] = await db
    .select({ c: count(orders.id) })
    .from(orders)
    .where(inArray(orders.status, ["RETURN_REQUESTED", "RETURNED", "REFUNDED"]));

  const totalRevenue = Number(revTotal?.v ?? 0);
  const salesCount = Number(totals?.salesCount ?? 0);
  const channelRevenue = {
    pos: Number(channelMap.get("POS")?.revenue ?? 0),
    online: Number(channelMap.get("ONLINE_B2C")?.revenue ?? 0),
  };
  const dashboardStats = {
    totalRevenue,
    totalOrders: Number(totals?.totalOrders ?? 0),
    salesCount,
    posCount: Number(channelMap.get("POS")?.c ?? 0),
    onlineCount: Number(channelMap.get("ONLINE_B2C")?.c ?? 0),
    channelRevenue,
    avgBasket: salesCount > 0 ? totalRevenue / salesCount : 0,
    grossProfit: totalRevenue - Number(costRow?.cost ?? 0),
    monthRevenue,
    lastMonthRevenue,
    monthGrowth, // null => önceki ay verisi yok
    pendingOrdersCount: Number(pendingRow?.c ?? 0),
    returnedOrdersCount: Number(returnedRow?.c ?? 0),
    customersCount: allCustomers.length,
    criticalStockCount: allInv.filter((i) => Math.max(0, i.physicalQty - i.reservedQty) <= i.reorderPoint).length,
  };

  return (
    <>
      <StripQueryParam name="kt" />
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
      shifts={allShifts}
      dashboardStats={dashboardStats}
      currentRole={currentRole}
      currentUserName={currentUserName}
      currentRoleLabel={currentRoleLabel}
    />
    </>
  );
}
