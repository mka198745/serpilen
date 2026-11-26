import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { sqlite } from "@/db";

type Notice = { id:number; order_id:number; attempts:number; lease_token:string; order_number:string; customer_email:string|null; status:string; deadline:number|null };

/** Called inside the transaction that gives a waiting order its stock. */
export function enqueueStockReadyNotice(orderId:number) {
  if (!sqlite.inTransaction) throw new Error("notification enqueue requires transaction");
  sqlite.prepare("INSERT OR IGNORE INTO order_notification_outbox(order_id,event) VALUES(?,'STOCK_READY')").run(orderId);
}

function claim():Notice|undefined {
  return sqlite.transaction(() => {
    // Notifications that can no longer be acted upon must never be sent as a new payment invitation.
    sqlite.prepare(`UPDATE order_notification_outbox SET status='CANCELLED',lease_token=NULL,lease_until=NULL
      WHERE status IN ('PENDING','SENDING') AND order_id IN (SELECT id FROM orders WHERE status<>'PENDING')`).run();
    const row=sqlite.prepare(`SELECT n.id FROM order_notification_outbox n JOIN orders o ON o.id=n.order_id
      WHERE o.status='PENDING' AND ((n.status='PENDING' AND n.next_attempt_at<=unixepoch()) OR (n.status='SENDING' AND n.lease_until<=unixepoch()))
      ORDER BY n.id LIMIT 1`).get() as {id:number}|undefined;
    if(!row) return undefined;
    const token=randomUUID();
    sqlite.prepare("UPDATE order_notification_outbox SET status='SENDING',lease_token=?,lease_until=unixepoch()+120,attempts=attempts+1 WHERE id=?").run(token,row.id);
    return sqlite.prepare(`SELECT n.id,n.order_id,n.attempts,n.lease_token,o.order_number,o.customer_email,o.status,
      (SELECT MIN(expires_at) FROM inventory_reservations r WHERE r.reference_type='PAYMENT_HOLD' AND r.status='ACTIVE' AND r.reference_id=CAST(o.id AS TEXT)) AS deadline
      FROM order_notification_outbox n JOIN orders o ON o.id=n.order_id WHERE n.id=?`).get(row.id) as Notice;
  }).immediate();
}

function smtpConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, PUBLIC_SITE_URL }=process.env;
  if(!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM || !PUBLIC_SITE_URL) throw new Error("SMTP yapılandırması eksik");
  const port=Number(SMTP_PORT), url=new URL(PUBLIC_SITE_URL);
  if(!Number.isInteger(port)||port<1||port>65535 || url.protocol!=="https:" || url.username || url.password) throw new Error("SMTP veya site adresi geçersiz");
  return {host:SMTP_HOST,port,user:SMTP_USER,pass:SMTP_PASSWORD,from:SMTP_FROM,site:url.origin};
}

export async function sendOneStockReadyNotice() {
  const notice=claim();if(!notice)return false;
  try {
    if(!notice.customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notice.customer_email) || /[\r\n]/.test(notice.customer_email)) throw new Error("Müşteri e-posta adresi eksik veya geçersiz");
    if(!notice.deadline || notice.deadline<=Math.floor(Date.now()/1000)) throw new Error("Ödeme süresi doldu");
    const cfg=smtpConfig();
    const transport=nodemailer.createTransport({host:cfg.host,port:cfg.port,secure:cfg.port===465,requireTLS:cfg.port!==465,auth:{user:cfg.user,pass:cfg.pass},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
    const deadline=new Date(notice.deadline*1000).toLocaleString("tr-TR",{timeZone:"Europe/Istanbul",dateStyle:"long",timeStyle:"short"});
    await transport.sendMail({from:cfg.from,to:notice.customer_email,subject:`${notice.order_number} siparişiniz için stok ayrıldı`,text:`Merhaba,\n\n${notice.order_number} numaralı siparişinizin tüm ürünleri için stok ayrıldı. Havale/EFT ve banka onay süresi ${deadline} (Türkiye saati) itibarıyla sona erer. Siparişinizin güncel durumunu ve ödeme bilgilerini ${cfg.site}/siparis-takip adresinden sipariş numaranız ve telefonunuzla kontrol edin. Süre dolmuş veya sipariş iptal edilmişse ödeme yapmayın.\n\nSerpilen`,messageId:`<stock-ready-${notice.id}@${new URL(cfg.site).hostname}>`});
    sqlite.prepare("UPDATE order_notification_outbox SET status='SENT',sent_at=unixepoch(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=? AND status='SENDING' AND lease_token=?").run(notice.id,notice.lease_token);
  } catch(error) {
    // Do not persist SMTP response text, credentials, or customer addresses in logs.
    const reason=error instanceof Error && ["SMTP yapılandırması eksik","SMTP veya site adresi geçersiz","Müşteri e-posta adresi eksik veya geçersiz","Ödeme süresi doldu"].includes(error.message) ? error.message : "SMTP gönderimi başarısız";
    sqlite.prepare("UPDATE order_notification_outbox SET status='PENDING',next_attempt_at=unixepoch()+?,last_error=?,lease_token=NULL,lease_until=NULL WHERE id=? AND status='SENDING' AND lease_token=?").run(Math.min(3600,60*2**Math.min(notice.attempts,6)),reason,notice.id,notice.lease_token);
  }
  return true;
}
let running=false;
export async function processStockReadyNotifications() {
  if(running)return;running=true;
  try { for(let i=0;i<20;i++) if(!await sendOneStockReadyNotice())break; }
  finally { running=false; }
}
