import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getRequestToken, getUserByToken, requireStaff, SESSION_COOKIE } from "@/lib/auth";
import { readCrmJson, validateCrmWrite } from "@/lib/crm-write";
import { DeletionError, deleteOrderReturn, previewOrderReturnDeletion } from "@/lib/delete-order-return";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const input=(kind:unknown,id:unknown):kind is "order"|"return" => (kind==="order"||kind==="return")&&typeof id==="number"&&Number.isSafeInteger(id)&&id>0;
function errorResult(error:unknown){
 if(error instanceof DeletionError)return NextResponse.json({success:false,error:error.message},{status:error.status,headers});
 console.error("Sipariş/iade silme işlemi başarısız:",error instanceof Error?error.name:'UnknownError');
 return NextResponse.json({success:false,error:"İşlem tamamlanamadı; hiçbir kayıt değiştirilmedi."},{status:500,headers});
}
export async function GET(request:Request){
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 const url=new URL(request.url),raw=url.searchParams.get('id'),kind=url.searchParams.get('kind'),id=Number(raw);
 if(!raw||!/^[1-9]\d*$/.test(raw)||!input(kind,id))return NextResponse.json({success:false,error:"Geçerli kayıt numarası gereklidir."},{status:422,headers});
 try{return NextResponse.json({success:true,data:previewOrderReturnDeletion(kind,id,gate.user)},{headers});}catch(error){return errorResult(error);}
}
export async function DELETE(request:Request){
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 const bad=validateCrmWrite(request);if(bad)return bad;
 if(!request.headers.get('origin')){const auth=request.headers.get('authorization')||'';const bearer=auth.startsWith('Bearer ')?await getUserByToken(auth.slice(7).trim()):null;if(!bearer||bearer.id!==gate.user.id)return NextResponse.json({success:false,error:"İstek kaynağı doğrulanamadı."},{status:403,headers});}
 const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
 const body=parsed.value as Record<string,unknown>|null;
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['kind','id','fingerprint','physicalConfirmed','cascadeConfirmed','rightsConfirmed','legacyConfirmed'].includes(k))||!input(body.kind,body.id)||typeof body.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(body.fingerprint)||body.physicalConfirmed!==true||typeof body.cascadeConfirmed!=='boolean'||typeof body.rightsConfirmed!=='boolean'||typeof body.legacyConfirmed!=='boolean')return NextResponse.json({success:false,error:"Geçerli kayıt ve açık fiziksel stok onayı gereklidir."},{status:422,headers});
 const current=await requireStaff(request);if(!current.ok||current.user.id!==gate.user.id)return NextResponse.json({success:false,error:"Silme yetkiniz bulunmuyor."},{status:403,headers});
 const cookieToken=(await cookies()).get(SESSION_COOKIE)?.value;
 const cookieUser=await getUserByToken(cookieToken);
 const token=cookieUser?.id===current.user.id?cookieToken:getRequestToken(request);
 if(!token)return NextResponse.json({success:false,error:"Oturum doğrulanamadı."},{status:403,headers});
 const sessionHash=createHash('sha256').update(token).digest('hex');
 try{return NextResponse.json({success:true,data:deleteOrderReturn(body.kind,body.id as number,{...current.user,sessionHash},{fingerprint:body.fingerprint,physicalConfirmed:true,cascadeConfirmed:body.cascadeConfirmed,rightsConfirmed:body.rightsConfirmed,legacyConfirmed:body.legacyConfirmed})},{headers});}catch(error){return errorResult(error);}
}
