import { NextResponse } from "next/server";
import { db } from "@/db";
import { erpSyncLogs, erpSyncJobs, customers, orders, orderItems, inventory, products, warehouses, purchaseOrders, auditLogs } from "@/db/schema";
import { erpAdapter, ERP_PROVIDERS, ErpProviderType } from "@/lib/erp-adapter";
import { desc, eq, and, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entityTypeFilter = searchParams.get("entityType");
    const statusFilter = searchParams.get("status");
    const limit = Math.min(100, Number(searchParams.get("limit") || 50));

    let query = db.select().from(erpSyncLogs).orderBy(desc(erpSyncLogs.id)).limit(limit);
    let logs = await query;

    if (entityTypeFilter && entityTypeFilter !== "ALL") {
      logs = logs.filter((l) => l.entityType === entityTypeFilter);
    }
    if (statusFilter && statusFilter !== "ALL") {
      logs = logs.filter((l) => l.status === statusFilter);
    }

    const allLogs = await db.select().from(erpSyncLogs);
    const totalCount = allLogs.length;
    const successCount = allLogs.filter((l) => l.status === "SUCCESS").length;
    const failedCount = allLogs.filter((l) => l.status === "FAILED").length;
    const pendingCount = allLogs.filter((l) => l.status === "PENDING" || l.status === "RETRYING").length;

    // Varlık bazlı dağılım
    const byEntity = {
      CUSTOMER: allLogs.filter((l) => l.entityType === "CUSTOMER").length,
      INVOICE: allLogs.filter((l) => l.entityType === "INVOICE").length,
      PURCHASE_INVOICE: allLogs.filter((l) => l.entityType === "PURCHASE_INVOICE").length,
      PAYMENT: allLogs.filter((l) => l.entityType === "PAYMENT").length,
      STOCK: allLogs.filter((l) => l.entityType === "STOCK").length,
      RECEIPT: allLogs.filter((l) => l.entityType === "RECEIPT").length,
    };

    const health = await erpAdapter.healthCheck();

    return NextResponse.json({
      success: true,
      currentProvider: erpAdapter.getProvider(),
      availableProviders: Object.values(ERP_PROVIDERS),
      health,
      stats: {
        total: totalCount,
        success: successCount,
        failed: failedCount,
        pending: pendingCount,
        successRate: totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100,
        byEntity,
      },
      logs,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // 1. SAĞLAYICI SEÇİMİ
    if (action === "SET_PROVIDER") {
      const provider = body.provider as ErpProviderType;
      if (!ERP_PROVIDERS[provider]) {
        return NextResponse.json({ success: false, error: "Geçersiz ERP sağlayıcısı." }, { status: 400 });
      }
      erpAdapter.setProvider(provider);
      const meta = erpAdapter.getProvider();

      await db.insert(auditLogs).values({
        userId: "1",
        userName: "Yönetici",
        action: "ERP_PROVIDER_CHANGED",
        entity: "ErpProvider",
        entityId: provider,
        details: `Aktif ERP entegratörü "${meta.name}" olarak ayarlandı.`,
      });

      return NextResponse.json({
        success: true,
        message: `Aktif ERP sağlayıcısı "${meta.name}" olarak değiştirildi.`,
        currentProvider: meta,
      });
    }

    // 2. TÜM CARİLERİ AKTAR
    if (action === "SYNC_ALL_CUSTOMERS") {
      const allCustomers = await db.select().from(customers);
      const results = [];
      for (const c of allCustomers) {
        const res = await erpAdapter.syncCustomer({
          customerId: c.id,
          customerName: c.name,
          companyName: c.companyName,
          taxNumber: c.taxNumber,
          taxOffice: c.taxOffice,
          email: c.email,
          phone: c.phone,
          address: c.address,
          city: c.city,
          balance: c.balance || "0.00",
        });
        results.push(res);
      }

      return NextResponse.json({
        success: true,
        message: `${allCustomers.length} adet cari kartı (${erpAdapter.getProvider().name}) sistemine başarıyla senkronize edildi.`,
        syncedCount: results.length,
      });
    }

    // 3. TÜM SİPARİŞLERİN FATURALARINI TOPLU AKTAR
    if (action === "SYNC_ALL_INVOICES") {
      const allOrders = await db.select().from(orders);
      const allItems = await db.select().from(orderItems);
      const results = [];

      for (const order of allOrders) {
        const items = allItems.filter((it) => it.orderId === order.id);
        const res = await erpAdapter.createInvoice({
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          total: Number(order.grandTotal),
          tax: Number(order.taxTotal),
          items: items.map((it) => ({
            name: it.productName,
            sku: it.sku,
            barcode: it.barcode || undefined,
            quantity: it.quantity,
            price: Number(it.unitPrice),
            total: Number(it.totalPrice),
          })),
        });
        results.push(res);
      }

      return NextResponse.json({
        success: true,
        message: `${allOrders.length} adet sipariş faturası ERP sistemine tanzim edildi.`,
        syncedCount: results.length,
      });
    }

    // 4. DEPO STOKLARINI EŞİTLE
    if (action === "SYNC_STOCK_LEVELS") {
      const allInv = await db.select().from(inventory);
      const allProds = await db.select().from(products);
      const allWh = await db.select().from(warehouses);
      let count = 0;

      for (const inv of allInv) {
        const prod = allProds.find((p) => p.id === inv.productId);
        const wh = allWh.find((w) => w.id === inv.warehouseId);
        if (prod && wh) {
          await erpAdapter.syncStock({
            sku: prod.sku,
            productName: prod.name,
            physicalQty: inv.physicalQty,
            warehouseCode: wh.code,
            unit: prod.unit,
          });
          count++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `${count} adet depo stok kalemi ERP ambar kartlarıyla senkronize edildi.`,
        syncedCount: count,
      });
    }

    // 5. BAŞARISIZ KAYDI YENİDEN DENE (RETRY)
    if (action === "RETRY_LOG") {
      const logId = Number(body.logId);
      if (!logId) {
        return NextResponse.json({ success: false, error: "Log ID zorunludur." }, { status: 400 });
      }

      const res = await erpAdapter.retrySyncLog(logId);
      return NextResponse.json({
        success: true,
        message: `İşlem #${logId} başarıyla yeniden denendi.`,
        data: res,
      });
    }

    // 6. TEST SENARYOSU: HATA SİMÜLASYONU
    if (action === "SIMULATE_FAILURE") {
      const entityType = body.entityType || "INVOICE";
      const entityId = body.entityId || `TEST-${Date.now().toString().slice(-5)}`;
      const errorMsg = body.errorMsg || "GİB e-Fatura Portal Zaman Aşımı (Timeout: 504 Gateway Timeout)";

      const [{ id: __log_id }] = await db.insert(erpSyncLogs).values({
          provider: erpAdapter.getProvider().id,
          entityType,
          entityId,
          action: "SYNC_ERROR",
          status: "FAILED",
          retryCount: 0,
          errorMessage: errorMsg,
          payload: JSON.stringify({ entityId, test: true, timestamp: new Date().toISOString() }),
          response: JSON.stringify({ error: errorMsg, code: 504 }),
        }).$returningId();
      const [log] = await db.select().from(erpSyncLogs).where(eq(erpSyncLogs.id, __log_id));

      return NextResponse.json({
        success: true,
        message: "Hata senaryosu kaydedildi. Retry mekanizmasını test edebilirsiniz.",
        data: log,
      });
    }

    // 7. ANLIK SAĞLIK PING TESTİ
    if (action === "HEALTH_CHECK") {
      const health = await erpAdapter.healthCheck();
      return NextResponse.json({ success: true, data: health });
    }

    return NextResponse.json({ success: false, error: "Bilinmeyen eylem." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
