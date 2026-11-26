import { sharedSalesWarehouseId } from "@/lib/shared-sales-warehouse";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { resolveActiveWarehouse } from "@/lib/warehouse-policy";
import { NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { products, productVariants, productImages, categories, brands, inventory } from "@/db/schema";
import { eq, or, desc, sql, and, asc } from "drizzle-orm";

import { requireStaff, getUserByToken } from "@/lib/auth";
import { validateCrmWrite, readCrmJson } from "@/lib/crm-write";
import { deleteProductSafely } from "@/lib/delete-product";
import { validateProductSpecifications } from "@/lib/product-specifications";
import { validateNewProductVariants, variantSkuBase, VariantValidationError } from "@/lib/new-product-variants";
import { publicHttpsUrl, resolvePublicHost } from "@/lib/product-import/safe-fetch";
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const allWarehouses = searchParams.get("scope") === "all-warehouses";
    if (allWarehouses) {
      const gate=await requireStaff(request); if(!gate.ok)return gate.response;
      const matrix=await readRoleMatrix();
      if(!roleCanAccessModule(matrix,gate.user.role,"wms") && !roleCanAccessModule(matrix,gate.user.role,"catalog")) return NextResponse.json({success:false,error:"Stok yetkiniz bulunmuyor."},{status:403});
    }
    const salesWarehouse=sharedSalesWarehouseId();
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
      const allStocks = await db.select().from(inventory).where(eq(inventory.productId, prod.id));
      const stocks = allWarehouses ? allStocks : allStocks.filter(s=>s.warehouseId===salesWarehouse);
      const gallery = await db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, prod.id))
        .orderBy(asc(productImages.sortOrder), asc(productImages.id));
      const totalStock = stocks.reduce((acc, s) => acc + (s.physicalQty - s.reservedQty), 0);

      return NextResponse.json({
        success: true,
        data: {
          ...prod,
          variants,
          images: gallery.map((g) => g.url),
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
    let conditions = allWarehouses ? [] : [eq(products.isActive, true)];

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
        technicalDetails: products.technicalDetails,
        unit: products.unit,
        buyPrice: products.buyPrice,
        retailPrice: products.retailPrice,
        minOrderQty: products.minOrderQty,
        packageQty: products.packageQty,
        vatRate: products.vatRate,
        hasVariants: products.hasVariants,
        imageUrl: products.imageUrl,
        videoUrl: products.videoUrl,
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

    // Fetch all variants, images and stocks to attach
    const allVariants = await db.select().from(productVariants);
    const allInventory = await db.select().from(inventory);
    const allCats = await db.select().from(categories);
    const allBrandsList = await db.select().from(brands);
    const allImages = await db.select().from(productImages);

    const enriched = allProducts.map((p) => {
      const pVariants = allVariants.filter((v) => v.productId === p.id);
      const pStocks = allInventory.filter((i) => i.productId === p.id && (allWarehouses || i.warehouseId === salesWarehouse));
      const totalStock = pStocks.reduce((sum, item) => sum + (item.physicalQty - item.reservedQty), 0);
      const cat = allCats.find((c) => c.id === p.categoryId);
      const br = allBrandsList.find((b) => b.id === p.brandId);
      const pImages = allImages
        .filter((g) => g.productId === p.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((g) => g.url);

      return {
        ...p,
        categoryName: cat?.name || "Tuhafiye",
        categorySlug: cat?.slug || "",
        brandName: br?.name || "Özel Üretim",
        brandSlug: br?.slug || "",
        variants: pVariants,
        images: pImages,
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
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

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
      shortDescription,
      description,
      imageUrl,
      videoUrl,
      images,
      initialStock = 50,
      warehouseId,
    } = body;

    // A controlled select must never silently persist a stale or nonexistent brand.
    if (brandId !== undefined && brandId !== null && brandId !== "") {
      const selectedBrandId = Number(brandId);
      if (!Number.isSafeInteger(selectedBrandId) || selectedBrandId < 1 || !(await db.select({ id: brands.id }).from(brands).where(eq(brands.id, selectedBrandId)).limit(1)).length) {
        return NextResponse.json({ success: false, error: "Seçilen marka bulunamadı. Lütfen geçerli bir marka seçin." }, { status: 422 });
      }
    }

    let technicalDetails: string | null = null;
    if (body.technicalDetails !== undefined) {
      try {
        const value = validateProductSpecifications(body.technicalDetails);
        technicalDetails = value ? JSON.stringify(value) : null;
      } catch {
        return NextResponse.json({ success: false, error: "Teknik özellikler geçersiz veya çok uzun." }, { status: 422 });
      }
    }
    const galleryUrls = Array.isArray(images)
      ? images.map((u) => String(u || "").trim()).filter(Boolean).slice(0, 6)
      : [];

    let variants;
    try { variants = validateNewProductVariants(body.variants); }
    catch (error) { return NextResponse.json({ success: false, error: error instanceof VariantValidationError ? error.message : "Varyant bilgileri geçersiz." }, { status: 422 }); }

    const resolvedWarehouse = resolveActiveWarehouse(warehouseId);
    if (!resolvedWarehouse) return NextResponse.json({ success: false, error: "Geçerli ve aktif bir depo seçin." }, { status: 422 });

    if (variants.length) {
      const productSku = typeof sku === "string" ? sku.trim() : "";
      const productBarcode = typeof barcode === "string" ? barcode.trim() : "";
      const productName = typeof name === "string" ? name.trim() : "";
      const warehouse = resolvedWarehouse;
      const validPrice = (v: unknown) => /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(v)) && Number(v) <= 100000000;
      if (!productName || !productSku || productSku.length > 40 || productBarcode.length > 80 || !validPrice(buyPrice) || !validPrice(retailPrice) || !Number.isSafeInteger(warehouse) || warehouse < 1 || Number(initialStock) !== 0) {
        return NextResponse.json({ success: false, error: "Varyantlı ürün için ad, SKU, geçerli fiyat ve depo gereklidir; ana ürün stoğu 0 olmalıdır." }, { status: 422 });
      }
      // Images are external browser resources: validate each hostname again at save time.
      const imageHosts = new Map<string, Promise<unknown>>();
      try {
        const signal = AbortSignal.timeout(4000);
        for (const variant of variants) {
          if (!variant.imageUrl) continue;
          const image = publicHttpsUrl(variant.imageUrl);
          variant.imageUrl = image.href;
          if (!imageHosts.has(image.hostname)) imageHosts.set(image.hostname, resolvePublicHost(image.hostname, signal));
        }
        await Promise.all(imageHosts.values());
      } catch {
        return NextResponse.json({ success: false, error: "Varyant görsel adresi güvenli veya erişilebilir değil. Görsel bağlantısını kontrol edin." }, { status: 422 });
      }
      try {
        const created = db.transaction((tx) => {
          if (!resolveActiveWarehouse(warehouse)) throw new VariantValidationError("Seçilen depo bulunamadı.");
          const skuUsed = (value: string) => !!tx.select({ id: products.id }).from(products).where(eq(products.sku, value)).get() || !!tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, value)).get();
          const barcodeUsed = (value: string) => !!tx.select({ id: products.id }).from(products).where(eq(products.barcode, value)).get() || !!tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.barcode, value)).get();
          if (skuUsed(productSku)) throw new VariantValidationError("Ürün SKU zaten kullanılıyor.");
          if (productBarcode && barcodeUsed(productBarcode)) throw new VariantValidationError("Ürün barkodu zaten kullanılıyor.");
          const [product] = tx.insert(products).values({
            name: productName,
            slug: slug || productName.toLowerCase().replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ]+/gi, "-").replace(/(^-|-$)/g, ""),
            sku: productSku, barcode: productBarcode || null,
            categoryId: Number(categoryId) || 1, brandId: brandId ? Number(brandId) : null,
            unit, buyPrice: String(buyPrice), retailPrice: String(retailPrice), shortDescription, description, technicalDetails,
            imageUrl: imageUrl || galleryUrls[0] || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800&auto=format&fit=crop&q=80",
            videoUrl: videoUrl || null, hasVariants: true,
          }).returning().all();
          for (const [i, url] of galleryUrls.entries()) tx.insert(productImages).values({ productId: product.id, url, sortOrder: i, isPrimary: i === 0 }).run();
          for (const [i, variant] of variants.entries()) {
            let variantSku = variant.sku;
            if (variantSku && skuUsed(variantSku)) throw new VariantValidationError(`${i + 1}. varyantın SKU değeri zaten kullanılıyor.`);
            if (!variantSku) {
              const base = variantSkuBase(productSku, variant);
              for (let suffix = 1; suffix <= 10000; suffix++) {
                const candidate = `${base}-${suffix}`;
                if (!skuUsed(candidate)) { variantSku = candidate; break; }
              }
              if (!variantSku) throw new VariantValidationError(`${i + 1}. varyant için uygun SKU üretilemedi.`);
            }
            if (variant.barcode && barcodeUsed(variant.barcode)) throw new VariantValidationError(`${i + 1}. varyantın barkodu zaten kullanılıyor.`);
            const [createdVariant] = tx.insert(productVariants).values({
              productId: product.id, sku: variantSku, barcode: variant.barcode || null,
              colorName: variant.colorName || null, colorHex: variant.colorHex || null, size: variant.size || null, length: variant.length || null,
              buyPrice: variant.buyPrice || String(buyPrice), retailPrice: variant.retailPrice || String(retailPrice), imageUrl: variant.imageUrl || null,
            }).returning().all();
            if (variant.initialStock > 0) tx.insert(inventory).values({ warehouseId: warehouse, productId: product.id, variantId: createdVariant.id, physicalQty: variant.initialStock, reservedQty: 0, locationCode: null }).run();
          }
          return product;
        }, { behavior: "immediate" });
        return NextResponse.json({ success: true, data: created });
      } catch (error) {
        if (error instanceof VariantValidationError) return NextResponse.json({ success: false, error: error.message }, { status: 422 });
        if (error instanceof Error && /unique constraint/i.test(error.message)) return NextResponse.json({ success: false, error: "Ürün adresi, SKU veya barkod zaten kullanılıyor." }, { status: 409 });
        console.error("Varyantlı ürün kaydedilemedi:", error instanceof Error ? error.message : "Unknown error");
        return NextResponse.json({ success: false, error: "Ürün ve varyantlar kaydedilemedi; hiçbir kayıt oluşturulmadı." }, { status: 500 });
      }
    }

    const newProd = db.transaction((tx) => {
      if (!resolveActiveWarehouse(resolvedWarehouse)) throw new Error("Seçilen depo artık aktif değil.");
      const [newProd] = tx.insert(products).values({
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ]+/gi, "-").replace(/(^-|-$)/g, ""),
        sku,
        barcode: barcode || `869${Date.now().toString().slice(-10)}`,
        categoryId: Number(categoryId) || 1,
        brandId: brandId ? Number(brandId) : null,
        unit,
        buyPrice: String(buyPrice),
        retailPrice: String(retailPrice),
        shortDescription,
        description,
        technicalDetails,
        imageUrl: imageUrl || galleryUrls[0] || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800&auto=format&fit=crop&q=80",
        videoUrl: videoUrl || null,
      }).returning().all();

    // Insert gallery images (tek tek; köprü uyumluluğu için çoklu VALUES yok)
    for (const [i, url] of galleryUrls.entries()) {
      tx.insert(productImages).values({
        productId: newProd.id,
        url,
        sortOrder: i,
        isPrimary: i === 0,
      }).run();
    }

    // Insert initial inventory
    if (initialStock > 0) {
      tx.insert(inventory).values({
        warehouseId: resolvedWarehouse,
        productId: newProd.id,
        physicalQty: Number(initialStock),
        reservedQty: 0,
        locationCode: null,
      }).run();
    }

      return newProd;
    }, { behavior: "immediate" });

    return NextResponse.json({ success: true, data: newProd });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

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
    if (body.campaignPrice !== undefined) updates.campaignPrice = body.campaignPrice ? String(body.campaignPrice) : null;
    if (body.shortDescription !== undefined) updates.shortDescription = body.shortDescription;
    if (body.description !== undefined) updates.description = body.description;
    if (body.technicalDetails !== undefined) {
      try {
        const value = validateProductSpecifications(body.technicalDetails);
        updates.technicalDetails = value ? JSON.stringify(value) : null;
      } catch {
        return NextResponse.json({ success: false, error: "Teknik özellikler geçersiz veya çok uzun." }, { status: 422 });
      }
    }
    if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl;
    if (body.videoUrl !== undefined) updates.videoUrl = body.videoUrl || null;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.collection !== undefined) updates.collection = body.collection;
    if (body.seoTitle !== undefined) updates.seoTitle = body.seoTitle;
    if (body.seoDescription !== undefined) updates.seoDescription = body.seoDescription;
    if (typeof body.isFeatured === "boolean") updates.isFeatured = body.isFeatured;
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
    if (body.vatRate !== undefined) updates.vatRate = Number(body.vatRate);
    if (body.minOrderQty !== undefined) updates.minOrderQty = Number(body.minOrderQty);
    if (body.packageQty !== undefined) updates.packageQty = Number(body.packageQty);

    // Galeri değişimi: liste verildiyse satırları baştan yaz, kapağı eşitle.
    const galleryUrls = Array.isArray(body.images)
      ? body.images.map((u: unknown) => String(u || "").trim()).filter(Boolean).slice(0, 6)
      : null;

    if (Object.keys(updates).length === 0 && galleryUrls === null) {
      return NextResponse.json({ success: false, error: "Güncellenecek alan yok." }, { status: 422 });
    }

    if (Object.keys(updates).length > 0) {
      await db.update(products).set(updates).where(eq(products.id, id));
    }
    if (galleryUrls !== null) {
      await db.delete(productImages).where(eq(productImages.productId, id));
      for (const [i, url] of galleryUrls.entries()) {
        await db.insert(productImages).values({
          productId: id,
          url,
          sortOrder: i,
          isPrimary: i === 0,
        });
      }
      await db
        .update(products)
        .set({ imageUrl: galleryUrls[0] || null })
        .where(eq(products.id, id));
    }
    const [updated] = await db.select().from(products).where(eq(products.id, id));
    if (!updated) {
      return NextResponse.json({ success: false, error: "Ürün bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/** Deletion permission and product history are checked atomically in deleteProductSafely. */
export async function DELETE(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const invalid = validateCrmWrite(request);
  if (invalid) return invalid;
  if (!request.headers.get("origin")) {
    const bearer = await getUserByToken(request.headers.get("authorization")?.slice(7).trim());
    if (!bearer || bearer.id !== gate.user.id) return NextResponse.json({success:false,error:"İstek kaynağı doğrulanamadı."},{status:403});
  }
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string,unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k=>k!=="id" && k!=="fingerprint") || !Number.isSafeInteger(body.id) || Number(body.id)<1 || (body.fingerprint !== undefined && (typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.fingerprint)))) return NextResponse.json({success:false,error:"Geçerli ürün numarası gereklidir."},{status:422});
  const current = await requireStaff(request);
  if (!current.ok || current.user.id !== gate.user.id) return NextResponse.json({success:false,error:"Ürün silme yetkiniz bulunmuyor."},{status:403});
  try {
    const result = deleteProductSafely(sqlite,Number(body.id),current.user,body.fingerprint as string | undefined);
    if (result.status !== 200) return NextResponse.json({success:false,error:result.error},{status:result.status,headers:{"Cache-Control":"private, no-store"}});
    return NextResponse.json({success:true,data:{id:body.id,name:result.name}},{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    console.error("Ürün silinemedi:",error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({success:false,error:"Ürün silinemedi; hiçbir kayıt değiştirilmedi."},{status:500,headers:{"Cache-Control":"private, no-store"}});
  }
}
