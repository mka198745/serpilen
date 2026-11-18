"use client";

import Link from "next/link";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { parseCartSettings } from "@/lib/site-settings-shared";
import { useSiteSettings } from "@/lib/use-site-settings";
import type { Product } from "@/lib/types";

export function HeroProductActions({ product, initialCartEnabled }: { product: Product; initialCartEnabled: boolean }) {
  const { addToCart } = useCart();
  const settings = useSiteSettings({ "site.cart.enabled": String(initialCartEnabled) });
  const cartEnabled = parseCartSettings(settings).enabled;
  const variant = product.variants?.find((item) => item.isActive) ?? null;
  const canAdd = cartEnabled && (!product.hasVariants || !!variant);
  const variantLabel = [variant?.colorName, variant?.size || variant?.length].filter(Boolean).join(" · ");

  return (
    <div className="mt-3 space-y-2">
      {variantLabel && <p className="min-h-4 truncate px-1 text-[10px] text-stone-400" title={variantLabel}>Seçili: {variantLabel}</p>}
      {product.hasVariants && !variant && <p className="min-h-4 px-1 text-[10px] text-stone-400">Aktif seçenek bulunmuyor.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/urun/${product.slug}`} aria-label={`${product.name} ürününü incele`} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-white/20 bg-white/5 px-2 py-2 text-[11px] font-bold text-white transition hover:border-amber-300/60 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:text-xs">
          Ürünü İncele <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </Link>
        <button type="button" disabled={!canAdd} onClick={() => addToCart(product, variant, Math.max(1, product.minOrderQty || 1))} aria-label={`${product.name} ürününü sepete ekle`} title={!cartEnabled ? "Sepet şu anda kapalı" : !canAdd ? "Aktif seçenek bulunmuyor" : variantLabel ? `Seçili: ${variantLabel}` : undefined} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-2 py-2 text-[11px] font-bold text-stone-950 shadow-sm transition hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs">
          <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Sepete Ekle
        </button>
      </div>
    </div>
  );
}
