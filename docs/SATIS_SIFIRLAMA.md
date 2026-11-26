# Satış ve kapalı Z raporlarını sıfırlama (SQLite)

Bu işlem **geri alınması zor ve veri silen** bir işlemdir. Yalnızca yetkili işletme sahibi onayıyla, muhasebe ve yasal saklama yükümlülüklerini değerlendirdikten sonra çalıştırın. Bu betik kendiliğinden çalışmaz; uygulamaya, migration'a veya başlangıç akışına bağlı değildir.

## Kapsam

- **Silinir:** Tüm POS ve online siparişler (iptal, hazırlıkta, teslim edilmemiş ve diğer tüm durumlar dahil), sipariş kalemleri/durum geçmişi, iade kayıtları ve kalemleri, kapalı POS vardiyaları ve onlara bağlı kasa hareketleri/Z raporları. Müşteriler bu siparişleri artık takip edemez; sipariş ve satış raporları da sıfırlanır.
- **Korunur:** Ürünler, müşteriler, sadakat puanları, stok miktarları ve stok defteri. Silinen siparişlerle ilişkili sadakat hareketleri ve puanları tutulur, yalnızca artık bulunmayan siparişe ait ID bağlantısı kaldırılır. Eski sipariş numaralarının yeniden kullanılmaması için numara rezervasyonları korunur. Denetim kayıtları ve diğer analiz/tahmin geçmişleri de korunur; bunlar eski işlemlere referans içerebilir.
- Panelde satışa bağlı ciro, satış sayısı ve ortalama sepet sıfırlanır. **Müşteri sayısı ve kritik stok uyarısı** mevcut kayıtları yansıtmaya devam eder; bunları sıfırlamak müşteri veya stokları da değiştirmeyi gerektirir ve bu işlem kapsamında değildir.
- Açık veya durumu `CLOSED` olmayan herhangi bir vardiya varsa betik **hiçbir veriyi silmeden durur**. Önce vardiyaları normal POS akışından kapatın ve Z raporlarını ayrı olarak saklayın.

## Canlı sistemde uygulama

1. Yeni sürümün PR'ı onaylanıp canlıya alındıktan sonra, satışları ve sipariş alımını durdurun; tüm POS vardiyalarını normal şekilde kapatın. Daha sonra yönetim panelinden uygulamayı **durdurun**. Kullanıcıların işlem sırasında yeniden satış yapmadığından emin olun.
2. Canlı uygulamanın kullandığı **gerçek, mutlak SQLite dosya yolunu** hosting panelindeki `DATABASE_URL` ayarından doğrulayın. `sqlite:` veya `file:` öneki varsa aşağıdaki `DB` değişkenine öneksiz dosya yolunu yazın. Veritabanını, `data/` klasörünü ve `.env` dosyasını yedekleyin; dağıtım sırasında bu dosyaları değiştirmeyin veya silmeyin. Yedekler kişisel veri içereceğinden güvenli ve erişimi kısıtlı bir yerde tutulmalıdır.
3. Uygulama kök klasöründe `DB` ve `BACKUP_DIR` değerlerini canlı sisteme uygun **mutlak yollarla** kendiniz ayarlayın. `BACKUP_DIR`, tercihen dağıtımda üzerine yazılmayacak güvenli bir klasör olmalıdır. Önce sadece inceleyin:

   ```sh
   cd /uygulamanin/kok/klasoru
   DB="/canli/veritabaninin/mutlak/yolu.db"
   BACKUP_DIR="/guvenli/yedek/klasoru"
   node scripts/reset-sales.mjs --db "$DB" --inspect
   ```

   Ekranda görünen veritabanı yolunu, sipariş durumlarını ve silinecek sayıları doğrulayın. Açık/bilinmeyen vardiya sayısı sıfır olmalıdır. `--inspect` hiçbir kaydı değiştirmez. Yol veya kapsam doğru değilse **devam etmeyin**.
4. Bu kapsamı tekrar doğruladıktan sonra, aynı durdurulmuş uygulama ve aynı kabuk oturumunda çalıştırın:

   ```sh
   node scripts/reset-sales.mjs --db "$DB" --backup-dir "$BACKUP_DIR" --apply --confirm SATISLARI-VE-KAPALI-Z-RAPORLARINI-SIL
   ```

   Betik yazma kilidi alır; açık vardiya kontrolünü tekrarlar. SQLite yedekleme API'siyle ayrı bir yedek oluşturup bütünlüğünü ve kayıt sayılarını kontrol eder; ancak bundan sonra tek transaction içinde siler. Hata oluşursa silme işlemi geri alınır. Başarı mesajındaki **yedek yolunu** güvenli biçimde saklayın ve mümkünse ikinci bir güvenli konuma kopyalayın. Yedekleme veya kontrol başarısızsa uygulamayı yeniden satışa açmadan önce sorunu çözün.
5. Uygulamayı hosting panelinden yeniden başlatın. `/api/health` yanıtını ve yönetim panelindeki satış göstergelerini kontrol edin. Mevcut müşteri ve kritik stok sayıları sıfırlanmaz.

> Geri yükleme gerekirse uygulamayı durdurun; SQLite WAL/SHM dosyalarıyla birlikte doğru geri yükleme yapılmalıdır. Dosyaları çalışan veritabanının üzerine rastgele kopyalamayın.
