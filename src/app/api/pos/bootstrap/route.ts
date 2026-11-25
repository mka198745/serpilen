import { NextResponse } from "next/server";
import { db } from "@/db";
import { products,productVariants,categories,posShifts } from "@/db/schema";
import { eq,desc,and } from "drizzle-orm";
import { requireStaff } from "@/lib/auth";
import { hasPosGrant,posLocked } from "@/lib/pos-screen-access";
import { readRoleMatrix,roleCanAccessModule } from "@/lib/role-matrix-server";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,'pos'))return NextResponse.json({success:false,error:'POS yetkiniz bulunmuyor.'},{status:403});
 if(!await hasPosGrant(request,gate.user.id))return posLocked();
 const allProds=await db.select().from(products), allVariants=await db.select().from(productVariants), allCats=await db.select().from(categories);
 const [shift]=await db.select().from(posShifts).where(and(eq(posShifts.warehouseId,2),eq(posShifts.status,'OPEN'))).orderBy(desc(posShifts.id)).limit(1);
 const catalog=allProds.map(p=>({...p,variants:allVariants.filter(v=>v.productId===p.id)}));
 return NextResponse.json({success:true,data:{products:catalog,categories:allCats,shift:shift||null,cashierName:gate.user.name}},{headers:{'Cache-Control':'private, no-store'}});
}
