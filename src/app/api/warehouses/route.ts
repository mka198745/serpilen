import { NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { protectedWarehouseReason } from "@/lib/warehouse-policy";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { validateCrmWriteAccess } from "@/lib/crm-write-access";
import {
  warehouses,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { slugifyTr } from "@/lib/slug";

import { requireStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["CENTRAL", "STORE", "ONLINE", "WHOLESALE"] as const;

export async function GET(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const all = await db.select().from(warehouses).orderBy(desc(warehouses.id));
  return NextResponse.json({ success: true, data: all });
}

/** POST /api/warehouses — Admin panelinden manuel depo ekleme. Kod otomatik üretilir. */
export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const body = (await request.json().catch(() => ({}))) as { name?: string; type?: string; address?: string };
  const name = String(body?.name || "").trim();
  const type = String(body?.type || "CENTRAL").toUpperCase();
  const address = body?.address ? String(body.address).trim() : null;

  if (!name) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Depo adı zorunludur." } },
      { status: 422 }
    );
  }
  if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: `Geçersiz depo tipi. İzinli: ${ALLOWED_TYPES.join(", ")}` } },
      { status: 422 }
    );
  }

  try {
    const all = await db.select().from(warehouses);
    const existing = all.find((w) => w.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"));
    if (existing) {
      return NextResponse.json({ success: true, existed: true, data: existing });
    }

    // Kod üret: adın baş harflerinden benzersiz kısa kod (örn. "Bursa Depo" → BRD, çakışırsa BRD-2)
    const words = slugifyTr(name).split("-").filter(Boolean);
    const base = (words.map((w) => w[0]).join("").slice(0, 4) || "DEP").toUpperCase();
    let code = base;
    let suffix = 2;
    while (all.some((w) => w.code.toUpperCase() === code)) {
      code = `${base}-${suffix}`;
      suffix++;
    }

    const [{ id: __created_id }] = await db.insert(warehouses).values({ name, code, type, address }).returning({ id: warehouses.id });
    const [created] = await db.select().from(warehouses).where(eq(warehouses.id, __created_id));

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    console.error("Warehouse create error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Depo eklenemedi." } }, { status: 500 });
  }
}

/** PATCH /api/warehouses — Depo Aktif/Pasif (isActive) günceller. */
export async function PATCH(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const invalid = await validateCrmWriteAccess(request, __gate.user); if (invalid) return invalid;
  if (!roleCanAccessModule(await readRoleMatrix(), __gate.user.role, "wms")) return NextResponse.json({ success:false, error:{code:"FORBIDDEN",message:"Depo yönetimi yetkiniz bulunmuyor."} }, {status:403});
  const body = (await request.json().catch(() => ({}))) as { id?: number | string; isActive?: boolean };
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir depo id zorunludur." } },
      { status: 422 }
    );
  }
  if (typeof body?.isActive !== "boolean") {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "isActive (true/false) zorunludur." } },
      { status: 422 }
    );
  }
  try {
    const result = sqlite.transaction(() => {
      const actor=sqlite.prepare("SELECT role,is_active FROM users WHERE id=?").get(__gate.user.id) as {role:string;is_active:number}|undefined;
      const setting=sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string}|undefined;
      let saved:unknown=null;try{if(setting?.value)saved=JSON.parse(setting.value);}catch{/* defaults */}
      if(!actor?.is_active||actor.role!==__gate.user.role||!roleCanAccessModule(normalizeRoleMatrix(saved),actor.role,"wms"))return {status:403,error:"Depo yönetimi yetkiniz yok."};
      const existing=db.select().from(warehouses).where(eq(warehouses.id,id)).get();
      if(!existing)return {status:404,error:"Depo bulunamadı."};
      const reason=body.isActive===false?protectedWarehouseReason(id):null;
      if(reason)return {status:409,error:reason};
      const updated=db.update(warehouses).set({isActive:body.isActive}).where(eq(warehouses.id,id)).returning().get();
      return {status:200,data:updated};
    }).immediate();
    if(result.status!==200)return NextResponse.json({success:false,error:{code:"WAREHOUSE_ERROR",message:result.error}},{status:result.status});
    return NextResponse.json({success:true,data:result.data});
  } catch (error) {
    console.error("Warehouse patch error:",error instanceof Error?error.name:"UnknownError");
    return NextResponse.json({success:false,error:{code:"INTERNAL_ERROR",message:"Depo güncellenemedi."}},{status:500});
  }
}

/** Delete an unused warehouse and its empty location definitions atomically. */
export async function DELETE(request: Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 const invalid=await validateCrmWriteAccess(request,gate.user);if(invalid)return invalid;
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,"wms")) return NextResponse.json({success:false,error:{code:"FORBIDDEN",message:"Depo yönetimi yetkiniz bulunmuyor."}},{status:403});
 const raw=new URL(request.url).searchParams.get("id");
 const id=raw && /^\d+$/.test(raw) ? Number(raw) : 0;
 if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({success:false,error:{code:"VALIDATION_ERROR",message:"Geçerli bir depo numarası gereklidir."}},{status:422});
 try {
  const result=sqlite.transaction(()=>{
   const migration=sqlite.prepare("SELECT 1 FROM __migrations WHERE tag='0028_warehouse_reference_guards'").get();
   const guards=sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'warehouse_guard_%'").get() as {n:number};
   if(!migration || guards.n < 24) return {status:503,code:"MIGRATION_REQUIRED",message:"Depo güvenlik güncellemesi uygulanmamış; silme işlemi yapılmadı."};
   const actor=sqlite.prepare("SELECT role,is_active FROM users WHERE id=?").get(gate.user.id) as {role:string;is_active:number}|undefined;
   const setting=sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string}|undefined;
   let saved:unknown=null;try{if(setting?.value)saved=JSON.parse(setting.value);}catch{/* use defaults */}
   if(!actor?.is_active||actor.role!==gate.user.role||!roleCanAccessModule(normalizeRoleMatrix(saved),actor.role,"wms")) return {status:403,code:"FORBIDDEN",message:"Depo yönetimi yetkiniz bulunmuyor."};
   const warehouse=sqlite.prepare("SELECT id,name,is_active FROM warehouses WHERE id=?").get(id) as {id:number;name:string;is_active:number}|undefined;
   if(!warehouse)return {status:404,code:"NOT_FOUND",message:"Depo bulunamadı."};
   const system=protectedWarehouseReason(id);if(system)return {status:409,code:"SYSTEM_WAREHOUSE",message:system};
   if(warehouse.is_active && !(sqlite.prepare("SELECT 1 FROM warehouses WHERE is_active=1 AND id<>? LIMIT 1").get(id))) return {status:409,code:"LAST_ACTIVE",message:"Son aktif depo silinemez."};
   const quote=(name:string)=>'"'+name.replace(/"/g,'""')+'"';
   const labels:Record<string,string>={inventory:"stok kaydı",inventory_reservations:"stok rezervasyonu",inventory_ledger:"stok defteri hareketi",stock_count_sessions:"stok sayımı",order_returns:"iade kaydı",pos_shifts:"POS vardiyası",pos_cash_transactions:"POS nakit hareketi",purchase_orders:"satın alma siparişi",purchase_requests:"satın alma talebi",goods_receipts:"mal kabulü",stock_transfers:"stok transferi"};
   const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];
   const blockers:string[]=[];
   for(const {name} of tables){
    if(name==='warehouses'||name==='warehouse_locations')continue;
    const cols=(sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all() as {name:string}[]).map(x=>x.name);
    const fks=sqlite.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as {table:string;from:string}[];
    const refs=[...new Set([...['warehouse_id','from_warehouse_id','to_warehouse_id'].filter(x=>cols.includes(x)),...fks.filter(x=>x.table==='warehouses').map(x=>x.from)])];
    const locationRefs=fks.filter(x=>x.table==='warehouse_locations').map(x=>x.from);
    const conditions=[...refs.map(x=>`${quote(x)}=?`),...locationRefs.map(x=>`${quote(x)} IN (SELECT id FROM warehouse_locations WHERE warehouse_id=?)`)];
    if(!conditions.length)continue;
    const row=sqlite.prepare(`SELECT count(*) AS n FROM ${quote(name)} WHERE ${conditions.join(' OR ')}`).get(...conditions.map(()=>id)) as {n:number};
    if(row.n)blockers.push(`${labels[name]||name} (${row.n})`);
   }
   if(blockers.length)return {status:409,code:"HAS_REFERENCES",message:`"${warehouse.name}" silinemez — bağlı kayıtlar var: ${blockers.join(", ")}.`};
   const locations=sqlite.prepare('SELECT count(*) AS n FROM warehouse_locations WHERE warehouse_id=?').get(id) as {n:number};
   sqlite.prepare('DELETE FROM warehouse_locations WHERE warehouse_id=?').run(id);
   sqlite.prepare('DELETE FROM warehouses WHERE id=?').run(id);
   sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'WAREHOUSE_DELETED','Warehouse',?,?)").run(String(gate.user.id),gate.user.name,String(id),`Depo silindi; ${locations.n} boş lokasyon kaldırıldı.`);
   return {status:200,id,locations:locations.n};
  }).immediate();
  if(result.status!==200)return NextResponse.json({success:false,error:{code:result.code,message:result.message}},{status:result.status});
  return NextResponse.json({success:true,data:{id:result.id,deletedLocations:result.locations}});
 } catch(error){console.error("Warehouse delete error:",error instanceof Error?error.name:"UnknownError");return NextResponse.json({success:false,error:{code:"INTERNAL_ERROR",message:"Depo silinemedi; hiçbir kayıt değiştirilmedi."}},{status:500});}
}
