# Tedarikçi güncellemesi — dağıtım güvenliği

Durum: Bu belge ve 0029 aracı yerel çalışma alanında hazırlanmıştır; canlıda çalıştırılmamıştır. Kullanıcı, ortak satış deposu seçiminin canlıda kaydedildiğini ve çalıştığını teyit etmiştir.

## Ön koşullar

- Yeni bağımsız uygulama paketi ve `hosting/migrate-0029.cjs` için yayımlanan SHA-256 değerleri doğrulanmalı. Betik ayrıca 0028/0029 SQL, journal ve iki glibc SQLite binding hash'ini kontrol eder.
- `inspect` salt okunurdur. `backup` ve `apply` öncesinde uygulama, cron, worker ve tüm veritabanı yazıcıları durdurulmalı ve durdukları açıkça teyit edilmelidir; SQLite dosyası kopyalanırken WAL dahil güvenli SQLite backup API kullanılır.
- Uygulama ve DB yedekleri web kökü dışında, erişimi kısıtlı ayrı dosya ve dizinlerde tutulmalıdır. Betik mevcut yedeğin üstüne yazmaz. Canlı kullanıcı/şifreleri ve ortam dosyaları pakete eklenmez.
- Mevcut veri silinmez veya sıfırlanmaz. Stok, rezervasyon, açık satın alma veya sipariş bulunması bu eklemeli migration için başlı başına engel değildir. Eski ve yeni uygulama aynı anda yazmamalı; yeni uygulama 0029 tamamlanmadan çalıştırılmamalı.

## Betik

Node 22 kullanılarak `migrate-0029.cjs inspect|backup|apply MUTLAK_DB MUTLAK_YEDEK MUTLAK_STANDALONE` çağrılır; `inspect` için yedek yerine `-` verilebilir. `inspect`, 0028 sürümünü, DB bütünlüğünü, 24 depo trigger'ının gerçek SQL içeriğini ve ortak depo ayarını raporlar. Eksik/yanlış migration veya beklenmedik 0029 nesnesinde durur.

`backup` SQLite backup API ile dosya oluşturur ve kontrol eder. `apply`, yedeği doğrulayıp ayrı bir geçici kopya üzerinden bağlar. Bir IMMEDIATE transaction içinde mevcut DB ve yedeğin şemasını, tüm mevcut tablolarını (yinelenen satır sayıları, BINARY metin karşılaştırması ve SQLite tipleri dahil) ve `sqlite_sequence` karşılaştırır; herhangi bir değişiklikte durur. 0029'un tüm ifadelerini ve migration kaydını aynı transaction içinde çalıştırır; eski tabloların migration sonrası yine değişmediğini, yeni tabloların boş olduğunu, korumaları ve integrity/foreign key sonuçlarını kontrol eder. Herhangi bir hata transaction'ı geri alır.

## Geri dönüş

Önce tüm yazıcıları durdurun ve yeni durumun ayrı bir SQLite yedeğini alın. **Eski yedeğe dönmek, yedekten sonra gerçekleşen sipariş, stok, mal kabul ve diğer tüm değişiklikleri kaybettirir.** Yalnız yeni sürüm hiç yazma işlemi kabul etmeden önce, yetkili onayıyla doğrulanmış önceki DB ve uygulamaya birlikte dönülebilir. Yeni yazılar gerçekleşmiş veya olasıysa eski yedeği otomatik yüklemeyin; yeni DB'yi koruyun ve işlemleri mutabakatla değerlendirin. Yalnız uygulamayı eski sürüme alıp yeni sürüm açıkken yapılmış değişikliklerin güvenli biçimde geri alınacağını varsaymayın.

## Yerel prova kapsamı

Otomatik testler gerçek SQLite üzerinde stok/rezervasyonlu ve açık satın almalı örnek DB ile yedek almayı; değişen veri/şema/sequence ve farklı yinelenen satırları tespit etmeyi; zorlanan migration hatasında DDL ve tüm veriyi geri almayı; migration sırasında tetikleyiciyle değiştirilmiş stokta hata ile geri dönmeyi; başarıda eski stok ve siparişleri korumayı ve yedek kopyasını geri açmayı denetler. Bunlar canlı veritabanının bizzat incelendiği anlamına gelmez.

## Hazırlanan paket ve ek prova

- Kod sürümü: `dc63597`; paket `hosting/serpilen-tedarikci-dc63597.zip` SHA-256 `05ed07e5549bb5ecf68a2e662090c0163ddf861cb243ec07ecb809df1bc99c13`.
- `migrate-0029.cjs` SHA-256 `3d717933651b8cd6cff2ddd9fba9b35208d2a530fbe38b2136eb05e311b9f84a`; `0029_supplier_returns.sql` SHA-256 `da7303c863c05972e0d60493c1aa524b02b6e9bbbcf7b509f14bc3f69433e51f`; journal SHA-256 `bb86f7a6ac3652f7bc3de2136426069714d8a2f89a724d1dc0496a2bbc33b95b`.
- İki SQLite binding SHA-256: `2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5`. ZIP bütünlüğü ve iç hash'ler yerelde doğrulandı; çalışma zamanı DB, `.env` ve önceki ZIP dosyaları pakete dahil edilmedi.
- Ortak depo ID 5, fiziksel stok 8, ayrılmış stok 2 ve açık satın alma içeren sentetik 0028 DB'si üzerinde yedek ve 0029 uygulandı; kayıtlar korundu. Güncel standalone `/`, `/urunler`, health ve seçili ortak depo kontrollerini geçti; satın alma, mal kabul ve stoktan iade yapıldı. Yedek kopyasıyla önceki standalone ayrıca açıldı ve aynı sağlık/sayfa kontrollerini geçti; eski stok 8/2 kaldı. Bu yalnız yerel provadır, gerçek canlı DB'nin kopyası değildir.
