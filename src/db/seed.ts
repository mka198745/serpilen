import { db } from "./index";
import {
  categories,
  brands,
  products,
  productVariants,
  warehouses,
  warehouseLocations,
  inventory,
  inventoryLedger,
  customers,
  orders,
  orderItems,
  posShifts,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  coupons,
  blogPosts,
  erpSyncLogs,
  auditLogs,
  users,
} from "./schema";
import { sql, asc, eq, inArray } from "drizzle-orm";

export async function seedDatabase() {
  // Check if categories already seeded
  const existingCategories = await db.select({ count: sql<number>`count(*)` }).from(categories);
  if (Number(existingCategories[0]?.count) > 0) {
    return { success: true, message: "Database already seeded" };
  }

  // 1. Users
  await db.insert(users).values([
    {
      name: "Ahmet Yılmaz (Yönetici)",
      email: "admin@ipektuhafiye.com",
      passwordHash: "scrypt_hash_admin",
      role: "SUPER_ADMIN",
      phone: "0532 100 20 30",
    },
    {
      name: "Elif Demir (Kasiyer & Satış)",
      email: "kasiyer@ipektuhafiye.com",
      passwordHash: "scrypt_hash_cashier",
      role: "CASHIER",
      phone: "0533 200 40 50",
    },
    {
      name: "Murat Kaya (Depo Şefi)",
      email: "depo@ipektuhafiye.com",
      passwordHash: "scrypt_hash_depo",
      role: "WAREHOUSE_KEEPER",
      phone: "0535 300 60 70",
    },
  ]);

  // 2. Warehouses
  const __insertedWarehouses_ids = await db.insert(warehouses).values([
    {
      name: "Merkez Ana Depo",
      code: "MRK",
      type: "CENTRAL",
      address: "İkitelli OSB Dokumacılar Sanayi Sitesi No: 42, Başakşehir / İstanbul",
    },
    {
      name: "Kadıköy Mağaza & Kasa Depo",
      code: "KDK-MAG",
      type: "STORE",
      address: "Moda Caddesi No: 18, Kadıköy / İstanbul",
    },
    {
      name: "Online E-Ticaret Deposu",
      code: "ONL-DEP",
      type: "ONLINE",
      address: "Merkez Lojistik Binası Kat 2, İstanbul",
    },
    {
      name: "B2B Toptan Deposu",
      code: "TOPTAN",
      type: "WHOLESALE",
      address: "Zeytinburnu Tekstilciler Çarşısı No: 104, İstanbul",
    },
  ]).$returningId();
  const insertedWarehouses = await db.select().from(warehouses).where(inArray(warehouses.id, __insertedWarehouses_ids.map((r) => r.id))).orderBy(asc(warehouses.id));

  const mrkWarehouseId = insertedWarehouses[0].id;
  const kdkWarehouseId = insertedWarehouses[1].id;
  const onlWarehouseId = insertedWarehouses[2].id;

  // 3. Warehouse Locations
  await db.insert(warehouseLocations).values([
    { warehouseId: mrkWarehouseId, locationCode: "MRK-A-01-01", zone: "A", aisle: "01", rack: "01", shelf: "01" },
    { warehouseId: mrkWarehouseId, locationCode: "MRK-B-02-04", zone: "B", aisle: "02", rack: "02", shelf: "04" },
    { warehouseId: mrkWarehouseId, locationCode: "MRK-C-03-12", zone: "C", aisle: "03", rack: "03", shelf: "12" },
    { warehouseId: kdkWarehouseId, locationCode: "KDK-RAF-01", zone: "Mağaza", aisle: "Ön", rack: "01", shelf: "01" },
    { warehouseId: kdkWarehouseId, locationCode: "KDK-CEKMECE-03", zone: "Kasa Arkası", aisle: "İç", rack: "02", shelf: "03" },
    { warehouseId: onlWarehouseId, locationCode: "ONL-TOPLAMA-A1", zone: "Online", aisle: "Hızlı", rack: "01", shelf: "01" },
  ]);

  // 4. Categories
  const __insertedCats_ids = await db.insert(categories).values([
    { name: "Dikiş & Nakış", slug: "dikis-nakis", icon: "Scissors", description: "Dikiş, nakış ve overlok iplikleri, özel dikiş aksesuarları", displayOrder: 1 },
    { name: "Fermuar Çeşitleri", slug: "fermuar", icon: "Sliders", description: "Kemik, metal, plastik ve gizli fermuar çeşitleri", displayOrder: 2 },
    { name: "Düğme Dünyası", slug: "dugme", icon: "CircleDot", description: "Sedef, ahşap, metal, kaban ve gömlek düğmeleri", displayOrder: 3 },
    { name: "Kurdele & Şerit", slug: "kurdele-serit", icon: "Ribbon", description: "Saten, grogren, jüt, fisto ve dantel şeritler", displayOrder: 4 },
    { name: "Örgü & Hobi", slug: "orgu-hobi", icon: "Sparkles", description: "El örgü ipleri, tığ, şiş, punch ve makrome malzemeleri", displayOrder: 5 },
    { name: "Dikiş Malzemeleri", slug: "dikis-malzemeleri", icon: "Package", description: "Mezuralar, dikiş iğneleri, kumaş makasları, yüksükler", displayOrder: 6 },
    { name: "Tekstil Yardımcı Malzemeleri", slug: "tekstil-yardimci", icon: "Layers", description: "Tela, vatka, lastik, cırt cırt, kordon ve çıtçıtlar", displayOrder: 7 },
  ]).$returningId();
  const insertedCats = await db.select().from(categories).where(inArray(categories.id, __insertedCats_ids.map((r) => r.id))).orderBy(asc(categories.id));

  // 5. Brands
  const __insertedBrands_ids = await db.insert(brands).values([
    { name: "Gütermann", slug: "gutermann" },
    { name: "Coats Drima", slug: "coats-drima" },
    { name: "YKK Fermuar", slug: "ykk" },
    { name: "Prym Germany", slug: "prym" },
    { name: "Alize Örgü", slug: "alize" },
    { name: "Nako İplik", slug: "nako" },
    { name: "DMC Embroidery", slug: "dmc" },
    { name: "Ören Bayan", slug: "oren-bayan" },
  ]).$returningId();
  const insertedBrands = await db.select().from(brands).where(inArray(brands.id, __insertedBrands_ids.map((r) => r.id))).orderBy(asc(brands.id));

  // 6. Products & Variants
  // Product 1: Gütermann 100m Dikiş İpliği
  const [{ id: __p1_id }] = await db.insert(products).values({
    name: "Gütermann Sew-All 100m Polyester Dikiş İpliği",
    slug: "gutermann-sew-all-100m-polyester-dikis-ipligi",
    sku: "GUT-SEW-100",
    barcode: "8690011223344",
    brandId: insertedBrands[0].id,
    categoryId: insertedCats[0].id,
    shortDescription: "Alman kalitesiyle üretilmiş, kopmaz ve her kumaşa uygun üniversal dikiş ipliği.",
    description: "Tüm dikiş projelerinde güvenle kullanabileceğiniz Gütermann dikiş iplikleri pürüzsüz yapısı sayesinde dikiş makinesinde tiftiklenme ve kopma yapmaz. %100 polyester yüksek mukavemet.",
    unit: "Adet",
    buyPrice: "32.50",
    retailPrice: "58.00",
    b2bPrice: "42.00",
    minOrderQty: 1,
    packageQty: 10,
    hasVariants: true,
    imageUrl: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800&auto=format&fit=crop&q=80",
    isFeatured: true,
  }).$returningId();
  const [p1] = await db.select().from(products).where(eq(products.id, __p1_id));

  const __p1Variants_ids = await db.insert(productVariants).values([
    { productId: p1.id, sku: "GUT-100-SIYAH", barcode: "8690011223351", colorName: "Siyah (No: 000)", colorHex: "#111827", size: "100m", length: "100m", retailPrice: "58.00", buyPrice: "32.50", b2bPrice: "42.00" },
    { productId: p1.id, sku: "GUT-100-BEYAZ", barcode: "8690011223368", colorName: "Optik Beyaz (No: 800)", colorHex: "#F9FAFB", size: "100m", length: "100m", retailPrice: "58.00", buyPrice: "32.50", b2bPrice: "42.00" },
    { productId: p1.id, sku: "GUT-100-KIRMIZI", barcode: "8690011223375", colorName: "Bayrak Kırmızısı (No: 364)", colorHex: "#DC2626", size: "100m", length: "100m", retailPrice: "58.00", buyPrice: "32.50", b2bPrice: "42.00" },
    { productId: p1.id, sku: "GUT-100-LACIVERT", barcode: "8690011223382", colorName: "Gece Laciverti (No: 339)", colorHex: "#1E3A8A", size: "100m", length: "100m", retailPrice: "58.00", buyPrice: "32.50", b2bPrice: "42.00" },
  ]).$returningId();
  const p1Variants = await db.select().from(productVariants).where(inArray(productVariants.id, __p1Variants_ids.map((r) => r.id))).orderBy(asc(productVariants.id));

  // Product 2: YKK Metal Diş Fermuar
  const [{ id: __p2_id }] = await db.insert(products).values({
    name: "YKK Metal Diş Açılır Mont Fermuarı",
    slug: "ykk-metal-dis-acilir-mont-fermuari",
    sku: "YKK-MET-ZIP",
    barcode: "8690022334455",
    brandId: insertedBrands[2].id,
    categoryId: insertedCats[1].id,
    shortDescription: "Antik sarı pirinç metal dişli, mont ve deri ceketler için orijinal YKK fermuar.",
    description: "Yüksek dayanımlı YKK metal fermuar serisi. Ağır gramajlı kumaşlar, ceket, kaban ve el yapımı deri projelerinizde uzun ömürlü kullanım sunar.",
    unit: "Adet",
    buyPrice: "45.00",
    retailPrice: "85.00",
    b2bPrice: "60.00",
    minOrderQty: 1,
    packageQty: 5,
    hasVariants: true,
    imageUrl: "https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80",
    isFeatured: true,
  }).$returningId();
  const [p2] = await db.select().from(products).where(eq(products.id, __p2_id));

  const __p2Variants_ids = await db.insert(productVariants).values([
    { productId: p2.id, sku: "YKK-MET-50CM-ANT", barcode: "8690022334462", colorName: "Antik Pirinç / Siyah Şerit", colorHex: "#374151", size: "50 cm", length: "50 cm", retailPrice: "85.00", buyPrice: "45.00", b2bPrice: "60.00" },
    { productId: p2.id, sku: "YKK-MET-70CM-ANT", barcode: "8690022334479", colorName: "Antik Pirinç / Siyah Şerit", colorHex: "#374151", size: "70 cm", length: "70 cm", retailPrice: "98.00", buyPrice: "52.00", b2bPrice: "70.00" },
    { productId: p2.id, sku: "YKK-MET-50CM-GUM", barcode: "8690022334486", colorName: "Parlak Gümüş / Lacivert Şerit", colorHex: "#1E293B", size: "50 cm", length: "50 cm", retailPrice: "85.00", buyPrice: "45.00", b2bPrice: "60.00" },
  ]).$returningId();
  const p2Variants = await db.select().from(productVariants).where(inArray(productVariants.id, __p2Variants_ids.map((r) => r.id))).orderBy(asc(productVariants.id));

  // Product 3: Çift Taraflı Saten Kurdele Rulo (25 Metre)
  const [{ id: __p3_id }] = await db.insert(products).values({
    name: "Lüks Çift Taraflı İpek Dokulu Saten Kurdele (25 Metre)",
    slug: "luks-cift-tarafli-ipek-dokulu-saten-kurdele-25m",
    sku: "SAT-KUR-25M",
    barcode: "8690033445566",
    brandId: insertedBrands[0].id,
    categoryId: insertedCats[3].id,
    shortDescription: "25 metre makara halinde lüks parlak saten kurdele. Paketleme ve süsleme için ideal.",
    description: "Solmaz boya teknolojisi ile üretilmiş, kenarları overloklu atma yapmayan çift taraflı parlak saten kurdele.",
    unit: "Rulo",
    buyPrice: "50.00",
    retailPrice: "95.00",
    b2bPrice: "68.00",
    minOrderQty: 1,
    packageQty: 1,
    hasVariants: true,
    imageUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&auto=format&fit=crop&q=80",
    isFeatured: true,
  }).$returningId();
  const [p3] = await db.select().from(products).where(eq(products.id, __p3_id));

  const __p3Variants_ids = await db.insert(productVariants).values([
    { productId: p3.id, sku: "SAT-10MM-BORDO", barcode: "8690033445573", colorName: "Gül Kurusu / Bordo", colorHex: "#881337", size: "10 mm x 25 m", length: "25m", retailPrice: "75.00", buyPrice: "38.00", b2bPrice: "52.00" },
    { productId: p3.id, sku: "SAT-20MM-ALTIN", barcode: "8690033445580", colorName: "Şampanya / Altın", colorHex: "#D97706", size: "20 mm x 25 m", length: "25m", retailPrice: "95.00", buyPrice: "50.00", b2bPrice: "68.00" },
    { productId: p3.id, sku: "SAT-40MM-ZUMRUT", barcode: "8690033445597", colorName: "Zümrüt Yeşili", colorHex: "#065F46", size: "40 mm x 25 m", length: "25m", retailPrice: "135.00", buyPrice: "70.00", b2bPrice: "95.00" },
  ]).$returningId();
  const p3Variants = await db.select().from(productVariants).where(inArray(productVariants.id, __p3Variants_ids.map((r) => r.id))).orderBy(asc(productVariants.id));

  // Product 4: Prym Ergonomik Kumaş Terzi Makası (9 İnç)
  const [{ id: __p4_id }] = await db.insert(products).values({
    name: "Prym Professional Ergonomik Terzi Makası 23cm (9 İnç)",
    slug: "prym-professional-ergonomik-terzi-makasi-23cm",
    sku: "PRYM-MAK-9IN",
    barcode: "8690044556677",
    brandId: insertedBrands[3].id,
    categoryId: insertedCats[5].id,
    shortDescription: "Paslanmaz çelik hassas bilenmiş terzi makası, yumuşak ergonomik kavrama.",
    description: "Profesyonel moda tasarımcıları ve terziler için Prym Germany imzalı kumaş makası. Kumaşta kayma yapmadan milimetrik kesim imkanı sunar.",
    unit: "Adet",
    buyPrice: "340.00",
    retailPrice: "590.00",
    b2bPrice: "440.00",
    minOrderQty: 1,
    packageQty: 1,
    hasVariants: false,
    imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&auto=format&fit=crop&q=80",
    isFeatured: true,
  }).$returningId();
  const [p4] = await db.select().from(products).where(eq(products.id, __p4_id));

  // Product 5: Alize Puffy Battaniye & Hobi İpi
  const [{ id: __p5_id }] = await db.insert(products).values({
    name: "Alize Puffy Şişsiz & Tığsız Kendinden İlmekli Örgü İpi 100g",
    slug: "alize-puffy-sissiz-tigsiz-orgu-ipi-100g",
    sku: "ALZ-PUFFY-100",
    barcode: "8690055667788",
    brandId: insertedBrands[4].id,
    categoryId: insertedCats[4].id,
    shortDescription: "Şiş ve tığa gerek kalmadan sadece parmaklarla örülebilen kadife dokulu bebek ipi.",
    description: "%100 mikropolyester, antialerjik, bebek battaniyeleri, yelek, şal ve dekoratif minderler için ideal.",
    unit: "Adet",
    buyPrice: "45.00",
    retailPrice: "78.00",
    b2bPrice: "56.00",
    minOrderQty: 1,
    packageQty: 5,
    hasVariants: true,
    imageUrl: "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&auto=format&fit=crop&q=80",
    isFeatured: true,
  }).$returningId();
  const [p5] = await db.select().from(products).where(eq(products.id, __p5_id));

  const __p5Variants_ids = await db.insert(productVariants).values([
    { productId: p5.id, sku: "ALZ-PUF-PUDRA", barcode: "8690055667795", colorName: "Pudra Pembe (No: 161)", colorHex: "#FDA4AF", size: "100g / 9.2m", length: "9.2m", retailPrice: "78.00", buyPrice: "45.00", b2bPrice: "56.00" },
    { productId: p5.id, sku: "ALZ-PUF-BEBE-MAVI", barcode: "8690055667801", colorName: "Bebe Mavisi (No: 183)", colorHex: "#93C5FD", size: "100g / 9.2m", length: "9.2m", retailPrice: "78.00", buyPrice: "45.00", b2bPrice: "56.00" },
    { productId: p5.id, sku: "ALZ-PUF-KREM", barcode: "8690055667818", colorName: "Doğal Krem (No: 62)", colorHex: "#FEF3C7", size: "100g / 9.2m", length: "9.2m", retailPrice: "78.00", buyPrice: "45.00", b2bPrice: "56.00" },
  ]).$returningId();
  const p5Variants = await db.select().from(productVariants).where(inArray(productVariants.id, __p5Variants_ids.map((r) => r.id))).orderBy(asc(productVariants.id));

  // Product 6: Doğal Ahşap 4 Delikli Düğme Paketi (50 Adet)
  const [{ id: __p6_id }] = await db.insert(products).values({
    name: "Doğal Zeytin Ağacı 4 Delikli Rustik Düğme Seti (50 Adet)",
    slug: "dogal-zeytin-agaci-4-delikli-rustik-dugme-seti-50-adet",
    sku: "DUG-AHS-50PK",
    barcode: "8690066778899",
    brandId: insertedBrands[0].id,
    categoryId: insertedCats[2].id,
    shortDescription: "50 adetlik paketlerde cilalı, yıkanabilir doğal ahşap rustik hırka ve kaban düğmesi.",
    description: "Örme kazaklar, hırkalar, gömlekler ve vintage dikiş projeleri için doğal ahşap düğme serisi. Çevre dostu ve suya dayanıklı.",
    unit: "Paket",
    buyPrice: "65.00",
    retailPrice: "125.00",
    b2bPrice: "85.00",
    minOrderQty: 1,
    packageQty: 50,
    hasVariants: false,
    imageUrl: "https://images.unsplash.com/photo-1615886753866-79396abc446e?w=800&auto=format&fit=crop&q=80",
    isFeatured: true,
  }).$returningId();
  const [p6] = await db.select().from(products).where(eq(products.id, __p6_id));

  // Product 7: Bez Tela Dokuma Yapışkanlı (100cm En)
  const [{ id: __p7_id }] = await db.insert(products).values({
    name: "Bez Tela Dokuma Yapışkanlı Yaka ve Manşet Telası (Metre)",
    slug: "bez-tela-dokuma-yapiskanli-yaka-ve-manset-telasi",
    sku: "TEL-BEZ-100",
    barcode: "8690077889900",
    brandId: insertedBrands[1].id,
    categoryId: insertedCats[6].id,
    shortDescription: "Ütü ile yapışan birinci kalite pamuklu dokuma bez tela.",
    description: "Ceket yakaları, gömlek manşetleri ve çanta yapımında esneme yapmayan sağlam form kazandıran termal yapışkanlı tela.",
    unit: "Metre",
    buyPrice: "28.00",
    retailPrice: "52.00",
    b2bPrice: "36.00",
    minOrderQty: 1,
    packageQty: 50,
    hasVariants: false,
    imageUrl: "https://images.unsplash.com/photo-1528458876861-544fd1761a91?w=800&auto=format&fit=crop&q=80",
    isFeatured: false,
  }).$returningId();
  const [p7] = await db.select().from(products).where(eq(products.id, __p7_id));

  // 7. Inventory Stocks across Warehouses
  // Insert initial stocks for variants and simple products
  const allStockEntries = [
    // p1 variants in Merkez, Kadıköy, Online
    { warehouseId: mrkWarehouseId, productId: p1.id, variantId: p1Variants[0].id, physicalQty: 140, reservedQty: 10, locationCode: "MRK-A-01-01" },
    { warehouseId: kdkWarehouseId, productId: p1.id, variantId: p1Variants[0].id, physicalQty: 45, reservedQty: 0, locationCode: "KDK-RAF-01" },
    { warehouseId: onlWarehouseId, productId: p1.id, variantId: p1Variants[0].id, physicalQty: 80, reservedQty: 5, locationCode: "ONL-TOPLAMA-A1" },

    { warehouseId: mrkWarehouseId, productId: p1.id, variantId: p1Variants[1].id, physicalQty: 220, reservedQty: 12, locationCode: "MRK-A-01-01" },
    { warehouseId: kdkWarehouseId, productId: p1.id, variantId: p1Variants[1].id, physicalQty: 60, reservedQty: 0, locationCode: "KDK-RAF-01" },

    { warehouseId: mrkWarehouseId, productId: p1.id, variantId: p1Variants[2].id, physicalQty: 90, reservedQty: 4, locationCode: "MRK-A-01-02" },
    { warehouseId: kdkWarehouseId, productId: p1.id, variantId: p1Variants[2].id, physicalQty: 30, reservedQty: 0, locationCode: "KDK-RAF-01" },

    // p2 variants
    { warehouseId: mrkWarehouseId, productId: p2.id, variantId: p2Variants[0].id, physicalQty: 65, reservedQty: 2, locationCode: "MRK-B-02-04" },
    { warehouseId: kdkWarehouseId, productId: p2.id, variantId: p2Variants[0].id, physicalQty: 18, reservedQty: 0, locationCode: "KDK-CEKMECE-03" },
    { warehouseId: mrkWarehouseId, productId: p2.id, variantId: p2Variants[1].id, physicalQty: 42, reservedQty: 1, locationCode: "MRK-B-02-04" },

    // p3 variants
    { warehouseId: mrkWarehouseId, productId: p3.id, variantId: p3Variants[0].id, physicalQty: 85, reservedQty: 0, locationCode: "MRK-C-03-12" },
    { warehouseId: kdkWarehouseId, productId: p3.id, variantId: p3Variants[1].id, physicalQty: 25, reservedQty: 0, locationCode: "KDK-RAF-01" },
    { warehouseId: mrkWarehouseId, productId: p3.id, variantId: p3Variants[2].id, physicalQty: 40, reservedQty: 0, locationCode: "MRK-C-03-12" },

    // p4 Prym scissor
    { warehouseId: mrkWarehouseId, productId: p4.id, variantId: null, physicalQty: 28, reservedQty: 3, locationCode: "MRK-A-01-03" },
    { warehouseId: kdkWarehouseId, productId: p4.id, variantId: null, physicalQty: 8, reservedQty: 0, locationCode: "KDK-RAF-02" },

    // p5 Alize Puffy variants
    { warehouseId: mrkWarehouseId, productId: p5.id, variantId: p5Variants[0].id, physicalQty: 110, reservedQty: 5, locationCode: "MRK-C-03-01" },
    { warehouseId: kdkWarehouseId, productId: p5.id, variantId: p5Variants[0].id, physicalQty: 35, reservedQty: 0, locationCode: "KDK-RAF-03" },
    { warehouseId: mrkWarehouseId, productId: p5.id, variantId: p5Variants[1].id, physicalQty: 85, reservedQty: 2, locationCode: "MRK-C-03-01" },

    // p6 Wood Buttons
    { warehouseId: mrkWarehouseId, productId: p6.id, variantId: null, physicalQty: 150, reservedQty: 10, locationCode: "MRK-B-02-01" },
    { warehouseId: kdkWarehouseId, productId: p6.id, variantId: null, physicalQty: 40, reservedQty: 0, locationCode: "KDK-RAF-01" },

    // p7 Tela
    { warehouseId: mrkWarehouseId, productId: p7.id, variantId: null, physicalQty: 320, reservedQty: 25, locationCode: "MRK-D-01-01" },
  ];

  await db.insert(inventory).values(allStockEntries);

  // 8. Inventory Ledger Movements
  await db.insert(inventoryLedger).values([
    {
      transactionType: "PURCHASE",
      warehouseId: mrkWarehouseId,
      productId: p1.id,
      variantId: p1Variants[0].id,
      quantity: 150,
      unitCost: "32.50",
      referenceType: "PO",
      referenceId: "SAT-2026-001",
      note: "Gütermann Dikiş İpliği Fabrika Girişi",
      createdBy: "Murat Kaya (Depo Şefi)",
    },
    {
      transactionType: "SALE",
      warehouseId: kdkWarehouseId,
      productId: p1.id,
      variantId: p1Variants[0].id,
      quantity: -2,
      unitCost: "32.50",
      referenceType: "POS_SALE",
      referenceId: "POS-2026-089",
      note: "Mağaza Kasa Satışı",
      createdBy: "Elif Demir (Kasiyer)",
    },
    {
      transactionType: "TRANSFER_OUT",
      warehouseId: mrkWarehouseId,
      productId: p1.id,
      variantId: p1Variants[0].id,
      quantity: -10,
      unitCost: "32.50",
      referenceType: "TRANSFER",
      referenceId: "TRF-2026-012",
      note: "Kadıköy Mağazasına Sevk",
      createdBy: "Murat Kaya",
    },
    {
      transactionType: "TRANSFER_IN",
      warehouseId: kdkWarehouseId,
      productId: p1.id,
      variantId: p1Variants[0].id,
      quantity: 10,
      unitCost: "32.50",
      referenceType: "TRANSFER",
      referenceId: "TRF-2026-012",
      note: "Kadıköy Mağazası Mal Kabulü",
      createdBy: "Elif Demir",
    },
  ]);

  // 9. Customers (B2C and B2B)
  const __insertedCustomers_ids = await db.insert(customers).values([
    {
      type: "B2C",
      name: "Ayşe Nilgün Kaya",
      email: "ayse.kaya@gmail.com",
      phone: "0542 333 44 55",
      loyaltyPoints: 340,
      segment: "VİP",
      city: "İstanbul",
      address: "Caferağa Mah. Moda Cad. No: 44 D: 6, Kadıköy / İstanbul",
      notes: "Sık sık örgü ve nakış ipi alır, atölye eğitmeni.",
    },
    {
      type: "B2B",
      name: "Moda Tasarım Tekstil Ltd. Şti.",
      email: "siparis@modatasarim.com.tr",
      phone: "0212 555 77 88",
      companyName: "Moda Tasarım Konfeksiyon San. ve Tic. Ltd. Şti.",
      taxOffice: "Marmara Kurumlar",
      taxNumber: "6220491823",
      creditLimit: "150000.00",
      balance: "18450.00",
      loyaltyPoints: 1200,
      segment: "TOPTANCI",
      discountRate: "12.00",
      city: "İstanbul",
      address: "Bomonti Silahşör Cad. No: 12 Kat: 3, Şişli / İstanbul",
      notes: "Aylık 200m üzeri bez tela ve fermuar çekişi var. 30 gün açık cari hesap.",
    },
    {
      type: "B2C",
      name: "Fatma Zeynep Şahin",
      email: "zeynep.sahin@hotmail.com",
      phone: "0536 789 12 34",
      loyaltyPoints: 80,
      segment: "YENİ",
      city: "Ankara",
      address: "Tunalı Hilmi Cad. No: 88 D: 12, Çankaya / Ankara",
      notes: "Online alışveriş müşterisi.",
    },
  ]).$returningId();
  const insertedCustomers = await db.select().from(customers).where(inArray(customers.id, __insertedCustomers_ids.map((r) => r.id))).orderBy(asc(customers.id));

  // 10. Sample Orders
  const [{ id: __order1_id }] = await db.insert(orders).values({
    orderNumber: "OR-2026-1049",
    orderType: "ONLINE_B2C",
    customerId: insertedCustomers[0].id,
    customerName: insertedCustomers[0].name,
    customerEmail: insertedCustomers[0].email,
    customerPhone: insertedCustomers[0].phone,
    status: "DELIVERED",
    paymentStatus: "PAID",
    paymentMethod: "CREDIT_CARD",
    subtotal: "748.00",
    discountTotal: "50.00",
    taxTotal: "116.33",
    shippingTotal: "0.00",
    grandTotal: "698.00",
    shippingAddress: insertedCustomers[0].address,
    trackingNumber: "YK-88492019401",
    carrier: "Yurtiçi Kargo",
    erpInvoiceNumber: "GIB2026000001049",
    notes: "Hediye paketi istendi, paketlendi.",
  }).$returningId();
  const [order1] = await db.select().from(orders).where(eq(orders.id, __order1_id));

  await db.insert(orderItems).values([
    {
      orderId: order1.id,
      productId: p4.id,
      variantId: null,
      productName: p4.name,
      variantName: "Standart 23cm",
      sku: p4.sku,
      barcode: p4.barcode,
      unitPrice: "590.00",
      quantity: 1,
      taxRate: 20,
      totalPrice: "590.00",
    },
    {
      orderId: order1.id,
      productId: p1.id,
      variantId: p1Variants[0].id,
      productName: p1.name,
      variantName: "Siyah (No: 000)",
      sku: p1Variants[0].sku,
      barcode: p1Variants[0].barcode,
      unitPrice: "58.00",
      quantity: 2,
      taxRate: 20,
      totalPrice: "116.00",
    },
    {
      orderId: order1.id,
      productId: p1.id,
      variantId: p1Variants[1].id,
      productName: p1.name,
      variantName: "Optik Beyaz (No: 800)",
      sku: p1Variants[1].sku,
      barcode: p1Variants[1].barcode,
      unitPrice: "58.00",
      quantity: 1,
      taxRate: 20,
      totalPrice: "58.00",
    },
  ]);

  // Order 2: B2B Wholesale Order
  const [{ id: __order2_id }] = await db.insert(orders).values({
    orderNumber: "B2B-2026-0312",
    orderType: "B2B",
    customerId: insertedCustomers[1].id,
    customerName: insertedCustomers[1].companyName || insertedCustomers[1].name,
    customerEmail: insertedCustomers[1].email,
    customerPhone: insertedCustomers[1].phone,
    status: "PREPARING",
    paymentStatus: "PAID",
    paymentMethod: "B2B_CREDIT",
    subtotal: "4200.00",
    discountTotal: "420.00",
    taxTotal: "630.00",
    shippingTotal: "0.00",
    grandTotal: "4410.00",
    shippingAddress: insertedCustomers[1].address,
    carrier: "Ambar / Özel Sevk",
    erpInvoiceNumber: "GIB2026000001050",
    notes: "30 Gün Vade, sevk irsaliyesi ile koli teslim.",
  }).$returningId();
  const [order2] = await db.select().from(orders).where(eq(orders.id, __order2_id));

  await db.insert(orderItems).values([
    {
      orderId: order2.id,
      productId: p7.id,
      variantId: null,
      productName: p7.name,
      variantName: "Standart 100cm Rulo",
      sku: p7.sku,
      barcode: p7.barcode,
      unitPrice: "36.00",
      quantity: 100,
      taxRate: 20,
      totalPrice: "3600.00",
    },
    {
      orderId: order2.id,
      productId: p2.id,
      variantId: p2Variants[0].id,
      productName: p2.name,
      variantName: "Antik Pirinç 50cm",
      sku: p2Variants[0].sku,
      barcode: p2Variants[0].barcode,
      unitPrice: "60.00",
      quantity: 10,
      taxRate: 20,
      totalPrice: "600.00",
    },
  ]);

  // 11. POS Shifts — FAZ 7
  await db.insert(posShifts).values({
    shiftNumber: "VARD-2026-001",
    terminalCode: "KASA-01",
    cashierName: "Elif Demir (Kasiyer & Satış)",
    warehouseId: kdkWarehouseId,
    openingAmount: "500.00",
    expectedAmount: "1850.00",
    totalSalesCash: "650.00",
    totalSalesCard: "1200.00",
    totalSalesSplit: "0.00",
    totalReturnsCash: "0.00",
    totalReturnsCard: "0.00",
    cashInTotal: "0.00",
    cashOutTotal: "0.00",
    status: "OPEN",
    notes: "Sabah kasası 500 TL bozuk para ile açıldı. Pos slip rulosu değiştirildi.",
  });

  // 12. Suppliers & Purchase Orders
  const [{ id: __sup1_id }] = await db.insert(suppliers).values([
    {
      name: "Gütermann İplik Türkiye Dağıtım A.Ş.",
      contactPerson: "Mehmet Tezcan",
      phone: "0212 444 38 88",
      email: "siparis@gutermann.com.tr",
      taxOffice: "Büyük Mükellefler",
      taxNumber: "4280918231",
      leadTimeDays: 2,
      paymentTerms: "30 Gün Vade",
      rating: "4.9",
      address: "İkitelli OSB Triko Center, Başakşehir / İstanbul",
    },
    {
      name: "YKK Fermuar Sanayi A.Ş.",
      contactPerson: "Serkan Aktaş",
      phone: "0212 388 90 00",
      email: "turkey@ykk.com",
      taxOffice: "Boğaziçi Kurumlar",
      taxNumber: "9820194821",
      leadTimeDays: 5,
      paymentTerms: "Peşin / Havale",
      rating: "4.9",
      address: "Güneşli Bağcılar, İstanbul",
    },
  ]).$returningId();
  const [sup1] = await db.select().from(suppliers).where(eq(suppliers.id, __sup1_id));

  const [{ id: __po1_id }] = await db.insert(purchaseOrders).values({
    poNumber: "SAT-2026-0084",
    supplierId: sup1.id,
    warehouseId: mrkWarehouseId,
    status: "ORDERED",
    totalAmount: "16250.00",
    notes: "Bahar sezonu dikiş iplikleri eksik stok tamamlama.",
    expectedDate: "2026-04-18",
  }).$returningId();
  const [po1] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, __po1_id));

  await db.insert(purchaseOrderItems).values([
    {
      purchaseOrderId: po1.id,
      productId: p1.id,
      variantId: p1Variants[0].id,
      quantity: 250,
      unitCost: "32.50",
      receivedQty: 0,
      totalCost: "8125.00",
    },
    {
      purchaseOrderId: po1.id,
      productId: p1.id,
      variantId: p1Variants[1].id,
      quantity: 250,
      unitCost: "32.50",
      receivedQty: 0,
      totalCost: "8125.00",
    },
  ]);

  // 13. Active Coupons
  await db.insert(coupons).values([
    {
      code: "MERHABA10",
      discountType: "PERCENT",
      discountValue: "10.00",
      minCartAmount: "250.00",
      maxDiscount: "100.00",
      usageLimit: 500,
      usedCount: 42,
      isActive: true,
    },
    {
      code: "IPEK50",
      discountType: "FIXED",
      discountValue: "50.00",
      minCartAmount: "500.00",
      maxDiscount: "50.00",
      usageLimit: 200,
      usedCount: 18,
      isActive: true,
    },
    {
      code: "TOPTAN15",
      discountType: "PERCENT",
      discountValue: "15.00",
      minCartAmount: "2000.00",
      maxDiscount: "500.00",
      usageLimit: 50,
      usedCount: 7,
      isActive: true,
    },
  ]);

  // 14. Blog Posts
  await db.insert(blogPosts).values([
    {
      title: "Hangi Kumaşa Hangi Dikiş İğnesi ve İpliği Kullanılır? Kapsamlı Rehber",
      slug: "hangi-kumasa-hangi-dikis-ignesi-ve-ipligi-kullanilir",
      excerpt: "İpekten kot kumaşına, jarse penye dokumadan deriye kadar doğru iğne numarası (No:70-110) ve iplik seçimi püf noktaları.",
      content: `Dikiş projelerinizde profesyonel bir sonuç elde etmenin birinci kuralı, kumaşın dokusuna uygun iplik ve makine iğnesi seçmektir. İnce şifon ve ipek kumaşlarda 70 numara Microtex iğne ve ince Gütermann iplikler tercih edilmeli; kot ve gabardinde ise Jeans No:90-100 iğneleri kullanılmalıdır. Overlok ve penye dikişlerinde esnekliği korumak için esnek dikiş iplikleri kumaşın çekmesini engeller.`,
      category: "Dikiş Rehberi",
      author: "Gülizar Usta (Moda Tasarımcısı)",
      imageUrl: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800&auto=format&fit=crop&q=80",
      isPublished: true,
    },
    {
      title: "Fermuar Çeşitleri ve Kullanım Alanları: Kemik, Metal, Gizli Fermuar",
      slug: "fermuar-cesitleri-ve-kullanim-alanlari",
      excerpt: "Elbiseden montlara, çanta yapımından pantolon patına hangi fermuar türü neden tercih edilir?",
      content: `Fermuarlar giysi ve aksesuarların hem fonksiyonel hem de estetik kalbini oluşturur. Gizli fermuar (Invisible zipper) abiye elbiselerde ve eteklerde dikişin içinde kaybolarak pürüzsüz görünüm sağlar. Metal dişli fermuarlar mont ve deri ceketlerde yüksek mukavemet sunarken, kemik (delrin) fermuarlar spor montlar ve yağmurluklar için suya dayanıklılık sağlar.`,
      category: "Malzeme Bilgisi",
      author: "Teknik Servis Ekibi",
      imageUrl: "https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80",
      isPublished: true,
    },
    {
      title: "Saten Kurdele ile Hediye Paketleme ve Dikiş Süsleme Sanatı",
      slug: "saten-kurdele-ile-hediye-paketleme-sanati",
      excerpt: "Çift taraflı saten kurdelelerin enleri (10mm, 20mm, 40mm) ile zarif fiyonk bağlama teknikleri.",
      content: `Özel günlerde hediyelerinize lüks bir dokunuş katmak veya bebek elbiselerinin kenarlarına zarif biyeler çekmek için çift taraflı saten kurdeleler vazgeçilmezdir. Kenarları overloklu modeller ütüye dayanıklıdır ve fiyonk yapıldığında formunu kaybetmez.`,
      category: "Hobi & Tasarım",
      author: "İpek Atölye",
      imageUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&auto=format&fit=crop&q=80",
      isPublished: true,
    },
  ]);

  // 15. ERP Sync Logs
  await db.insert(erpSyncLogs).values([
    {
      entityType: "INVOICE",
      entityId: "OR-2026-1049",
      action: "SYNC_SUCCESS",
      status: "SUCCESS",
      payload: JSON.stringify({ invoiceNumber: "GIB2026000001049", total: 698.00, tax: 116.33, customer: "Ayşe Nilgün Kaya" }),
      response: JSON.stringify({ gibStatus: "ACCEPTED", uuid: "d9e18b82-990a-4a2e-8391-28cf00192831" }),
    },
    {
      entityType: "CUSTOMER",
      entityId: "2",
      action: "SYNC_SUCCESS",
      status: "SUCCESS",
      payload: JSON.stringify({ code: "CAR-002", title: "Moda Tasarım Tekstil Ltd. Şti.", vkn: "6220491823" }),
      response: JSON.stringify({ erpCariId: "ERP-M0092" }),
    },
  ]);

  // 16. Audit Logs
  await db.insert(auditLogs).values([
    {
      userId: "1",
      userName: "Ahmet Yılmaz (Yönetici)",
      action: "SYSTEM_INITIALIZED",
      entity: "System",
      entityId: "1",
      details: "Tuhafiye Retail Commerce Platform çekirdek veritabanı başarıyla yapılandırıldı.",
    },
    {
      userId: "2",
      userName: "Elif Demir (Kasiyer)",
      action: "POS_SHIFT_OPENED",
      entity: "PosShift",
      entityId: "1",
      details: "Kadıköy Mağaza Kasası 500 TL nakit devir ile açıldı.",
    },
  ]);

  return { success: true, message: "Seed completed successfully!" };
}
