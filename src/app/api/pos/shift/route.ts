import { NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { posShifts, posCashTransactions, warehouses, orders, auditLogs } from "@/db/schema";
import { desc, eq, and, sql } from "drizzle-orm";

import { requireStaff, getUserByToken } from "@/lib/auth";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

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
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  if (!roleCanAccessModule(await readRoleMatrix(),__gate.user.role,"pos")) return NextResponse.json({success:false,error:"POS yetkiniz bulunmuyor."},{status:403});
  const invalid=validateCrmWrite(request);if(invalid)return invalid;
  if(!request.headers.get("origin")){const auth=request.headers.get("authorization")||"";const actor=auth.startsWith("Bearer ")?await getUserByToken(auth.slice(7).trim()):null;if(!actor||actor.id!==__gate.user.id)return NextResponse.json({success:false,error:"İstek kaynağı doğrulanamadı."},{status:403});}
  const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
  try {
    const body = parsed.value as Record<string, any>;
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
        }).returning({ id: posShifts.id });
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

    // Kasa hareketleri ve kapanış aynı SQLite yazma kilidini POS satışlarıyla paylaşır.
    if (action === "CASH_TRANSACTION") {
      const result=sqlite.transaction(()=>{
        const shift=db.select().from(posShifts).where(eq(posShifts.id,Number(shiftId))).get();
        if(!shift || shift.status!=="OPEN")return {error:"Açık vardiya bulunamadı."};
        const value=Number(amount);
        if(!Number.isFinite(value)||value<=0||Math.abs(value*100-Math.round(value*100))>0.000001||!['CASH_IN','CASH_OUT','EXPENSE','FLOAT_ADD'].includes(type))return {error:"Geçersiz kasa hareketi."};
        const incoming=type==='CASH_IN'||type==='FLOAT_ADD';
        const next=Number(shift.expectedAmount??shift.openingAmount)+(incoming?value:-value);
        if(next<0)return {error:"Kasadaki nakit yetersiz."};
        const trans=db.insert(posCashTransactions).values({shiftId:shift.id,warehouseId:shift.warehouseId,type,amount:value.toFixed(2),reason:reason||type,cashierName:__gate.user.name}).returning().get();
        db.update(posShifts).set({cashInTotal:(Number(shift.cashInTotal||0)+(incoming?value:0)).toFixed(2),cashOutTotal:(Number(shift.cashOutTotal||0)+(incoming?0:value)).toFixed(2),expectedAmount:next.toFixed(2)}).where(eq(posShifts.id,shift.id)).run();
        db.insert(auditLogs).values({userId:String(__gate.user.id),userName:__gate.user.name,action:`POS_${type}`,entity:'PosCashTransaction',entityId:String(trans.id),details:`${type}: ${value.toFixed(2)} TL`}).run();
        return {trans,updatedExpected:next.toFixed(2)};
      }).immediate();
      if('error' in result)return NextResponse.json({success:false,error:result.error},{status:409});
      return NextResponse.json({success:true,data:result.trans,updatedExpected:result.updatedExpected});
    }
    if (action === "CLOSE") {
      const result=sqlite.transaction(()=>{
        const shift=db.select().from(posShifts).where(eq(posShifts.id,Number(shiftId))).get();
        if(!shift || shift.status!=='OPEN')return {error:"Açık vardiya bulunamadı."};
        if(sqlite.prepare("SELECT 1 FROM pos_sale_intents WHERE shift_id=? AND status='PREPARED' LIMIT 1").get(shift.id))return {error:"Bu vardiyada sonuçlanmamış POS satış hazırlığı var. Önce tahsilatı kontrol edip satışları tamamlayın veya tahsilat yapılmadıysa iptal edin."};
        const counted=Number(closingAmount??shift.expectedAmount??shift.openingAmount),expected=Number(shift.expectedAmount??shift.openingAmount);
        if(!Number.isFinite(counted)||counted<0)return {error:"Geçersiz kasa tutarı."};
        const diff=counted-expected,diffNote=diff===0?'Kasa TAM MUTABIK.':diff>0?`+${diff.toFixed(2)} TL KASA FAZLASI.`:`${diff.toFixed(2)} TL KASA AÇIĞI!`;
        const zReportNumber=`Z-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
        const updated=db.update(posShifts).set({status:'CLOSED',closingAmount:counted.toFixed(2),zReportNumber,closedAt:new Date(),notes:`${notes?notes+' | ':''}${diffNote}`}).where(eq(posShifts.id,shift.id)).returning().get();
        const shiftOrders=db.select().from(orders).where(eq(orders.posShiftId,shift.id)).all(), transactions=db.select().from(posCashTransactions).where(eq(posCashTransactions.shiftId,shift.id)).all();
        const totalRevenue=shiftOrders.reduce((s,o)=>s+Number(o.grandTotal),0),totalTax=shiftOrders.reduce((s,o)=>s+Number(o.taxTotal),0),totalDiscount=shiftOrders.reduce((s,o)=>s+Number(o.discountTotal),0);
        const zReport={zReportNumber,shiftNumber:shift.shiftNumber||`VARD-${shift.id}`,terminalCode:shift.terminalCode,cashierName:shift.cashierName,openedAt:shift.openedAt,closedAt:new Date().toISOString(),openingAmount:Number(shift.openingAmount),closingAmount:counted,expectedAmount:expected,diff,diffStatus:diff===0?'BALANCED':diff>0?'SURPLUS':'DEFICIT',totalSalesCash:Number(shift.totalSalesCash||0),totalSalesCard:Number(shift.totalSalesCard||0),totalSalesSplit:Number(shift.totalSalesSplit||0),totalReturnsCash:Number(shift.totalReturnsCash||0),totalReturnsCard:Number(shift.totalReturnsCard||0),cashInTotal:Number(shift.cashInTotal||0),cashOutTotal:Number(shift.cashOutTotal||0),orderCount:shiftOrders.length,totalRevenue,totalTax,totalDiscount,transactions};
        db.insert(auditLogs).values({userId:String(__gate.user.id),userName:__gate.user.name,action:'POS_SHIFT_CLOSED',entity:'PosShift',entityId:String(shift.id),details:`Z Raporu ${zReportNumber}: ${diffNote} Toplam Ciro: ${totalRevenue.toFixed(2)} TL`}).run();
        return {updated,zReport,diffNote};
      }).immediate();
      if('error' in result)return NextResponse.json({success:false,error:result.error},{status:409});
      return NextResponse.json({success:true,message:`Vardiya kapatıldı ve Gün Sonu Z Raporu oluşturuldu. ${result.diffNote}`,data:result.updated,zReport:result.zReport});
    }

    return NextResponse.json({ success: false, error: "Bilinmeyen eylem" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
