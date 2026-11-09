import { NextResponse } from "next/server";
import { db } from "@/db";
import { blogPosts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { slugifyTr, ensureUniqueSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = [
  "Dikiş Rehberi",
  "Malzeme Rehberi",
  "Teknikler & İpuçları",
  "Bakım & Onarım",
  "Hikayeler",
];

function cleanString(v: unknown, max = 5000): string {
  return String(v ?? "").trim().slice(0, max);
}

/** GET /api/blog-posts — Tüm içerikleri listeler (yönetim paneli; taslaklar dahil). */
export async function GET() {
  try {
    const rows = await db.select().from(blogPosts).orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id));
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("Blog list error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Liste alınamadı." } }, { status: 500 });
  }
}

/** POST /api/blog-posts — Yeni içerik. Slug başlıktan üretilir, çakışırsa -2 eklenir. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = cleanString(body?.title, 300);
  const content = cleanString(body?.content, 100_000);
  if (!title) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Başlık zorunludur." } }, { status: 422 });
  }
  if (!content) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "İçerik metni zorunludur." } }, { status: 422 });
  }
  const excerpt = cleanString(body?.excerpt, 500) || null;
  const category = VALID_CATEGORIES.includes(cleanString(body?.category)) ? cleanString(body?.category) : "Dikiş Rehberi";
  const author = cleanString(body?.author, 120) || "Tuhafiye Uzmanı";
  const imageUrl = cleanString(body?.imageUrl, 1000) || null;
  const isPublished = body?.isPublished === undefined ? true : Boolean(body.isPublished);

  try {
    const all = await db.select({ slug: blogPosts.slug }).from(blogPosts);
    const slug = ensureUniqueSlug(slugifyTr(title) || "icerik", (s) => all.some((p) => p.slug === s));
    const [{ id }] = await db
      .insert(blogPosts)
      .values({ title, slug, excerpt, content, category, author, imageUrl, isPublished })
      .returning({ id: blogPosts.id });
    const [created] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: any) {
    console.error("Blog create error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "İçerik oluşturulamadı." } }, { status: 500 });
  }
}

/** PATCH /api/blog-posts — id ile günceller. Slug DEĞİŞMEZ (linkler bozulmasın). */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir içerik id zorunludur." } }, { status: 422 });
  }
  try {
    const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    if (!existing) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "İçerik bulunamadı." } }, { status: 404 });
    }
    const patch: Record<string, unknown> = {};
    if (body?.title !== undefined) {
      const title = cleanString(body.title, 300);
      if (!title) {
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Başlık boş olamaz." } }, { status: 422 });
      }
      patch.title = title;
    }
    if (body?.content !== undefined) {
      const content = cleanString(body.content, 100_000);
      if (!content) {
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "İçerik boş olamaz." } }, { status: 422 });
      }
      patch.content = content;
    }
    if (body?.excerpt !== undefined) patch.excerpt = cleanString(body.excerpt, 500) || null;
    if (body?.category !== undefined) {
      const category = cleanString(body.category);
      patch.category = VALID_CATEGORIES.includes(category) ? category : "Dikiş Rehberi";
    }
    if (body?.author !== undefined) patch.author = cleanString(body.author, 120) || "Tuhafiye Uzmanı";
    if (body?.imageUrl !== undefined) patch.imageUrl = cleanString(body.imageUrl, 1000) || null;
    if (body?.isPublished !== undefined) patch.isPublished = Boolean(body.isPublished);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, data: existing });
    }
    await db.update(blogPosts).set(patch).where(eq(blogPosts.id, id));
    const [updated] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error("Blog patch error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "İçerik güncellenemedi." } }, { status: 500 });
  }
}

/** DELETE /api/blog-posts?id=N (veya gövdede { id }) — İçeriği kalıcı siler. */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  let id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    const body = (await request.json().catch(() => ({}))) as { id?: number | string };
    id = Number(body?.id);
  }
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir içerik id zorunludur." } }, { status: 422 });
  }
  try {
    const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    if (!existing) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "İçerik bulunamadı." } }, { status: 404 });
    }
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
    return NextResponse.json({ success: true, data: { id } });
  } catch (err: any) {
    console.error("Blog delete error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "İçerik silinemedi." } }, { status: 500 });
  }
}
