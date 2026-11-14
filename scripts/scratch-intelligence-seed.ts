/**
 * SCRATCH test verisi üretici — YALNIZCA "scratch" içeren DATABASE_URL ile çalışır.
 * Canlı DB'ye asla dokunmaz. Sentetik, deterministik (tohumlu PRNG) veri üretir.
 */
import "dotenv/config";
import { db } from "../src/db";
import {
  users,
  categories,
  brands,
  products,
  warehouses,
  inventory,
  customers,
  orders,
  orderItems,
  orderReturns,
  orderReturnItems,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

const url = process.env.DATABASE_URL || "";
if (!url.includes("scratch")) {
  console.error("GÜVENLİK: Bu script yalnızca 'scratch' içeren DATABASE_URL ile çalışır. Çıkılıyor.");
  process.exit(1);
}

// Deterministik PRNG (mulberry32)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261112);

async function main() {
  console.log("Scratch seed başlıyor:", url);

  const [cat] = await db.insert(categories).values({ name: "Örgü İpleri", slug: "orgu-ipleri-scratch", displayOrder: 1 }).returning({ id: categories.id });
  const [cat2] = await db.insert(categories).values({ name: "Dikiş Malzemeleri", slug: "dikis-malzemeleri-scratch", displayOrder: 2 }).returning({ id: categories.id });
  const [brand] = await db.insert(brands).values({ name: "Scratch İplik A.Ş.", slug: "scratch-iplik" }).returning({ id: brands.id });
  const [wh] = await db.insert(warehouses).values({ name: "Scratch Merkez Depo", code: "SCRATCH-MRK", type: "CENTRAL" }).returning({ id: warehouses.id });

  // 10 ürün: P1 baskın, P10 maliyetsiz (N/A testi), kalan maliyetli
  const productIds: number[] = [];
  for (let i = 1; i <= 10; i++) {
    const [p] = await db
      .insert(products)
      .values({
        name: `Scratch Ürün ${i}`,
        slug: `scratch-urun-${i}`,
        sku: `SCR-${String(i).padStart(4, "0")}`,
        categoryId: i % 2 === 0 ? cat2.id : cat.id,
        brandId: brand.id,
        buyPrice: i === 10 ? "0.00" : String((20 + i * 15).toFixed(2)),
        retailPrice: String((60 + i * 30).toFixed(2)),
        isActive: true,
      })
      .returning({ id: products.id });
    productIds.push(p.id);
    await db.insert(inventory).values({ productId: p.id, variantId: null, warehouseId: wh.id, physicalQty: 50 + i * 20, reservedQty: i * 2 });
  }

  // 30 müşteri
  const custIds: number[] = [];
  for (let i = 1; i <= 30; i++) {
    const [c] = await db
      .insert(customers)
      .values({ type: "B2C", name: `Scratch Müşteri ${i}`, email: `scratch${i}@example.com`, phone: `0555 000 ${String(i).padStart(2, "0")} 00`, createdAt: new Date(Date.now() - Math.floor(rand() * 300 + 30) * 86400000) })
      .returning({ id: customers.id });
    custIds.push(c.id);
  }

  // 140 gün geçmişe, günde 2-7 sipariş, hafta sonu yoğunluğu
  let orderId = 0;
  const start = new Date();
  start.setDate(start.getDate() - 139);
  for (let d = 0; d < 140; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    date.setHours(10 + Math.floor(rand() * 8), Math.floor(rand() * 60), 0, 0);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const base = isWeekend ? 5 : 2;
    const dayOrders = base + Math.floor(rand() * 3);
    for (let k = 0; k < dayOrders; k++) {
      orderId++;
      const grandTotalSeed = 150 + Math.floor(rand() * 850);
      // baskın ürün P1, ikincil P2, uzun kuyruk P3-P9
      const lineCount = 1 + Math.floor(rand() * 2);
      const lines: Array<{ productId: number; qty: number; unitPrice: number }> = [];
      let subtotal = 0;
      for (let li = 0; li < lineCount; li++) {
        const r = rand();
        const pid = r < 0.4 ? 1 : r < 0.6 ? 2 : r < 0.78 ? 3 : r < 0.9 ? 5 : 7;
        const qty = 1 + Math.floor(rand() * 3);
        const unitPrice = 60 + pid * 30;
        subtotal += qty * unitPrice;
        lines.push({ productId: productIds[pid - 1], qty, unitPrice });
      }
      const discount = rand() < 0.3 ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
      const grandTotal = subtotal - discount;
      const status = rand() < 0.02 ? "REFUNDED" : rand() < 0.01 ? "CANCELLED" : "DELIVERED";
      const [o] = await db
        .insert(orders)
        .values({
          orderNumber: `SCR-2026-${String(orderId).padStart(5, "0")}`,
          orderType: rand() < 0.6 ? "ONLINE_B2C" : "POS",
          customerId: custIds[Math.floor(rand() * custIds.length)],
          customerName: "Scratch Müşteri",
          status,
          paymentStatus: status === "REFUNDED" ? "REFUNDED" : "PAID",
          paymentMethod: "CREDIT_CARD",
          subtotal: subtotal.toFixed(2),
          discountTotal: discount.toFixed(2),
          taxTotal: "0.00",
          shippingTotal: "0.00",
          grandTotal: grandTotal.toFixed(2),
          createdAt: date,
        })
        .returning({ id: orders.id });
      for (const line of lines) {
        await db.insert(orderItems).values({
          orderId: o.id,
          productId: line.productId,
          variantId: null,
          productName: `Scratch Ürün`,
          sku: `SCR-LINE`,
          unitPrice: line.unitPrice.toFixed(2),
          quantity: line.qty,
          taxRate: 20,
          totalPrice: (line.unitPrice * line.qty).toFixed(2),
        });
      }
    }
  }

  // Bir iade kaydı (REFUNDED durumunda, kalem bazlı)
  const [firstOrder] = await db.select().from(orders).limit(1);
  if (firstOrder) {
    const [ret] = await db
      .insert(orderReturns)
      .values({ returnNumber: "IAD-SCR-001", orderId: firstOrder.id, orderNumber: firstOrder.orderNumber, status: "REFUNDED", refundAmount: "50.00", restock: true })
      .returning({ id: orderReturns.id });
    const itemRows = await db.select().from(orderItems).limit(1);
    if (itemRows[0]) {
      await db.insert(orderReturnItems).values({ returnId: ret.id, orderItemId: itemRows[0].id, productId: itemRows[0].productId, productName: "Scratch Ürün", quantity: 1, refundAmount: "50.00" });
    }
  }

  // Scratch admin (SUPER_ADMIN) — GERÇEK parolayı bilmiyoruz; scratch'a özgü parola
  await db.insert(users).values({
    email: "qa-admin@scratch.test",
    passwordHash: hashPassword("Serpilen2026!"),
    name: "QA Scratch Admin",
    role: "SUPER_ADMIN",
    isActive: true,
  });

  const orderCount = (await db.select().from(orders)).length;
  console.log(`Scratch seed tamam: ${orderId} sipariş, 30 müşteri, 10 ürün, 1 admin (qa-admin@scratch.test)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
