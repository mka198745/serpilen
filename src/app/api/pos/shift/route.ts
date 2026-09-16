import { NextResponse } from "next/server";
import { db } from "@/db";
import { posShifts, posCashTransactions, warehouses, orders, auditLogs } from "@/db/schema";
import { desc, eq, and, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get("warehouseId") || "2"; // Default Kadıköy Mağaza (id: 2)

    // Find active open shift
    const openShifts = await db
      .select()
      .from(posShifts)
      .where(and(eq(posShifts.warehouseId, Number(warehouseId)), eq(posShifts.status, "OPEN")))
      .orderBy(desc(posShifts.id))
      .limit(1);

    const currentShift = openShifts[0] || null;

    let shiftTransactions: any[] = [];
    let shiftOrders: any[] = [];

    if (currentShift) {
      shiftTransactions = await db
        .select()
        .from(posCashTransactions)
        .where(eq(posCashTransactions.shiftId, currentShift.id))
        .orderBy(desc(posCashTransactions.id));

      shiftOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.posShiftId, currentShift.id))
        .orderBy(desc(orders.id));
    }

    const allWh = await db.select().from(warehouses);
    const history = await db.select().from(posShifts).orderBy(desc(posShifts.id)).limit(30);

    const enrichedHistory = history.map((s) => ({
      ...s,
      warehouseName: allWh.find((w) => w.id === s.warehouseId)?.name || "Mağaza",
    }));

    return NextResponse.json({
      success: true,
      currentShift,
      shiftTransactions,
      shiftOrderCount: shiftOrders.length,
      history: enrichedHistory,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      action,
      shiftId,
      cashierName = "Kasiyer",
      warehouseId = 2,
      openingAmount = "500.00",
      closingAmount,
      terminalCode = "KASA-01",
      notes,
      amount,
      reason,
      type = "EXPENSE", // CASH_IN, CASH_OUT, EXPENSE, FLOAT_ADD
    } = body;

    // 1. OPEN SHIFT
    if (action === "OPEN") {
      // Check if already open shift exists for this terminal/warehouse
      const existing = await db
        .select()
        .from(posShifts)
        .where(and(eq(posShifts.warehouseId, Number(warehouseId)), eq(posShifts.status, "OPEN")))
        .limit(1);

      if (existing.length > 0) {
        return NextResponse.json({
          success: true,
          message: "Açık bir vardiya zaten mevcut.",
          data: existing[0],
        });
      }

      const shiftNumber = `VARD-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

      const [{ id: __newShift_id }] = await db.insert(posShifts).values({
          shiftNumber,
          terminalCode,
          cashierName,
          warehouseId: Number(warehouseId),
          openingAmount: String(Number(openingAmount || 500).toFixed(2)),
          expectedAmount: String(Number(openingAmount || 500).toFixed(2)),
          totalSalesCash: "0.00",
          totalSalesCard: "0.00",
          totalSalesSplit: "0.00",
          totalReturnsCash: "0.00",
          totalReturnsCard: "0.00",
          cashInTotal: "0.00",
          cashOutTotal: "0.00",
          status: "OPEN",
          notes,
        }).$returningId();
      const [newShift] = await db.select().from(posShifts).where(eq(posShifts.id, __newShift_id));

      await db.insert(auditLogs).values({
        userId: "1",
        userName: cashierName,
        action: "POS_SHIFT_OPENED",
        entity: "PosShift",
        entityId: String(newShift.id),
        details: `${terminalCode} kasası ${newShift.openingAmount} TL nakit devir ile açıldı (${shiftNumber}).`,
      });

      return NextResponse.json({ success: true, message: "Kasa vardiyası açıldı.", data: newShift });
    }

    // 2. CASH IN / CASH OUT / EXPENSE
    if (action === "CASH_TRANSACTION") {
      if (!shiftId) {
        return NextResponse.json({ success: false, error: "Aktif vardiya gereklidir." }, { status: 400 });
      }

      const [shift] = await db.select().from(posShifts).where(eq(posShifts.id, Number(shiftId))).limit(1);
      if (!shift || shift.status !== "OPEN") {
        return NextResponse.json({ success: false, error: "Açık vardiya bulunamadı." }, { status: 404 });
      }

      const transAmount = Number(amount || 0);
      if (transAmount <= 0) {
        return NextResponse.json({ success: false, error: "Geçerli bir tutar girin." }, { status: 422 });
      }

      const isIncoming = type === "CASH_IN" || type === "FLOAT_ADD";
      const newCashIn = isIncoming ? Number(shift.cashInTotal || 0) + transAmount : Number(shift.cashInTotal || 0);
      const newCashOut = !isIncoming ? Number(shift.cashOutTotal || 0) + transAmount : Number(shift.cashOutTotal || 0);

      const netCashChange = isIncoming ? transAmount : -transAmount;
      const newExpected = Math.max(0, Number(shift.expectedAmount || shift.openingAmount) + netCashChange);

      const [{ id: __trans_id }] = await db.insert(posCashTransactions).values({
          shiftId: shift.id,
          warehouseId: shift.warehouseId,
          type,
          amount: String(transAmount.toFixed(2)),
          reason: reason || (isIncoming ? "Kasa Nakit Girişi" : "Kasa Masraf / Avans Çıkışı"),
          cashierName,
        }).$returningId();
      const [trans] = await db.select().from(posCashTransactions).where(eq(posCashTransactions.id, __trans_id));

      await db
        .update(posShifts)
        .set({
          cashInTotal: String(newCashIn.toFixed(2)),
          cashOutTotal: String(newCashOut.toFixed(2)),
          expectedAmount: String(newExpected.toFixed(2)),
        })
        .where(eq(posShifts.id, shift.id));

      await db.insert(auditLogs).values({
        userId: "1",
        userName: cashierName,
        action: `POS_${type}`,
        entity: "PosCashTransaction",
        entityId: String(trans.id),
        details: `${type}: ${transAmount.toFixed(2)} TL (${reason || ""})`,
      });

      return NextResponse.json({
        success: true,
        message: `${isIncoming ? "Nakit girişi" : "Nakit çıkışı"} başarıyla kaydedildi.`,
        data: trans,
        updatedExpected: newExpected.toFixed(2),
      });
    }

    // 3. CLOSE SHIFT & GENERATE Z-REPORT
    if (action === "CLOSE") {
      if (!shiftId) {
        return NextResponse.json({ success: false, error: "Vardiya ID gereklidir" }, { status: 400 });
      }

      const [shift] = await db.select().from(posShifts).where(eq(posShifts.id, Number(shiftId))).limit(1);
      if (!shift) {
        return NextResponse.json({ success: false, error: "Vardiya bulunamadı" }, { status: 404 });
      }

      const countedCash = Number(closingAmount !== undefined ? closingAmount : shift.expectedAmount || shift.openingAmount);
      const expectedCash = Number(shift.expectedAmount || shift.openingAmount);
      const diff = countedCash - expectedCash;
      const diffNote =
        diff === 0
          ? "Kasa TAM MUTABIK."
          : diff > 0
          ? `+${diff.toFixed(2)} TL KASA FAZLASI.`
          : `${diff.toFixed(2)} TL KASA AÇIĞI!`;

      const zReportNumber = `Z-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

      await db.update(posShifts).set({
          status: "CLOSED",
          closingAmount: String(countedCash.toFixed(2)),
          zReportNumber,
          closedAt: new Date(),
          notes: `${notes ? notes + " | " : ""}${diffNote}`,
        }).where(eq(posShifts.id, Number(shiftId)));
      const [updated] = await db.select().from(posShifts).where(eq(posShifts.id, Number(shiftId)));

      // Gather Z-Report summary
      const shiftOrders = await db.select().from(orders).where(eq(orders.posShiftId, shift.id));
      const cashTrans = await db.select().from(posCashTransactions).where(eq(posCashTransactions.shiftId, shift.id));

      const totalRevenue = shiftOrders.reduce((sum, o) => sum + Number(o.grandTotal), 0);
      const totalTax = shiftOrders.reduce((sum, o) => sum + Number(o.taxTotal), 0);
      const totalDiscount = shiftOrders.reduce((sum, o) => sum + Number(o.discountTotal), 0);

      const zReport = {
        zReportNumber,
        shiftNumber: shift.shiftNumber || `VARD-${shift.id}`,
        terminalCode: shift.terminalCode,
        cashierName: shift.cashierName,
        openedAt: shift.openedAt,
        closedAt: new Date().toISOString(),
        openingAmount: Number(shift.openingAmount),
        closingAmount: countedCash,
        expectedAmount: expectedCash,
        diff,
        diffStatus: diff === 0 ? "BALANCED" : diff > 0 ? "SURPLUS" : "DEFICIT",
        totalSalesCash: Number(shift.totalSalesCash || 0),
        totalSalesCard: Number(shift.totalSalesCard || 0),
        totalSalesSplit: Number(shift.totalSalesSplit || 0),
        totalReturnsCash: Number(shift.totalReturnsCash || 0),
        totalReturnsCard: Number(shift.totalReturnsCard || 0),
        cashInTotal: Number(shift.cashInTotal || 0),
        cashOutTotal: Number(shift.cashOutTotal || 0),
        orderCount: shiftOrders.length,
        totalRevenue,
        totalTax,
        totalDiscount,
        transactions: cashTrans,
      };

      await db.insert(auditLogs).values({
        userId: "1",
        userName: cashierName,
        action: "POS_SHIFT_CLOSED",
        entity: "PosShift",
        entityId: String(shift.id),
        details: `Z Raporu ${zReportNumber}: ${diffNote} Toplam Ciro: ${totalRevenue.toFixed(2)} TL`,
      });

      return NextResponse.json({
        success: true,
        message: `Vardiya kapatıldı ve Gün Sonu Z Raporu oluşturuldu. ${diffNote}`,
        data: updated,
        zReport,
      });
    }

    return NextResponse.json({ success: false, error: "Bilinmeyen eylem" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
