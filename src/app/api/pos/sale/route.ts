import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff, getUserByToken } from "@/lib/auth";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { preparePosSale,completePosSale,cancelPosSale } from "@/lib/pos-sale-intent";
import { StockShortage } from "@/lib/inventory-engine";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,'pos'))return NextResponse.json({success:false,error:'POS yetkiniz bulunmuyor.'},{status:403});
 const manager=['SUPER_ADMIN','STORE_MANAGER'].includes(gate.user.role);
 const rows=sqlite.prepare(`SELECT request_key AS requestKey,actor_id AS actorId,actor_name AS actorName,shift_id AS shiftId,status,payload_json AS payloadJson,created_at AS createdAt FROM pos_sale_intents WHERE status='PREPARED' ${manager?'':'AND actor_id=?'} ORDER BY created_at LIMIT 100`).all(...(manager?[]:[gate.user.id])) as Array<{payloadJson:string;[k:string]:unknown}>;
 return NextResponse.json({success:true,data:rows.map(({payloadJson,...row})=>({...row,payload:JSON.parse(payloadJson)}))},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,'pos'))return NextResponse.json({success:false,error:'POS yetkiniz bulunmuyor.'},{status:403});
 const bad=validateCrmWrite(request);if(bad)return bad;
 if(!request.headers.get('origin')){const auth=request.headers.get('authorization')||'';const user=auth.startsWith('Bearer ')?await getUserByToken(auth.slice(7).trim()):null;if(!user||user.id!==gate.user.id)return NextResponse.json({success:false,error:'İstek kaynağı doğrulanamadı.'},{status:403});}
 const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
 if(!parsed.value||typeof parsed.value!=='object'||Array.isArray(parsed.value))return NextResponse.json({success:false,error:'Geçersiz istek.'},{status:422});
 const body=parsed.value as Record<string,any>,actor={id:gate.user.id,name:gate.user.name,role:gate.user.role};
 try {
  const data=sqlite.transaction(()=>{
   if(body.action==='PREPARE')return preparePosSale(body.payload,actor);
   if(body.action==='COMPLETE'){if(body.confirmPayment!==true)throw new StockShortage('Harici tahsilatın yapıldığını doğrulayın.');return completePosSale(body.key,actor);}
   if(body.action==='CANCEL'){if(body.confirmNoPayment!==true)throw new StockShortage('Tahsilat yapılmadığını doğrulayın.');return cancelPosSale(body.key,actor,body.payload);}
   throw new StockShortage('Geçersiz satış işlemi.');
  }).immediate();
  return NextResponse.json({success:true,data});
 } catch(error){if(error instanceof StockShortage)return NextResponse.json({success:false,error:error.message},{status:409});console.error('POS sale transaction failed',error);return NextResponse.json({success:false,error:'Satış işlemi kaydedilemedi. Tahsilat yapıldıysa tekrar tahsil etmeyin ve hazırlığı kontrol edin.'},{status:500});}
}
