import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff } from "@/lib/auth";
import { validateCrmWriteAccess } from "@/lib/crm-write-access";
import { readCrmJson } from "@/lib/crm-write";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { sharedSalesWarehouseId, selectSharedSalesWarehouse, SharedWarehouseError } from "@/lib/shared-sales-warehouse";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,"wms"))return NextResponse.json({success:false,error:"Depo yönetimi yetkiniz yok."},{status:403});
 return NextResponse.json({success:true,data:{warehouseId:sharedSalesWarehouseId()}},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 const invalid=await validateCrmWriteAccess(request,gate.user);if(invalid)return invalid;
 const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
 if(!parsed.value||typeof parsed.value!=="object"||Array.isArray(parsed.value))return NextResponse.json({success:false,error:"Geçersiz istek."},{status:422});
 const id=Number((parsed.value as {warehouseId?:unknown}).warehouseId);
 try {
  const data=sqlite.transaction(()=>{
   const actor=sqlite.prepare("SELECT role,is_active FROM users WHERE id=?").get(gate.user.id) as {role:string;is_active:number}|undefined;
   const setting=sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string}|undefined;
   let matrix:unknown=null;try{if(setting?.value)matrix=JSON.parse(setting.value);}catch{/* use defaults */}
   if(!actor?.is_active||actor.role!==gate.user.role||!['SUPER_ADMIN','STORE_MANAGER'].includes(actor.role)||!roleCanAccessModule(normalizeRoleMatrix(matrix),actor.role,"wms")) throw new SharedWarehouseError("Ortak satış deposunu değiştirme yetkiniz yok.","FORBIDDEN");
   return selectSharedSalesWarehouse(id,{id:gate.user.id,name:gate.user.name});
  }).immediate();
  return NextResponse.json({success:true,data});
 }catch(e){if(e instanceof SharedWarehouseError)return NextResponse.json({success:false,error:e.message,code:e.code},{status:e.code==='FORBIDDEN'?403:e.code==='INVALID_WAREHOUSE'?422:409});console.error('Shared warehouse selection failed',e instanceof Error?e.name:'Unknown');return NextResponse.json({success:false,error:'Depo seçimi kaydedilemedi.'},{status:500});}
}
