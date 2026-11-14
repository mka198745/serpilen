# FAZ 3 — AŞAMA 1: Mevcut Sistem Denetimi ve Faz 3 Teknik Planı

Tarih: 2026-11-13 · Branch: `arena/01a0a9cf-serpilen` · Girdi: FAZ 1 + FAZ 2 (commit `6858df9`, `d6c7fb1`)

## 1. Denetlenen gerçek durum

| Bileşen | Durum | Not |
|---|---|---|
| FAZ 1 servisleri (`src/lib/intelligence/*`: forecast, profit, abc-xyz, rfm, cohort, anomalies, accuracy) | READY | Testli (46/46), canlıda çalışır; `runIntelligenceAnalysis` tek yazma noktası |
| FAZ 2 ticari motorlar (`commercial/*`) | READY | Scratch'ta doğrulandı (12 fırsat, idempotent); canlıda INSUFFICIENT_DATA (1 sipariş) |
| Commercial Opportunity Engine | READY | Havuz + dedup + yaşam döngüsü; `runCommercialAnalysis` |
| `intelligence_settings` tablosu | READY | faz2.* önek deseni mevcut → faz3.* ile genişletildi |
| Audit log + `requireStaff` + RBAC | READY | Tüm intelligence uçları kullanır; yazma = SUPER_ADMIN/STORE_MANAGER |
| AI Yönetim Asistanı (`ai-engine.ts`, intent tabanlı) | READY | FAZ 1 intent'leri çalışıyor; FAZ 3 intent'leri eklenecek |
| Veritabanı | SQLite (WAL) | Canlı: 1 sipariş → FAZ 3 sonuçları canlıda INSUFFICIENT_DATA gösterir |
| MySQL şema paritesi | PARTIAL | `schema.mysql.ts` manuel eşle (runtime SQLite) — FAZ 3 tabloları da eşlendi |

## 2. FAZ 3 için veri kaynağı sınıflaması

| Kaynak | Veri | Yeterlilik |
|---|---|---|
| FAZ 1/2 servis çıktıları (kâr, tahmin, RFM, ABC-XYZ, anomali, ticari fırsatlar) | Hesaplanmış sinyaller | READY (scratch'ta) |
| `orders/order_items/order_returns` | Ciro, iade, kanal | READY (scratch) / INSUFFICIENT_DATA (canlı) |
| `inventory` + satış hızı | Stok, ölü/fazla stok, reorder | READY (scratch) |
| `suppliers/purchase_orders/goods_receipts` | Termin, doluluk, iade-bağlı | READY (scratch) |
| `advertising_performance` (manuel) | ROAS/ROI/CAC | PARTIAL (kayıt yoksa null) |
| Yönetim hedefleri | Tablo yok → FAZ 3'te oluşturulur | N/A → yeni |
| Tahmin güveni (backtest WAPE) | `forecast_accuracy` | READY (scratch) |
| Karar geçmişi/gerçekleşen etki | FAZ 3'te oluşturulur | N/A → yeni |

## 3. Teknik mimari (AŞAMA 2+)

- Yeni: `src/lib/intelligence/decision/{core,early-warning,simulation,monte-carlo,goals,outcomes,orchestrator}/`.
- Yeni tablolar (migration `0006_decision_intelligence_faz3`): decision_records, decision_alternatives, decision_conflicts, early_warning_events, early_warning_history, scenario_definitions, scenario_results, monte_carlo_runs, management_goals, decision_outcomes. (Spec'teki 24 tablonun minimum gerekli alt kümesi; explanation JSON kayıt üzerinde, goal forecast/measurements talep anında hesaplanır.)
- Algoritma sürümleri `algorithm_version` ile; Monte Carlo'da seed saklanır; karar kayıtları değiştirilemez snapshot (`analysisSnapshot`) taşır.
- FAZ 1/2 servisleri ÇAĞRILIR, kopyalanmaz. UI: Intelligence Center'da "Karar Zekâsı" sekmesi (9 alt görünüm). API: `/api/intelligence/decision/*`.
- Monte Carlo üst sınır 10.000 iterasyon, senkron istekte ≤ 10k küçük boyut; HTTP timeout'a girmez (tek senaryo, ms seviyesi). Kuyruk sistemi mevcut ölçeğe göre gerekmiyor (spec §15: önce ölçeği değerlendir).
- Ayarlar: `intelligence_settings` faz3.* (risk ağırlıkları, skor eşiği, MC iterasyon varsayılanı, hedef yönleri).

## 4. Kapsam kararı (durumu değiştirme)

- AHP ve TOPSIS: spec ilk sürüme dahil değil → Weighted Scoring + Cost-Benefit uygulanır, genişletme notu raporda.
- EVENT_DRIVEN ve SCHEDULED orkestrasyon: mevcut altyapı desteklemiyor → yalnız MANUAL (spec §12 izniyle).
- Counterfactual (DiD): kontrol grubu/veri yok → yalnızca "önceki dönem" karşılaştırması + uyarı etiketi; nedensel iddia yok.
- Grafikler: repo pattern'i (CSS/bar) — yeni grafik kütüphanesi eklenmez.
- Bildirim altyapısı yok → erken uyarılar dashboard içi (spec §7.7 izniyle).
