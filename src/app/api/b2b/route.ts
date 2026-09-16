import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers, accountTransactions, orders, priceLists, auditLogs } from "@/db/schema";
import { checkCredit } from "@/lib/pricing-engine";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statementFor = searchParams.get("statement");

    // Cari ekstre (tek müşteri)
    if (statementFor) {
      const id = Number(statementFor);
      const [c] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
      if (!c) return NextResponse.json({ success: false, error: "Cari bulunamadı." }, { status: 404 });

      const txs = await db.select().from(accountTransactions).where(eq(accountTransactions.customerId, id)).orderBy(desc(accountTransactions.id));
      const myOrders = await db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.id));

      const now = Date.now();
      const openDebits = txs.filter((t) => t.type === "DEBIT" && !t.paidAt);
      const overdue = openDebits.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now);
      const overdueTotal = overdue.reduce((s, t) => s + Number(t.amount), 0);

      // Yaşlandırma (aging) analizi
      const buckets = { current: 0, d30: 0, d60: 0, d90plus: 0 };
      for (const t of openDebits) {
        const days = t.dueDate ? Math.floor((now - new Date(t.dueDate).getTime()) / 86400000) : 0;
        const amt = Number(t.amount);
        if (days <= 0) buckets.current += amt;
        else if (days <= 30) buckets.d30 += amt;
        else if (days <= 60) buckets.d60 += amt;
        else buckets.d90plus += amt;
      }

      return NextResponse.json({
        success: true,
        customer: c,
        summary: {
          balance: Number(c.balance || 0),
          creditLimit: Number(c.creditLimit || 0),
          availableCredit: Number(c.creditLimit || 0) - Number(c.balance || 0),
          paymentTermDays: c.paymentTermDays,
          overdueTotal: Number(overdueTotal.toFixed(2)),
          overdueCount: overdue.length,
          orderCount: myOrders.length,
          aging: {
            current: Number(buckets.current.toFixed(2)),
            d30: Number(buckets.d30.toFixed(2)),
            d60: Number(buckets.d60.toFixed(2)),
            d90plus: Number(buckets.d90plus.toFixed(2)),
          },
        },
        transactions: txs.map((t) => ({
          ...t,
          createdAt: new Date(t.createdAt).toISOString(),
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          paidAt: t.paidAt ? new Date(t.paidAt).toISOString() : null,
          isOverdue: t.type === "DEBIT" && !t.paidAt && t.dueDate ? new Date(t.dueDate).getTime() < now : false,
        })),
      });
    }

    // Tüm B2B cariler + risk özeti
    const b2bCustomers = await db.select().from(customers).where(eq(customers.type, "B2B")).orderBy(desc(customers.id));
    const lists = await db.select().from(priceLists);
    const allTx = await db.select().from(accountTransactions);
    const now = Date.now();

    const enriched = b2bCustomers.map((c) => {
      const open = allTx.filter((t) => t.customerId === c.id && t.type === "DEBIT" && !t.paidAt);
      const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now);
      const balance = Number(c.balance || 0);
      const limit = Number(c.creditLimit || 0);
      const usage = limit > 0 ? Math.round((balance / limit) * 100) : 0;
      return {
        ...c,
        priceListName: lists.find((l) => l.id === c.priceListId)?.name || "Varsayılan",
        priceListCode: lists.find((l) => l.id === c.priceListId)?.code || null,
        availableCredit: Number((limit - balance).toFixed(2)),
        creditUsagePercent: usage,
        overdueTotal: Number(overdue.reduce((s, t) => s + Number(t.amount), 0).toFixed(2)),
        overdueCount: overdue.length,
        riskLevel: c.isBlocked ? "KAPALI" : overdue.length > 0 ? "RİSKLİ" : usage >= 90 ? "LİMİT DOLU" : usage >= 70 ? "İZLEMEDE" : "İYİ",
      };
    });

    return NextResponse.json({ success: true, data: enriched, priceLists: lists });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action = "CREATE" } = body;

    // Kredi limiti ön kontrolü (B2B checkout öncesi)
    if (action === "CHECK_CREDIT") {
      const check = await checkCredit(Number(body.customerId), Number(body.orderTotal || 0));
      return NextResponse.json({ success: true, data: check });
    }

    // Tahsilat kaydı (alacak) — bakiye düşer
    if (action === "PAYMENT") {
      const id = Number(body.customerId);
      const amount = Number(body.amount);
      if (!id || !amount || amount <= 0) return NextResponse.json({ success: false, error: "Geçerli cari ve tutar gerekli." }, { status: 422 });

      const [c] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
      if (!c) return NextResponse.json({ success: false, error: "Cari bulunamadı." }, { status: 404 });

      const newBalance = Number((Number(c.balance || 0) - amount).toFixed(2));
      await db.update(customers).set({ balance: String(newBalance) }).where(eq(customers.id, id));

      const [{ id: __tx_id }] = await db.insert(accountTransactions).values({
          customerId: id,
          type: "CREDIT",
          amount: String(amount.toFixed(2)),
          balanceAfter: String(newBalance),
          referenceType: "PAYMENT",
          referenceId: body.reference || `TAH-${Date.now().toString(36).toUpperCase()}`,
          description: body.description || `Tahsilat (${body.method || "HAVALE"})`,
          createdBy: "Muhasebe",
        }).$returningId();
      const [tx] = await db.select().from(accountTransactions).where(eq(accountTransactions.id, __tx_id));

      // Vadesi geçmiş borçları FIFO kapat
      let remaining = amount;
      const openDebits = (await db.select().from(accountTransactions).where(eq(accountTransactions.customerId, id)))
        .filter((t) => t.type === "DEBIT" && !t.paidAt)
        .sort((a, b) => new Date(a.dueDate || a.createdAt).getTime() - new Date(b.dueDate || b.createdAt).getTime());
      for (const d of openDebits) {
        if (remaining <= 0) break;
        if (remaining >= Number(d.amount)) {
          await db.update(accountTransactions).set({ paidAt: new Date() }).where(eq(accountTransactions.id, d.id));
          remaining -= Number(d.amount);
        }
      }

      await db.insert(auditLogs).values({ userName: "Muhasebe", action: "B2B_PAYMENT", entity: "Customer", entityId: String(id), details: `${amount.toFixed(2)} TL tahsilat · yeni bakiye ${newBalance.toFixed(2)} TL` });
      return NextResponse.json({ success: true, data: { transaction: tx, newBalance } });
    }

    // Cari kart güncelleme (limit, vade, fiyat listesi, blok, onay)
    if (action === "UPDATE") {
      const id = Number(body.id);
      const updates: Record<string, unknown> = {};
      if (body.creditLimit !== undefined) updates.creditLimit = String(body.creditLimit);
      if (body.discountRate !== undefined) updates.discountRate = String(body.discountRate);
      if (body.paymentTermDays !== undefined) updates.paymentTermDays = Number(body.paymentTermDays);
      if (body.minOrderAmount !== undefined) updates.minOrderAmount = String(body.minOrderAmount);
      if (body.priceListId !== undefined) updates.priceListId = body.priceListId ? Number(body.priceListId) : null;
      if (body.isBlocked !== undefined) updates.isBlocked = Boolean(body.isBlocked);
      if (body.approvalStatus !== undefined) updates.approvalStatus = body.approvalStatus;
      if (body.segment !== undefined) updates.segment = body.segment;

      await db.update(customers).set(updates).where(eq(customers.id, id));
      const [u] = await db.select().from(customers).where(eq(customers.id, id));
      await db.insert(auditLogs).values({ userName: "Yönetici", action: "B2B_ACCOUNT_UPDATED", entity: "Customer", entityId: String(id), details: JSON.stringify(updates) });
      return NextResponse.json({ success: true, data: u });
    }

    // Yeni B2B cari / bayilik başvurusu
    const {
      name,
      companyName,
      email,
      phone,
      taxOffice,
      taxNumber,
      creditLimit = "50000.00",
      discountRate = "10.00",
      paymentTermDays = 30,
      minOrderAmount = "0.00",
      priceListId = null,
      address,
      city = "İstanbul",
      notes,
      approvalStatus = "APPROVED",
    } = body;

    if (!name?.trim() || !phone?.trim()) {
      return NextResponse.json({ success: false, error: "Ad ve telefon zorunludur." }, { status: 422 });
    }

    const [{ id: __newCustomer_id }] = await db.insert(customers).values({
        type: "B2B",
        name,
        companyName,
        email,
        phone,
        taxOffice,
        taxNumber,
        creditLimit: String(creditLimit),
        discountRate: String(discountRate),
        paymentTermDays: Number(paymentTermDays),
        minOrderAmount: String(minOrderAmount),
        priceListId: priceListId ? Number(priceListId) : null,
        segment: "TOPTANCI",
        approvalStatus,
        address,
        city,
        notes,
      }).$returningId();
    const [newCustomer] = await db.select().from(customers).where(eq(customers.id, __newCustomer_id));

    return NextResponse.json({ success: true, data: newCustomer });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
