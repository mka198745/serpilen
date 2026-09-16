import { NextResponse } from "next/server";
import {
  analyzeSales,
  analyzeInventory,
  recommendPurchases,
  analyzeCustomers,
  generateProductContent,
  chat,
} from "@/lib/ai-engine";
import { db } from "@/db";
import { products, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const GUARDRAILS = {
  default: "Guardrail: AI yalnızca öneri üretir. Kullanıcı onayı olmadan fiyat, stok, sipariş veya muhasebe kaydı değiştirilmez.",
  content: "Guardrail: Üretilen içerikler önizleme modundadır. 'Uygula' onayı verilmeden ürüne yazılmaz.",
};

export async function GET() {
  return NextResponse.json({
    success: true,
    modules: [
      { id: "sales_analyst", label: "AI Satış & Ciro Analisti", description: "Kanal bazlı trend, büyüme, tahmin ve kârlılık analizi." },
      { id: "inventory_assistant", label: "AI Stok & Envanter Asistanı", description: "Tükenme tahmini, days-of-cover ve reorder önerisi." },
      { id: "purchasing_advisor", label: "AI Satın Alma Danışmanı", description: "Tedarikçi eşleştirmesi ve maliyet hesaplı sipariş taslağı." },
      { id: "crm_assistant", label: "AI CRM & Churn Asistanı", description: "Segmentasyon, kayıp riski skoru ve LTV analizi." },
      { id: "content_generator", label: "AI Ürün İçerik & SEO Asistanı", description: "SEO başlık, meta, uzun açıklama ve etiket üretimi." },
      { id: "chat", label: "AI Sohbet Asistanı", description: "Doğal dil ile serbest soru-cevap." },
    ],
    guardrails: GUARDRAILS,
    chatSuggestions: [
      "Bugünkü satışlar nasıl?",
      "Hangi ürünlerin stoğu kritik?",
      "Satın alma önerisi ver",
      "VIP müşterilerim kimler?",
      "Bu ay ne kadar ciro yaparız?",
      "Kampanya önerisi ver",
    ],
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { module, productId, prompt, tone, keywords } = body;

    // Doğal dil sohbet modu
    if (module === "chat") {
      const res = await chat(String(prompt || ""));
      return NextResponse.json({ success: true, guardrail: GUARDRAILS.default, data: res });
    }

    // Ürün içerik & SEO üretimi (önizleme, onay gerektirir)
    if (module === "content_generator") {
      const pid = Number(productId);
      if (!pid) return NextResponse.json({ success: false, error: "Ürün seçilmelidir." }, { status: 422 });
      const content = await generateProductContent(pid, { tone, keywords });
      return NextResponse.json({ success: true, guardrail: GUARDRAILS.content, data: content });
    }

    // Ürün içerik uygulama (kullanıcı onayı sonrası) — tek yazma noktası
    if (module === "apply_content") {
      const pid = Number(productId);
      if (!pid) return NextResponse.json({ success: false, error: "Ürün seçilmelidir." }, { status: 422 });
      const { seoTitle, metaDescription, seoDescription, longDescription, suggestedTags } = body.content || {};
      if (!seoTitle && !seoDescription && !longDescription) {
        return NextResponse.json({ success: false, error: "Uygulanacak içerik bulunamadı." }, { status: 422 });
      }

      await db.update(products).set({
          ...(seoTitle && { seoTitle: String(seoTitle).slice(0, 200) }),
          ...(metaDescription && { seoDescription: String(metaDescription).slice(0, 300) }),
          ...(longDescription && { description: String(longDescription) }),
          ...(suggestedTags && { tags: String(suggestedTags) }),
        }).where(eq(products.id, pid));
      const [updated] = await db.select().from(products).where(eq(products.id, pid));

      await db.insert(auditLogs).values({
        userId: "1",
        userName: "Yönetici (AI Onayı)",
        action: "AI_CONTENT_APPLIED",
        entity: "Product",
        entityId: String(pid),
        details: `AI tarafından üretilen SEO içerik kullanıcı onayıyla ürüne yazıldı. Başlık: ${updated.seoTitle?.slice(0, 60)}`,
      });

      return NextResponse.json({
        success: true,
        message: "İçerik kullanıcı onayıyla ürüne uygulandı.",
        data: updated,
      });
    }

    // Analitik modüller
    if (module === "sales_analyst") {
      const data = await analyzeSales();
      return NextResponse.json({ success: true, guardrail: GUARDRAILS.default, data });
    }

    if (module === "inventory_assistant") {
      const data = await analyzeInventory();
      return NextResponse.json({ success: true, guardrail: GUARDRAILS.default, data });
    }

    if (module === "purchasing_advisor") {
      const data = await recommendPurchases();
      return NextResponse.json({ success: true, guardrail: GUARDRAILS.default, data });
    }

    if (module === "crm_assistant") {
      const data = await analyzeCustomers();
      return NextResponse.json({ success: true, guardrail: GUARDRAILS.default, data });
    }

    return NextResponse.json({ success: false, error: "Bilinmeyen AI modülü." }, { status: 400 });
  } catch (err: any) {
    console.error("AI module error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
