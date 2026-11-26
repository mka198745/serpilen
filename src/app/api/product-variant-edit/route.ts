import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getRequestToken, getUserByToken, requireStaff, SESSION_COOKIE } from "@/lib/auth";
import { readCrmJson, validateCrmWrite } from "@/lib/crm-write";
import { publicHttpsUrl, resolvePublicHost } from "@/lib/product-import/safe-fetch";
import { VariantEditError, previewVariantEdit, saveVariantEdits } from "@/lib/edit-product-variants";
import { processStockReadyNotifications } from "@/lib/order-notifications";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const id=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
function failure(e:unknown){if(e instanceof VariantEditError)return NextResponse.json({success:false,error:e.message},{status:e.status,headers});console.error('Varyant düzenleme başarısız:',e instanceof Error?e.name:'Unknown');return NextResponse.json({success:false,error:'İşlem tamamlanamadı; hiçbir değişiklik kaydedilmedi.'},{status:500,headers});}
export async function GET(request:Request){
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 const url=new URL(request.url),p=url.searchParams.get('id'),w=url.searchParams.get('warehouseId');
 if(!p||!/^[1-9]\d*$/.test(p)||!id(Number(p))||(w!==null&&(!/^[1-9]\d*$/.test(w)||!id(Number(w)))))return NextResponse.json({success:false,error:'Geçersiz ürün veya depo.'},{status:422,headers});
 try{return NextResponse.json({success:true,data:previewVariantEdit(Number(p),w===null?undefined:Number(w),gate.user)},{headers});}catch(e){return failure(e);}
}
export async function PATCH(request:Request){
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 const bad=validateCrmWrite(request);if(bad)return bad;
 if(!request.headers.get('origin')){const auth=request.headers.get('authorization')||'';const bearer=auth.startsWith('Bearer ')?await getUserByToken(auth.slice(7).trim()):null;if(!bearer||bearer.id!==gate.user.id)return NextResponse.json({success:false,error:'İstek kaynağı doğrulanamadı.'},{status:403,headers});}
 const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
 const body=parsed.value as Record<string,unknown>|null;
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['productId','warehouseId','fingerprint','physicalConfirmed','variants'].includes(k))||!id(body.productId)||!id(body.warehouseId)||typeof body.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(body.fingerprint)||typeof body.physicalConfirmed!=='boolean'||!Array.isArray(body.variants))return NextResponse.json({success:false,error:'Geçersiz varyant isteği.'},{status:422,headers});
 try {
  const preview=previewVariantEdit(body.productId,body.warehouseId,gate.user);
  // Existing unchanged image URLs remain usable; new links must be public HTTPS.
  const hosts=new Map<string,Promise<unknown>>(),signal=AbortSignal.timeout(4000);
  for(const row of body.variants){if(!row||typeof row!=='object'||typeof row.imageUrl!=='string')continue;const old=preview.variants.find(v=>v.id===row.id);if(!row.imageUrl.trim()||row.imageUrl.trim()===old?.imageUrl)continue;try{const u=publicHttpsUrl(row.imageUrl.trim());row.imageUrl=u.href;if(!hosts.has(u.hostname))hosts.set(u.hostname,resolvePublicHost(u.hostname,signal));}catch{throw new VariantEditError('Varyant görsel adresi güvenli bir HTTPS adresi olmalıdır.',422);}}
  try{await Promise.all(hosts.values());}catch{throw new VariantEditError('Varyant görsel adresi güvenli veya erişilebilir değil.',422);}
  const current=await requireStaff(request);if(!current.ok||current.user.id!==gate.user.id)return NextResponse.json({success:false,error:'Oturum doğrulanamadı.'},{status:403,headers});
  const cookie=(await cookies()).get(SESSION_COOKIE)?.value,cookieUser=await getUserByToken(cookie);const token=cookieUser?.id===current.user.id?cookie:getRequestToken(request);
  if(!token)return NextResponse.json({success:false,error:'Oturum doğrulanamadı.'},{status:403,headers});
  const result=saveVariantEdits(body.productId,body.warehouseId,{...current.user,sessionHash:createHash('sha256').update(token).digest('hex')},body.variants,body.fingerprint,body.physicalConfirmed);
  if(result.promoted)void processStockReadyNotifications().catch(()=>{});
  return NextResponse.json({success:true,data:result},{headers});
 }catch(e){return failure(e);}
}
