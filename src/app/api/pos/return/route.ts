import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff, getUserByToken } from "@/lib/auth";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { createReturn, rejectReturn, receiveReturn, completeReturn, ReturnError } from "@/lib/order-returns";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  const gate=await requireStaff(request);if(!gate.ok)return gate.response;
  if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,"pos"))return NextResponse.json({success:false,error:"POS iade yetkiniz bulunmuyor."},{status:403});
  const bad=validateCrmWrite(request);if(bad)return bad;
  if(!request.headers.get("origin")){const auth=request.headers.get("authorization")||"";const actor=auth.startsWith("Bearer ")?await getUserByToken(auth.slice(7).trim()):null;if(!actor||actor.id!==gate.user.id)return NextResponse.json({success:false,error:"İstek kaynağı doğrulanamadı."},{status:403});}
  const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
  if(!parsed.value||typeof parsed.value!=="object"||Array.isArray(parsed.value))return NextResponse.json({success:false,error:"Geçersiz istek."},{status:400});
  const body=parsed.value as Record<string,any>,actor={id:gate.user.id,name:gate.user.name};
  try {
    const result=sqlite.transaction(()=>{
      if(body.action==='PREPARE') {
        const order=sqlite.prepare("SELECT id FROM orders WHERE order_number=?").get(String(body.orderNumber||"").trim()) as {id:number}|undefined;
        if(!order)throw new ReturnError("Fiş veya sipariş bulunamadı.",404);
        const shiftId=Number(body.posShiftId), method=String(body.refundMethod||"");
        if(!Number.isSafeInteger(shiftId)||shiftId<=0||!sqlite.prepare("SELECT 1 FROM pos_shifts WHERE id=? AND warehouse_id=2 AND status='OPEN'").get(shiftId)) throw new ReturnError("Açık mağaza vardiyası gerekli.");
        if(!["CASH","CREDIT_CARD"].includes(method)) throw new ReturnError("Geçersiz iade yöntemi.",422);
        const created=createReturn(order.id,body.items,2,true,String(body.reason||"Mağaza iadesi"),actor,true);
        if(method==='CASH') { const shift=sqlite.prepare("SELECT expected_amount FROM pos_shifts WHERE id=?").get(shiftId) as {expected_amount:number|string}; if(Math.round(Number(shift.expected_amount)*100)<Math.round(Number(created.refundAmount)*100)) throw new ReturnError("Kasada iade için yeterli nakit görünmüyor."); }
        sqlite.prepare("INSERT INTO pos_return_context(return_id,shift_id,refund_method) VALUES(?,?,?)").run(created.id,shiftId,method);
        return created;
      }
      const id=Number(body.returnId);if(!Number.isSafeInteger(id)||id<=0)throw new ReturnError("Geçersiz iade numarası.",422);
      const context=sqlite.prepare("SELECT shift_id,refund_method FROM pos_return_context WHERE return_id=?").get(id) as {shift_id:number;refund_method:string}|undefined;
      if(!context) throw new ReturnError("Bu kayıt POS iade talebi değil.");
      if(body.action==='CANCEL') {rejectReturn(id,actor);return {id,status:'REJECTED'};}
      if(body.action==='COMPLETE') {
        if(body.confirmRefund!==true)throw new ReturnError("Para iadesinin yapıldığını doğrulayın.",422);
        const r=sqlite.prepare("SELECT status,refund_amount FROM order_returns WHERE id=?").get(id) as {status:string;refund_amount:number|string}|undefined;
        if(!r)throw new ReturnError("İade bulunamadı.",404);
        if(Math.round(Number(body.confirmedAmount)*100)!==Math.round(Number(r.refund_amount)*100))throw new ReturnError("Onaylanan tutar kayıtla eşleşmiyor.",409);
        if(r.status==='REFUNDED') return completeReturn(id,actor);
        receiveReturn(id,actor);
        return completeReturn(id,actor,context.refund_method,context.shift_id);
      }
      throw new ReturnError("Önce iade tutarını hesaplayın.",422);
    }).immediate();
    return NextResponse.json({success:true,data:result});
  } catch(error){if(error instanceof ReturnError)return NextResponse.json({success:false,error:error.message},{status:error.status});console.error("POS return error:",error);return NextResponse.json({success:false,error:"İade kaydı tamamlanamadı. Para iadesi yapıldıysa tekrar ödemeden önce kayıtları inceleyin."},{status:500});}
}
