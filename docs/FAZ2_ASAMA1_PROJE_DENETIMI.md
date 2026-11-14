# FAZ 2 — AŞAMA 1: Proje Denetimi ve Veri Yeterlilik Analizi

Tarih: 2026-11-13 · Branch: `arena/01a0a9cf-serpilen` · Kapsam: yalnızca mevcut veritabanı şeması ve gerçek veri kaynakları.
Prensip: Eksik veri tahmin edilip "gerçekmiş gibi" gösterilmez; her bölüm veri yeterlilik durumuyla raporlanır.

## 1. Kullanılabilir veri kaynakları (şema doğrulandı)

| Kaynak | Tablolar | Sinyal |
|---|---|---|
| Satış / sipariş | `orders`, `order_items` | Ciro, adet, indirim toplamı, kanal (POS/ONLINE_B2C), durum (REFUNDED/CANCELLED) |
| Ürün / maliyet | `products` (`buy_price`, `retail_price`, `campaign_price`, `vat_rate`), `product_variants`, `product_images` | Birim maliyet/fiyat, KDV |
| Stok | `inventory`, `inventory_reservations` (CART/CHECKOUT/ORDER referanslı), `stock_transfers`, `stock_counts` | Stok, rezerve, tüketim referansları (sepet terk kaydı DEĞİL) |
| İade | `order_returns` (`reason`, `status`, `refund_amount`, `restock`), `order_return_items` | İade adedi, tutarı, nedeni (serbest metin) |
| Müşteri | `customers`, `loyalty_transactions`, `rfm_scores` (FAZ 1), `cohort` türevi | RFM, kohort, puan hareketleri |
| Promosyon / kupon | `promotions` (`rule_type`, kapsam, `percent_value`, `used_count`, `priority`), `coupons` (`used_count`, `usage_limit`) | Kampanya tanımı + kullanım sayacı |
| Tedarik / satınalma | `suppliers` (`lead_time_days`, `payment_terms`, `rating`), `purchase_orders` (`expected_date`, `total_amount`, `status`), `purchase_order_items` (`received_qty`), `goods_receipts` (`created_at`) | Teslimat süresi, doluluk oranı, PO geçmişi |
| Denetim | `audit_logs` | İşlem geçmişi |
| FAZ 1 çıktıları | `forecast_results`, `anomaly_events`, `rfm_scores`, `abc_xyz_classifications`, `forecast_accuracy`, `intelligence_settings` | Yeniden kullanılır, yeniden yazılmaz |
| Yorumlar | `product_reviews` (`rating`, `verified_purchase`, `status=APPROVED`) | Kalite sinyali (satış sonrası) |

## 2. Var olmayan / yetersiz veri (uydurma YOK — açık eksik listesi)

| Eksik | Etki | Çözüm |
|---|---|---|
| Reklam/harcama verisi (şema yok) | ROAS/ROI/CAC hesaplanamaz | Yeni `advertising_performance` tablosu: **manuel giriş**, açık etiketli |
| Sepet/checkout olayları, terk kaydı (şema yok; `inventory_reservations` yalnızca stok referansı) | Sepet terk oranı, funnel kaybı ölçülemez | Market Basket modülü **yalnızca tamamlanmış siparişlerden** ilişki madenciliği yapar; terk metrikleri INSUFFICIENT_DATA olarak işaretlenir |
| Sipariş↔kampanya yapısal bağı (yalnızca `orders.notes` serbest metinde "Kampanya: ad" ve `promotions.used_count` sayacı) | Sipariş bazında kesin kampanya atfı YAPILAMAZ | Kampanya analizi kümülatif/tahmini olarak raporlanır; kesin atıf isteniyorsa şemaya `order_applied_promotions` tablosu gerekir (FAZ 2 kapsamı dışında, not edildi) |
| Komisyon / kargo / paketleme / ödeme komisyonu maliyetleri (şema yok) | Gerçek net kârlılık UNAVAIL | Katkı marjı hesabı bu maliyetleri DIŞLAR; `MISSING_VARIABLE_COST_KEYS` ile her hesapta açıkça işaretlenir |
| Ürün↔tedarikçi bağı (yalnızca PO geçmişi) | Tedarikçi→ürün eşlemesi geçmiş PO'ya dayanır | Performans skorlaması PO/GDN kayıtlarından türetilir; "ürün tedarikçisi" tahmini YAPILMAZ |
| Ürün kalite olay tablosu (hasar, arıza, şikâyet) yok | Doğrudan kalite maliyeti yalnızca iade + onaylı yorumla sınırlı | Kalite analizi: iade oranı, iade nedeni Pareto'su, onaylı yorum ortalaması |
| Fiyat değişim / rekabet verisi yok | Gerçek fiyat elastikiyeti ve rakip fiyatı hesaplanamaz | Smart Pricing "esneklik yoksa düz talep (FLAT) varsayımı" ile simülasyon yapar; bu varsayım her öneride açıkça belirtilir |

## 3. Modül veri yeterlilik sınıflaması

| Modül | Sınıf | Gerekçe |
|---|---|---|
| Smart Pricing (marj, katkı, hedef marj fiyatı, simülasyon) | **READY** | `buy_price`/`retail_price`/`campaign_price`/`vat_rate` + satış hacmi yeterli (komisyon/kargo hariç-işaretli) |
| Smart Pricing (rakip fiyat, elastikiyet) | NOT_AVAILABLE | Kaynak veri yok — kapsam dışı; tahmin üretilmez |
| Campaign & Advertising (promosyon kullanım/indirim, ROAS/ROI/CAC) | **PARTIAL** | Promo kullanılabilirlik ve `used_count` var; sipariş-baz atıf yok; ROAS için manuel `advertising_performance` gerekir; reklam verisi girilene kadar INSUFFICIENT_DATA |
| Market Basket (co-purchase lift/confidence) | **READY** | `order_items` + sipariş filtresi yeterli (tamamlanan siparişler) |
| Market Basket (sepet terk / funnel) | NOT_AVAILABLE | Olay verisi yok |
| Supplier Performance | **READY (PARTIAL alt-kalemlerle)** | Teslimat & doluluk: PO `expected_date` + GDN `created_at` + `received_qty/ordered_qty`; kalite: PO ürünlerinin iade oranı; fiyat: PO `unit_cost` trendi. Tekil PO'lu tedarikçide güven penceresi dardır (LOW) |
| Returns & Quality | **READY** | `order_returns`, `order_return_items`, `reason`, `refund_amount`, onaylı `product_reviews` |
| Procurement Optimization | **READY (PARTIAL alt-kalemlerle)** | Satış hızı + stok + `lead_time_days` + FEFO/ölü stok; tedarikçi konsolidasyonu PO'lara dayanır |
| Commercial Opportunity Engine | **READY** | Ortak çekirdek + modül çıktıları; kalıcılık `commercial_opportunities` |
| Kasa akışı etkisi (nakit bağlayan stok) | **PARTIAL** | Stok maliyeti (qty × buy_price) kesin; nakit döngüsü tahmini varsayım etiketli |

## 4. FAZ 2 mimari kararları

1. **LLM yok, harici AI API yok, deterministik motorlar** — FAZ 1 deseni aynen sürer.
2. Yeni tablolar (migration `0005_commercial_optimization_faz2`): `commercial_opportunities`, `opportunity_history`, `opportunity_impact_results`, `advertising_performance` (manuel giriş). Kaynak veriler (orders, products, PO...) DEĞİŞTİRİLMEZ; öneri/uygulama akışı ayrı tablolarda yaşar.
3. Yeni modül: `src/lib/intelligence/commercial/{core,pricing,campaigns,basket,suppliers,quality,procurement,opportunities}/`.
4. Yönetici onayı zorunlu: fırsatlar `NEW → UNDER_REVIEW → APPROVED/REJECTED → IN_PROGRESS → COMPLETED` akışında; hiçbir öneri kendiliğinden uygulanmaz; tüm geçişler `opportunity_history` + `audit_logs`'a yazılır.
5. Beklenen vs gerçekleşen etki: `opportunity_impact_results` — yönetici tamamlarken gerçekleşen kâr etkisini girer; sistem gerçekleşme oranını hesaplar.
6. FAZ 1 modülleri (`forecasting`, `profitability`, `abc-xyz`, `rfm`, `anomalies`, `accuracy`) **yeniden kullanılır, yeniden yazılmaz**.
7. API: `/api/intelligence/commercial/*` (GET okuma, POST aksiyon) — mevcut `/api/intelligence/*` sözleşmelerine dokunulmaz.
8. SQLite + MySQL şema parite korunur; yeni tablolar her iki şemada aynı tanımdadır.
9. UI: Intelligence Center içine "Ticari Optimizasyon" sekmesi (9 → 10 sekme) — fırsat havuzu + modül görünümleri + reklam girişi.
10. Canlı DB'de 1 sipariş var; canlı ekranlarda INSUFFICIENT_DATA gösterilecektir (dürüst davranış). Scratch seed ile uçtan uca doğrulama yapılacaktır. Canlı DB'ye FAZ 2 verisi YAZILMAYACAKTIR (öneri tablolarına yazım yalnızca kullanıcı aksiyonu).

## 5. Bilinen boşluklar / dürüstlük notları

- Kampanya atfı: kullanılan yaklaşım kümülatif sayaç + serbest-metin `notes` taramasıdır; **sipariş bazında kesin atıf değildir** ve raporlarda bu şekilde etiketlenir.
- Smart Pricing simülasyonu **düz talep varsayımı** ile çalışır (elastikiyet verisi yok); sonuçlar "alt sınır/üst sınır" değil "sabit adet senaryosu" olarak sunulur.
- `advertising_performance` verisi girilmeden ROAS/ROI/CAC bölümleri boş döner; sistem sıfır UYDURMAZ.
- İade nedeni serbest metindir; Pareto gruplaması normalizasyon (küçük/büyük harf, Türkçe karakter indirme) ile yapılır, yanlış eşleşmeler "DİĞER" altında toplanır.
- Tedarikçi performansında eksik alt-kriterler skor dışında bırakılır ve **kapsama %'si** ayrıca raporlanır (eksik kriter 0 puan sayılmaz).

## 6. Sonraki adımlar

AŞAMA 2: Ortak çekirdek motorlar + birim testler → AŞAMA 3…8 modül modül → AŞAMA 9 Commercial Opportunity Engine servisi + API'lar → AŞAMA 10 UI → AŞAMA 11 test/seed/doğrulama/raporlama.
