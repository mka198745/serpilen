import { NextResponse } from "next/server";
import { db } from "@/db";
import { brands, products } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureUniqueSlug, slugifyTr } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function GET() {
  const all = await db.select().from(brands).orderBy(desc(brands.id));
  return NextResponse.json({ success: true, data: all });
}

/** POST /api/brands — Admin panelinden manuel marka ekleme. Aynı isim varsa mevcudu döner (idempotent). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = String(body?.name || "").trim();

  if (!name) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Marka adı zorunludur." } },
      { status: 422 }
    );
  }

  try {
    const all = await db.select().from(brands);
    const existing = all.find((b) => b.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"));
    if (existing) {
      return NextResponse.json({ success: true, existed: true, data: existing });
    }

    const slug = ensureUniqueSlug(slugifyTr(name) || "marka", (s) => all.some((b) => b.slug === s));
    const [{ id: __created_id }] = await db.insert(brands).values({ name, slug }).$returningId();
    const [created] = await db.select().from(brands).where(eq(brands.id, __created_id));

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    console.error("Brand create error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Marka eklenemedi." } }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: number;
    name?: string;
    isActive?: boolean;
    logoUrl?: string;
  };
  const id = Number(body.id);
  if (!id) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Marka ID zorunludur." } }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name && body.name.trim()) {
    updates.name = body.name.trim();
    updates.slug = slugifyTr(body.name.trim());
  }
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
  if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Güncellenecek alan yok." } }, { status: 422 });
  }

  await db.update(brands).set(updates).where(eq(brands.id, id));
  const [updated] = await db.select().from(brands).where(eq(brands.id, id));
  if (!updated) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Marka bulunamadı." } }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: updated });
}

/** DELETE /api/brands — Marka silme. Ürünü olan marka silinemez (önce ürünleri taşıyın/pasife alın). */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: number };
  const id = Number(body?.id);
  if (!id) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Marka ID zorunludur." } }, { status: 422 });
  }

  try {
    const [target] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
    if (!target) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Marka bulunamadı." } }, { status: 404 });
    }

    const linked = await db.select({ id: products.id }).from(products).where(eq(products.brandId, id)).limit(1);
    if (linked.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: "BRAND_IN_USE", message: `Bu markaya bağlı ürünler var; önce ürünleri başka markaya taşıyın veya markayı pasife alın.` } },
        { status: 409 }
      );
    }

    await db.delete(brands).where(eq(brands.id, id));
    return NextResponse.json({ success: true, data: { id, name: target.name } });
  } catch (err: any) {
    console.error("Brand delete error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Marka silinemedi." } }, { status: 500 });
  }
}
