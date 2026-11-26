# Katalog varyant tablosu

Tablo kategori, marka, ürün, renk/ölçü, alış fiyatı, satış fiyatı, fiili stok, depo, barkod ve işlemleri gösterir. Aynı varyant birden fazla depoda varsa her depo ayrı satırdır; rezervasyon ayrıca gösterilir. Stok satırı yoksa 0 gösterilir ve depo tahmin edilmez. Pasif ürün, varyant ve depolar işaretlenir. Alış fiyatı kaydedilmemişse uydurulmaz.

Varyant tablosu öncesinde kategori, marka, ürün, renk ve stok yeri filtreleri bulunur. Tek bir seçim yeterlidir; birden fazla filtre birlikte uygulanır. Depo filtresi yalnız o depoya ait satırları gösterir; stok kaydı olmayan varyantlar ayrı seçilebilir. Filtreler tablo verisi güncellendiğinde yeniden uygulanır ve tek düğmeyle temizlenebilir.

Düzenle, mevcut güvenli varyant ve depo stoğu düzenleme akışını seçilen varyantı öne çıkararak açar. Silme için katalog ve mevcut ürün silme rol yetkisi gerekir. Önizleme tüm depolardaki silinecek fiziksel stokları gösterir ve açık kalıcı silme onayı ister. Rezervasyon, defter/sipariş geçmişi veya başka varyant bağı, tutarsız stok, bekleyen POS hazırlığı veya değişen önizleme varsa silme durur; yetki ve oturum işlem içinde yeniden kontrol edilir. Silme ve audit aynı transaction'dadır.

Son varyant silinirse ürün varyantsız kalır; varyant stoğu ana ürüne taşınmaz. Ana ürün fiyatları ile varsa ana ürün stokları ve rezervasyonları önceden gösterilir. Satış deposundaki kullanılabilir ana stok için FIFO siparişleri aynı işlemde değerlendirilir. Satışa açık ürünün ana SKU, barkod ve fiyatları kullanılabilir hale gelebileceğinden onay ekranı dikkatle incelenmelidir. Silme işlemi fiziksel malı yok etmez, sistemdeki stok kayıtlarını siler.

Yeni migration gerekmez. Kod ve testler yereldedir; canlıya alınmadan önce güncel yedek ve dağıtım doğrulaması gerekir.
