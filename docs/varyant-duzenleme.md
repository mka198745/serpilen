# Ürün düzenlemede varyant ve stok

Ürün & Katalog > Düzenle ekranında mevcut varyantların renk/ölçü, SKU, barkod, fiyat ve görsel bağlantıları düzenlenebilir. Varyant bilgileri bütün depolar için ortaktır; fiziksel stok yalnız seçilen aktif depoda değişir. Varsayılan depo ortak satış deposudur; seçili değilse aktif bir depo seçmek gerekir. Pasif varyantlar da görünür ve düzenlenir; bu ekran varyant eklemez veya silmez.

Stok alanı ekleme miktarı değil, sayım sonucu **toplam fiili miktardır**. Ayrılmış ve kullanılabilir miktarlar ayrıca gösterilir; rezervasyon tutarsızsa veya yeni fiili miktar ayrılmış miktardan küçükse kayıt durur. Eksik stok satırı sıfır kabul edilir; pozitif miktarda satır ve stok defteri hareketi aynı işlemde oluşturulur. Stok değişimi fiziksel doğrulama gerektirir. Satış deposuna stok artışı FIFO bekleyen siparişleri aynı işlemde değerlendirir; bildirimler mevcut outbox mekanizmasına alınır. SMTP kurulmamışsa e-posta gönderilemeyeceği yönündeki mevcut uyarı geçerlidir.

Ürün ana bilgileri ve varyantlar ayrı kaydetme düğmeleridir; biri diğerini kaydetmez. Varyant verisi, seçili depo stoku, aktif depo listesi veya ürün değişirse eski önizlemeyle kayıt reddedilir. Yetki ve oturum işlem içinde yeniden kontrol edilir; varyantlar, stok hareketleri, FIFO ve audit tek SQLite işlemidir. Bağlantı kesilirse sonucu varsaymayın, sayfayı yenileyerek kontrol edin.

Kontroller: `node --import tsx --test tests/edit-product-variants.test.ts tests/product-variant-edit-ui.test.mjs`; üretim build sonrasında `node --test tests/product-variant-edit-api.test.mjs`. Bu özellik kendi başına veritabanı migration'ı gerektirmez; aynı dağıtımdaki sipariş/iade silme özelliği ise 0030 offline migration ve doğrulanmış yedek gerektirir.
