# Ürün formu ve silme yetkisi — dağıtım

Kod: `9e0b357`. Bu sürüm için şema migration'ı yoktur; mevcut canlı DB'nin 0029 sürümünde olması gerekir. Yeni `productDelete` rol matrisi hücresi diğer roller için varsayılan kapalıdır; Süper Admin kilitli yetkisini korur. Stok, rezervasyon ve diğer ilişkili kayıtların silinmesini engelleyen kontroller korunur.

- Paket: `hosting/serpilen-revizyon-9e0b357.zip`, SHA-256 `fdcfba27f0c73682194b0d7fd1ece47bd8cfdf7fa4b38303c9f732763b8458d5`.
- `revizyon-deploy-check.cjs` SHA-256 `b93bc0bdfb573f23d8b294288dd21a90ce95331ecefa4be047f061de8fa1aa7f`.
- Her iki SQLite binding: SHA-256 `2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5`; arşivdeki hash'li bağımlılık kopyaları da doğrulandı.
- ZIP içine veritabanı, env dosyası, önceki ZIP'ler veya çalışma zamanı yüklemeleri dahil edilmez. Canlı `data` ve ortam dosyaları değiştirilmez.

Betik `inspect|backup|check MUTLAK_DB MUTLAK_YEDEK MUTLAK_STANDALONE` kullanır. `inspect` salt okunurdur ve yedek yerine `-` kullanılabilir. `backup` ve `check` öncesi uygulama, worker, cron ve tüm DB yazıcıları durdurulmalıdır. `backup` SQLite backup API ile WAL'i kapsayan, mevcut dosyanın üzerine yazmayan 0600 yedek oluşturur; `check` verileri ve şemayı yinelenen satır, SQLite türü, BINARY karşılaştırması ve sequence dahil doğrular. 0029 kaydı, trigger ve bütünlük kontrolü başarısızsa durur. Açık işlemler veya stok varlığı tek başına dağıtıma engel değildir; hiçbir veri sıfırlanmaz. Yedekler web kökü dışında tutulmalı ve kullanıcının açık izni olmadan silinmemelidir.

Uygulama değiştirilmeden önce eski standalone da web kökü dışında saklanır. Başlatma öncesi eski ve yeni süreçler aynı anda çalışmamalıdır. Başlatma sonrası sağlık kontrolü ve kullanıcı onaylı form/rol kontrolleri yapılır. Geri dönüşten önce tüm yazıcılar durdurulur; yeni işlemler yapıldıysa eski DB yedeğini geri yüklemek o işlemleri kaybettirir. Özellikle yeni `size` teknik alanı eski uygulama tarafından tanınmayabileceğinden, yeni sürüm veri kabul ettikten sonra uygulama veya DB otomatik geri alınmaz; mevcut veriler korunarak uyumluluk değerlendirilir.

Yerel testlerde, ZIP açılarak sentetik 0029 DB üzerinde inspect/backup/check, health, ana sayfa ve ürünler, varyant stoklarının çift kaydedilmemesi, varsayılan yetkisizlik, rol yetkilendirmesi, stoklu ürün silme koruması ve yetkili bağlantısız ürün silme kontrolleri geçti. Bu deneme canlı DB üzerinde yapılmamıştır.
