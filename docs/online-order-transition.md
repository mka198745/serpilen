# Online sipariş ve iade: canlıya geçiş öncesi operasyon notları

Bu not bir dağıtım veya veritabanı değişikliği yapmaz. Yeni davranışın kullanılabilmesi için `0023_order_discount_claims`, `0024_pos_notifications`, `0025_pos_sale_intents` ve `0026_brand_categories` migration'ları sunucu başlamadan önce uygulanmalıdır. Önce uygulama ve SQLite veritabanının tutarlı yedeği alınmalı, migration yedeğin kopyasında ve gerçek hosting ortamında denenmelidir.

## Eski açık siparişler ve sonsuz rezervasyonlar

- Yeni oluşturulan veya stoktan sıraya alınan siparişlerin havale rezervasyonu 24 saat sürer. Eski `9999` süreli PAYMENT_HOLD kayıtları **otomatik olarak 24 saate çevrilmez**: başlangıç tarihi, bankadan geçmiş ödeme ve müşteriye verilen söz güvenle çıkarılamaz.
- Geçişten önce personel bu tür kayıtları sipariş, aktif rezervasyon, stok ve banka hareketleriyle tek tek mutabıklaştırmalı; müşteriyle konuşup yetkili sipariş ekranından ödeme onayı veya iptal etmelidir. Ödenmiş ancak gecikmiş havaleler için ayrıca manuel banka mutabakatı/iade gerekir. Rastgele SQL ile stok veya sayaç düzeltmeyin.
- Eski siparişlerde bu sürüme ait indirim hakları yoktur. İptal sırasında geçmiş kupon/kampanya sayaçları tahminen geri alınmaz. Sayaçların düzeltimi yalnız belgeli, ayrı mutabakatla yapılmalıdır.
- Süresiz veya eksik/tutarsız rezervasyonlu geçmiş kayıtların sayısı ve çözümü canlı veritabanında doğrulanmadan geçiş tamamlanmış sayılmaz.

## İşletim ve müşteri iletişimi

Node süreci çalışırken sıra kontrolü başlangıçta ve yaklaşık 30 saniyede bir yapılır; sipariş API çağrıları da kontrolü tetikler. Süreçlerin tamamı durmuşsa iptal ve sıradaki siparişe stok ayrılması sistem yeniden çalışana kadar gecikir; süre dolmuş rezervasyon ödeme onayında tüketilemez. Worker hataları sunucu günlüklerinde `Order queue maintenance failed` olarak görünür; düzenli izleme ve hizmet sürekliliği gerekir. Bozuk bir eski rezervasyon aynı işlemdeki sıra bakımını durdurabilir, böyle bir hata operatör incelemesi gerektirir.

Stok ayrılınca e-posta aynı veritabanı işlemiyle gönderim kuyruğuna alınır. Node worker kuyruktaki e-postaları SMTP üzerinden göndermeye çalışır; hata durumunda yeniden dener. SMS uygulanmaz (seçilen kanal e-postadır). SMTP kabulü gerçek teslimatı garantilemez; müşteri takip sayfasını da kontrol etmelidir. Gönderimin gerçekleşip gerçekleşmediğini yetkili Siparişler → mutabakat panelinden izlemelidir. Süre, e-posta tesliminden değil stok ayrılmasından başlar. Süreden sonra gelen EFT'ler otomatik eşleştirilmez; banka hareketleri manuel incelenmelidir.

SMTP ayarları sunucuda ortam değişkenleriyle yapılır: `SMTP_HOST`, `SMTP_PORT` (465 TLS veya STARTTLS destekli port), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `PUBLIC_SITE_URL` (HTTPS ana adres). Şifreleri repoya veya sohbetlere koymayın. TLS sertifikası doğrulanır. Canlı hesap ve alıcıyla test edilmeden e-posta çalışıyor kabul edilmemelidir. Güvenli ortam değişkenleri tanımlandıktan sonra sunucuda bu sürümün dosyaları ve bağımlılıklarıyla `node scripts/smtp-check.mjs` TLS/kimlik doğrulamasını, `node scripts/smtp-check.mjs --send-to DENEME_ADRESI` ise test iletisini sınar. Alıcıyı gerçek bir yetkili test adresiyle değiştirin; ortam değişkenlerinin değerlerini komut çıktısına veya sohbete yazdırmayın. Sunucunun çalışma ortamı ile worker'ın çalışma ortamının aynı yapılandırmayı kullandığını ayrıca doğrulayın. Ağ kesintisinde sağlayıcı mesajı kabul ettikten sonra işlem sonucu kaybolabilir: tekrar denemede nadiren yinelenen e-posta mümkündür; bu nedenle mesaj kimliği sabittir ve mesaj ödeme yapmadan güncel sipariş durumunun kontrol edilmesini ister. Teslimat sağlayıcı tarafında da izlenmelidir.

## İade

İade tutarı ürünlere orantılı dağıtılır; para sistem tarafından transfer edilmez. POS'ta önce tutar hazırlanır, personel gerçek ödemeyi dışarıda yapıp aynı kaydı onaylar. Ağ kesilirse yeniden ödeme yapmadan iade numarası ve banka/kasa kaydı kontrol edilmelidir. POS hazırlığı yapan açık vardiyanın kapanması veya nakit bakiyesinin değişmesi onay kaydını engelleyebilir: işlem sırasında vardiyayı açık tutun; para gönderilmişse ikinci kez göndermeyin ve yöneticiye bildirin. Hazırlanmış kaydın ekranı kaybolursa yönetim iade listesinde bulunarak incelenmelidir.

Eski veya sıfır tutarlı, bozuk tutarlı, eksik puan/stok verili siparişler otomatik hesap için uygun olmayabilir ve manuel inceleme gerektirir. Kısmi iadelerde kuruş dağılımını korumak için aynı kalemin sonradan açılmış aktif iadesi varken daha eski talep reddedilemez; önce sonraki talepler değerlendirilir. Parçalı POS tahsilatında nakit ve kart tutarları ayrı kaydedilir; vardiya nakit ve kart toplamlarına karşılık gelen paylar yazılır ve parçalı toplam bilgilendirme amacıyla ayrıca tutulur (iki kez gelir sayılmaz).

## Canlı öncesi açık kontroller

- Gerçek hostingte migration, worker izleme, eşzamanlı çok süreçli yazma ve yedekten geri dönüşü prova edin.
- POS tahsilatından önce sunucu, stoğu ve kesin kampanyalı tutarı aynı işlemde ayırır; kupon ve kullanılan puanlar da hazırlanma sırasında ayrılır. Stok/fiyat/kampanya değişse de hazırlanan tutar korunur. Tahsilat harici cihaz/kasada yapıldıktan sonra personel kayıt onayı verir; aynı anahtarlı tekrarlar tek satış döndürür. Satış henüz sonuçlanmadıysa ilgili vardiya kapatılamaz.
- Hazırlık otomatik süresiz bırakılır: uygulama veya bağlantı kesildiğinde tahsilatın yapılıp yapılmadığı otomatik bilinemez. POS ekranındaki “Sunucudaki açık satışları kontrol et” listesinden aynı kasiyer veya yetkili yönetici banka/POS hareketlerini kontrol edip yalnızca gerçek tahsilat varsa tamamlamalı; hiçbir ödeme alınmadıysa açıkça doğrulayıp iptal etmelidir. İptal stok ve hakları geri verir. Başarısız veya belirsiz işlemlerde tekrar tahsilat yapmayın. Nakit/kart parçalı işlemde yalnız bir kısmı tahsil edilmişse önce dışarıda mutabakat sağlayın; tamamı tahsil edilmiş veya hiç tahsil edilmemiş gibi onaylamayın.
- POS güvenliği için gerçek kasada son ürün, aynı anda vardiya kapama, promosyon değişimi, ağ kopması, cihaz yeniden açılması ve farklı yetkiliyle geri kazanım senaryolarını deneyin. Personel tarafından yanlış ödeme onayı, altyapı arızası, veritabanı bozulması veya gerçek dış ödeme sistemleri sistemin otomatik doğrulayabildiği durumlar değildir.
- Siparişler ekranındaki yetkili mutabakat paneli uzun süreli aktif hold ve hak kaydı olmayan indirimli eski siparişleri sayfalı listeler; kaydın eksik olması sayacın kullanıldığı anlamına gelmez. Gerçek banka ve geçmiş belgeleri karşılaştırın, eski iadeler ve indirim/puan/kasa kayıtlarını örneklerle doğrulayın. Canlı veriler otomatik düzeltilmez.
- Gerçek SMTP hesabını kurun, deneme alıcısıyla başarı/geri dönüş senaryolarını ve operatör uyarılarını doğrulayın.
- Canlı veritabanını değiştirmeden sayfalı ön kontrol için `DATABASE_URL="sqlite:/GERCEK/YOL/tuhafiye.db" node scripts/legacy-order-review.mjs` çalıştırılabilir; sonraki sayfa için `REVIEW_PAGE=2` kullanılır. Çıktı banka hareketi içermez ve sayaçların hangi siparişe ait olduğunu kanıtlamaz. Rapor ve banka kayıtlarını yetkili personel güvenli ortamda karşılaştırmalı; kişisel ve banka verilerini sohbetlere göndermemelidir. Bu komut verileri/migration'ları değiştirmez.

## Marka ve kategori geçişi

- `0026_brand_categories` mevcut ürünlerdeki geçerli marka/kategori çiftlerini başlangıç ilişkisi olarak aktarır; ürünleri değiştirmez. Ürünü olmayan eski markalar atanmamış kalır ve Markalar sekmesinden düzenlenebilir.
- Markaya birden fazla kategori atanabilir. Yeni ürün formunda ilgili markalar önce, diğer ve atanmamış markalar da ayrı grupta görünür; bu ilişki ürün kaydında zorunlu kısıt değildir. Mevcut veya kaynak bağlantısından gelen seçim otomatik silinmez.
- Aynı marka adıyla yeni kategori eklemek mevcut markanın kategorilerine ekler; düzenleme ekranı ise kategori listesini değiştirir. Canlıya geçmeden önce SQLite yedeğinde migration ve katalog doğrulamasını uygulayın.
