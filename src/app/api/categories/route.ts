import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureUniqueSlug, slugifyTr } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function GET() {
  const all = await db.select().from(categories).orderBy(categories.displayOrder, desc(categories.id));
  const allProds = await db.select({ id: products.id, categoryId: products.categoryId }).from(products);

  const data = all.map((c) => ({
    ...c,
    productCount: allProds.filter((p) => p.categoryId === c.id).length,
    parentName: all.find((p) => p.id === c.parentId)?.name || null,
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    parentId?: number | null;
    description?: string;
    icon?: string;
    displayOrder?: number;
  };

  const name = String(body?.name || "").trim();
  if (!name) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Kategori adı zorunludur." } },
      { status: 422 }
    );
  }

  try {
    const all = await db.select().from(categories);
    const existing = all.find((c) => c.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR") && (c.parentId || null) === (body.parentId || null));
    if (existing) {
      return NextResponse.json({ success: true, existed: true, data: existing });
    }

    const slug = ensureUniqueSlug(slugifyTr(name) || "kategori", (s) => all.some((c) => c.slug === s));
    const [{ id: __created_id }] = await db.insert(categories).values({
        name,
        slug,
        parentId: body.parentId ? Number(body.parentId) : null,
        description: body.description?.trim() || null,
        icon: body.icon?.trim() || "Package",
        displayOrder: Number(body.displayOrder || all.length + 1),
      }).$returningId();
    const [created] = await db.select().from(categories).where(eq(categories.id, __created_id));

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: number;
    name?: string;
    parentId?: number | null;
    description?: string;
    isActive?: boolean;
    displayOrder?: number;
  };

  const id = Number(body.id);
  if (!id) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Kategori ID zorunludur." } }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name && body.name.trim()) {
    updates.name = body.name.trim();
    updates.slug = slugifyTr(body.name.trim());
  }
  if (body.parentId !== undefined) updates.parentId = body.parentId ? Number(body.parentId) : null;
  if (body.description !== undefined) updates.description = body.description;
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
  if (body.displayOrder !== undefined) updates.displayOrder = Number(body.displayOrder);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Güncellenecek alan yok." } }, { status: 422 });
  }

  await db.update(categories).set(updates).where(eq(categories.id, id));
  const [updated] = await db.select().from(categories).where(eq(categories.id, id));
  if (!updated) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Kategori bulunamadı." } }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: updated });
}
