/** Read credentials from the hosting environment only. Never print them. */
import 'dotenv/config';
import nodemailer from 'nodemailer';
const args=process.argv.slice(2);
if(args.includes('--help')) {
 console.log('Kullanım: node scripts/smtp-check.mjs [--send-to test@example.com]\nVarsayılan mod TLS ve SMTP kimlik doğrulamasını sınar. --send-to ile ayrıca belirtilen adrese deneme iletisi gönderir. SMTP_* ve PUBLIC_SITE_URL ortam değişkenleri gereklidir.');process.exit(0);
}
const index=args.indexOf('--send-to');
if((args.length && (index!==0 || args.length!==2)) || (index===0 && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1]) || /[\r\n]/.test(args[1])))) {console.error('Geçersiz parametre. --help kullanın.');process.exit(2);}
const {SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASSWORD,SMTP_FROM,PUBLIC_SITE_URL}=process.env;
if(!SMTP_HOST||!SMTP_PORT||!SMTP_USER||!SMTP_PASSWORD||!SMTP_FROM||!PUBLIC_SITE_URL){console.error('SMTP veya site ortam ayarları eksik.');process.exit(2);}
let url;try{url=new URL(PUBLIC_SITE_URL);}catch{console.error('PUBLIC_SITE_URL geçersiz.');process.exit(2);}
const port=Number(SMTP_PORT);
if(!Number.isInteger(port)||port<1||port>65535||url.protocol!=='https:'||url.username||url.password){console.error('SMTP portu veya HTTPS site adresi geçersiz.');process.exit(2);}
const transport=nodemailer.createTransport({host:SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:SMTP_USER,pass:SMTP_PASSWORD},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
try{
 await transport.verify();console.log('SMTP TLS bağlantısı ve kimlik doğrulaması başarılı.');
 if(index===0){await transport.sendMail({from:SMTP_FROM,to:args[1],subject:'Serpilen e-posta bağlantı testi',text:'Bu ileti Serpilen SMTP yapılandırması için gönderilmiş bir testtir. Herhangi bir sipariş veya ödeme işlemi içermez.'});console.log('Sağlayıcı test iletisini kabul etti. Gelen kutusu ve spam klasörünü ayrıca kontrol edin; kabul teslimatı garantilemez.');}
}catch{console.error('SMTP doğrulaması veya gönderimi başarısız. Sunucu ayarlarını ve sağlayıcı kayıtlarını inceleyin.');process.exitCode=1;}finally{transport.close();}
