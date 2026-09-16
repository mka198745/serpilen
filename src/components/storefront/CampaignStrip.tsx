import React from "react";
import Link from "next/link";
import { db } from "@/db";
import { promotions, categories } from "@/db/schema";
import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { Megaphone, Truck, Percent, TicketPercent, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const RULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PERCENT_CATEGORY: Percent,
  PERCENT_BRAND: TicketPercent,
  THRESHOLD_DISCOUNT: Megaphone,
  BUY_X_PAY_Y: TicketPercent,
  FREE_SHIPPING: Truck,
  BUNDLE_PERCENT: Percent,
};

export async function CampaignStrip() {
  let active: (typeof promotions.$inferSelect)[] = [];
  try {
    active = await db
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.isActive, true),
          lte(promotions.startDate, new Date()),
          or(isNull(promotions.endDate), gt(promotions.endDate, new Date()))
        )
      )
      .orderBy(asc(promotions.priority));
  } catch {
    return null;
  }

  if (active.length === 0) return null;

  const cats = await db.select().from(categories);

  return (
    <section className="max-w-7xl mx-auto px-4">
      <div className="bg-gradient-to-r from-rose-700 via-rose-600 to-amber-600 rounded-3xl p-5 md:p-6 text-white shadow-lg shadow-rose-900/20">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Megaphone className="w-4 h-4" />
            </span>
            <h2 className="text-lg font-black tracking-tight">Aktif Kampanyalar</h2>
          </div>
          <Link href="/urunler" className="text-xs font-bold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full transition flex items-center gap-1">
            Ürünleri Keşfet <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {active.slice(0, 4).map((p) => {
            const Icon = RULE_ICONS[p.ruleType] || Megaphone;
            const target = p.categoryId ? cats.find((c) => c.id === p.categoryId) : null;
            const href = target ? `/urunler?category=${target.slug}` : "/urunler";
            return (
              <Link
                key={p.id}
                href={href}
                className="bg-white/10 hover:bg-white/20 backdrop-blur-xs rounded-2xl p-4 transition border border-white/15 flex items-start gap-3"
              >
                <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="font-black text-sm leading-tight">{p.name}</h3>
                  <p className="text-[11px] text-white/85 leading-snug mt-0.5 line-clamp-2">
                    {p.ruleType === "PERCENT_CATEGORY" && p.percentValue && `%${p.percentValue} indirim${target ? ` · ${target.name}` : ""}`}
                    {p.ruleType === "PERCENT_BRAND" && p.percentValue && `Markada %${p.percentValue} indirim`}
                    {p.ruleType === "THRESHOLD_DISCOUNT" && `${p.thresholdAmount ? `${p.thresholdAmount} TL+` : ""} sepete ${p.fixedValue} TL indirim`}
                    {p.ruleType === "BUY_X_PAY_Y" && `${p.buyQty} al ${p.payQty} öde`}
                    {p.ruleType === "FREE_SHIPPING" && "Ücretsiz kargo"}
                    {p.ruleType === "BUNDLE_PERCENT" && `${p.minQty || 2}+ adet alımda %${p.percentValue}`}
                  </p>
                  <span className="inline-block text-[10px] font-bold text-white/70 mt-1">
                    {p.endDate ? `Son gün: ${new Date(p.endDate).toLocaleDateString("tr-TR")}` : "Süresiz"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
