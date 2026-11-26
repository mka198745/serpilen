import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { readCrmJson } from "@/lib/crm-write";
import { safePosWrite } from "@/lib/pos-screen-access";
import { readRoleMatrix,roleCanAccessModule } from "@/lib/role-matrix-server";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,'pos'))return NextResponse.json({success:false,error:'POS yetkiniz bulunmuyor.'},{status:403});
 return NextResponse.json({success:true,data:{configured:!!sqlite.prepare('SELECT 1 FROM pos_screen_pins WHERE user_id=?').get(gate.user.id)}},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request) {
 const gate=await requireStaff(request);if(!gate.ok)return gate.response;
 if(!roleCanAccessModule(await readRoleMatrix(),gate.user.role,'pos'))return NextResponse.json({success:false,error:'POS yetkiniz bulunmuyor.'},{status:403});
 const bad=await safePosWrite(request,gate.user.id);if(bad)return bad;
 const parsed=await readCrmJson(request);if(!parsed.ok)return parsed.response;
 const body=parsed.value as Record<string,unknown>|null;
 if(!body || typeof body.pin!=='string'||!/^\d{6}$/.test(body.pin)||typeof body.currentPassword!=='string'||!body.currentPassword || body.currentPassword.length>128)return NextResponse.json({success:false,error:'Mevcut şifrenizi ve 6 rakamlı PIN girin.'},{status:422});
 const pin=body.pin, password=body.currentPassword;
 // Password check and grant invalidation are serialized with PIN replacement.
 const result=sqlite.transaction(()=>{
  const row=sqlite.prepare('SELECT password_hash FROM users WHERE id=? AND is_active=1').get(gate.user.id) as {password_hash:string}|undefined;
  const attempts=sqlite.prepare('SELECT failed_attempts,locked_until FROM pos_pin_password_attempts WHERE user_id=?').get(gate.user.id) as {failed_attempts:number;locked_until:number}|undefined;
  const now=Math.floor(Date.now()/1000);
  if(attempts && attempts.locked_until>now)return 'locked';
  if(!row||!verifyPassword(password,row.password_hash)) {
   const n=attempts && !(attempts.locked_until>0&&attempts.locked_until<=now) ? attempts.failed_attempts+1 : 1;
   sqlite.prepare('INSERT INTO pos_pin_password_attempts(user_id,failed_attempts,locked_until) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET failed_attempts=excluded.failed_attempts,locked_until=excluded.locked_until').run(gate.user.id,n,n>=5?now+900:0);
   return n>=5?'locked':'wrong';
  }
  sqlite.prepare('DELETE FROM pos_pin_password_attempts WHERE user_id=?').run(gate.user.id);
  if(verifyPassword(pin,row.password_hash))return 'wrong';
  const pinHash=hashPassword(pin);
  sqlite.prepare('INSERT INTO pos_screen_pins(user_id,pin_hash,failed_attempts,locked_until) VALUES(?,?,0,0) ON CONFLICT(user_id) DO UPDATE SET pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=0').run(gate.user.id,pinHash);
  sqlite.prepare('DELETE FROM pos_screen_grants WHERE user_id=?').run(gate.user.id);
  return 'ok';
 }).immediate();
 if(result!=='ok')return NextResponse.json({success:false,error:result==='locked'?'Çok fazla hatalı deneme; 15 dakika sonra tekrar deneyin.':'Şifre doğrulanamadı veya PIN hesap şifrenizle aynı.'},{status:result==='locked'?429:403});
 return NextResponse.json({success:true,message:'POS ekran PIN’i kaydedildi.'},{headers:{'Cache-Control':'private, no-store'}});
}
