/**
 * FAZ 2 ortak finans hesaplayıcı — saf fonksiyonlar.
 * Her formül, katkı ve varsayım açıkça tanımlanır; komisyon/kargo/paket verisi
 * şemada olmadığında ZERO_VARIABLE = eksik maliyet olarak işaretlenir.
 */

export const MISSING_VARIABLE_COST_KEYS = ["commission", "shipping", "packaging", "adSpendUnit", "paymentFee"] as const;

/** Birim brüt marj (fiyat 0'sa null — tanımsız). */
export function grossMarginPct(price: number, unitCost: number): number | null {
  if (!(price > 0)) return null;
  return ((price - unitCost) / price) * 100;
}

/** Birim katkı kârı (değişken maliyetler düşülmüş). */
export function contributionPerUnit(price: number, unitCost: number, variableCost = 0): number {
  return price - unitCost - variableCost;
}

/** Birim katkı marjı % (fiyat 0'sa null). */
export function contributionMarginPct(price: number, unitCost: number, variableCost = 0): number | null {
  if (!(price > 0)) return null;
  return (contributionPerUnit(price, unitCost, variableCost) / price) * 100;
}

/** Maliyet + hedef marj → satış fiyatı. price = cost / (1 - margin). */
export function priceForTargetMargin(totalUnitCost: number, targetMarginPct: number): number {
  const m = Math.min(Math.max(targetMarginPct / 100, 0), 0.95); // %95 tavan — saçma değerlere karşı
  return totalUnitCost / (1 - m);
}

/** Minimum kârlı fiyat: maliyet + hedef asgari katkı (tutar bazında). */
export function minimumProfitablePrice(totalUnitCost: number, minUnitProfit = 0): number {
  return totalUnitCost + minUnitProfit;
}

/** ROAS = atfedilebilir reklam geliri / reklam harcaması. Harcama 0 → null. */
export function roas(attributedRevenue: number, spend: number): number | null {
  if (!(spend > 0)) return null;
  return attributedRevenue / spend;
}

/** ROI % = (atfedilebilir katkı kârı - kampanya maliyeti) / kampanya maliyeti. */
export function roiPct(attributedContributionProfit: number, campaignCost: number): number | null {
  if (!(campaignCost > 0)) return null;
  return ((attributedContributionProfit - campaignCost) / campaignCost) * 100;
}

/** CAC = reklam harcaması / edinilen yeni müşteri. */
export function cac(spend: number, newCustomers: number): number | null {
  if (!(newCustomers > 0)) return null;
  return spend / newCustomers;
}

/** Basit ROI (tutar): net kazanç / yatırım. */
export function simpleRoiPct(netGain: number, investment: number): number | null {
  if (!(investment > 0)) return null;
  return (netGain / investment) * 100;
}

export interface ScenarioRow {
  label: string;
  price: number;
  quantity: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  contributionProfit: number;
}

/**
 * What-if simülasyonu. Satış miktarı tahmini yoksa yalnızca fiyat×miktar
 * aritmetiği yapılır ve `quantityAssumption` "FLAT" olarak işaretlenir.
 */
export function simulatePriceScenarios(opts: {
  currentPrice: number;
  unitCost: number;
  variableCost?: number;
  baseQuantity: number; // referans dönem satış adedi
  variableBandPct?: number; // ±% değişim senaryoları
}): ScenarioRow[] {
  const { currentPrice, unitCost, variableCost = 0, baseQuantity, variableBandPct = 10 } = opts;
  const bands = [-variableBandPct, -variableBandPct / 2, 0, variableBandPct / 2, variableBandPct];
  return bands.map((b) => {
    const price = b === 0 ? currentPrice : currentPrice * (1 + b / 100);
    const qty = baseQuantity; // sabit talep varsayımı — elasticity yoksa
    const revenue = price * qty;
    const cogs = unitCost * qty;
    const grossProfit = revenue - cogs;
    const contributionProfit = grossProfit - variableCost * qty;
    return {
      label: b === 0 ? "Mevcut fiyat" : `${b > 0 ? "+" : ""}${b}%`,
      price: Number(price.toFixed(2)),
      quantity: qty,
      revenue: Number(revenue.toFixed(2)),
      cogs: Number(cogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      contributionProfit: Number(contributionProfit.toFixed(2)),
    };
  });
}
