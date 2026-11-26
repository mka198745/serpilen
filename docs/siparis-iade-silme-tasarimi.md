# Sipariş ve iade silme — güvenlik ve dağıtım notları

Durum: Yerel uygulama ve testler hazırlanmıştır; **henüz canlıya alınmadı**. Canlı geçişte 0030 şema geçişi, çalışır uygulamanın durdurulması, ayrı doğrulanmış yedek ve bütünlük/dağıtım provası gereklidir. Eski reset/dağıtım araçları 0030 için güncel değildir.

## Uygulanan davranış

- Rol matrisindeki `orderReturnDelete` ve `orders` yetkileri gerekir. Süper Admin kilitli açık, diğerleri varsayılan kapalıdır. Aktif kullanıcı, rol, matris ve oturum silme transaction'ında yeniden doğrulanır.
- `GET /api/order-deletion` mevcut işlemi ve depo/varyant bazında fiziki, ayrılmış, değişim ve sonraki stokları gösterir. `DELETE` sunucuda aynı verileri yeniden hesaplayıp parmak izini karşılaştırır. Fiziki kontrol, bağlı iade silme ve puan/indirim değişimleri ayrı açık onay gerektirir.
- Satış ve iade hareketleri gerçek stok defteriyle eşleşmelidir. Eksik/yinelenmiş stok, tutarsız aktif rezervasyon, yetersiz kullanılabilir stok, eksik sahiplik veya hareketler işlem engelidir. Stok tersleme, iade guard'ları, hak değişimleri, operasyon kayıtlarının kaldırılması, FIFO ve audit tek `IMMEDIATE` transaction'dır.
- Sonuçlanmış iadelerin kuruş/adet tahsisi değiştirilmez guard olarak kalır. Silinmiş iade yeniden istenemez; doğrudan tekrar denemelerde para iadesi yapılmaması uyarılır. POS talep anahtarı, ödeme kaydı, tamamlanmış POS intent'i ve iade işlem bağlamı korunur. Kapanmış vardiya/Z tutarları değiştirilmez; banka işlemi yapılmaz.
- Kullanıcının seçimiyle silinen siparişin net sadakat etkisi ve kanıtlanmış kupon/kampanya kullanım sayacı terslenir. Mevcut bakiyeler ve sayaçlar önizlemede gösterilir, değişirse işlem durur. Puan işlemlerinin güvenlik geçmişi ve tersleme kaydı korunur. Tek başına iade silme daha önce yapılmış finansal iadeyi geri almadığından puan iade etkilerini geri almaz.
- Yeni online siparişlerde indirimlerin kapsamını kanıtlayan `COVERAGE` işareti aynı sipariş transaction'ında oluşturulur. İptal ve FIFO süresi dolumu bu işareti haklarla birlikte kapatır. Yeni POS işlemlerinde tamamlanmış intent'in değişmez teklif ve kupon bilgileri kullanılır.
- Silinen sipariş, satırları, durum geçmişi, sonuçlanmış iadeleri ve ilgili sonlanmış bildirimleri operasyon listeleri ve canlı siparişe dayalı KPI'lardan çıkar. Finans/kasa ve güvenlik kanıtları, stok defteri ve audit korunur. Kullanılabilir stok artarsa FIFO kuyruğu aynı transaction'da çalışır; ayrılmış stok önizlemeden sonra değişebilir.

## Bilinçli güvenlik sınırları

- Yalnız teslim edilmiş/ödenmiş veya tam iadesi sonuçlanmış siparişler; sonuçlanmış iadeler ve kapalı POS vardiyaları uygundur. Açık veya belirsiz ödeme, rezervasyon, bildirim, işlem veya iade silmeyi engeller. İptal edilmiş/eski siparişlerin belirsiz banka durumları otomatik tahmin edilmez.
- **Önceki online siparişlerde `COVERAGE` işareti bulunmaz.** Sistem kayıtlı kupon/kampanyaları gösterir; yetkili dış belgelerle listenin eksiksizliğini ayrıca doğrularsa silme yapılır, onay audit kaydında saklanır. Belgeler eksikse, hak kaydı çelişkiliyse veya indirim tutarı varken terslenecek hak kaydı bulunmuyorsa işlem durur. Eski POS satışında tamamlanmış intent/ödeme anahtarı yoksa da otomatik tahmin yapılmaz.
- Puan geçmişi eksik/çelişkili, geri alma sonrası puan bakiyesi negatif, kupon/kampanya sayacı yetersiz veya kayıtlar bilinemiyorsa işlem engellenir. Bilinmeyen yeni ilişkiler de otomatik silinmez.
- İade guard'ları ve POS güvenlik kayıtları eski operasyon kayıtlarının tamamı değildir; yasal saklama ve muhasebe gereklilikleri işletme tarafından değerlendirilmelidir.

## 0030 migration aracı

`hosting/migrate-0030.cjs` yalnız tüm uygulama süreçleri ve veritabanı yazıcıları durdurulduğunda kullanılmak üzere `inspect`, `backup` ve `apply` kipleri sağlar. Paket, SQLite binding'i, 0028/0029 şemasını ve migration kimliklerini doğrular; yedekten sonraki veri/şema değişikliklerini engeller; migration ve kaydını tek transaction'da uygular. Yerel testler hata anında rollback ve bağımsız yedek korunmasını doğrular. Araç tek başına canlı dağıtım izni veya provası değildir.
