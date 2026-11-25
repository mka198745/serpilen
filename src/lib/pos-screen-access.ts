import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getRequestToken, getUserByToken, SESSION_COOKIE } from "@/lib/auth";
import { validateCrmWrite } from "@/lib/crm-write";

const hash=(s:string)=>crypto.createHash("sha256").update(s).digest("hex");
/** Match the same session selected by getSessionUserFromRequest (cookie first). */
export async function posSessionHash(request:Request,userId:number):Promise<string|null> {
  const cookie=(await cookies()).get(SESSION_COOKIE)?.value;
  for(const token of [cookie,getRequestToken(request)]) {
    if(!token) continue;
    const user=await getUserByToken(token);
    if(user) return user.id===userId ? hash(token) : null;
  }
  return null;
}
export async function safePosWrite(request:Request,userId:number) {
  const bad=validateCrmWrite(request);if(bad)return bad;
  if(!request.headers.get("origin")) {
    const auth=request.headers.get("authorization")||"";
    const actor=auth.startsWith("Bearer ")?await getUserByToken(auth.slice(7).trim()):null;
    if(!actor||actor.id!==userId)return NextResponse.json({success:false,error:"İstek kaynağı doğrulanamadı."},{status:403});
  }
  return null;
}
export async function hasPosGrant(request:Request,userId:number):Promise<boolean> {
  const token=request.headers.get("x-pos-grant"), session=await posSessionHash(request,userId);
  if(!token||!/^[0-9a-f]{64}$/.test(token)||!session)return false;
  return !!sqlite.prepare("SELECT 1 FROM pos_screen_grants WHERE grant_hash=? AND user_id=? AND session_hash=? AND expires_at>unixepoch()").get(hash(token),userId,session);
}
export const posLocked=()=>NextResponse.json({success:false,error:"POS kilitli; ekran PIN'inizle tekrar giriş yapın.",code:"POS_LOCKED"},{status:403,headers:{"Cache-Control":"private, no-store"}});
export const posGrantHash=hash;
