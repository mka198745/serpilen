import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  orders,
  orderItems,
  products,
  productVariants,
  brands,
  categories,
  customers,
  inventory,
  inventoryLedger,
  warehouses,
  orderReturns,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function toCsv(headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\r\n");
}

const DAYS = (n: number) => Date.now() - n * 86400000;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days") || 30);
    const format = searchParams.get("format"); // csv
    const exportType = searchParams.get("export"); // sales | products | stock | customers | finance
    const since = new Date(DAYS(days));

    const allOrders = await db.select().from(orders);
    const allItems = await db.select().from(orderItems);
    const allProds = await db.select().from(products);
    const allVars = await db.select().from(productVariants);
    const allBrands = await db.select().from(brands);
    const allCats = await db.select().from(categories);
    const allCusts = await db.select().from(customers);
    const allInv = await db.select().from(inventory);
    const allWh = await db.select().from(warehouses);
    const returns = await db.select().from(orderReturns);

    const periodOrders = allOrders.filter((o) => new Date(o.createdAt) >= since);
    const validOrders = periodOrders.filter((o) => !["CANCELLED"].includes(o.status));

    /* ---------- 1. SATIŞ RAPORU ---------- */
    const revenue = validOrders.reduce((s, o) => s + Number(o.grandTotal), 0);
    const discounts = validOrders.reduce((s, o) => s + Number(o.discountTotal), 0);
    const shipping = validOrders.reduce((s, o) => s + Number(o.shippingTotal), 0);

    const byChannel = (["ONLINE_B2C", "POS", "B2B"] as const).map((ch) => {
      const list = validOrders.filter((o) => o.orderType === ch);
      const rev = list.reduce((s, o) => s + Number(o.grandTotal), 0);
      return { channel: ch, count: list.length, revenue: Number(rev.toFixed(2)), share: revenue ? Number(((rev / revenue) * 100).toFixed(1)) : 0 };
    });

    const byDay: Record<string, number> = {};
    for (const o of validOrders) {
      const d = new Date(o.createdAt).toISOString().slice(0, 10);
      byDay[d] = (byDay[d] || 0) + Number(o.grandTotal);
    }
    const dailySeries = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total: Number(total.toFixed(2)) }));

    /* ---------- 2. ÜRÜN PERFORMANSI ---------- */
    const periodItemRows = allItems.filter((it) => {
      const o = allOrders.find((x) => x.id === it.orderId);
      return o && new Date(o.createdAt) >= since && !["CANCELLED"].includes(o.status);
    });

    const productAgg = new Map<number, { qty: number; revenue: number; cost: number }>();
    for (const it of periodItemRows) {
      const cur = productAgg.get(it.productId) || { qty: 0, revenue: 0, cost: 0 };
      cur.qty += it.quantity;
      cur.revenue += Number(it.totalPrice);
      const p = allProds.find((x) => x.id === it.productId);
      cur.cost += Number(p?.buyPrice || 0) * it.quantity;
      productAgg.set(it.productId, cur);
    }

    const productPerf = [...productAgg.entries()]
      .map(([pid, v]) => {
        const p = allProds.find((x) => x.id === pid);
        const grossProfit = v.revenue - v.cost;
        return {
          productId: pid,
          productName: p?.name || "?",
          sku: p?.sku || "",
          brandName: allBrands.find((b) => b.id === p?.brandId)?.name || "—",
          categoryName: allCats.find((c) => c.id === p?.categoryId)?.name || "—",
          qtySold: v.qty,
          revenue: Number(v.revenue.toFixed(2)),
          cost: Number(v.cost.toFixed(2)),
          grossProfit: Number(grossProfit.toFixed(2)),
          margin: v.revenue ? Number(((grossProfit / v.revenue) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // Ölü stok (dead stock): hiç satılmamış ve 60+ gün bekleyen
    const deadStock = allInv
      .filter((i) => !productAgg.has(i.productId) && i.physicalQty > 0)
      .map((i) => {
        const p = allProds.find((x) => x.id === i.productId);
        return {
          productName: p?.name || "?",
          sku: p?.sku || "",
          warehouseName: allWh.find((w) => w.id === i.warehouseId)?.name || "?",
          physicalQty: i.physicalQty,
          stockValue: Number((i.physicalQty * Number(p?.buyPrice || 0)).toFixed(2)),
          daysInStock: Math.max(0, Math.round((Date.now() - new Date(i.updatedAt).getTime()) / 86400000)),
        };
      })
      .sort((a, b) => b.stockValue - a.stockValue);

    /* ---------- 3. STOK RAPORU ---------- */
    const totalStockValue = allInv.reduce((s, i) => {
      const p = allProds.find((x) => x.id === i.productId);
      return s + i.physicalQty * Number(p?.buyPrice || 0);
    }, 0);

    const criticalStock = allInv
      .filter((i) => i.physicalQty - i.reservedQty <= i.reorderPoint)
      .map((i) => ({
        productName: allProds.find((p) => p.id === i.productId)?.name || "?",
        sku: allProds.find((p) => p.id === i.productId)?.sku || "",
        warehouseName: allWh.find((w) => w.id === i.warehouseId)?.name || "?",
        available: Math.max(0, i.physicalQty - i.reservedQty),
        reorderPoint: i.reorderPoint,
      }));

    const byWarehouse = allWh.map((w) => {
      const rows = allInv.filter((i) => i.warehouseId === w.id);
      return {
        warehouse: w.name,
        code: w.code,
        skuCount: rows.length,
        totalQty: rows.reduce((s, i) => s + i.physicalQty, 0),
        stockValue: Number(rows.reduce((s, i) => s + i.physicalQty * Number(allProds.find((p) => p.id === i.productId)?.buyPrice || 0), 0).toFixed(2)),
      };
    });

    // Stok devir hızı (yıllıklandırılmış)
    const soldQty = periodItemRows.reduce((s, it) => s + it.quantity, 0);
    const totalQty = allInv.reduce((s, i) => s + i.physicalQty, 0);
    const turnover = totalQty ? Number((((soldQty * 365) / days) / totalQty).toFixed(2)) : 0;

    /* ---------- 4. MÜŞTERİ RAPORU ---------- */
    const custAgg = new Map<number, { orders: number; spend: number; last: Date }>();
    for (const o of validOrders) {
      if (!o.customerId) continue;
      const cur = custAgg.get(o.customerId) || { orders: 0, spend: 0, last: new Date(o.createdAt) };
      cur.orders += 1;
      cur.spend += Number(o.grandTotal);
      if (new Date(o.createdAt) > cur.last) cur.last = new Date(o.createdAt);
      custAgg.set(o.customerId, cur);
    }

    const custReport = allCusts
      .map((c) => {
        const agg = custAgg.get(c.id);
        const daysSince = agg ? Math.floor((Date.now() - agg.last.getTime()) / 86400000) : null;
        const ltv = agg?.spend || 0;
        return {
          name: c.name,
          type: c.type,
          segment: c.segment || "YENİ",
          phone: c.phone,
          loyaltyPoints: c.loyaltyPoints,
          orderCount: agg?.orders || 0,
          totalSpend: Number(ltv.toFixed(2)),
          avgBasket: agg && agg.orders ? Number((agg.spend / agg.orders).toFixed(2)) : 0,
          lastOrderDaysAgo: daysSince,
          activity: !agg ? "YENİ" : daysSince !== null && daysSince > 60 ? "PASİF" : daysSince !== null && daysSince <= 30 ? "AKTİF" : "ORTA",
        };
      })
      .sort((a, b) => b.totalSpend - a.totalSpend);

    const newCustomers = custReport.filter((c) => c.orderCount === 0).length;
    const activeCustomers = custReport.filter((c) => c.activity === "AKTİF").length;
    const passiveCustomers = custReport.filter((c) => c.activity === "PASİF").length;
    const vipCustomers = custReport.filter((c) => c.totalSpend >= 1000 || c.segment === "VIP" || c.segment === "VİP").length;

    /* ---------- 5. FİNANSAL RAPOR ---------- */
    const cogs = productPerf.reduce((s, p) => s + p.cost, 0);
    const grossProfit = revenue - cogs;
    const refundTotal = returns.reduce((s, r) => s + Number(r.refundAmount), 0);

    const finance = {
      revenue: Number(revenue.toFixed(2)),
      cogs: Number(cogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      margin: revenue ? Number(((grossProfit / revenue) * 100).toFixed(1)) : 0,
      discounts: Number(discounts.toFixed(2)),
      shipping: Number(shipping.toFixed(2)),
      returns: Number(refundTotal.toFixed(2)),
      orderCount: validOrders.length,
      avgBasket: validOrders.length ? Number((revenue / validOrders.length).toFixed(2)) : 0,
    };

    /* ---------- CSV DIŞA AKTARMA ---------- */
    if (format === "csv") {
      let csv = "";
      if (exportType === "sales") csv = toCsv(["Tarih", "Ciro (TL)"], dailySeries.map((d) => [d.date, d.total]));
      else if (exportType === "products")
        csv = toCsv(
          ["Ürün", "SKU", "Marka", "Kategori", "Satılan Adet", "Ciro", "Maliyet", "Brüt Kâr", "Marj %"],
          productPerf.map((p) => [p.productName, p.sku, p.brandName, p.categoryName, p.qtySold, p.revenue, p.cost, p.grossProfit, p.margin])
        );
      else if (exportType === "stock")
        csv = toCsv(
          ["Ürün", "SKU", "Depo", "Fiziksel", "Rezerve", "Kullanılabilir", "Yeniden Sipariş Noktası"],
          allInv.map((i) => {
            const p = allProds.find((x) => x.id === i.productId);
            return [p?.name || "?", p?.sku || "", allWh.find((w) => w.id === i.warehouseId)?.name || "?", i.physicalQty, i.reservedQty, Math.max(0, i.physicalQty - i.reservedQty), i.reorderPoint];
          })
        );
      else if (exportType === "customers")
        csv = toCsv(
          ["Müşteri", "Tip", "Segment", "Telefon", "Sipariş", "Toplam Harcama", "Ortalama Sepet", "Son Sipariş (gün)", "Aktivite"],
          custReport.map((c) => [c.name, c.type, c.segment, c.phone, c.orderCount, c.totalSpend, c.avgBasket, c.lastOrderDaysAgo ?? "-", c.activity])
        );
      else if (exportType === "finance")
        csv = toCsv(
          ["Metrik", "Değer"],
          [
            ["Ciro", finance.revenue],
            ["SMM (COGS)", finance.cogs],
            ["Brüt Kâr", finance.grossProfit],
            ["Brüt Marj %", finance.margin],
            ["İndirimler", finance.discounts],
            ["Kargo Geliri", finance.shipping],
            ["İadeler", finance.returns],
            ["Sipariş Sayısı", finance.orderCount],
            ["Ortalama Sepet", finance.avgBasket],
          ]
        );

      return new NextResponse("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${exportType || "rapor"}-${days}gun.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      period: { days, since: since.toISOString(), orderCount: validOrders.length },
      sales: {
        revenue: Number(revenue.toFixed(2)),
        discounts: Number(discounts.toFixed(2)),
        byChannel,
        dailySeries,
        today: Number((validOrders.filter((o) => new Date(o.createdAt).toDateString() === new Date().toDateString()).reduce((s, o) => s + Number(o.grandTotal), 0)).toFixed(2)),
      },
      products: {
        topSellers: productPerf.slice(0, 10),
        worstSellers: [...productPerf].reverse().slice(0, 5),
        mostProfitable: [...productPerf].sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 5),
        deadStock: deadStock.slice(0, 10),
        deadStockValue: Number(deadStock.reduce((s, d) => s + d.stockValue, 0).toFixed(2)),
      },
      stock: {
        totalStockValue: Number(totalStockValue.toFixed(2)),
        criticalCount: criticalStock.length,
        critical: criticalStock.slice(0, 10),
        byWarehouse,
        turnover,
        totalQty,
      },
      customers: {
        total: allCusts.length,
        newCount: newCustomers,
        activeCount: activeCustomers,
        passiveCount: passiveCustomers,
        vipCount: vipCustomers,
        top: custReport.slice(0, 10),
      },
      finance,
    });
  } catch (error: any) {
    console.error("Reports error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
