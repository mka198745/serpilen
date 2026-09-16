import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productVariants, categories, brands, inventory } from "@/db/schema";
import { eq, or, desc, sql, and } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const categorySlug = searchParams.get("category");
    const brandSlug = searchParams.get("brand");
    const isFeatured = searchParams.get("featured");
    const slug = searchParams.get("slug");
    const barcode = searchParams.get("barcode");

    // If specific slug is requested
    if (slug) {
      const prodList = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
      if (prodList.length === 0) {
        return NextResponse.json({ success: false, error: "Ürün bulunamadı" }, { status: 404 });
      }
      const prod = prodList[0];
      const variants = await db.select().from(productVariants).where(eq(productVariants.productId, prod.id));
      const stocks = await db.select().from(inventory).where(eq(inventory.productId, prod.id));
      const totalStock = stocks.reduce((acc, s) => acc + (s.physicalQty - s.reservedQty), 0);

      return NextResponse.json({
        success: true,
        data: {
          ...prod,
          variants,
          totalStock: Math.max(0, totalStock),
          stockDetails: stocks,
        },
      });
    }

    // Barcode scan lookup (for POS / Warehouse scan)
    if (barcode) {
      // First check variants
      const variantMatch = await db.select().from(productVariants).where(eq(productVariants.barcode, barcode)).limit(1);
      if (variantMatch.length > 0) {
        const v = variantMatch[0];
        const p = (await db.select().from(products).where(eq(products.id, v.productId)).limit(1))[0];
        return NextResponse.json({
          success: true,
          data: {
            ...p,
            selectedVariant: v,
            retailPrice: v.retailPrice,
            sku: v.sku,
            barcode: v.barcode,
          },
        });
      }

      // Check main product barcode
      const prodMatch = await db.select().from(products).where(eq(products.barcode, barcode)).limit(1);
      if (prodMatch.length > 0) {
        return NextResponse.json({ success: true, data: prodMatch[0] });
      }

      return NextResponse.json({ success: false, error: "Barkod ile eşleşen ürün bulunamadı" }, { status: 404 });
    }

    // Query builder — metin araması varyant/marka dahil JS katmanında yapılır
    let conditions = [eq(products.isActive, true)];

    if (isFeatured === "true") {
      conditions.push(eq(products.isFeatured, true));
    }

    let allProducts = await db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        sku: products.sku,
        barcode: products.barcode,
        brandId: products.brandId,
        categoryId: products.categoryId,
        shortDescription: products.shortDescription,
        description: products.description,
        unit: products.unit,
        buyPrice: products.buyPrice,
        retailPrice: products.retailPrice,
        b2bPrice: products.b2bPrice,
        minOrderQty: products.minOrderQty,
        packageQty: products.packageQty,
        vatRate: products.vatRate,
        hasVariants: products.hasVariants,
        imageUrl: products.imageUrl,
        campaignPrice: products.campaignPrice,
        tags: products.tags,
        collection: products.collection,
        isFeatured: products.isFeatured,
        isActive: products.isActive,
        createdAt: products.createdAt,
      })
      .from(products)
      .where(and(...conditions))
      .orderBy(desc(products.id));

    // Filter by category slug if given
    if (categorySlug) {
      const cat = (await db.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1))[0];
      if (cat) {
        allProducts = allProducts.filter((p) => p.categoryId === cat.id);
      }
    }

    // Filter by brand slug if given
    if (brandSlug) {
      const b = (await db.select().from(brands).where(eq(brands.slug, brandSlug)).limit(1))[0];
      if (b) {
        allProducts = allProducts.filter((p) => p.brandId === b.id);
      }
    }

    // Fetch all variants and stocks to attach
    const allVariants = await db.select().from(productVariants);
    const allInventory = await db.select().from(inventory);
    const allCats = await db.select().from(categories);
    const allBrandsList = await db.select().from(brands);

    const enriched = allProducts.map((p) => {
      const pVariants = allVariants.filter((v) => v.productId === p.id);
      const pStocks = allInventory.filter((i) => i.productId === p.id);
      const totalStock = pStocks.reduce((sum, item) => sum + (item.physicalQty - item.reservedQty), 0);
      const cat = allCats.find((c) => c.id === p.categoryId);
      const br = allBrandsList.find((b) => b.id === p.brandId);

      return {
        ...p,
        categoryName: cat?.name || "Tuhafiye",
        categorySlug: cat?.slug || "",
        brandName: br?.name || "Özel Üretim",
        brandSlug: br?.slug || "",
        variants: pVariants,
        totalStock: Math.max(0, totalStock),
      };
    });

    let result = enriched;
    if (query) {
      const q = query.toLowerCase();
      result = enriched.filter((p) => {
        const hay = [
          p.name,
          p.sku,
          p.barcode,
          p.description,
          p.shortDescription,
          p.tags,
          p.collection,
          p.brandName,
          p.categoryName,
          ...p.variants.flatMap((v) => [v.sku, v.barcode, v.colorName, v.size, v.length]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return NextResponse.json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error: any) {
    console.error("Products API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      slug,
      sku,
      barcode,
      categoryId,
      brandId,
      unit = "Adet",
      buyPrice = "0.00",
      retailPrice,
      b2bPrice,
      shortDescription,
      description,
      imageUrl,
      initialStock = 50,
      warehouseId = 1,
    } = body;

    const [{ id: __newProd_id }] = await db.insert(products).values({
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ]+/gi, "-").replace(/(^-|-$)/g, ""),
        sku,
        barcode: barcode || `869${Date.now().toString().slice(-10)}`,
        categoryId: Number(categoryId) || 1,
        brandId: brandId ? Number(brandId) : null,
        unit,
        buyPrice: String(buyPrice),
        retailPrice: String(retailPrice),
        b2bPrice: String(b2bPrice || retailPrice),
        shortDescription,
        description,
        imageUrl: imageUrl || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800&auto=format&fit=crop&q=80",
      }).$returningId();
    const [newProd] = await db.select().from(products).where(eq(products.id, __newProd_id));

    // Insert initial inventory
    if (initialStock > 0) {
      await db.insert(inventory).values({
        warehouseId: Number(warehouseId),
        productId: newProd.id,
        physicalQty: Number(initialStock),
        reservedQty: 0,
        locationCode: "MRK-A-01-01",
      });
    }

    return NextResponse.json({ success: true, data: newProd });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!id) {
      return NextResponse.json({ success: false, error: "Ürün ID zorunludur." }, { status: 422 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.sku !== undefined) updates.sku = String(body.sku).trim();
    if (body.barcode !== undefined) updates.barcode = String(body.barcode).trim() || null;
    if (body.categoryId !== undefined) updates.categoryId = Number(body.categoryId);
    if (body.brandId !== undefined) updates.brandId = body.brandId ? Number(body.brandId) : null;
    if (body.unit !== undefined) updates.unit = String(body.unit);
    if (body.buyPrice !== undefined) updates.buyPrice = String(body.buyPrice);
    if (body.retailPrice !== undefined) updates.retailPrice = String(body.retailPrice);
    if (body.b2bPrice !== undefined) updates.b2bPrice = String(body.b2bPrice);
    if (body.campaignPrice !== undefined) updates.campaignPrice = body.campaignPrice ? String(body.campaignPrice) : null;
    if (body.shortDescription !== undefined) updates.shortDescription = body.shortDescription;
    if (body.description !== undefined) updates.description = body.description;
    if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.collection !== undefined) updates.collection = body.collection;
    if (body.seoTitle !== undefined) updates.seoTitle = body.seoTitle;
    if (body.seoDescription !== undefined) updates.seoDescription = body.seoDescription;
    if (typeof body.isFeatured === "boolean") updates.isFeatured = body.isFeatured;
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
    if (body.vatRate !== undefined) updates.vatRate = Number(body.vatRate);
    if (body.minOrderQty !== undefined) updates.minOrderQty = Number(body.minOrderQty);
    if (body.packageQty !== undefined) updates.packageQty = Number(body.packageQty);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "Güncellenecek alan yok." }, { status: 422 });
    }

    await db.update(products).set(updates).where(eq(products.id, id));
    const [updated] = await db.select().from(products).where(eq(products.id, id));
    if (!updated) {
      return NextResponse.json({ success: false, error: "Ürün bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
