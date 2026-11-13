# FAZ 3 — KARAR ZEKÂSI (COMMERCE INTELLIGENCE ENGINE) — SONUÇ RAPORU

Tarih: 2026-11-13 · Branch: `arena/01a0a9cf-serpilen` · Temel: FAZ 1 (`6858df9`) + FAZ 2 (`d6c7fb1`)
Durum: **FAZ 3 TAMAM.** Migration 0006 canlı `data/tuhafiye.db`'ye kullanıcı onayıyla uygulandı (2026-11-13 20:10, taze yedek `tuhafiye.db.bak-20261113-201053-faz3`, integrity ok, mevcut kayıtlar değişmedi).

---

## 1. AŞAMA AŞAMA TAMAMLANMA ÖZETİ

| # | AŞAMA | Durum | Kanıt |
|---|---|---|---|
| 1 | Mevcut sistem denetimi + teknik plan | ✅ TAMAM | `docs/FAZ3_ASAMA1_DENETIM_VE_PLAN.md` |
| 2 | Karar değerlendirme modeli (MCDA) | ✅ TAMAM | Weighted Scoring (11 kriter, faz3.* ağırlıkları, normalize) + Cost-Benefit. AHP/TOPSIS ilk sürümde YOK (spec izniyle) |
| 3 | Recommendation engine + alternatif değerlendirme | ✅ TAMAM | `decision/core`: kayıt dedup (decisionKey), 4'li alternatif (CURRENT/CONSERVATIVE/BALANCED/AGGRESSIVE), rank, audit |
| 4 | Çelişki tespiti (conflict detection) | ✅ TAMAM | `decision/core/conflicts` — anahtar bazlı dedup (örn. PRICE_UP_VS_DISCOUNT), `decision_conflicts` tablosu |
| 5 | Güven modeli | ✅ TAMAM | Data Coverage / Statistical Confidence / Decision Confidence AYRI; en yüksek skor otomatik kazanan değil |
| 6 | Erken Uyarı Motoru | ✅ TAMAM | 10 dedektör (sales drop, margin, stockout, overstock, ROAS, iade, tedarikçi gecikme, tahmin sapması, anomali, stok eritme), risk skoru 0-100, severity, dedup (alertKey) + tekrar sayısında severity kademesi, EXPIRE sweep |
| 7 | What-if Simulation Engine | ✅ TAMAM | 6 kategori (PRICING, SALES, PROCUREMENT, MARKETING, INVENTORY, FINANCIAL); parametre doğrulama; kullanıcı aralığı yoksa VARSAYIMSAL ±10% + etiket; best/worst etiketli |
| 8 | Monte Carlo Engine | ✅ TAMAM | Seed'li PRNG (seed + algorithm_version saklanır); normal/lognormal/uniform/triangular/poisson/empirical; korelasyon matrisi doğrulamalı (PSD değilse RED); boşsa "bağımsızlık varsayımı" raporda etiketli; outlier clip (faz3 ayarı); yakınsama kontrolü; |r| duyarlılığı |
| 9 | Sonuç ölçümü (outcomes) | ✅ TAMAM | `recordOutcome` (yalnız IMPLEMENTED/MONITORING/COMPLETED), `computeEffectiveness` (kabul/uygulama/başarı oranı, finansal gerçekleşme, tür kırılımı) |
| 10 | Yönetim Hedefleri | ✅ TAMAM | AUTO ölçüm (9 KPI), kategori-KPI uyumu doğrulaması, çelişki tespiti (ciro↔marj vb.), ilerleme formülü KPI yönüne göre, tahmin YALNIZ ≥14 gün veriyle (yoksa "veri yok" — uydurma yok) |
| 11 | Migration `0006_decision_intelligence_faz3.sql` | ✅ TAMAM | 10 YENİ tablo (yalnız CREATE — mevcut tabloya ALTER YOK); canlıya 20:10'da uygulandı + doğrulandı (`__migrations`=0006, 53 tablo, integrity ok, 1 sipariş/7 ürün aynen); scratch'ta da doğrulandı; `schema.mysql.ts` parite TAM (10/10) |
| 12 | UI | ✅ TAMAM | Intelligence Center → **Karar Zekâsı** (11. sekme, "COMMERCE INTELLIGENCE ENGINE — FAZ 1 + FAZ 2 + FAZ 3"). 9 alt görünüm: Özet / Öneriler / Erken Uyarı / What-if / Monte Carlo / Yönetim Hedefleri / Karar Geçmişi / Etkililik / Ayarlar |
| 13 | API katmanı | ✅ TAMAM | `/api/intelligence/decision/*` — 34 `route.ts`; `requireStaff` her yerde; yazma uçları SUPER_ADMIN/STORE_MANAGER; her yazma `audit_logs`'a düşer |
| 14 | AI Sohbet Asistanı | ✅ TAMAM | 3 yeni intent (öneri listesi / erken uyarı / hedefler) + yardım metni; SALT OKUMA; karar tabloları yoksa kibar uyarı (defansif try/catch) |
| 15 | Rapor + doğrulama | ✅ TAMAM | Bu belge + scratch e2e + HTTP e2e + build |

---

## 2. DOĞRULAMA KANITI — 20 MADDELİK KONTROL LİSTESİ

**Scratch e2e (`DATABASE_URL=sqlite:./data/scratch-faz3.db` — canlıya DOKUNULMAZ, `scripts/faz3-smoke.ts`):**

1. ✅ Tam analiz: `runDecisionAnalysis` → `opportunitiesConsidered:9, decisionsCreated:9, alertsCreated:4`
2. ✅ İdempotansi: 2. çalıştırma → `decisionsCreated:0, decisionsUpdated:9` (dedup çalışıyor)
3. ✅ Senaryo motoru: PRICING +%10 / esneklik −0.8 → expected.netSales 179.262,75 TL; profitDelta **+9.327,27 TL**; risk 35; assumptions listelendi
4. ✅ Delta semantiği düzeltildi: MARKETING +25% ROAS 2.0 → revenueDelta **+7.560 TL** (önce −156.887 TL idi — mağaza geneliyle karşılaştırılıyordu, hata)
5. ✅ Monte Carlo seed 1234, 500 iter → mean 737,19; P5/P95=447/1.159; yakınsadı=true; korelasyon yokluğu raporlandı
6. ✅ MC kayıt persist (seed+parametreler+özet; ham örneklemler saklanmıyor); liste endpoint'i çalışıyor
7. ✅ Hedef: create → measure (gerçek KPI; REVENUE ölçüldü) → evaluate → `ACHIEVED`
8. ✅ Hedef doğrulama: `validateGoalInput` uyumsuz KPI/kategori → hata mesajı (reddeder, sessiz düzeltme yok)
9. ✅ Tahmin tabanı: ≥14 günlük seri yoksa `forecast.projected=null` + `note` (uydurma yok)
10. ✅ Erken uyarı: 4 kayıt (SALES_DROP/HIGH, STOCKOUT_RISK/CRITICAL ×2, AD_ROAS_LOW/HIGH)
11. ✅ FAZ 3 ayarları: 37 anahtar; `validateFaz3Setting("faz3.confidence.min_coverage_for_high","200")` → RED
12. ✅ İdempotansi (HTTP): POST /analyze → 200, `decisionsCreated:0, decisionsUpdated:9`
13. ✅ HTTP auth: login 200 → GET overview/recommendations/early-warning/goals/outcomes/settings/monte-carlo/simulations → tümü 200
14. ✅ HTTP senaryo: POST /simulations → netSales 179.262,75 / profitDelta +9.327,27 (rebuilt bundle)
15. ✅ AI asistanı: "karar önerileri neler" → decision_recommendations (gerçek kayıtlarla); "en kârlı ürünler" → FAZ 1 intent'i korundu; "satışlar nasıl" → sales (gölgelenme yok)
16. ✅ TypeScript: `npx tsc --noEmit` — HATA YOK
17. ✅ Production build: `npm run build` — ✓ Compiled (Turbopack), 1 adet ÖNCEDEN VAR OLAN NFT uyarısı dışında temiz; postbuild standalone'a statikleri kopyaladı
18. ✅ Canlı DB 2026-11-13 20:10'da ONAY İLE migrate edildi: 10 FAZ 3 tablosu + `__migrations` 0006; taze yedek `tuhafiye.db.bak-20261113-201053-faz3` (integrity ok); mevcut kayıt sayısı değişmedi (1 sipariş)
19. ✅ MySQL parite: `schema.mysql.ts` 10/10 FAZ 3 tablosu (runtime SQLite; MySQL test edilemedi — TEST EDİLMEDİ)
20. ✅ Yedekler: `data/backups/tuhafiye.db.bak-20261113-201053-faz3` (20:10, ONAY SONRASI taze) + `tuhafiye.db.bak-20261113-commercial-faz2` (18:44) mevcut

---

## 3. KAPSAM DIŞI / YAPILMAYANLAR (bilinçli)

- `comparePeriodsPrePost` (counterfactual) — `orders.createdAt` saniye-int varsayımı Teyit EDİLMEDİ → yalnız "önceki dönem" etiketiyle; nedensel iddia YOK (DiD yok)
- AHP / TOPSIS — ilk sürümde değil (Weighted Scoring + Cost-Benefit yeterli)
- SCHEDULED / EVENT_DRIVEN orkestrasyon — yalnız MANUAL
- Bildirim altyapısı (e-posta/SMS) — yok; uyarılar panelde
- Yeni grafik kütüphanesi — eklenmedi (CSS/bar pattern)
- MySQL runtime testi — yapılamadı (ortam SQLite)
- FAZ 1/2 modülleri YENİDEN YAZILMADI — çağrıldı, kopyalanmadı

---

## 4. GUARDRAIL BĞÜMLERİ

- Deterministik — LLM yok; her sayı kendi verinizden
- Gerçek veri yoksa sonuç yok; eksik veri gerçeği gibi gösterilmez
- Her öneri finansal etki + yöntem notu taşır (methodNote)
- Otomatik uygulama YOK — her öneri yönetici onayından geçer; tüm aksiyonlar audit log'lu
- Kaynak ticari kayıtlar (sipariş/stok/fiyat) DEĞİŞTİRİLMEZ
- Monte Carlo: seed saklanır; çıktı DB'de örneklem olarak TUTULMAZ (yalnız parametre+özet)
- Karar kayıtları değiştirilemez snapshot (`analysisSnapshot`) taşır
- Data Coverage ≠ Statistical Confidence ≠ Decision Confidence (karıştırılmaz)
- En yüksek skor otomatik "kazanan" değildir; hedefler/kısıtlar dikkate alınır

---

## 5. CANLIYA ALMA (AŞAMA 11 — TAMAMLANDI 20:10)

Yapılanlar (20:10 UTC): better-sqlite3 online backup → `tuhafiye.db.bak-20261113-201053-faz3` (integrity ok) → preview durduruldu → `DATABASE_URL=sqlite:./data/tuhafiye.db node scripts/db-apply.mjs` → "0006 (30 ifade) uygulandı" → 10 tablo + `__migrations` 0006 doğrulandı → preview yeniden başlatıldı (HTTP 200; auth'sız /api/intelligence/decision/overview → 401).

Sonrası (kullanıcı tarafı): Intelligence Center → Karar Zekâsı → "Karar Analizini Çalıştır" (MANUAL).
Beklenti: canlıda 1 sipariş olduğu için FAZ 3 analizi `INSUFFICIENT_DATA` ağırlıkla çalışır — dürüst "veri yok" raporlar; yeni siparişler biriktikçe anlam kazanır.

---

## 6. BİLİNEN RİSKLER / NOTLAR

1. `buildBaseline` FAZ 2'de `../../route`'tan import ediliyordu → FAZ 3'te `src/lib/intelligence/decision/simulation/baseline.ts`'a taşındı (Next App Router route dosyaları yalnız HTTP metodu export edebilir).
2. Global (mağaza geneli) baseline artık gerçekleşen ciro/adet ağırlıklı ort. fiyat (136,05 TL) ve maliyet (69,14 TL) ile çalışıyor; ürün kapsamı için ürün kartı + hareket geçmişi kullanılır.
3. MARKETING `revenueDelta` artık atfedilen ciro değişimi (mevcut 30g ROAS taban alınarak); mağaza geneliyle kıyaslanmıyor.
4. `goalForecast` ≥14 gün yoksa null döner (canlıda hedefler "tahmin yok" gösterir — doğru davranış).
5. `data/scratch-faz3.db` — test veritabanı (git'e girmez; `.gitignore`'da scratch dosyaları zaten hariç).
