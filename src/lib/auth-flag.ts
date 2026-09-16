/**
 * Kullanıcı/giriş sistemi ana anahtarı.
 *
 * false → GEÇİCİ KAPALI: giriş ekranı gizlenir, personel butonları herkese
 * görünür, /admin /pos /toptan-b2b koruması uygulanmaz (doğrudan açılır).
 * true  → sistem açık: giriş + sunucu koruması çalışır.
 *
 * Değişiklikten sonra derleyip yeniden başlatın (`npm run build && npm start`).
 * (İstemci + sunucu ortak kullandığı için saf TS modülüdür; Node import'u yok.)
 */
export const AUTH_ENABLED = false;
