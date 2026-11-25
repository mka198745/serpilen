import { sharedSalesWarehouseId } from "@/lib/shared-sales-warehouse";
import { NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { orderReturns, orderReturnItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireStaff, getUserByToken } from "@/lib/auth";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { createReturn, approveReturn, rejectReturn, receiveReturn, completeReturn, ReturnError } from "@/lib/order-returns";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request); if (!gate.ok) return gate.response;
  if (!roleCanAccessModule(await readRoleMatrix(),gate.user.role,"orders")) return NextResponse.json({success:false,error:{message:"İade erişim yetkiniz bulunmuyor."}},{status:403});
  const rows = await db.select().from(orderReturns).orderBy(desc(orderReturns.id)).limit(50);
  const items = await db.select().from(orderReturnItems);
  return NextResponse.json({success:true,data:rows.map(r=>({...r,items:items.filter(i=>i.returnId===r.id),createdAt:new Date(r.createdAt).toISOString(),resolvedAt:r.resolvedAt?new Date(r.resolvedAt).toISOString():null}))},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request) {
  const gate=await requireStaff(request);if(!gate.ok)return gate.response;
  if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,"orders"))return NextResponse.json({success:false,error:{message:"İade yetkiniz bulunmuyor."}},{status:403});
  const bad=validateCrmWrite(request);if(bad)return bad;
  if(!request.headers.get("origin")){const auth=request.headers.get("authorization")||"";const actor=auth.startsWith("Bearer ")?await getUserByToken(auth.slice(7).trim()):null;if(!actor||actor.id!==gate.user.id)return NextResponse.json({success:false,error:{message:"İstek kaynağı doğrulanamadı."}},{status:403});}
  const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
  if(!parsed.value||typeof parsed.value!=="object"||Array.isArray(parsed.value))return NextResponse.json({success:false,error:{message:"Geçersiz istek."}},{status:400});
  const body=parsed.value as Record<string,any>, action=body.action||"CREATE", actor={id:gate.user.id,name:gate.user.name};
  try {
    const data=sqlite.transaction(()=>{
      if(action==='CREATE') {
        const order=sqlite.prepare("SELECT order_type FROM orders WHERE id=?").get(Number(body.orderId)) as {order_type:string}|undefined;
        if(order?.order_type==='POS') throw new ReturnError("Mağaza satış iadesini vardiya kaydı için POS ekranından başlatın.");
        return createReturn(Number(body.orderId),body.items,Number(body.warehouseId || sharedSalesWarehouseId()),body.restock!==false,String(body.reason||"Müşteri iadesi"),actor);
      }
      const id=Number(body.returnId);if(!Number.isSafeInteger(id)||id<=0)throw new ReturnError("Geçersiz iade numarası.",422);
      if(action==='APPROVE') {approveReturn(id,actor);return {id,status:'APPROVED'};}
      if(action==='REJECT') {rejectReturn(id,actor);return {id,status:'REJECTED'};}
      if(action==='RECEIVE') {receiveReturn(id,actor);return {id,status:'RECEIVED'};}
      if(action==='REFUND') {
        if(!["SUPER_ADMIN","STORE_MANAGER"].includes(gate.user.role))throw new ReturnError("Para iadesi onay yetkiniz bulunmuyor.",403);
        if(body.confirmRefund!==true)throw new ReturnError("Gerçek para iadesinin yapıldığını doğrulayın.",422);
        const context=sqlite.prepare("SELECT shift_id,refund_method FROM pos_return_context WHERE return_id=?").get(id) as {shift_id:number;refund_method:string}|undefined;
        return completeReturn(id,actor,context?.refund_method,context?.shift_id);
      }
      throw new ReturnError("Geçersiz iade işlemi.",400);
    }).immediate();
    return NextResponse.json({success:true,data});
  } catch(error) {if(error instanceof ReturnError)return NextResponse.json({success:false,error:{message:error.message}},{status:error.status});console.error("Return error:",error);return NextResponse.json({success:false,error:{message:"İade işlemi kaydedilemedi; ödeme yapıldıysa tekrar ödeme yapmadan kayıtları inceleyin."}},{status:500});}
}
