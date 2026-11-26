import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getRequestToken,getUserByToken,requireStaff,SESSION_COOKIE } from "@/lib/auth";
import { readCrmJson,validateCrmWrite } from "@/lib/crm-write";
import { deleteVariant,previewVariantDeletion,VariantDeleteError } from "@/lib/delete-variant";
import { processStockReadyNotifications } from "@/lib/order-notifications";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const validId=(id:unknown):id is number=>typeof id==='number'&&Number.isSafeInteger(id)&&id>0;
function failure(e:unknown){if(e instanceof VariantDeleteError)return NextResponse.json({success:false,error:e.message},{status:e.status,headers});console.error('Varyant silme başarısız:',e instanceof Error?e.name:'Unknown');return NextResponse.json({success:false,error:'İşlem tamamlanamadı; hiçbir kayıt değiştirilmedi.'},{status:500,headers});}
export async function GET(request:Request){
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 const raw=new URL(request.url).searchParams.get('id'),id=Number(raw);if(!raw||!/^[1-9]\d*$/.test(raw)||!validId(id))return NextResponse.json({success:false,error:'Geçerli varyant numarası gereklidir.'},{status:422,headers});
 try{return NextResponse.json({success:true,data:previewVariantDeletion(id,gate.user)},{headers});}catch(e){return failure(e);}
}
export async function DELETE(request:Request){
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;const bad=validateCrmWrite(request);if(bad)return bad;
 if(!request.headers.get('origin')){const auth=request.headers.get('authorization')||'';const bearer=auth.startsWith('Bearer ')?await getUserByToken(auth.slice(7).trim()):null;if(!bearer||bearer.id!==gate.user.id)return NextResponse.json({success:false,error:'İstek kaynağı doğrulanamadı.'},{status:403,headers});}
 const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;const body=parsed.value as Record<string,unknown>|null;
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['id','fingerprint','confirmed'].includes(k))||!validId(body.id)||typeof body.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(body.fingerprint)||body.confirmed!==true)return NextResponse.json({success:false,error:'Geçerli varyant ve açık silme onayı gereklidir.'},{status:422,headers});
 const current=await requireStaff(request);if(!current.ok||current.user.id!==gate.user.id)return NextResponse.json({success:false,error:'Oturum doğrulanamadı.'},{status:403,headers});
 const cookie=(await cookies()).get(SESSION_COOKIE)?.value,cookieUser=await getUserByToken(cookie);const token=cookieUser?.id===current.user.id?cookie:getRequestToken(request);if(!token)return NextResponse.json({success:false,error:'Oturum doğrulanamadı.'},{status:403,headers});
 try {const result=deleteVariant(body.id,{...current.user,sessionHash:createHash('sha256').update(token).digest('hex')},body.fingerprint,true);if(result.promoted)void processStockReadyNotifications().catch(()=>{});return NextResponse.json({success:true,data:result},{headers});}catch(e){return failure(e);}
}
