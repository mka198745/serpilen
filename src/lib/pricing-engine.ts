import { db } from "@/db";
import { priceLists, priceListItems, priceTiers, products, productVariants, customers } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface PriceQuoteInput {
  productId: number;
  variantId?: number | null;
  quantity: number;
  customerId?: number | null;
  priceListId?: number | null;
}

export interface PriceQuote {
  productId: number;
  variantId: number | null;
  quantity: number;
  listPrice: number; // perakende referans
  basePrice: number; // liste/override sonrası birim
  unitPrice: number; // kademe + cari iskonto sonrası nihai birim
  lineTotal: number;
  discountRate: number; // toplam efektif iskonto %
  savings: number; // perakendeye göre toplam tasarruf
  priceListCode: string | null;
  priceListName: string | null;
  appliedTier: { minQty: number; maxQty: number | null; label: string } | null;
  customerDiscountRate: number;
  source: "TIER" | "PRICE_LIST_ITEM" | "PRICE_LIST_DEFAULT" | "B2B_BASE" | "RETAIL";
}

/** Bir ürün/varyant için müşteriye özel nihai fiyatı hesaplar. */
export async function quotePrice(input: PriceQuoteInput): Promise<PriceQuote> {
  const qty = Math.max(1, Number(input.quantity) || 1);

  const [product] = await db.select().from(products).where(eq(products.id, Number(input.productId))).limit(1);
  if (!product) throw new Error("Ürün bulunamadı");

  let variant: typeof productVariants.$inferSelect | undefined;
  if (input.variantId) {
    [variant] = await db.select().from(productVariants).where(eq(productVariants.id, Number(input.variantId))).limit(1);
  }

  const listPrice = Number(variant?.retailPrice ?? product.retailPrice);
  const b2bBase = Number(variant?.b2bPrice ?? product.b2bPrice ?? listPrice);

  // 1) Fiyat listesi çözümle: explicit → müşterinin listesi → varsayılan liste
  let customer: typeof customers.$inferSelect | undefined;
  if (input.customerId) {
    [customer] = await db.select().from(customers).where(eq(customers.id, Number(input.customerId))).limit(1);
  }

  let list: typeof priceLists.$inferSelect | undefined;
  const targetListId = input.priceListId ?? customer?.priceListId ?? null;
  if (targetListId) {
    [list] = await db.select().from(priceLists).where(eq(priceLists.id, Number(targetListId))).limit(1);
  }
  if (!list) {
    const all = await db.select().from(priceLists);
    list = all.find((l) => l.isDefault && l.isActive);
  }
  if (list && !list.isActive) list = undefined;

  let basePrice = customer?.type === "B2B" ? b2bBase : listPrice;
  let source: PriceQuote["source"] = customer?.type === "B2B" ? "B2B_BASE" : "RETAIL";

  // 2) Liste geneli iskonto
  if (list) {
    const rate = Number(list.defaultDiscountRate || 0);
    if (rate > 0) {
      basePrice = listPrice * (1 - rate / 100);
      source = "PRICE_LIST_DEFAULT";
    }

    // 3) Ürün bazlı override (liste × ürün) — en spesifik kural
    const items = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, list.id));
    const override = items
      .filter(
        (i) =>
          i.productId === product.id &&
          (i.variantId == null || i.variantId === (variant?.id ?? null)) &&
          qty >= (i.minQty || 1)
      )
      .sort((a, b) => (b.minQty || 1) - (a.minQty || 1))[0];
    if (override) {
      basePrice = Number(override.unitPrice);
      source = "PRICE_LIST_ITEM";
    }
  }

  // 4) Kademeli (hacim) barem
  let appliedTier: PriceQuote["appliedTier"] = null;
  let unitPrice = basePrice;
  if (list) {
    const tiers = await db.select().from(priceTiers).where(eq(priceTiers.priceListId, list.id));
    const candidates = tiers
      .filter((t) => (t.productId == null || t.productId === product.id))
      .filter((t) => qty >= t.minQty && (t.maxQty == null || qty <= t.maxQty))
      // ürün bazlı barem liste barem'inden önceliklidir
      .sort((a, b) => (b.productId ? 1 : 0) - (a.productId ? 1 : 0) || b.minQty - a.minQty);

    const tier = candidates[0];
    if (tier) {
      if (tier.unitPrice != null) {
        unitPrice = Number(tier.unitPrice);
      } else if (tier.discountRate != null) {
        unitPrice = basePrice * (1 - Number(tier.discountRate) / 100);
      }
      appliedTier = {
        minQty: tier.minQty,
        maxQty: tier.maxQty,
        label: tier.maxQty ? `${tier.minQty}–${tier.maxQty} adet` : `${tier.minQty}+ adet`,
      };
      source = "TIER";
    }
  }

  // 5) Müşteriye özel ek iskonto (cari kartındaki oran)
  const customerDiscountRate = Number(customer?.discountRate || 0);
  if (customerDiscountRate > 0) {
    unitPrice = unitPrice * (1 - customerDiscountRate / 100);
  }

  unitPrice = Math.max(0, Number(unitPrice.toFixed(2)));
  const lineTotal = Number((unitPrice * qty).toFixed(2));
  const discountRate = listPrice > 0 ? Number((((listPrice - unitPrice) / listPrice) * 100).toFixed(1)) : 0;

  return {
    productId: product.id,
    variantId: variant?.id ?? null,
    quantity: qty,
    listPrice: Number(listPrice.toFixed(2)),
    basePrice: Number(basePrice.toFixed(2)),
    unitPrice,
    lineTotal,
    discountRate,
    savings: Number(((listPrice - unitPrice) * qty).toFixed(2)),
    priceListCode: list?.code ?? null,
    priceListName: list?.name ?? null,
    appliedTier,
    customerDiscountRate,
    source,
  };
}

/** Sepetin tamamı için fiyat teklifi. */
export async function quoteCart(lines: PriceQuoteInput[], customerId?: number | null) {
  const quotes: PriceQuote[] = [];
  for (const l of lines) {
    quotes.push(await quotePrice({ ...l, customerId: customerId ?? l.customerId ?? null }));
  }
  const subtotal = quotes.reduce((s, q) => s + q.lineTotal, 0);
  const listTotal = quotes.reduce((s, q) => s + q.listPrice * q.quantity, 0);
  return {
    quotes,
    subtotal: Number(subtotal.toFixed(2)),
    listTotal: Number(listTotal.toFixed(2)),
    totalSavings: Number((listTotal - subtotal).toFixed(2)),
  };
}

/** Bir ürün için tüm kademe baremlerini (fiyat merdiveni) döndürür. */
export async function getTierLadder(productId: number, priceListId?: number | null, customerId?: number | null) {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return [];

  let listId = priceListId ?? null;
  if (!listId && customerId) {
    const [c] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    listId = c?.priceListId ?? null;
  }
  if (!listId) {
    const all = await db.select().from(priceLists);
    listId = all.find((l) => l.isDefault && l.isActive)?.id ?? null;
  }
  if (!listId) return [];

  const tiers = await db.select().from(priceTiers).where(eq(priceTiers.priceListId, listId));
  const relevant = tiers
    .filter((t) => t.productId == null || t.productId === productId)
    .sort((a, b) => a.minQty - b.minQty);

  const ladder = [];
  for (const t of relevant) {
    const q = await quotePrice({ productId, quantity: t.minQty, customerId, priceListId: listId });
    ladder.push({
      minQty: t.minQty,
      maxQty: t.maxQty,
      label: t.maxQty ? `${t.minQty}–${t.maxQty} adet` : `${t.minQty}+ adet`,
      unitPrice: q.unitPrice,
      discountRate: q.discountRate,
    });
  }
  return ladder;
}

/** Cari limit / vade / minimum sipariş kontrolü. */
export interface CreditCheck {
  allowed: boolean;
  reason?: string;
  code?: "BLOCKED" | "PENDING_APPROVAL" | "MIN_ORDER" | "CREDIT_LIMIT";
  balance: number;
  creditLimit: number;
  availableCredit: number;
  newBalance: number;
  paymentTermDays: number;
  dueDate: string | null;
}

export async function checkCredit(customerId: number, orderTotal: number): Promise<CreditCheck> {
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!c) throw new Error("Cari bulunamadı");

  const balance = Number(c.balance || 0);
  const creditLimit = Number(c.creditLimit || 0);
  const availableCredit = Number((creditLimit - balance).toFixed(2));
  const newBalance = Number((balance + orderTotal).toFixed(2));
  const term = Number(c.paymentTermDays || 30);
  const dueDate = new Date(Date.now() + term * 86400000).toISOString();

  const base = { balance, creditLimit, availableCredit, newBalance, paymentTermDays: term, dueDate };

  if (c.isBlocked) {
    return { allowed: false, code: "BLOCKED", reason: "Cari hesap risk nedeniyle kapalıdır. Lütfen muhasebe ile görüşün.", ...base };
  }
  if (c.approvalStatus === "PENDING") {
    return { allowed: false, code: "PENDING_APPROVAL", reason: "Bayilik başvurunuz onay bekliyor.", ...base };
  }
  const minOrder = Number(c.minOrderAmount || 0);
  if (minOrder > 0 && orderTotal < minOrder) {
    return { allowed: false, code: "MIN_ORDER", reason: `Minimum sipariş tutarı ${minOrder.toFixed(2)} TL'dir.`, ...base };
  }
  if (creditLimit > 0 && newBalance > creditLimit) {
    return {
      allowed: false,
      code: "CREDIT_LIMIT",
      reason: `Kredi limiti aşılıyor. Kullanılabilir limit: ${availableCredit.toFixed(2)} TL`,
      ...base,
    };
  }

  return { allowed: true, ...base };
}
