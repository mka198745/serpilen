import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "./ProductCard";

type ShowcaseProduct = React.ComponentProps<typeof ProductCard>["product"];

interface CategoryShowcaseProps {
  /** Bölüm üstü küçük etiket (örn. "Başlangıç Setleri") */
  eyebrow: string;
  /** Bölüm başlığı (kategori adı) */
  title: string;
  /** "Tümünü gör" bağlantısı — kategori filtreli katalog */
  href: string;
  products: ShowcaseProduct[];
}

/** Ürünü olmayan kategori vitrini anasayfada gösterilmez. */
export function CategoryShowcase({ eyebrow, title, href, products }: CategoryShowcaseProps) {
  if (products.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-2">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800">{eyebrow}</span>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">{title}</h2>
        </div>
        <Link
          href={href}
          className="text-xs font-semibold text-amber-800 hover:text-amber-900 flex items-center gap-1"
        >
          <span>Tüm {title}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
