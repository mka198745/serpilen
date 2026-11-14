/**
 * Karar alternatifi ÜRETİCİSİ — her karar kategorisi için 4 zorunlu şablon
 * (CURRENT_STATE / CONSERVATIVE / BALANCED / AGGRESSIVE) + çağıran sağlarsa CUSTOM.
 * Yetersiz veride metrikler null kalır; SIFIR UYDURULMAZ, varsayım listesine düşülür.
 */
import type { AlternativeDraft, AlternativeKind, DecisionType } from "./types";

export interface BaselineInput {
  periodDays: number;
  // Fiyat/ürün
  price?: number | null;
  unitCost?: number | null;
  variableCost?: number | null;
  dailyUnits?: number | null;
  revenuePerDay?: number | null;
  marginPct?: number | null;
  // Stok
  stockQty?: number | null;
  coverDays?: number | null;
  deadStockValue?: number | null;
  // Reklam/kampanya
  adSpendPerDay?: number | null;
  campaignRoiPct?: number | null;
  campaignRevenue30d?: number | null;
  // İade/kalite
  returnRatePct?: number | null;
  returnCost30d?: number | null;
  // Tedarikçi
  supplierLatePct?: number | null;
  supplierFillRatePct?: number | null;
  // Müşteri
  rfmSegment?: string | null;
  // Tahmin
  forecastMapePct?: number | null;
  forecastBiasPct?: number | null;
}

const n0 = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(v) ? v : null;
const round2 = (n: number) => Number(n.toFixed(2));

interface AltComputeOut {
  revenue: number | null;
  profit: number | null;
  costTotal: number | null;
  cashNeed: number | null;
  riskScore: number | null;
  successProbability: number | null;
  implementationDays: number | null;
  resourceNote?: string | null;
  constraints?: string | null;
  assumptions: string[];
  evidence: string[];
}

interface AltSpec {
  label: string;
  description: string;
  compute: (b: BaselineInput, s: Record<string, number>) => AltComputeOut;
}

// ---------- Ortak metrikler yardımcı ----------
function bandMetrics(b: BaselineInput, priceDeltaPct: number, qtyDeltaPct: number) {
  const price = n0(b.price);
  const cost = n0(b.unitCost);
  const daily = n0(b.dailyUnits);
  if (price == null || daily == null) {
    return { revenue: null, profit: null, costTotal: null, cashNeed: null };
  }
  const newPrice = price * (1 + priceDeltaPct / 100);
  const newDaily = Math.max(0, daily * (1 + qtyDeltaPct / 100));
  const revenue = round2(newPrice * newDaily * b.periodDays);
  const unitContribution = newPrice - (cost ?? 0) - (n0(b.variableCost) ?? 0);
  const profit = round2(unitContribution * newDaily * b.periodDays);
  const costTotal = cost != null ? round2(cost * newDaily * b.periodDays) : null;
  return { revenue, profit, costTotal, cashNeed: 0 };
}

// ---------- Kategori şablonları ----------
const TEMPLATES: Record<DecisionType, AltSpec[]> = {
  PRICING: [
    {
      label: "Mevcut fiyatı koru",
      description: "Fiyatta değişiklik yok; baz senaryo.",
      compute: (b) => ({
        ...bandMetrics(b, 0, 0),
        riskScore: 10,
        successProbability: 0.95,
        implementationDays: 0,
        resourceNote: "Ek kaynak gerektirmez",
        constraints: null,
        assumptions: ["Talep ve maliyetler mevcut düzeyde kalır"],
        evidence: [],
      }),
    },
    {
      label: "Kademeli artış (+%5)",
      description: "Düşük riskli kademeli fiyat artışı.",
      compute: (b) => ({
        ...bandMetrics(b, 5, 0),
        riskScore: 25,
        successProbability: 0.8,
        implementationDays: 3,
        resourceNote: "Etiket/fiyat güncelleme",
        constraints: "Azami öneri artışı ayarı içinde",
        assumptions: ["Talep fiyat değişimine kısa vadede sabit (esneklik verisi yok)", "Rakipler aynı kalır"],
        evidence: [],
      }),
    },
    {
      label: "Dengeli artış (+%10)",
      description: "Hedef marjı destekleyen dengeli artış.",
      compute: (b) => ({
        ...bandMetrics(b, 10, 0),
        riskScore: 40,
        successProbability: 0.65,
        implementationDays: 3,
        resourceNote: "Etiket/fiyat güncelleme + iletişim",
        constraints: "Azami öneri artışı ayarı içinde",
        assumptions: ["Talep sabit varsayılır (esneklik verisi yok)", "İade oranı değişmez"],
        evidence: [],
      }),
    },
    {
      label: "Agresif artış (+%20)",
      description: "Azami önerilen artış; marj odaklı, hacim riski yüksek.",
      compute: (b) => ({
        ...bandMetrics(b, 20, -5), // %5 talep kaybı varsayımı (varsayım etiketli)
        riskScore: 65,
        successProbability: 0.45,
        implementationDays: 5,
        resourceNote: "İletişim + müşteri hassasiyeti izleme",
        constraints: "Yönetici onayı zorunlu; müşteri kaybı riski",
        assumptions: ["%5 talep kaybı varsayımı (varsayım — esneklik verisi yok, etiketli)", "Rakip tepkisi izlenmeli"],
        evidence: [],
      }),
    },
  ],
  INVENTORY: [
    {
      label: "Mevcut stok politikası",
      description: "Reorder noktası ve tedarik parametreleri değiştirilmez.",
      compute: (b) => ({
        revenue: n0(b.revenuePerDay) != null ? round2((b.revenuePerDay as number) * b.periodDays) : null,
        profit: null,
        costTotal: null,
        cashNeed: 0,
        riskScore: n0(b.coverDays) != null && (b.coverDays as number) < 7 ? 70 : 20,
        successProbability: 0.9,
        implementationDays: 0,
        resourceNote: null,
        constraints: null,
        assumptions: ["Satış hızı mevcut düzeyde sürer"],
        evidence: [],
      }),
    },
    {
      label: "Temkinli takviye (+7 gün kapsama)",
      description: "Kapsamı bir hafta artır; stok-out riskini azalt.",
      compute: (b) => {
        const daily = n0(b.dailyUnits);
        const cost = n0(b.unitCost);
        const add = daily != null ? daily * 7 : null;
        return {
          revenue: null,
          profit: null,
          costTotal: add != null && cost != null ? round2(add * cost) : null,
          cashNeed: add != null && cost != null ? round2(add * cost) : null,
          riskScore: 25,
          successProbability: 0.85,
          implementationDays: 2,
          resourceNote: "Satın alma siparişi",
          constraints: null,
          assumptions: ["Teslimat süresi normal seyrinde"],
          evidence: [],
        };
      },
    },
    {
      label: "Dengeli takviye (FAZ 2 reorder önerisi)",
      description: "FAZ 2 yeniden sipariş noktası önerisine uyarımlı takviye.",
      compute: (b) => {
        const daily = n0(b.dailyUnits);
        const cost = n0(b.unitCost);
        const add = daily != null ? daily * 21 : null; // reorder cover varsayılanı 21g
        return {
          revenue: null,
          profit: null,
          costTotal: add != null && cost != null ? round2(add * cost) : null,
          cashNeed: add != null && cost != null ? round2(add * cost) : null,
          riskScore: 30,
          successProbability: 0.8,
          implementationDays: 3,
          resourceNote: "Satın alma + depo kabul",
          constraints: null,
          assumptions: ["Satış hızı korunur", "Tedarikçide stok var"],
          evidence: [],
        };
      },
    },
    {
      label: "Agresif takviye (2× kapsama)",
      description: "Talebe karşı iki kat kapsama; nakit bağlar, stok-out'u en aza indirir.",
      compute: (b) => {
        const daily = n0(b.dailyUnits);
        const cost = n0(b.unitCost);
        const add = daily != null ? daily * 42 : null;
        return {
          revenue: null,
          profit: null,
          costTotal: add != null && cost != null ? round2(add * cost) : null,
          cashNeed: add != null && cost != null ? round2(add * cost) : null,
          riskScore: 45,
          successProbability: 0.7,
          implementationDays: 5,
          resourceNote: "Satın alma + depo alanı",
          constraints: "Nakit akışı ve depo kapasitesi",
          assumptions: ["Talep artabilir", "Obsoloesans riski kabul ediliyor"],
          evidence: [],
        };
      },
    },
  ],
  PROCUREMENT: [
    { label: "Mevcut alım planı", description: "Plan değiştirilmez.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 20, successProbability: 0.9, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "Kritik alımlar + küçük parti", description: "Yalnız kritik stok kalemleri alınır, parti küçültülür.", compute: (b) => { const daily = n0(b.dailyUnits); const cost = n0(b.unitCost); const qty = daily != null ? daily * 14 : null; return { revenue: null, profit: null, costTotal: qty != null && cost != null ? round2(qty * cost) : null, cashNeed: qty != null && cost != null ? round2(qty * cost) : null, riskScore: 25, successProbability: 0.85, implementationDays: 2, resourceNote: "Satın alma", constraints: null, assumptions: ["Kritik kalemler öncelikli"], evidence: [] }; } },
    { label: "Dengeli alım (21g kapsama)", description: "Reorder önerisine göre dengeli alım.", compute: (b) => { const daily = n0(b.dailyUnits); const cost = n0(b.unitCost); const qty = daily != null ? daily * 21 : null; return { revenue: null, profit: null, costTotal: qty != null && cost != null ? round2(qty * cost) : null, cashNeed: qty != null && cost != null ? round2(qty * cost) : null, riskScore: 30, successProbability: 0.8, implementationDays: 3, resourceNote: "Satın alma + bütçe", constraints: null, assumptions: ["Tedarik süresi normal"], evidence: [] }; } },
    { label: "Büyük parti (ölçek alım indirimi)", description: "Büyük parti alım; vade ve depolama etkisiyle.", compute: (b) => { const daily = n0(b.dailyUnits); const cost = n0(b.unitCost); const qty = daily != null ? daily * 60 : null; return { revenue: null, profit: null, costTotal: qty != null && cost != null ? round2(qty * cost * 0.97) : null, cashNeed: qty != null && cost != null ? round2(qty * cost * 0.97) : null, riskScore: 50, successProbability: 0.65, implementationDays: 7, resourceNote: "Depo + nakit planlaması", constraints: "%3 parti indirimi varsayımı (etiketli)", assumptions: ["Parti indirimi %3 varsayılır (varsayım)", "Depo kapasitesi yeterli"], evidence: [] }; } },
  ],
  SUPPLIER: [
    { label: "Mevcut tedarikçilerle devam", description: "Tedarikçi değişikliği yok.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 20, successProbability: 0.9, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "Mevcut tedarikçiyle yeniden pazarlık", description: "Vade/fiyat koşulları müzakere edilir.", compute: (b) => ({ revenue: null, profit: n0(b.revenuePerDay) != null ? round2((b.revenuePerDay as number) * b.periodDays * 0.02) : null, costTotal: null, cashNeed: 0, riskScore: 30, successProbability: 0.6, implementationDays: 14, resourceNote: "Satın alma pazarlığı", constraints: "Tedarikçi ticari ilişkisi", assumptions: ["Müzakere %2 maliyet iyileştirmesi hedefler (varsayım)"], evidence: [] }) },
    { label: "İkinci kaynak araştırması", description: "Kritik kalemler için çift kaynak hazırlığı.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 35, successProbability: 0.7, implementationDays: 30, resourceNote: "Satın alma + kalite testi", constraints: null, assumptions: ["Aday tedarikçi kalite testinden geçer"], evidence: [] }) },
    { label: "Tedarikçi geçişi", description: "Performansı düşük tedarikçiden tam geçiş.", compute: (b) => ({ revenue: null, profit: n0(b.supplierLatePct) != null && (b.supplierLatePct as number) > 30 ? 5000 : null, costTotal: null, cashNeed: 0, riskScore: 55, successProbability: 0.55, implementationDays: 45, resourceNote: "Kalite + satın alma geçiş planı", constraints: "Geçiş riski ve minimum siparişler", assumptions: ["Yeni tedarikçi fill-rate ≥ mevcut"], evidence: [] }) },
  ],
  CAMPAIGN: [
    { label: "Kampanya yok / mevcut süreç", description: "Kampanya planında değişiklik yok.", compute: () => ({ revenue: null, profit: null, costTotal: 0, cashNeed: 0, riskScore: 10, successProbability: 0.95, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "Kısa süreli küçük kampanya (%5, 1 hafta)", description: "Düşük marj riskiyle kısa kampanya.", compute: (b) => { const rev = n0(b.campaignRevenue30d); return { revenue: rev != null ? round2(rev * 0.6) : null, profit: null, costTotal: null, cashNeed: 0, riskScore: 25, successProbability: 0.75, implementationDays: 2, resourceNote: "Kampanya kurgusu", constraints: null, assumptions: ["Mevcut marj %5 indirimi tolere eder"], evidence: [] }; } },
    { label: "Dengeli kampanya (%10, 2 hafta)", description: "Marj kontrollü orta ölçekli kampanya.", compute: (b) => { const rev = n0(b.campaignRevenue30d); return { revenue: rev != null ? round2(rev * 1.0) : null, profit: null, costTotal: null, cashNeed: 0, riskScore: 35, successProbability: 0.65, implementationDays: 3, resourceNote: "Kampanya + stok kontrolü", constraints: null, assumptions: ["Stok yeterliliği teyit edildi"], evidence: [] }; } },
    { label: "Agresif kampanya (%20, 4 hafta)", description: "Yüksek ciro, daralan marj; stok riski.", compute: (b) => { const rev = n0(b.campaignRevenue30d); return { revenue: rev != null ? round2(rev * 1.8) : null, profit: null, costTotal: null, cashNeed: 0, riskScore: 60, successProbability: 0.5, implementationDays: 5, resourceNote: "Stok + marj planlaması", constraints: "Marj koruması izlenmeli; israf riski", assumptions: ["Stok yeterliliği teyit edildi", "İade oranı artmaz"], evidence: [] }; } },
  ],
  MARKETING: [
    { label: "Reklam bütçesini koru", description: "Mevcut reklam harcaması sabit.", compute: () => ({ revenue: null, profit: null, costTotal: 0, cashNeed: 0, riskScore: 10, successProbability: 0.9, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "Bütçe +10% (kârlı kanallara)", description: "ROAS>1 kanallara kontrollü artış.", compute: (b) => { const spend = n0(b.adSpendPerDay); return { revenue: spend != null ? round2(spend * 1.1 * 30 * 1.5) : null, profit: null, costTotal: spend != null ? round2(spend * 0.1 * 30) : null, cashNeed: spend != null ? round2(spend * 0.1 * 30) : null, riskScore: 25, successProbability: 0.7, implementationDays: 2, resourceNote: "Reklam paneli", constraints: null, assumptions: ["Atfedilen ROAS korunur (varsayım)"], evidence: [] }; } },
    { label: "Dengeli optimizasyon (zayıf kanal kesme)", description: "ROAS<1 kanalları kapat, bütçeyi güçlüye kaydır.", compute: (b) => { const spend = n0(b.adSpendPerDay); return { revenue: spend != null ? round2(spend * 30 * 1.2) : null, profit: null, costTotal: 0, cashNeed: 0, riskScore: 30, successProbability: 0.75, implementationDays: 4, resourceNote: "Reklam paneli + raporlama", constraints: null, assumptions: ["Atfetme modeli aynı kalır"], evidence: [] }; } },
    { label: "Bütçe ×1.5 (ölçekleme)", description: "Güçlü kanallarda agresif ölçekleme.", compute: (b) => { const spend = n0(b.adSpendPerDay); return { revenue: spend != null ? round2(spend * 1.5 * 30 * 1.5) : null, profit: null, costTotal: spend != null ? round2(spend * 0.5 * 30) : null, cashNeed: spend != null ? round2(spend * 0.5 * 30) : null, riskScore: 55, successProbability: 0.5, implementationDays: 5, resourceNote: "Reklam bütçesi", constraints: "Marka/ibra hassasiyeti", assumptions: ["Marjinal ROAS azalmaz (varsayım)"], evidence: [] }; } },
  ],
  FINANCIAL: [
    { label: "Mevcut finansal planı koru", description: "Tahsisat değiştirilmez.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 15, successProbability: 0.9, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "Temkinli tahsis (nakit tamponu)", description: "Harcamaları kıs, likiditeyi güçlendir.", compute: (b) => ({ revenue: null, profit: null, costTotal: null, cashNeed: 50000, riskScore: 20, successProbability: 0.85, implementationDays: 7, resourceNote: "Finans planı", constraints: null, assumptions: ["50.000 TL tampon ayrılır (varsayım)"], evidence: [] }) },
    { label: "Dengeli tahsis (büyüme + tampon)", description: "Büyüme yatırımları ve tampon dengeli.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 25000, riskScore: 35, successProbability: 0.7, implementationDays: 10, resourceNote: "Finans planı + onay", constraints: null, assumptions: ["25.000 TL ilave nakit gerekir"], evidence: [] }) },
    { label: "Agresif büyüme tahsisi", description: "Büyümeye maksimum kaynak ayır.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 100000, riskScore: 55, successProbability: 0.5, implementationDays: 14, resourceNote: "CFO onayı", constraints: "Likidite sınırı", assumptions: ["100.000 TL ilave nakit ihtiyacı (varsayım)"], evidence: [] }) },
  ],
  QUALITY: [
    { label: "Aksiyon yok", description: "İade/kalite süreci mevcut haliyle sürer.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 15, successProbability: 0.9, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "Tedarikçi uyarısı + koli kontrolü", description: "Düşük maliyetli kalite önlemi.", compute: (b) => ({ revenue: null, profit: n0(b.returnCost30d) != null ? round2((b.returnCost30d as number) * 0.15) : null, costTotal: null, cashNeed: 0, riskScore: 25, successProbability: 0.7, implementationDays: 7, resourceNote: "Satın alma + depo", constraints: null, assumptions: ["İade maliyetinde %15 azalma hedeflenir (varsayım)"], evidence: [] }) },
    { label: "Sorunlu kalemlerde süreç incelemesi", description: "İadesi yüksek SKU'lara derin analiz.", compute: (b) => ({ revenue: null, profit: n0(b.returnCost30d) != null ? round2((b.returnCost30d as number) * 0.3) : null, costTotal: null, cashNeed: 0, riskScore: 35, successProbability: 0.65, implementationDays: 14, resourceNote: "Kalite + satın alma", constraints: null, assumptions: ["İade maliyetinde %30 azalma hedeflenir (varsayım)"], evidence: [] }) },
    { label: "Sorunlu kalemi satıştan çek", description: "İade kök nedeni çözülemiyorsa SKU çıkışı.", compute: (b) => ({ revenue: null, profit: n0(b.returnCost30d) != null ? round2((b.returnCost30d as number) * 0.8) : null, costTotal: null, cashNeed: 0, riskScore: 50, successProbability: 0.6, implementationDays: 21, resourceNote: "Kategori yönetimi", constraints: "Ciro etkisi kabul edilmeli", assumptions: ["Kalemin yerine ikame ürün belirsiz"], evidence: [] }) },
  ],
  CUSTOMER: [
    { label: "Aksiyon yok", description: "Segment bazlı aksiyon alınmaz.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 10, successProbability: 0.95, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "VIP'lere küçük teşekkür kuponu", description: "Düşük maliyetli sadakat hamlesi.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 5000, riskScore: 20, successProbability: 0.75, implementationDays: 3, resourceNote: "CRM", constraints: null, assumptions: ["5.000 TL kupon bütçesi (varsayım)"], evidence: [] }) },
    { label: "RFM segment kampanyası", description: "S-At-Risk/Hibernating segmentine özel teklif.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 15000, riskScore: 35, successProbability: 0.6, implementationDays: 7, resourceNote: "CRM + kampanya", constraints: null, assumptions: ["Segment geri kazanım oranı %10 (varsayım)"], evidence: [] }) },
    { label: "Büyük win-back kampanyası", description: "Kaybedilen müşterilere agresif teklif.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 40000, riskScore: 55, successProbability: 0.45, implementationDays: 10, resourceNote: "CRM + finans onayı", constraints: "Marj", assumptions: ["Geri kazanım oranı %15 üzerinde ise kârlı (varsayım)"], evidence: [] }) },
  ],
  ASSORTMENT: [
    { label: "Gam sabit", description: "Ürün gamında değişiklik yok.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 10, successProbability: 0.95, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "C-Z kalemleri izlemeye al", description: "Satmayan kalemler için izleme listesi.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 15, successProbability: 0.85, implementationDays: 5, resourceNote: "Kategori yönetimi", constraints: null, assumptions: [], evidence: [] }) },
    { label: "C-Z tasfiye + A-X takviye", description: "Zayıf kalemleri tasfiye et, güçlüye stok.", compute: (b) => ({ revenue: null, profit: n0(b.deadStockValue) != null ? round2((b.deadStockValue as number) * 0.1) : null, costTotal: null, cashNeed: 0, riskScore: 35, successProbability: 0.7, implementationDays: 14, resourceNote: "Kategori + depo", constraints: "Tasfiye indirimi marjı", assumptions: ["Tasfiye stok değerinin %10'u kadar kurtarma (varsayım)"], evidence: [] }) },
    { label: "Gamden çıkış (C-Z tam tasfiye)", description: "Zayıf kalemleri gamden çıkar, nakde dön.", compute: (b) => ({ revenue: null, profit: n0(b.deadStockValue) != null ? round2((b.deadStockValue as number) * 0.5) : null, costTotal: null, cashNeed: 0, riskScore: 45, successProbability: 0.65, implementationDays: 30, resourceNote: "Kategori + depo + nakit", constraints: "Müşteri beklentisi", assumptions: ["Tasfiye ile ölü stok değerinin %50'si nakde döner (varsayım)"], evidence: [] }) },
  ],
  CASH_FLOW: [
    { label: "Mevcut vade yapısı", description: "Ödeme tahsilat koşulları değişmez.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 15, successProbability: 0.9, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "Alımlarda vade +7g müzakeresi", description: "Tedarikçilerle vade uzatma.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 30000, riskScore: 25, successProbability: 0.6, implementationDays: 14, resourceNote: "Satın alma", constraints: "Tedarikçi ilişkisi", assumptions: ["Vade uzatımı 30.000 TL likidite yaratır (varsayım)"], evidence: [] }) },
    { label: "Dengeli nakit planı", description: "Vade + tahsilat sıkılaştırma birlikte.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 60000, riskScore: 30, successProbability: 0.65, implementationDays: 21, resourceNote: "Finans + satın alma", constraints: null, assumptions: ["Çift taraflı iyileştirme 60.000 TL yaratır (varsayım)"], evidence: [] }) },
    { label: "Erken ödeme indirimleri programı", description: "İndirim karşılığı erken ödeme.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: -20000, riskScore: 40, successProbability: 0.55, implementationDays: 30, resourceNote: "Finans", constraints: "Nakit tamponu gerekli", assumptions: ["Erken ödeme indiriminin yıllık kazancı 20.000 TL (varsayım)"], evidence: [] }) },
  ],
  RETURNS: [
    { label: "Aksiyon yok", description: "İade süreci mevcut haliyle.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 15, successProbability: 0.9, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "İade neden kodu zorunluluğu", description: "Kayıt disiplini + haftalık rapor.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 20, successProbability: 0.8, implementationDays: 7, resourceNote: "POS/iade formu", constraints: null, assumptions: [], evidence: [] }) },
    { label: "İade maliyet azaltım programı", description: "Kök neden analizi ile % veya iade düşüşü.", compute: (b) => ({ revenue: null, profit: n0(b.returnCost30d) != null ? round2((b.returnCost30d as number) * 0.25) : null, costTotal: null, cashNeed: 0, riskScore: 35, successProbability: 0.65, implementationDays: 21, resourceNote: "Kalite + lojistik", constraints: null, assumptions: ["İade maliyetinde %25 azalma hedeflenir (varsayım)"], evidence: [] }) },
    { label: "İade politikası sıkılaştırma", description: "Koşulsuz iade yerine kontrollü politika.", compute: (b) => ({ revenue: null, profit: n0(b.returnCost30d) != null ? round2((b.returnCost30d as number) * 0.5) : null, costTotal: null, cashNeed: 0, riskScore: 55, successProbability: 0.5, implementationDays: 30, resourceNote: "Operasyon + müşteri hizmetleri", constraints: "Müşteri memnuniyeti riski", assumptions: ["Koşulsuz iadenin kaldırılması iade oranını düşürür (varsayım)"], evidence: [] }) },
  ],
  FORECAST: [
    { label: "Tahmin planı yok", description: "Tahmin tabanlı aksiyon alınmaz.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 15, successProbability: 0.9, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "Tahmin aralığı alt bandına göre planla", description: "Muhafazakâr tedarik/üretim planı.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 20, successProbability: 0.8, implementationDays: 3, resourceNote: "Planlama", constraints: null, assumptions: ["Plan talebin alt bandında tutulur"], evidence: [] }) },
    { label: "Tahmin orta noktasına göre planla", description: "Dengeli tedarik planı.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 30, successProbability: 0.75, implementationDays: 3, resourceNote: "Planlama", constraints: null, assumptions: ["Plan tahmin orta noktasında"], evidence: [] }) },
    { label: "Tahmin üst bandına göre planla", description: "Agresif stok/üretim planı.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 45, successProbability: 0.6, implementationDays: 5, resourceNote: "Planlama + finans", constraints: "Stok/nakit riski", assumptions: ["Plan talebin üst bandında tutulur"], evidence: [] }) },
  ],
  OPERATIONAL: [
    { label: "Aksiyon yok", description: "Süreç mevcut haliyle sürer.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 15, successProbability: 0.9, implementationDays: 0, resourceNote: null, constraints: null, assumptions: [], evidence: [] }) },
    { label: "İzleme + haftalık kontrol", description: "Düşük maliyetli izleme adımları.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 0, riskScore: 20, successProbability: 0.8, implementationDays: 3, resourceNote: "Operasyon", constraints: null, assumptions: [], evidence: [] }) },
    { label: "Süreç iyileştirme (pilot)", description: "Tek şube/süreçte pilot iyileştirme.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 10000, riskScore: 30, successProbability: 0.7, implementationDays: 21, resourceNote: "Operasyon + analiz", constraints: "Pilot kapsamı", assumptions: ["Pilot %10 verim yaratır (varsayım)"], evidence: [] }) },
    { label: "Süreç yeniden yapılandırma", description: "Kapsamlı süreç değişikliği.", compute: () => ({ revenue: null, profit: null, costTotal: null, cashNeed: 30000, riskScore: 50, successProbability: 0.55, implementationDays: 45, resourceNote: "Operasyon liderliği + değişim yönetimi", constraints: "İş kesintisi riski", assumptions: ["Yeniden yapılandırma %20 verim yaratır (varsayım)"], evidence: [] }) },
  ],
};

const KIND_ORDER: AlternativeKind[] = ["CURRENT_STATE", "CONSERVATIVE", "BALANCED", "AGGRESSIVE"];

/** Kategoriye göre alternatifleri üretir. CUSTOM çağrıya bağlıdır (burada üretilmez). */
export function generateAlternatives(type: DecisionType, baseline: BaselineInput, settingsNums: Record<string, number>): AlternativeDraft[] {
  const specs = TEMPLATES[type] ?? TEMPLATES.OPERATIONAL;
  const out: AlternativeDraft[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const computed = spec.compute(baseline, settingsNums);
    out.push({
      kind: KIND_ORDER[i] ?? "CUSTOM",
      label: spec.label,
      description: spec.description,
      expectedRevenue: computed.revenue,
      expectedProfit: computed.profit,
      expectedCost: computed.costTotal,
      cashNeed: computed.cashNeed,
      riskScore: computed.riskScore,
      successProbability: computed.successProbability,
      implementationDays: computed.implementationDays,
      resourceNote: computed.resourceNote,
      constraints: computed.constraints,
      assumptions: computed.assumptions,
      evidence: computed.evidence,
    });
  }
  return out;
}
