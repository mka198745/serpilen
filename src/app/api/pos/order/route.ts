import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff } from "@/lib/auth";
import { hasPosGrant, posLocked } from "@/lib/pos-screen-access";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { normalizeOrderNumber } from "@/lib/order-number";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,'pos'))return NextResponse.json({success:false,error:'POS yetkiniz bulunmuyor.'},{status:403});
 if(!await hasPosGrant(request,gate.user.id))return posLocked();
 const raw=new URL(request.url).searchParams.get('orderNumber')?.trim()||'';
 if(!raw||raw.length>100)return NextResponse.json({success:false,error:'Geçersiz sipariş numarası.'},{status:422});
 const normalized=normalizeOrderNumber(raw),alternate=/^SIP\d{8,}$/.test(normalized)?`SİP${normalized.slice(3)}`:raw;
 const order=sqlite.prepare(`SELECT id,order_number AS orderNumber,customer_name AS customerName,grand_total AS grandTotal,strftime('%Y-%m-%dT%H:%M:%SZ',created_at,'unixepoch') AS createdAt FROM orders WHERE order_number=? OR order_number=? ORDER BY order_number=? DESC LIMIT 1`).get(raw,alternate,raw) as {id:number}|undefined;
 if(!order)return NextResponse.json({success:false,error:'Sipariş bulunamadı.'},{status:404,headers:{'Cache-Control':'private, no-store'}});
 const items=sqlite.prepare('SELECT id,product_id AS productId,variant_id AS variantId,product_name AS productName,quantity,unit_price AS unitPrice FROM order_items WHERE order_id=?').all(order.id);
 const {id: _id,...data}=order;void _id;
 return NextResponse.json({success:true,data:{...data,items}},{headers:{'Cache-Control':'private, no-store'}});
}
