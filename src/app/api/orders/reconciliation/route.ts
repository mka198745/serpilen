import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff } from "@/lib/auth";
import { readRoleMatrix,roleCanAccessModule } from "@/lib/role-matrix-server";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!["SUPER_ADMIN","STORE_MANAGER"].includes(gate.user.role)||!roleCanAccessModule(await readRoleMatrix(),gate.user.role,"orders"))return NextResponse.json({success:false,error:"Mutabakat yetkiniz bulunmuyor."},{status:403});
 const params=new URL(request.url).searchParams, page=Math.max(1,Math.min(10000,Math.floor(Number(params.get('page'))||1))), offset=(page-1)*50;
 const filter=`o.order_type='ONLINE_B2C' AND (EXISTS(SELECT 1 FROM inventory_reservations r WHERE r.reference_type='PAYMENT_HOLD' AND r.reference_id=CAST(o.id AS TEXT) AND r.status='ACTIVE' AND r.expires_at>=4102444800) OR (CAST(o.discount_total AS REAL)>0 AND NOT EXISTS(SELECT 1 FROM order_discount_claims c WHERE c.order_id=o.id)))`;
 const total=(sqlite.prepare(`SELECT COUNT(*) n FROM orders o WHERE ${filter}`).get() as {n:number}).n;
 const rows=sqlite.prepare(`SELECT o.id,o.order_number AS orderNumber,o.status,o.payment_status AS paymentStatus,o.grand_total AS grandTotal,o.discount_total AS discountTotal,o.created_at AS createdAt,
   EXISTS(SELECT 1 FROM inventory_reservations r WHERE r.reference_type='PAYMENT_HOLD' AND r.reference_id=CAST(o.id AS TEXT) AND r.status='ACTIVE' AND r.expires_at>=4102444800) AS longHold,
   NOT EXISTS(SELECT 1 FROM order_discount_claims c WHERE c.order_id=o.id) AS noClaims
   FROM orders o WHERE ${filter} ORDER BY o.id DESC LIMIT 50 OFFSET ?`).all(offset);
 const notices=sqlite.prepare(`SELECT n.id,o.order_number AS orderNumber,n.status,n.attempts,n.last_error AS lastError,n.sent_at AS sentAt FROM order_notification_outbox n JOIN orders o ON o.id=n.order_id WHERE n.status<>'SENT' ORDER BY n.id DESC LIMIT 50`).all();
 return NextResponse.json({success:true,data:{rows,total,page,notices},note:"Hak kaydı olmaması indirim sayacının kullanıldığını kanıtlamaz; banka ve belgeleri inceleyin."},{headers:{"Cache-Control":"private, no-store"}});
}
