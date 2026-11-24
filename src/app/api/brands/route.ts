import { NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { brands, brandCategories } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureUniqueSlug, slugifyTr } from "@/lib/slug";
import { requireStaff, getUserByToken } from "@/lib/auth";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
export const dynamic = "force-dynamic";

class BrandError extends Error { constructor(message:string, public status=422) { super(message); } }
const failure=(message:string,status:number)=>NextResponse.json({success:false,error:{message}},{status});
function categoryIds(input:unknown):number[]|undefined {
  if(input===undefined)return undefined;
  if(!Array.isArray(input)||input.length>200)throw new BrandError("Geçerli kategorileri seçin.");
  const ids=input.map(value=>typeof value==='number'?value:typeof value==='string' && /^\d+$/.test(value)?Number(value):NaN);
  if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)throw new BrandError("Geçersiz veya tekrarlanan kategori seçimi.");
  const check=sqlite.prepare("SELECT id FROM categories WHERE id=?");
  if(ids.some(id=>!check.get(id)))throw new BrandError("Seçilen kategorilerden biri bulunamadı.");
  return ids;
}
function brandWithCategories(id:number) {
  const brand=db.select().from(brands).where(eq(brands.id,id)).get();
  if(!brand)throw new BrandError("Marka bulunamadı.",404);
  const rows=sqlite.prepare("SELECT category_id FROM brand_categories WHERE brand_id=? ORDER BY category_id").all(id) as {category_id:number}[];
  return {...brand,categoryIds:rows.map(row=>row.category_id)};
}
async function writeGate(request:Request) {
  const gate=await requireStaff(request);if(!gate.ok)return gate.response;
  if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,"catalog"))return failure("Katalog yetkiniz bulunmuyor.",403);
  const bad=validateCrmWrite(request);if(bad)return bad;
  if(!request.headers.get("origin")){const auth=request.headers.get("authorization")||"";const actor=auth.startsWith("Bearer ")?await getUserByToken(auth.slice(7).trim()):null;if(!actor||actor.id!==gate.user.id)return failure("İstek kaynağı doğrulanamadı.",403);}
  return null;
}
async function parseBody(request:Request) {
  const parsed=await readCrmJson(request);if(!parsed.ok)return {response:parsed.response};
  if(!parsed.value||typeof parsed.value!=="object"||Array.isArray(parsed.value))return {response:failure("Geçersiz istek.",400)};
  return {body:parsed.value as Record<string,unknown>};
}
function caught(error:unknown){if(error instanceof BrandError)return failure(error.message,error.status);console.error("Brand operation error:",error);return failure("Marka işlemi tamamlanamadı.",500);}

export async function GET() {
  const all=db.select().from(brands).orderBy(desc(brands.id)).all(), links=db.select().from(brandCategories).all();
  return NextResponse.json({success:true,data:all.map(brand=>({...brand,categoryIds:links.filter(row=>row.brandId===brand.id).map(row=>row.categoryId)}))});
}

/** Re-adding an existing name merges explicitly selected categories without duplicating a brand. */
export async function POST(request:Request) {
  const gate=await writeGate(request);if(gate)return gate;
  const parsed=await parseBody(request);if(parsed.response)return parsed.response;
  try {
    const body=parsed.body!, name=typeof body.name==='string'?body.name.trim():"";
    if(!name||name.length>120)throw new BrandError("Marka adı zorunludur ve en fazla 120 karakter olabilir.");
    const data=sqlite.transaction(()=>{
      const ids=categoryIds(body.categoryIds);
      if(ids && !ids.length)throw new BrandError("En az bir kategori seçin.");
      const all=db.select().from(brands).all();const existing=all.find(b=>b.name.trim().toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR'));
      const brand=existing||db.insert(brands).values({name,slug:ensureUniqueSlug(slugifyTr(name)||'marka',s=>all.some(b=>b.slug===s))}).returning().get();
      const insert=sqlite.prepare("INSERT OR IGNORE INTO brand_categories(brand_id,category_id) VALUES(?,?)");for(const id of ids||[])insert.run(brand.id,id);
      return {brand:brandWithCategories(brand.id),existed:!!existing};
    }).immediate();
    return NextResponse.json({success:true,existed:data.existed,data:data.brand});
  } catch(error){return caught(error);}
}

export async function PATCH(request:Request) {
  const gate=await writeGate(request);if(gate)return gate;
  const parsed=await parseBody(request);if(parsed.response)return parsed.response;
  try {
    const body=parsed.body!, id=Number(body.id);
    if(!Number.isSafeInteger(id)||id<=0)throw new BrandError("Geçerli marka numarası gereklidir.");
    const result=sqlite.transaction(()=>{
      const current=db.select().from(brands).where(eq(brands.id,id)).get();if(!current)throw new BrandError("Marka bulunamadı.",404);
      const ids=categoryIds(body.categoryIds), updates:Record<string,unknown>={};
      if(body.name!==undefined){if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>120)throw new BrandError("Geçerli marka adı gereklidir.");const name=body.name.trim();const all=db.select().from(brands).all();if(all.some(b=>b.id!==id&&b.name.trim().toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR')))throw new BrandError("Bu marka adı zaten kullanılıyor.",409);updates.name=name;if(name!==current.name)updates.slug=ensureUniqueSlug(slugifyTr(name)||'marka',s=>all.some(b=>b.id!==id&&b.slug===s));}
      if(typeof body.isActive==='boolean')updates.isActive=body.isActive;
      if(body.logoUrl!==undefined){if(body.logoUrl!==null&&typeof body.logoUrl!=='string')throw new BrandError("Geçersiz logo.");updates.logoUrl=body.logoUrl;}
      if(!Object.keys(updates).length && ids===undefined)throw new BrandError("Güncellenecek alan yok.");
      if(Object.keys(updates).length)db.update(brands).set(updates).where(eq(brands.id,id)).run();
      if(ids!==undefined){sqlite.prepare('DELETE FROM brand_categories WHERE brand_id=?').run(id);const insert=sqlite.prepare('INSERT INTO brand_categories(brand_id,category_id) VALUES(?,?)');for(const categoryId of ids)insert.run(id,categoryId);}
      return brandWithCategories(id);
    }).immediate();
    return NextResponse.json({success:true,data:result});
  } catch(error){return caught(error);}
}

export async function DELETE(request:Request) {
  const gate=await writeGate(request);if(gate)return gate;
  const parsed=await parseBody(request);if(parsed.response)return parsed.response;
  try {
    const id=Number(parsed.body!.id);if(!Number.isSafeInteger(id)||id<=0)throw new BrandError("Geçerli marka numarası gereklidir.");
    const target=sqlite.transaction(()=>{
      const brand=db.select().from(brands).where(eq(brands.id,id)).get();if(!brand)throw new BrandError("Marka bulunamadı.",404);
      if(sqlite.prepare('SELECT 1 FROM products WHERE brand_id=? LIMIT 1').get(id))throw new BrandError('Bu markaya bağlı ürünler var; önce ürünleri başka markaya taşıyın veya markayı pasife alın.',409);
      sqlite.prepare('DELETE FROM brand_categories WHERE brand_id=?').run(id);
      db.delete(brands).where(eq(brands.id,id)).run();return brand;
    }).immediate();
    return NextResponse.json({success:true,data:{id:target.id,name:target.name}});
  } catch(error){return caught(error);}
}
