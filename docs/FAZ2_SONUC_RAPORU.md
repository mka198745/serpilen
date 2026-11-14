# FAZ 2 — Ticari Optimizasyon: Sonuç Raporu

Tarih: 2026-11-13 · Branch: `arena/01a0a9cf-serpilen` · Plan: AŞAMA 1→11
Faz 1 altyapısı yeniden kullanıldı (yeniden yazılmadı); LLM/harici AI API yok; deterministik; SQLite veri modeline bağlı; canlı DB'ye FAZ 2 verisi yazılmadı (öneri/aksiyon yazımları yalnızca kullanıcı aksiyonuyla).

## Özet durum

| Aşama | Kapsam | Durum |
|---|---|---|
| 1 | Proje denetimi & veri yeterlilik | ✅ `docs/FAZ2_ASAMA1_PROJE_DENETIMI.md` |
| 2 | Ortak çekirdek (finans, güvenilirlik, skor, öncelik, fırsat motoru) + 8 test | ✅ 20/20 test |
| 3 | Smart Pricing (marj, katkı, hedef fiyat, simülasyon, fırsatlar) | ✅ + test |
| 4 | Campaign & Advertising (indirim, kupon, ROAS/ROI/CAC, manuel reklam CRUD) | ✅ + test |
| 5 | Market Basket (destek/güven/lift, çapraz satış) | ✅ + test |
| 6 | Supplier Performance (zamanında teslim, doluluk, termin, kalite, konsantrasyon) | ✅ + test |
| 7 | Returns & Quality (iade oranı, neden Pareto'su, yorum kalitesi) | ✅ + test |
| 8 | Procurement (reorder, ölü stok, fazla stok, ABC bağlamı) | ✅ + test |
| 9 | Commercial Opportunity Engine (havuz, dedup, döngü, audit, gerçekleşen etki) | ✅ scrathed doğrulandı |
| 10 | UI (Intelligence Center → "Ticari Optimizasyon" sekmesi, 8 alt görünüm) | ✅ build geçti |
| 11 | Test + build + canlı migration + smoke (scratch) + bu rapor | ✅ aşağıda |

Toplam test: **66/66 yeşil** (46 FAZ 1 + 20 FAZ 2). Lint: FAZ 2 ile **0 yeni hata** (taban 36 hata korunur; tümü FAZ-1-öncesi kod tabanındaki `react-hooks/set-state-in-effect` bulguları). Build: başarılı; 12 yeni API ucu üretildi.

## Yeni/yansıyan parçalar

- Migration `0005_commercial_optimization_faz2` (SQLite, canlıya uygulandı — yedek: `data/backups/tuhafiye.db.bak-20261113-commercial-faz2`): `commercial_opportunities`, `opportunity_history`, `opportunity_impact_results`, `advertising_performance`. MySQL şeması (`schema.mysql.ts`) manuel eşlenik tutuldu (repo konvansiyonu: çalışma zamanı SQLite).
- `src/lib/intelligence/commercial/{core,pricing,campaigns,basket,suppliers,quality,procurement,...}` + `data-prep.ts` (salt okuma yükleyici; FAZ 1 `SalesBundle` üzerine) + `service.ts` (tek çağrı noktası `runCommercialAnalysis`).
- API: `/api/intelligence/commercial/{summary,analyze,pricing,campaigns,basket,suppliers,quality,procurement,opportunities,opportunities/[id],settings,advertising}` — hepsi `requireStaff`; yazma/aksiyon uçları SUPER_ADMIN & STORE_MANAGER.
- UI: `CommercialOptimization.tsx` — Intelligence Center'da 10. sekme ("Ticari Optimizasyon"): Özet & Fırsatlar, Akıllı Fiyatlama, Kampanya & Reklam (+reklam girişi CRUD), Sepet Analizi, Tedarikçi Performansı, İade & Kalite, Satınalma & Stok, FAZ 2 Ayarları; fırsat detay modalında onay akışı + "Gerçekleşen Etkiyi Kaydet & Tamamla".
- Komutlar: `scripts/commercial-smoke.ts` (uçtan uca, scratch-korumalı), `scripts/scratch-commercial-seed.ts` (sentetik scratch verisi: tedarikçiler/PO/GDN/kampanya/kupon/yorum/iade/reklam).

## Gerçek scratch doğrulaması (sentetik 557+33 sipariş, 140+ gün)

`DATABASE_URL="sqlite:./data/scratch-commercial.db" npx tsx scripts/scratch-commercial-seed.ts && npx tsx scripts/commercial-smoke.ts`

- **Pricing (VERIFIED):** maliyet kapsamı %90; 1 maliyet-altı satış (Ürün 3, kampanya 50 TL < maliyet 65 TL, CRITICAL fırsat ≈ 3.090 TL), 1 düşük marjlı hacim (Ürün 2, önerilen 144 TL, ≈ 5.184 TL), 1 kampanya-altı-maliyet; 1 maliyet-bilinmeyen ürün dürüstçe `COST_UNKNOWN` işaretlendi.
- **Campaigns (PARTIAL):** indirim oranı %2.68; Google reklamı ROAS 2.5 → SCALE_UP fırsatı; Meta reklamı ROAS 0.4 / CAC 600 TL → LOSING fırsatı (tasarruf ≈ 966 TL); süresi geçmiş ama aktif kampanya yakalandı (`EXPIRED_BUT_ACTIVE`); atfedilen katkı %48.78 varsayımıyla ROI -80.5% olarak hesaplandı; reklam atfı sipariş bazında yapılamaz notu her yerde duruyor.
- **Basket (VERIFIED):** niş çift lift **11.48** (26 birliktelik) → CROSS_SELLING fırsatı üretildi; kaldırılsın diye eşikler FAZ 2 ayarlarından değişebilir.
- **Suppliers (PARTIAL):** Anadolu İplik 98.8/100 (kapsama %100, doluluk %100, zamanında %100); Geç Teslimat Tekstil 44.1/100 (kapsama %90, doluluk %71, zamanında %0, termin 10g vs taahhüt 3g) → SUPPLIER_IMPROVEMENT fırsatı; "Hiç Alınmadı Toptan" yalnızca kayıt puanıyla 80/100 ama kapsam %5 olarak raporlandı; Örgü İpleri'nde %75.9 pay → `CONCENTRATED` riski işaretlendi.
- **Quality (PARTIAL):** 7 gerçekleşen iade; Pareto: BEDEN/NUMARA %42.9, KUMAŞ/İPLİK %28.6; Ürün 2: 6 iade + yorum ort. 2.33 → `LOW_RATING` fırsatı; iade alarmı (%8) tetiklenmedi, eşiği geçmediği için fırsat Üretilmedi (gürültü yok).
- **Procurement (PARTIAL):** ölü stok 87.160 TL (4 kalem, son 90 günde sıfır satış) → CASH_FLOW_OPTIMIZATION fırsatı; fazla stok 22.050 TL; 2 kalemde reorder adayı (Ürün 1: 67 adet öneri).
- **Opportunity Engine:** ilk analiz 12 fırsat üretti; 2. çalıştırmada **0 yeni / 12 güncellenen** (dedup `opportunity_key` ile; deterministik anahtarlar). Yaşam döngüsü: NEW→UNDER_REVIEW→APPROVED→IN_PROGRESS→COMPLETED, gerçekleşen etki 2.500 TL girildi → **gerçekleşme %80.9**; kayıtlar `opportunity_history` + `audit_logs`'a işlendi (COMMERCIAL_OPPORTUNITY_APPROVED/ASSIGNED/COMPLETED, COMMERCIAL_ANALYSIS_RUN ×3). Scratch HTTP smoke CRUD/aksiyon uçlarında 200/400 döndü; canlı (üyeliksiz) istek 401 döndü.
- **Canlı DB:** 1 sipariş içerir → canlı ekranlar `INSUFFICIENT_DATA` gösterecek (uydurma veri yazılmadı). Önizleme: `http://0.0.0.0:3000` → Admin → Operasyon → Intelligence Center → **Ticari Optimizasyon**.

## Dürüstlük ve sınırlar (değişmedi)

1. Sipariş↔kampanya bağı şemada yok — kampanya atfı; pencerex×hedef tahmini veya kümülatif sayaçlardır, böyle etiketlenir. Reklam ROAS/ROI/CAC **yalnızca manuel `advertising_performance` kayıtlarıyla** hesaplanır; kayıt yoksa bölümler boş döner.
2. Elastikiyet/rakip verisi yok — fiyat simülasyonu düz talep (FLAT) varsayar; her önerinin "Varsayımlar" bölümünde yazar. Maliyete geçiş: komisyon/kargo/paket/ödeme komisyonu maliyetleri şemada yok; katkı marjı brüt katkıdır (`MISSING_VARIABLE_COST_KEYS` her satırda listelenir).
3. Tedarikçi ürün bağlantısı PO geçmişinden türetilir; kapsama % her skorun yanında. SINGLE_SOURCE alarmı yalnızca PO geçmişi içindir; PO dışı tedarik görülemez.
4. İade nedeni serbest metindir; anahtar kelime kümeleme hata payı taşır; bucket "BELİRTİLMEMİŞ" açıkça listelenir.
5. Hiçbir öneri otomatik uygulanmaz; ürün fiyatı/siparişi/stoğu FAZ 2 tarafından yazılmaz; tüm geçişler yönetici onayı + audit log'ludur.
6. Terminaldeki fırsat aynı sinyalle tekrar geldiğinde sessizce yeniden açılmaz/kopya üretmez; yönetici manuel `reopen` yapar.

## Bilinen eksikler (kapsam dışı, kayıtlı)

- `order_applied_promotions` yapısal bağı yoksa sipariş bazında kesin kampanya atfı mümkün değildir.
- Sepet terk / funnel olay verisi şemada yok; Market Basket yalnız tamamlanan siparişleri kapsar.
- Geçmiş alış maliyeti kaydı yok; COGS cari `buy_price` üzerindendir.
- Kayıp %30 geri kazanım varsayımları tahminîdir (ölçülmüş etki değildir); gerçek oran `opportunity_impact_results` ile yönetici ölçümüyle kapanır.
- MySQL şema paritesi dosya düzeyindedir; runtime SQLite'tır (repo konvansiyonu).

## Test & doğrulama komutları

```bash
npx tsx --test tests/intelligence/*.test.ts tests/intelligence/commercial/*.test.ts   # 66/66
npm run lint                                                                           # FAZ 2 ile +0 hata
npm run build                                                                          # başarılı (12 yeni rota)
DATABASE_URL="sqlite:./data/scratch-commercial.db" npx tsx scripts/scratch-commercial-seed.ts
DATABASE_URL="sqlite:./data/scratch-commercial.db" npx tsx scripts/commercial-smoke.ts  # uçtan uca
```
