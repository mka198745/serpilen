import { hasPosGrant, posLocked } from "@/lib/pos-screen-access";
import { NextResponse } from "next/server";
import { requireStaff, getUserByToken } from "@/lib/auth";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { posQuote } from "@/lib/pos-quote";
import { StockShortage } from "@/lib/inventory-engine";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!await hasPosGrant(request,gate.user.id))return posLocked();
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,"pos"))return NextResponse.json({success:false,error:"POS yetkiniz bulunmuyor."},{status:403});
 const bad=validateCrmWrite(request);if(bad)return bad;
 if(!request.headers.get("origin")){const auth=request.headers.get("authorization")||"";const actor=auth.startsWith("Bearer ")?await getUserByToken(auth.slice(7).trim()):null;if(!actor||actor.id!==gate.user.id)return NextResponse.json({success:false,error:"İstek kaynağı doğrulanamadı."},{status:403});}
 const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
 if(!await hasPosGrant(request,gate.user.id))return posLocked();
 const body=parsed.value as {items?:unknown;discountTotal?:unknown;couponCode?:unknown;spentPoints?:unknown;customerId?:unknown};
 try {return NextResponse.json({success:true,data:posQuote(body?.items as never[],body?.discountTotal??0,true,body?.couponCode,body?.spentPoints,body?.customerId)},{headers:{"Cache-Control":"private, no-store"}});}
 catch(e){if(e instanceof StockShortage)return NextResponse.json({success:false,error:e.message},{status:409});console.error("POS quote error",e);return NextResponse.json({success:false,error:"POS özeti hesaplanamadı."},{status:500});}
}
