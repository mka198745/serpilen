import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { readCrmJson } from "@/lib/crm-write";
import { safePosWrite,posSessionHash,posGrantHash,posLocked } from "@/lib/pos-screen-access";
import { readRoleMatrix,roleCanAccessModule } from "@/lib/role-matrix-server";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,'pos'))return NextResponse.json({success:false,error:'POS yetkiniz bulunmuyor.'},{status:403});
 const bad=await safePosWrite(request,gate.user.id);if(bad)return bad;
 const session=await posSessionHash(request,gate.user.id);if(!session)return posLocked();
 const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
 const body=parsed.value as Record<string,unknown>|null;
 if(!body||typeof body.action!=='string')return NextResponse.json({success:false,error:'Geçersiz istek.'},{status:400});
 if(body.action==='UNLOCK') {
  if(typeof body.pin!=='string'||!/^\d{6}$/.test(body.pin))return NextResponse.json({success:false,error:'6 rakamlı PIN girin.'},{status:422});
  const pin=body.pin,token=crypto.randomBytes(32).toString('hex');
  const status=sqlite.transaction(()=>{
   const row=sqlite.prepare('SELECT pin_hash,failed_attempts,locked_until FROM pos_screen_pins WHERE user_id=?').get(gate.user.id) as {pin_hash:string;failed_attempts:number;locked_until:number}|undefined;
   const now=Math.floor(Date.now()/1000);
   if(!row)return 'missing';if(row.locked_until>now)return 'locked';
   if(!verifyPassword(pin,row.pin_hash)){
    const attempts=row.locked_until>0&&row.locked_until<=now?1:row.failed_attempts+1;
    sqlite.prepare('UPDATE pos_screen_pins SET failed_attempts=?,locked_until=? WHERE user_id=?').run(attempts,attempts>=5?now+900:0,gate.user.id);
    return attempts>=5?'locked':'wrong';
   }
   sqlite.prepare('UPDATE pos_screen_pins SET failed_attempts=0,locked_until=0 WHERE user_id=?').run(gate.user.id);
   sqlite.prepare('DELETE FROM pos_screen_grants WHERE expires_at<=?').run(now);
   sqlite.prepare('INSERT INTO pos_screen_grants(grant_hash,user_id,session_hash,expires_at) VALUES(?,?,?,?)').run(posGrantHash(token),gate.user.id,session,now+60);
   return 'ok';
  }).immediate();
  if(status!=='ok')return NextResponse.json({success:false,error:status==='missing'?'Önce Hesabım bölümünden POS PIN’i belirleyin.':status==='locked'?'Çok fazla hatalı deneme; 15 dakika sonra tekrar deneyin veya şifrenizle PIN’i yenileyin.':'PIN hatalı.',code:status},{status:status==='locked'?429:403});
  return NextResponse.json({success:true,data:{grant:token,expiresIn:60}},{headers:{'Cache-Control':'private, no-store'}});
 }
 if(body.action==='TOUCH'||body.action==='LOCK') {
  const token=request.headers.get('x-pos-grant');if(!token||!/^[0-9a-f]{64}$/.test(token))return posLocked();
  const key=posGrantHash(token);
  if(body.action==='LOCK'){sqlite.prepare('DELETE FROM pos_screen_grants WHERE grant_hash=? AND user_id=? AND session_hash=?').run(key,gate.user.id,session);return NextResponse.json({success:true});}
  const updated=sqlite.prepare('UPDATE pos_screen_grants SET expires_at=unixepoch()+60 WHERE grant_hash=? AND user_id=? AND session_hash=? AND expires_at>unixepoch()').run(key,gate.user.id,session);
  return updated.changes?NextResponse.json({success:true,data:{expiresIn:60}},{headers:{'Cache-Control':'private, no-store'}}):posLocked();
 }
 return NextResponse.json({success:false,error:'Geçersiz işlem.'},{status:400});
}
