import { randomUUID } from "node:crypto";
import { resolveActiveWarehouse } from "@/lib/warehouse-policy";
import { NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { validateCrmWriteAccess } from "@/lib/crm-write-access";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { roleCanAccessModule, readRoleMatrix } from "@/lib/role-matrix-server";
import { readCrmJson } from "@/lib/crm-write";
import { receiveGoods, returnToSupplier, fencePurchasingCommand, requirePurchasingInTransaction, SupplierOperationError } from "@/lib/supplier-operations";
import { supplierRatings } from "@/lib/supplier-rating-data";
import { StockShortage } from "@/lib/inventory-engine";
import {
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  goodsReceipts,
  goodsReceiptItems,
  warehouses,
  products,
  productVariants,
  inventory,
  orderItems,
  orders,
  auditLogs,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";

import { requireStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";

function enrichedPOs(allSuppliers: any[], allPOs: any[], allPOItems: any[], allProds: any[], allWh: any[], variants: any[]) {
  return allPOs.map((po: any) => {
    const sup = allSuppliers.find((s: any) => s.id === po.supplierId);
    const wh = allWh.find((w: any) => w.id === po.warehouseId);
    const items = allPOItems
      .filter((it: any) => it.purchaseOrderId === po.id)
      .map((it: any) => {
        const pr = allProds.find((p: any) => p.id === it.productId);
        const variant = variants.find((v: any) => v.id === it.variantId);
        return { ...it, productName: pr?.name || "Ürün", sku: variant?.sku || pr?.sku || "", variantName: variant ? [variant.colorName, variant.size, variant.length].filter(Boolean).join(" / ") : "" };
      });
    const receivedTotal = items.reduce((s: number, i: any) => s + (i.receivedQty || 0), 0);
    const orderedTotal = items.reduce((s: number, i: any) => s + i.quantity, 0);
    return {
      ...po,
      supplierName: sup?.name || "Tedarikçi",
      warehouseName: wh?.name || "Depo",
      items,
      progress: orderedTotal ? Math.round((receivedTotal / orderedTotal) * 100) : 0,
    };
  });
}

export async function GET(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;
  if (!roleCanAccessModule(await readRoleMatrix(), __gate.user.role, "purchasing")) return NextResponse.json({success:false,error:"Satın alma yetkiniz yok."},{status:403});

  try {
    const { searchParams } = new URL(request.url);
    const allSuppliers = await db.select().from(suppliers).orderBy(desc(suppliers.id));
    const allPOs = await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.id));
    const allPOItems = await db.select().from(purchaseOrderItems);
    const allProds = await db.select().from(products);
    const allWh = await db.select().from(warehouses);
    const allVariants = await db.select().from(productVariants);
    const allReceipts = await db.select().from(goodsReceipts).orderBy(desc(goodsReceipts.id));
    const receiptLines = sqlite.prepare(`SELECT ri.id,ri.receipt_id AS receiptId,ri.product_id AS productId,ri.variant_id AS variantId,ri.qty,
      p.name AS productName,COALESCE(v.sku,p.sku) AS sku,v.color_name AS colorName,v.size,v.length,COALESCE((SELECT SUM(sri.qty) FROM supplier_return_items sri WHERE sri.receipt_item_id=ri.id),0) AS returnedQty
      FROM goods_receipt_items ri LEFT JOIN products p ON p.id=ri.product_id LEFT JOIN product_variants v ON v.id=ri.variant_id`).all() as Array<{receiptId:number}>;
    const supplierReturnHistory = sqlite.prepare(`SELECT id,receipt_id AS receiptId,reason,created_at AS createdAt FROM supplier_returns ORDER BY id DESC`).all() as Array<{receiptId:number;createdAt:number}>;
    const receiptData = allReceipts.map(r=>({...r,items:receiptLines.filter(l=>l.receiptId===r.id),warehouseName:allWh.find(w=>w.id===r.warehouseId)?.name ?? `Depo #${r.warehouseId}`,returns:supplierReturnHistory.filter(x=>x.receiptId===r.id).map(x=>({...x,createdAt:new Date(x.createdAt*1000).toISOString()})),supplierName:allSuppliers.find(s=>s.id===allPOs.find(p=>p.id===r.purchaseOrderId)?.supplierId)?.name ?? 'Tedarikçi'}));

    // Reorder önerileri: kritik + satış hızı
    const allInv = await db.select().from(inventory);
    const allOrderItems = await db.select().from(orderItems);
    const allOrders = await db.select().from(orders);
    const since = Date.now() - 30 * 86400000;
    const recentItems = allOrderItems.filter((it) => {
      const o = allOrders.find((x) => x.id === it.orderId);
      return o && new Date(o.createdAt).getTime() >= since && o.status !== "CANCELLED" && o.paymentStatus === "PAID";
    });

    const salesByProduct = new Map<number, number>();
    for (const it of recentItems) {
      salesByProduct.set(it.productId, (salesByProduct.get(it.productId) || 0) + it.quantity);
    }

    const suggestions = allInv
      .map((inv) => {
        const p = allProds.find((x) => x.id === inv.productId);
        if (!p) return null;
        const available = inv.physicalQty - inv.reservedQty;
        const monthlySales = salesByProduct.get(inv.productId) || 0;
        const dailySales = monthlySales / 30;
        const leadTime = allSuppliers.find(s => s.isActive)?.leadTimeDays || 5;
        const reorderPoint = Math.ceil(dailySales * leadTime) + inv.minStock;
        const suggestedQty = Math.max(0, inv.maxStock - available);
        const isCritical = available <= inv.reorderPoint || available <= reorderPoint;
        // Tedarikçi eşleşmesi: ürün adında marka/tedarikçi ipucu yoksa ilk tedarikçi
        return {
          productId: inv.productId,
          productName: p.name,
          sku: p.sku,
          warehouseId: inv.warehouseId,
          warehouseName: allWh.find((w) => w.id === inv.warehouseId)?.name || "?",
          available,
          monthlySales,
          dailySales: Number(dailySales.toFixed(2)),
          reorderPoint,
          suggestedQty,
          estimatedCost: Number((suggestedQty * Number(p.buyPrice)).toFixed(2)),
          supplierId: allSuppliers.find(s => s.isActive)?.id || null,
          supplierName: allSuppliers.find(s => s.isActive)?.name || "—",
          isCritical,
          priority: available <= 0 ? "URGENT" : available <= inv.reorderPoint ? "HIGH" : "NORMAL",
        };
      })
      .filter((s) => s && (s.isCritical || s.suggestedQty > 0))
      .slice(0, 30) as any[];

    const ratings = supplierRatings(allSuppliers);
    const supplierPerf = allSuppliers.filter((s) => s.isActive).map((s) => {
      const pos = allPOs.filter((p) => p.supplierId === s.id);
      const received = pos.filter((p) => p.status === "RECEIVED").length;
      return {
        ...s,
        rating: ratings.get(s.id)?.score ?? null,
        ratingDetails: ratings.get(s.id),
        totalPOs: pos.length,
        completedPOs: received,
        completionRate: pos.length ? Math.round((received / pos.length) * 100) : null,
      };
    });

    const enriched = enrichedPOs(allSuppliers, allPOs, allPOItems, allProds, allWh, allVariants);

    return NextResponse.json({
      success: true,
      suppliers: supplierPerf,
      purchaseOrders: enriched,
      receipts: receiptData,
      suggestions,
      suggestionCount: suggestions.filter((s) => s.isCritical).length,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const invalid = await validateCrmWriteAccess(request, __gate.user);
  if (invalid) return invalid;
  if (!roleCanAccessModule(await readRoleMatrix(), __gate.user.role, "purchasing")) return NextResponse.json({success:false,error:"Satın alma yetkiniz yok."},{status:403});
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return NextResponse.json({success:false,error:"Geçersiz istek."},{status:422});
  try {
    const body = parsed.value as Record<string, any>;
    const { action } = body;

    /* ---------- TEDARİKÇİ CRUD ---------- */
    if (action === "CREATE_SUPPLIER" || action === "UPDATE_SUPPLIER") {
      if (Object.hasOwn(body, "rating")) return NextResponse.json({ success: false, error: "Puan elle girilemez." }, { status: 422 });
      const { id, name, contactPerson, phone, email, taxOffice, taxNumber, leadTimeDays, paymentTerms, address, isActive } = body;
      if (action === "CREATE_SUPPLIER") {
        if (!name?.trim()) return NextResponse.json({ success: false, error: "Firma adı zorunlu." }, { status: 422 });
        const [{ id: __created_id }] = await db.insert(suppliers).values({
            name: name.trim(),
            contactPerson: contactPerson || null,
            phone: phone || null,
            email: email || null,
            taxOffice: taxOffice || null,
            taxNumber: taxNumber || null,
            leadTimeDays: Number(leadTimeDays || 5),
            paymentTerms: typeof paymentTerms === "string" ? paymentTerms.trim() || null : null,
            rating: null,
            address: address || null,
          }).returning({ id: suppliers.id });
        const [created] = await db.select().from(suppliers).where(eq(suppliers.id, __created_id));
        return NextResponse.json({ success: true, data: created });
      }
      await db.update(suppliers).set({
          ...(name && { name: name.trim() }),
          contactPerson: contactPerson ?? undefined,
          phone: phone ?? undefined,
          email: email ?? undefined,
          leadTimeDays: leadTimeDays !== undefined ? Number(leadTimeDays) : undefined,
          paymentTerms: paymentTerms ?? undefined,
          isActive: typeof isActive === "boolean" ? isActive : undefined,
        }).where(eq(suppliers.id, Number(id)));
      const [updated] = await db.select().from(suppliers).where(eq(suppliers.id, Number(id)));
      return NextResponse.json({ success: true, data: updated });
    }

    /* ---------- DOĞRUDAN PO ---------- */
    if (action === "CREATE_PO") {
      const { supplierId, items = [], notes = "", expectedDate } = body;
      const warehouseId = resolveActiveWarehouse(body.warehouseId);
      if (!warehouseId) return NextResponse.json({success:false,error:"Geçerli ve aktif bir depo seçin."},{status:422});
      if (!Array.isArray(items) || !items.length || items.length > 100 || items.some((i: any) => !i || typeof i !== "object" || !Number.isSafeInteger(Number(i.quantity)) || Number(i.quantity) <= 0)) return NextResponse.json({success:false,error:"Geçerli sipariş kalemleri gerekli."},{status:422});
      if (expectedDate && (typeof expectedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expectedDate) || !Number.isFinite(Date.parse(expectedDate)) || new Date(expectedDate).toISOString().slice(0,10)!==expectedDate)) return NextResponse.json({success:false,error:"Geçerli beklenen teslim tarihi gerekli."},{status:422});
      const valid = items;
      if (!valid.length) return NextResponse.json({ success: false, error: "Kalem ekleyin." }, { status: 422 });
      const poNumber = `SAT-${randomUUID()}`;
      const totalAmount = valid.reduce((s: number, it: any) => s + Number(it.unitCost) * Number(it.quantity), 0);
      const newPo = sqlite.transaction(() => {
        requirePurchasingInTransaction(__gate.user);
        if (!sqlite.prepare("SELECT 1 FROM __migrations WHERE tag='0029_supplier_returns'").get()) throw new SupplierOperationError("Tedarikçi işlem güncellemesi uygulanmamış.",503);
        if (!resolveActiveWarehouse(warehouseId)) throw new SupplierOperationError("Depo aktif değil.");
        const supplier = db.select().from(suppliers).where(eq(suppliers.id, Number(supplierId))).get();
        if (!supplier?.isActive) return null;
        const created = db.insert(purchaseOrders).values({ poNumber, supplierId: supplier.id, warehouseId: Number(warehouseId), status: "ORDERED", totalAmount: String(totalAmount), notes, expectedDate }).returning().get();
        for (const item of valid) {
          if (!Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unitCost)) || Number(item.unitCost)<0 || !sqlite.prepare('SELECT 1 FROM products WHERE id=?').get(Number(item.productId))) throw new SupplierOperationError("Geçersiz sipariş kalemi.",422);
          if (item.variantId && !sqlite.prepare('SELECT 1 FROM product_variants WHERE id=? AND product_id=?').get(Number(item.variantId),Number(item.productId))) throw new SupplierOperationError("Geçersiz ürün varyantı.",422);
          db.insert(purchaseOrderItems).values({
          purchaseOrderId: created.id, productId: Number(item.productId), variantId: item.variantId ? Number(item.variantId) : null,
          quantity: Number(item.quantity), unitCost: String(item.unitCost), receivedQty: 0,
          totalCost: String(Number(item.unitCost) * Number(item.quantity)),
          }).run();
        }
        sqlite.prepare('INSERT INTO supplier_order_coverage(purchase_order_id,expected_date) VALUES(?,?)').run(created.id, expectedDate || null);
        return created;
      }).immediate();
      if (!newPo) return NextResponse.json({success:false,error:"Aktif tedarikçi bulunamadı."},{status:409});
      return NextResponse.json({ success: true, data: newPo });
    }

    if (action === "CANCEL_PO") {
      const po = sqlite.transaction(() => {
        requirePurchasingInTransaction(__gate.user);
        const current = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, Number(body.purchaseOrderId))).get();
        if (!current || !["ORDERED","APPROVED","PARTIAL"].includes(current.status)) throw new SupplierOperationError("Bu sipariş iptal edilemez.");
        return db.update(purchaseOrders).set({status:"CANCELLED"}).where(eq(purchaseOrders.id,current.id)).returning().get();
      }).immediate();
      return NextResponse.json({ success: true, data: po });
    }

    if (action === "RECEIVE_GOODS") return NextResponse.json({success:true,data:receiveGoods(__gate.user,body)});
    if (action === "RETURN_TO_SUPPLIER") return NextResponse.json({success:true,data:returnToSupplier(__gate.user,body)});
    if (action === "FENCE_PURCHASING") return NextResponse.json({success:true,data:fencePurchasingCommand(__gate.user,body)});

    return NextResponse.json({ success: false, error: "Bilinmeyen eylem." }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof SupplierOperationError) return NextResponse.json({success:false,error:err.message},{status:err.status});
    if (err instanceof StockShortage) return NextResponse.json({success:false,error:err.message},{status:409});
    console.error("Suppliers API error:", err instanceof Error ? err.name : 'Unknown');
    return NextResponse.json({ success: false, error: "İşlem tamamlanamadı; kayıtlar kontrol edilmeli." }, { status: 500 });
  }
}

/** Geçmişi olan firmalar arşivlenir; geçmişi olmayanlar atomik olarak silinir. */
export async function DELETE(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const invalid = await validateCrmWriteAccess(request, gate.user);
  if (invalid) return invalid;
  const raw = new URL(request.url).searchParams.get("id");
  const id = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({success:false,error:"Geçerli tedarikçi numarası gerekli."},{status:422});
  try {
    const result = sqlite.transaction(() => {
      const actor = sqlite.prepare("SELECT role,is_active FROM users WHERE id=?").get(gate.user.id) as {role:string;is_active:number}|undefined;
      const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string}|undefined;
      let matrix:unknown = null;
      try { if (setting?.value) matrix = JSON.parse(setting.value); } catch { /* varsayılan matris */ }
      if (!actor?.is_active || actor.role !== gate.user.role || !roleCanAccessModule(normalizeRoleMatrix(matrix),actor.role,"purchasing")) return {status:403, error:"Satın alma yetkiniz yok."};
      const supplier = sqlite.prepare("SELECT id,name,is_active FROM suppliers WHERE id=?").get(id) as {id:number;name:string;is_active:number}|undefined;
      if (!supplier) return {status:404,error:"Tedarikçi bulunamadı."};
      // Future schema references as well as current supplier and opportunity links.
      const quote = (value:string) => '"' + value.replace(/"/g,'""') + '"';
      const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];
      let linked = false;
      for (const {name} of tables) {
        if (name === 'suppliers' || name === 'audit_logs') continue;
        const cols = (sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all() as {name:string}[]).map(c=>c.name);
        const fks = sqlite.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as {table:string;from:string}[];
        const refs = [...new Set([...['supplier_id','related_supplier_id'].filter(c=>cols.includes(c)),...fks.filter(f=>f.table==='suppliers').map(f=>f.from)])];
        if (refs.some(c=>!!sqlite.prepare(`SELECT 1 FROM ${quote(name)} WHERE ${quote(c)}=? LIMIT 1`).get(id))) { linked=true; break; }
        if (cols.includes('related_entity_type') && cols.includes('related_entity_id') && sqlite.prepare(`SELECT 1 FROM ${quote(name)} WHERE related_entity_type='SUPPLIER' AND related_entity_id=? LIMIT 1`).get(id)) { linked=true; break; }
      }
      if (linked) sqlite.prepare("UPDATE suppliers SET is_active=0 WHERE id=?").run(id);
      else sqlite.prepare("DELETE FROM suppliers WHERE id=?").run(id);
      sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,?,?,?,?)").run(String(gate.user.id),gate.user.name,linked?'SUPPLIER_ARCHIVED':'SUPPLIER_DELETED','Supplier',String(id),JSON.stringify({name:supplier.name}));
      return {status:200,mode:linked?'archived':'deleted'};
    }).immediate();
    if (result.status !== 200) return NextResponse.json({success:false,error:result.error},{status:result.status});
    return NextResponse.json({success:true,mode:result.mode});
  } catch (error) {
    console.error("Supplier delete failed",error instanceof Error ? error.name : "Unknown");
    return NextResponse.json({success:false,error:"Tedarikçi kaldırılamadı; kayıtlar değiştirilmedi."},{status:500});
  }
}
