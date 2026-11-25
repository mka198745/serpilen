# POS ve online için ortak satış deposu — uygulama planı

Durum: Kod ve yerel testler hazırlanıyor; **canlıya uygulanmış veya doğrulanmış değildir.** Bu belge canlı sistemde değişiklik yapmaz.

## Onaylanan işleyiş

- Yönetici, aktif depolar arasından **tek bir ortak satış deposu** seçer. POS ve online satış aynı fiziksel ve ayrılmış stok kayıtlarını kullanır.
- Diğer depoların stokları bağımsız kalır. Depolar otomatik birleştirilmez, stok miktarları otomatik taşınmaz ve geçmiş kayıtlar değiştirilmez.
- Online stok yoksa mevcut FIFO ve 24 saatlik ödeme bekleme politikası, POS'ta ise kuyruksuz satış politikası korunur. Satış hazırlığı veya ödeme beklemesi ortak stoktan miktar ayırır; iki kanal aynı son ürünü satamaz.
- Online satışa açık tek depo, depoların stok toplamı değildir. Yönetim ekranında hangi depo kullanıldığı ve seçimin değişmesinin stokları taşımayacağı açıkça gösterilir.

## Mevcut bağlantılar ve değişmesi gerekenler

- `src/lib/warehouse-policy.ts`, `src/app/api/warehouses/route.ts` ve WMS UI: 2/3 sabit korumasını kaldır; seçilen ortak depoyu, seçim ve silme/pasifleştirme işlemleri arasında yarışa izin vermeden koru. Seçim değişikliği yetki, istek kaynağı ve denetim kaydıyla korunmalı.
- `src/lib/order-queue.ts`, `src/app/api/orders/route.ts`, `src/app/odeme/CheckoutClient.tsx`: online sipariş, stok kontrolü, FIFO sırası ve stok ayırmayı ortak depoya bağla. İstemciden gelen depo numarasına güvenme; aynı SQLite yazma işlemi içinde geçerli ayarı oku. Eski ödeme rezervasyonları kendi orijinal depo kayıtlarından sonuçlandırılmaya devam etmeli.
- `src/lib/pos-quote.ts`, `src/lib/pos-sale-intent.ts`, `src/lib/inventory-engine.ts`, POS bootstrap/vardiya/iade rotaları, `src/app/pos/PosTerminalClient.tsx`, `PosScreenGate.tsx`: teklif, vardiya, hazırlık, tahsilat, iptal ve iade aynı seçime dayanmalı. Açık hazırlığın kaydedildiği depo sonraki seçimden bağımsız doğrulanmalı; belirsiz harici ödeme için tekrar tahsilat yapılmamalı.
- `src/app/api/products/route.ts`, `src/app/api/variants/route.ts` ve `src/app/urun/[slug]/page.tsx`: müşteriye gösterilen online kullanılabilirlik yalnızca ortak satış deposu stoklarını yansıtmalı. Yönetimin tüm depo stoklarını görme ihtiyacı korunmalı; kamuya sunulan ve yönetim amaçlı veri ayırt edilmeli.
- `src/app/api/returns/route.ts`, `src/lib/order-returns.ts`: eski iadelerin kayıtlı depo kimliğini koru; yeni iade hedefini açıkça doğrula, sabit 3'e sessizce düşme.
- `src/app/admin/AdminDashboardClient.tsx`: ortak depo seçim ve mevcut depo bilgisi ile anlaşılır uyarılar; sabit POS vardiya sorgularının düzeltilmesi.

## Geçiş güvenliği

1. Canlıdaki mevcut depoların, miktarların ve tamamlanmamış POS/online satış, iade, vardiya ve rezervasyonların salt okunur kontrolü yapılmalı. Önceki sıfırlamanın bugünkü canlı durumla aynı olduğu varsayılmamalı.
2. İlk ortak depo, yetkili kullanıcı tarafından seçilmeli. Mevcut online deposunda kalan stok ayrıca gösterilmeli; aktarım gerekiyorsa miktarlar kullanıcının onayıyla izlenebilir stok transferi üzerinden yapılmalı. Geçmiş işlemler veya kayıtlar silinmemeli.
3. Açık vardiya, belirsiz POS tahsilatı/iadesi, aktif ödeme rezervasyonu veya bekleyen stok sırası varsa otomatik geçiş yapılmamalı; uygulama açık kayıtları ve gerekli işlemi belirtmeli. Bu sayede sipariş sırası veya ödeme yükümlülüğü sessizce farklı depoya taşınmaz.
4. Ayar değişikliği ve tüm engel kontrolleri aynı `IMMEDIATE` işlemde yapılmalı; eski sekmelerden gelen istekler de sunucuda yeniden doğrulanmalı. Mevcut ortak depo değiştirilirken de aynı kurallar uygulanmalı. Seçilen depo silinemez veya pasif yapılamaz; başka depoya güvenli geçişten sonra silme kontrolleri uygulanır.
5. Uygulama, migration ve canlıya geçiş, veritabanının doğrulanmış güncel yedeği alındıktan ve tüm yazıcılar durdurulduktan sonra birlikte uygulanmalı. Hata halinde işlem durmalı; otomatik silme veya sayaç düzeltme yapılmamalı.

## Kabul testleri

- Aynı son stok için POS hazırlığı ile online sipariş eşzamanlı yarıştığında en fazla biri stok ayırır; stok veya ayrılmış miktar negatife düşmez.
- POS satışı ve online havale rezervasyonu aynı satırın kullanılabilir miktarını anında azaltır; iptal ve 24 saatlik süre sonunda doğru miktar serbest bırakılır.
- FIFO sırasında eski bekleyen sipariş atlanmaz; online talep stoğu ayrılırsa POS kalan kullanılabilir stoktan satış yapar ve sırayı ihlal edecek şekilde rezervasyonu kullanamaz.
- Stok başka depoda varsa online ürün ekranı ve checkout bunu ortak depo stoğu gibi göstermez. Yönetim diğer depo stoklarını görmeye devam eder.
- Ortak depo değişimi açık vardiya, hazırlanmış POS satışı, açık iade, aktif ödeme rezervasyonu veya bekleyen online sipariş varken reddedilir; veri değiştirilmez. Eşzamanlı ayar/satış/silme testleri güvenli sonuç verir.
- Seçilen depo silme ve pasifleştirmeye karşı korunur; kullanılmayan eski online deposu yalnız tüm bağlı kayıt kontrollerinden geçerse silinebilir.
- Eski sipariş, iade, ödeme rezervasyonu ve stok defteri kayıtları kendi depo kimliği ve tutarlarıyla korunur. Yetkisiz, farklı kaynaklı veya hatalı ayar istekleri reddedilir.
- Ürün sayfası, POS PIN/vardiya/tahsilat/iade, online sipariş/havale/FIFO, yönetim, migration/rollback ve paketli hosting uygulaması regresyon testleri geçer.
