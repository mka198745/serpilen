import { db } from "@/db";
import { promotions } from "@/db/schema";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

export interface PromoCartLine {
  productId: number;
  variantId?: number | null;
  categoryId?: number | null;
  brandId?: number | null;
  unitPrice: number; // KDV dahil birim fiyat
  quantity: number;
}

export interface PromoLineResult {
  lineIndex: number;
  discount: number;
  promotionId: number;
  promotionName: string;
  label: string;
}

export interface PromoResult {
  totalDiscount: number;
  lineDiscounts: PromoLineResult[];
  freeShipping: boolean;
  appliedPromotions: Array<{ id: number; name: string; amount: number; type: string }>;
  orderLevelDiscounts: Array<{ promotionId: number; name: string; amount: number }>;
}

function isActiveNow(p: typeof promotions.$inferSelect) {
  const now = new Date();
  if (!p.isActive) return false;
  if (p.startDate && new Date(p.startDate) > now) return false;
  if (p.endDate && new Date(p.endDate) < now) return false;
  return true;
}

/**
 * Kural tabanlı promosyon motoru.
 * - Satır bazlı kurallar (kategori/marka yüzdesi, X al Y öde, paket indirimi):
 *   her satıra en yüksek indirim uygulanır (üst üste binme yok).
 * - Sipariş bazlı kurallar (eşik indirimi, ücretsiz kargo) sepet toplamına uygulanır.
 */
export async function applyPromotions(lines: PromoCartLine[]): Promise<PromoResult> {
  const rows = await db.select().from(promotions).where(
    and(
      eq(promotions.isActive, true),
      lte(promotions.startDate, new Date()),
      or(isNull(promotions.endDate), gt(promotions.endDate, new Date()))
    )
  );

  const active = rows.filter(isActiveNow).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const result: PromoResult = {
    totalDiscount: 0,
    lineDiscounts: [],
    freeShipping: false,
    appliedPromotions: [],
    orderLevelDiscounts: [],
  };

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  if (subtotal <= 0 || active.length === 0) return result;

  // ---- Satır bazlı kurallar ----
  lines.forEach((line, lineIndex) => {
    let best: { amount: number; promo: (typeof active)[number]; label: string } | null = null;
    const lineTotal = line.unitPrice * line.quantity;

    for (const p of active) {
      let amount = 0;
      let label = "";

      if (p.ruleType === "PERCENT_CATEGORY" && p.categoryId === line.categoryId && p.percentValue) {
        amount = (lineTotal * Number(p.percentValue)) / 100;
        label = `Kategori indirimi %${p.percentValue}`;
      } else if (p.ruleType === "PERCENT_BRAND" && p.brandId === line.brandId && p.percentValue) {
        amount = (lineTotal * Number(p.percentValue)) / 100;
        label = `Marka indirimi %${p.percentValue}`;
      } else if (p.ruleType === "BUNDLE_PERCENT" && p.categoryId === line.categoryId && line.quantity >= (p.minQty || 2) && p.percentValue) {
        amount = (lineTotal * Number(p.percentValue)) / 100;
        label = `${p.minQty || 2}+ adet %${p.percentValue} sepet indirimi`;
      } else if (p.ruleType === "BUY_X_PAY_Y" && p.buyQty && p.payQty && p.buyQty > p.payQty) {
        const matchesTarget = !p.categoryId || p.categoryId === line.categoryId;
        if (matchesTarget) {
          const groups = Math.floor(line.quantity / p.buyQty);
          if (groups > 0) {
            amount = groups * (p.buyQty - p.payQty) * line.unitPrice;
            label = `${p.buyQty} al ${p.payQty} öde`;
          }
        }
      }

      if (p.maxDiscount && amount > Number(p.maxDiscount)) amount = Number(p.maxDiscount);

      if (amount > 0 && (!best || amount > best.amount)) {
        best = { amount, promo: p, label };
      }
    }

    if (best) {
      const capped = Math.min(best.amount, lineTotal);
      if (capped > 0.009) {
        result.lineDiscounts.push({
          lineIndex,
          discount: Number(capped.toFixed(2)),
          promotionId: best.promo.id,
          promotionName: best.promo.name,
          label: best.label,
        });
        result.totalDiscount += capped;
        const existing = result.appliedPromotions.find((a) => a.id === best!.promo.id);
        if (existing) existing.amount += capped;
        else result.appliedPromotions.push({ id: best.promo.id, name: best.promo.name, amount: capped, type: best.promo.ruleType });
      }
    }
  });

  // ---- Sipariş bazlı kurallar ----
  for (const p of active) {
    if (p.ruleType === "THRESHOLD_DISCOUNT" && p.thresholdAmount && subtotal >= Number(p.thresholdAmount)) {
      const amount = p.fixedValue ? Number(p.fixedValue) : p.percentValue ? (subtotal * Number(p.percentValue)) / 100 : 0;
      if (amount > 0) {
        result.totalDiscount += amount;
        result.orderLevelDiscounts.push({ promotionId: p.id, name: p.name, amount });
        result.appliedPromotions.push({ id: p.id, name: p.name, amount, type: p.ruleType });
      }
    }
    if (p.ruleType === "FREE_SHIPPING" && p.thresholdAmount && subtotal >= Number(p.thresholdAmount)) {
      result.freeShipping = true;
      result.appliedPromotions.push({ id: p.id, name: p.name, amount: 0, type: "FREE_SHIPPING" });
    } else if (p.ruleType === "FREE_SHIPPING" && !p.thresholdAmount) {
      result.freeShipping = true;
      result.appliedPromotions.push({ id: p.id, name: p.name, amount: 0, type: "FREE_SHIPPING" });
    }
  }

  result.totalDiscount = Number(Math.min(result.totalDiscount, subtotal).toFixed(2));
  result.appliedPromotions = result.appliedPromotions.map((a) => ({ ...a, amount: Number(a.amount.toFixed(2)) }));
  return result;
}

/** Kampanya kullanım sayaçlarını artırır (sipariş tamamlandığında). */
export async function touchPromotions(ids: number[]) {
  for (const id of ids) {
    await db.update(promotions).set({ usedCount: sql`${promotions.usedCount} + 1` }).where(eq(promotions.id, id));
  }
}
