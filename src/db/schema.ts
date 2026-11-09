import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, numeric } from "drizzle-orm/sqlite-core";

// ==========================================
// 1. KULLANICILAR & ROLLER
// ==========================================
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("CASHIER"), // SUPER_ADMIN, STORE_MANAGER, WAREHOUSE_KEEPER, CASHIER, B2B_CUSTOMER, B2C_CUSTOMER
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  customerId: integer("customer_id"), // B2B portal müşterisinin cari karta bağlantısı
  // --- Güvenlik / 2FA alanları ---
  totpSecret: text("totp_secret"), // Google Authenticator base32 gizli anahtarı
  totpSecretPrevious: text("totp_secret_previous"), // Rotasyon sırasında eski kod da kabul edilir (kilitlenmeyi önler)
  mfaEnabled: integer("mfa_enabled", { mode: "boolean" }).notNull().default(false),
  recoveryCodeHash: text("recovery_code_hash"), // Tek kullanımlık kurtarma kodu özeti
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp" }), // Brute-force hesap kilidi
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  passwordChangedAt: integer("password_changed_at", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// OTURUM (SESSION) YÖNETİMİ — token iptali (revocation) ve cihaz takibi
export const adminSessions = sqliteTable("admin_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  jti: text("jti").notNull().unique(), // Token JWT-ID
  ip: text("ip"),
  userAgent: text("user_agent"),
  mfaVerified: integer("mfa_verified", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
});

// TEK KULLANIMLIK GİRİŞ DOĞRULAMA NONCE'LARI (pre-auth / enrollment)
export const authNonces = sqliteTable("auth_nonces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id").notNull(),
  scope: text("scope").notNull(), // PRE_AUTH | ENROLL
  attemptCount: integer("attempt_count").notNull().default(0),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// ==========================================
// 2. MÜŞTERİLER (B2C & B2B) & CRM
// ==========================================
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull().default("B2C"), // B2C, B2B
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone").notNull(),
  companyName: text("company_name"),
  taxOffice: text("tax_office"),
  taxNumber: text("tax_number"),
  creditLimit: numeric("credit_limit").default("0.00"),
  balance: numeric("balance").default("0.00"), // Cari Bakiye
  loyaltyPoints: integer("loyalty_points").default(0).notNull(),
  segment: text("segment").default("YENİ"), // YENİ, AKTİF, VİP, TOPTANCI, RİSKLİ
  discountRate: numeric("discount_rate").default("0.00"), // Özel B2B iskontosu
  // --- FAZ 9: B2B cari & fiyatlandırma ---
  priceListId: integer("price_list_id"), // atanmış fiyat listesi
  paymentTermDays: integer("payment_term_days").default(30).notNull(), // vade (gün)
  minOrderAmount: numeric("min_order_amount").default("0.00"),
  isBlocked: integer("is_blocked", { mode: "boolean" }).notNull().default(false), // riskli/kapalı cari
  approvalStatus: text("approval_status").default("APPROVED"), // PENDING, APPROVED, REJECTED
  address: text("address"),
  city: text("city"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ==========================================
// 3. KATEGORİLER & MARKALAR
// ==========================================
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: integer("parent_id"),
  icon: text("icon"),
  description: text("description"),
  displayOrder: integer("display_order").default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const brands = sqliteTable("brands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// ==========================================
// 4. ÜRÜNLER & VARYANTLAR
// ==========================================
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sku: text("sku").notNull().unique(),
  barcode: text("barcode").unique(),
  brandId: integer("brand_id"),
  categoryId: integer("category_id").notNull(),
  shortDescription: text("short_description"),
  description: text("description"),
  unit: text("unit").default("Adet").notNull(), // Adet, Metre, Paket, Kutu, Rulo, Bobin
  buyPrice: numeric("buy_price").notNull().default("0.00"),
  retailPrice: numeric("retail_price").notNull().default("0.00"),
  b2bPrice: numeric("b2b_price").notNull().default("0.00"),
  minOrderQty: integer("min_order_qty").default(1).notNull(),
  packageQty: integer("package_qty").default(1).notNull(), // Paket içi adet
  vatRate: integer("vat_rate").default(20).notNull(), // KDV %10 veya %20
  hasVariants: integer("has_variants", { mode: "boolean" }).default(false).notNull(),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  campaignPrice: numeric("campaign_price"),
  tags: text("tags"), // virgülle ayrılmış etiketler: "fermuar,siyah,mont"
  collection: text("collection"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  isFeatured: integer("is_featured", { mode: "boolean" }).default(false),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const productImages = sqliteTable("product_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  url: text("url").notNull(),
  altText: text("alt_text"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" }).default(false).notNull(),
});

export const productVariants = sqliteTable("product_variants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  sku: text("sku").notNull().unique(),
  barcode: text("barcode").unique(),
  colorName: text("color_name"),
  colorHex: text("color_hex"),
  size: text("size"), // e.g., "20 cm", "40 mm", "No: 50"
  length: text("length"), // e.g., "100m", "500m"
  buyPrice: numeric("buy_price"),
  retailPrice: numeric("retail_price").notNull(),
  b2bPrice: numeric("b2b_price"),
  imageUrl: text("image_url"),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
});

// ==========================================
// 5. DEPOLAR, RAF/LOKASYON & STOK
// ==========================================
export const warehouses = sqliteTable("warehouses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  code: text("code").notNull().unique(), // MRK, KDK-MAG, ONL-DEP, TOPTAN
  type: text("type").notNull().default("STORE"), // CENTRAL, STORE, ONLINE, WHOLESALE
  address: text("address"),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
});

export const warehouseLocations = sqliteTable("warehouse_locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  warehouseId: integer("warehouse_id").notNull(),
  locationCode: text("location_code").notNull(), // MRK-A-03-12
  zone: text("zone"),
  aisle: text("aisle"),
  rack: text("rack"),
  shelf: text("shelf"),
  bin: text("bin"),
});

export const inventory = sqliteTable("inventory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  warehouseId: integer("warehouse_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  physicalQty: integer("physical_qty").notNull().default(0),
  reservedQty: integer("reserved_qty").notNull().default(0),
  minStock: integer("min_stock").notNull().default(10),
  maxStock: integer("max_stock").notNull().default(500),
  reorderPoint: integer("reorder_point").notNull().default(15),
  locationCode: text("location_code").default("GENEL-A-01"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// STOK REZERVASYONLARI — checkout/sepet bazlı süreli stok kilitleme (FAZ 3)
export const inventoryReservations = sqliteTable("inventory_reservations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  warehouseId: integer("warehouse_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  qty: integer("qty").notNull(),
  referenceType: text("reference_type").notNull().default("CART"), // CART, CHECKOUT, ORDER
  referenceId: text("reference_id"), // sepet/checkout anahtarı veya sipariş no
  status: text("status").notNull().default("ACTIVE"), // ACTIVE, CONSUMED, RELEASED, EXPIRED
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdBy: text("created_by").default("Sistem"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// DEPOLAR ARASI TRANSFER İŞ AKIŞI: REQUESTED → APPROVED → SHIPPED → RECEIVED (FAZ 3)
export const stockTransfers = sqliteTable("stock_transfers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transferNumber: text("transfer_number").notNull().unique(), // TRF-2026-001
  fromWarehouseId: integer("from_warehouse_id").notNull(),
  toWarehouseId: integer("to_warehouse_id").notNull(),
  status: text("status").notNull().default("REQUESTED"), // REQUESTED, APPROVED, SHIPPED, RECEIVED, CANCELLED
  note: text("note"),
  createdBy: text("created_by").default("Depo Sorumlusu"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  shippedAt: integer("shipped_at", { mode: "timestamp" }),
  receivedAt: integer("received_at", { mode: "timestamp" }),
});

export const stockTransferItems = sqliteTable("stock_transfer_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transferId: integer("transfer_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  qty: integer("qty").notNull(),
});

// STOK SAYIM OTURUMLARI — barkod taramalı sayım ve fark mutabakatı (FAZ 3)
export const stockCountSessions = sqliteTable("stock_count_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  countNumber: text("count_number").notNull().unique(), // COUNT-2026-001
  warehouseId: integer("warehouse_id").notNull(),
  status: text("status").notNull().default("IN_PROGRESS"), // IN_PROGRESS, COMPLETED, CANCELLED
  startedBy: text("started_by").default("Sayım Ekibi"),
  startedAt: integer("started_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const stockCountItems = sqliteTable("stock_count_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  expectedQty: integer("expected_qty").notNull(),
  countedQty: integer("counted_qty").notNull(),
  locationCode: text("location_code"),
  scannedBarcode: text("scanned_barcode"),
  countedAt: integer("counted_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// STOK HAREKET DEFTERİ (STOCK LEDGER)
export const inventoryLedger = sqliteTable("inventory_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionType: text("transaction_type").notNull(), // PURCHASE, SALE, RETURN, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT, COUNT_DIFF, DAMAGE, RESERVATION
  warehouseId: integer("warehouse_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  quantity: integer("quantity").notNull(), // + veya -
  unitCost: numeric("unit_cost").default("0.00"),
  referenceType: text("reference_type"), // ORDER, POS_SALE, PO, TRANSFER, ADJUSTMENT
  referenceId: text("reference_id"),
  note: text("note"),
  createdBy: text("created_by").default("Sistem"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ==========================================
// 6. SİPARİŞLER (E-TİCARET, B2B, POS)
// ==========================================
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNumber: text("order_number").notNull().unique(), // OR-2026-001, POS-2026-042
  orderType: text("order_type").notNull().default("ONLINE_B2C"), // ONLINE_B2C, B2B, POS
  customerId: integer("customer_id"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  status: text("status").notNull().default("PAID"), // PENDING, PAID, PREPARING, READY_FOR_SHIPMENT, SHIPPED, DELIVERED, CANCELLED, REFUNDED
  paymentStatus: text("payment_status").notNull().default("PAID"), // PENDING, PAID, PARTIAL, REFUNDED
  paymentMethod: text("payment_method").notNull().default("CREDIT_CARD"), // CREDIT_CARD, CASH, EFT_HAVALE, B2B_CREDIT, SPLIT
  subtotal: numeric("subtotal").notNull().default("0.00"),
  discountTotal: numeric("discount_total").notNull().default("0.00"),
  taxTotal: numeric("tax_total").notNull().default("0.00"),
  shippingTotal: numeric("shipping_total").notNull().default("0.00"),
  grandTotal: numeric("grand_total").notNull().default("0.00"),
  shippingAddress: text("shipping_address"),
  trackingNumber: text("tracking_number"),
  carrier: text("carrier").default("Yurtiçi Kargo"),
  posShiftId: integer("pos_shift_id"),
  erpInvoiceNumber: text("erp_invoice_number"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  productName: text("product_name").notNull(),
  variantName: text("variant_name"),
  sku: text("sku").notNull(),
  barcode: text("barcode"),
  unitPrice: numeric("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  taxRate: integer("tax_rate").notNull().default(20),
  totalPrice: numeric("total_price").notNull(),
});

// SİPARİŞ DURUM GEÇMİŞİ (audit trail) — FAZ 4
export const orderStatusHistory = sqliteTable("order_status_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  note: text("note"),
  changedBy: text("changed_by").default("Sistem"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// İADELER (RMA) — FAZ 4
export const orderReturns = sqliteTable("order_returns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  returnNumber: text("return_number").notNull().unique(), // IAD-2026-001
  orderId: integer("order_id").notNull(),
  orderNumber: text("order_number").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("REQUESTED"), // REQUESTED, APPROVED, RECEIVED, REFUNDED, REJECTED
  refundAmount: numeric("refund_amount").default("0.00"),
  restock: integer("restock", { mode: "boolean" }).notNull().default(true),
  warehouseId: integer("warehouse_id").default(3),
  createdBy: text("created_by").default("Müşteri Hizmetleri"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

export const orderReturnItems = sqliteTable("order_return_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  returnId: integer("return_id").notNull(),
  orderItemId: integer("order_item_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  refundAmount: numeric("refund_amount").notNull().default("0.00"),
});

// ==========================================
// 7. POS VARDİYA & KASA YÖNETİMİ — FAZ 7
// ==========================================
export const posShifts = sqliteTable("pos_shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftNumber: text("shift_number"), // VARD-2026-001
  terminalCode: text("terminal_code").default("KASA-01").notNull(),
  cashierName: text("cashier_name").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  openingAmount: numeric("opening_amount").notNull().default("500.00"),
  closingAmount: numeric("closing_amount"),
  expectedAmount: numeric("expected_amount"),
  totalSalesCash: numeric("total_sales_cash").default("0.00"),
  totalSalesCard: numeric("total_sales_card").default("0.00"),
  totalSalesSplit: numeric("total_sales_split").default("0.00"),
  totalReturnsCash: numeric("total_returns_cash").default("0.00"),
  totalReturnsCard: numeric("total_returns_card").default("0.00"),
  cashInTotal: numeric("cash_in_total").default("0.00"),
  cashOutTotal: numeric("cash_out_total").default("0.00"),
  status: text("status").notNull().default("OPEN"), // OPEN, CLOSED
  zReportNumber: text("z_report_number"), // Z-2026-001
  openedAt: integer("opened_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp" }),
  notes: text("notes"),
});

// KASA HAREKETLERİ (Nakit Giriş / Çıkış / Masraf / Avans) — FAZ 7
export const posCashTransactions = sqliteTable("pos_cash_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  type: text("type").notNull(), // CASH_IN, CASH_OUT, EXPENSE, FLOAT_ADD
  amount: numeric("amount").notNull(),
  reason: text("reason").notNull(),
  cashierName: text("cashier_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ==========================================
// 8. TEDARİKÇİ & SATIN ALMA YÖNETİMİ
// ==========================================
export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  taxOffice: text("tax_office"),
  taxNumber: text("tax_number"),
  leadTimeDays: integer("lead_time_days").default(3).notNull(),
  paymentTerms: text("payment_terms").default("30 Gün Vade"),
  rating: numeric("rating").default("4.8"),
  address: text("address"),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
});

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poNumber: text("po_number").notNull().unique(), // SAT-2026-001
  supplierId: integer("supplier_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  status: text("status").notNull().default("ORDERED"), // DRAFT, APPROVED, ORDERED, RECEIVED, CANCELLED
  totalAmount: numeric("total_amount").notNull().default("0.00"),
  notes: text("notes"),
  expectedDate: text("expected_date"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const purchaseOrderItems = sqliteTable("purchase_order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  quantity: integer("quantity").notNull(),
  unitCost: numeric("unit_cost").notNull(),
  receivedQty: integer("received_qty").default(0).notNull(),
  totalCost: numeric("total_cost").notNull(),
});

// SATIN ALMA TALEPLERİ — FAZ 6: REQUESTED → APPROVED → ORDERED → REJECTED
export const purchaseRequests = sqliteTable("purchase_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestNumber: text("request_number").notNull().unique(), // TAL-2026-001
  warehouseId: integer("warehouse_id").notNull(),
  status: text("status").notNull().default("REQUESTED"), // REQUESTED, APPROVED, ORDERED, REJECTED
  priority: text("priority").notNull().default("NORMAL"), // LOW, NORMAL, HIGH, URGENT
  notes: text("notes"),
  createdBy: text("created_by").default("Depo Sorumlusu"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  approvedBy: text("approved_by"),
});

export const purchaseRequestItems = sqliteTable("purchase_request_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("request_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  qty: integer("qty").notNull(),
  estimatedCost: numeric("estimated_cost").default("0.00"),
});

// MAL KABUL FİŞLERİ — FAZ 6: kısmi kabul takibi
export const goodsReceipts = sqliteTable("goods_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptNumber: text("receipt_number").notNull().unique(), // MK-2026-001
  purchaseOrderId: integer("purchase_order_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  receivedBy: text("received_by").default("Mal Kabul Görevlisi"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const goodsReceiptItems = sqliteTable("goods_receipt_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptId: integer("receipt_id").notNull(),
  purchaseOrderItemId: integer("purchase_order_item_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  qty: integer("qty").notNull(),
});

// ==========================================
// 8.5 B2B: FİYAT LİSTELERİ, KADEMELİ FİYAT & CARİ HESAP (FAZ 9)
// ==========================================
export const priceLists = sqliteTable("price_lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(), // RETAIL, DEALER, WHOLESALE, VIP
  name: text("name").notNull(),
  description: text("description"),
  // Liste geneli varsayılan iskonto (ürün bazlı override yoksa uygulanır)
  defaultDiscountRate: numeric("default_discount_rate").default("0.00").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// Ürün bazlı özel fiyat (liste × ürün)
export const priceListItems = sqliteTable("price_list_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  priceListId: integer("price_list_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  unitPrice: numeric("unit_price").notNull(),
  minQty: integer("min_qty").default(1).notNull(),
});

// Kademeli (hacim) fiyat baremleri: 1-9 / 10-49 / 50-99 / 100+
export const priceTiers = sqliteTable("price_tiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  priceListId: integer("price_list_id").notNull(),
  productId: integer("product_id"), // null = liste geneli barem
  minQty: integer("min_qty").notNull(),
  maxQty: integer("max_qty"), // null = üst sınırsız
  discountRate: numeric("discount_rate"), // yüzde iskonto
  unitPrice: numeric("unit_price"), // ya da sabit birim fiyat
});

// CARİ HESAP HAREKETLERİ (borç/alacak defteri)
export const accountTransactions = sqliteTable("account_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  type: text("type").notNull(), // DEBIT (borç: satış), CREDIT (alacak: tahsilat), ADJUSTMENT
  amount: numeric("amount").notNull(),
  balanceAfter: numeric("balance_after").notNull(),
  referenceType: text("reference_type"), // ORDER, PAYMENT, MANUAL
  referenceId: text("reference_id"),
  description: text("description"),
  dueDate: integer("due_date", { mode: "timestamp" }), // vade tarihi (satış için)
  paidAt: integer("paid_at", { mode: "timestamp" }),
  createdBy: text("created_by").default("Sistem"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ==========================================
// 9. KAMPANYALAR, KUPONLAR & SADAKAT
// ==========================================
// KAMPANYALAR — kural tabanlı promosyon motoru (FAZ 8)
// ruleType: PERCENT_CATEGORY | PERCENT_BRAND | THRESHOLD_DISCOUNT | BUY_X_PAY_Y | FREE_SHIPPING | BUNDLE_PERCENT
export const promotions = sqliteTable("promotions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  ruleType: text("rule_type").notNull().default("PERCENT_CATEGORY"),
  // Hedef tanımlayıcılar
  categoryId: integer("category_id"),
  brandId: integer("brand_id"),
  productId: integer("product_id"),
  // Kural parametreleri
  percentValue: numeric("percent_value"),
  fixedValue: numeric("fixed_value"),
  thresholdAmount: numeric("threshold_amount"), // ör. 1000 TL üzeri
  buyQty: integer("buy_qty"),
  payQty: integer("pay_qty"),
  minQty: integer("min_qty").default(1),
  maxDiscount: numeric("max_discount"),
  freeShipping: integer("free_shipping", { mode: "boolean" }).notNull().default(false),
  priority: integer("priority").default(50).notNull(),
  startDate: integer("start_date", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  endDate: integer("end_date", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  usedCount: integer("used_count").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ÜRÜN YORUMLARI (moderasyonlu) — FAZ 8
export const productReviews = sqliteTable("product_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  rating: integer("rating").notNull(), // 1..5
  title: text("title"),
  comment: text("comment").notNull(),
  verifiedPurchase: integer("verified_purchase", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("PENDING"), // PENDING, APPROVED, REJECTED
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ÜRÜN SORU / CEVAP — FAZ 8
export const productQuestions = sqliteTable("product_questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  askerName: text("asker_name").notNull(),
  question: text("question").notNull(),
  answer: text("answer"),
  answeredBy: text("answered_by"),
  status: text("status").notNull().default("OPEN"), // OPEN, ANSWERED, HIDDEN
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const coupons = sqliteTable("coupons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull().default("PERCENT"), // PERCENT, FIXED
  discountValue: numeric("discount_value").notNull(),
  minCartAmount: numeric("min_cart_amount").default("0.00"),
  maxDiscount: numeric("max_discount"),
  usageLimit: integer("usage_limit").default(100),
  usedCount: integer("used_count").default(0),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
});

export const loyaltyTransactions = sqliteTable("loyalty_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  points: integer("points").notNull(),
  type: text("type").notNull(), // EARN, SPEND, BONUS
  description: text("description"),
  orderId: integer("order_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ==========================================
// 10. CMS: BLOG & KURUMSAL İÇERİK
// ==========================================
export const blogPosts = sqliteTable("blog_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  category: text("category").default("Dikiş Rehberi"),
  author: text("author").default("Tuhafiye Uzmanı"),
  imageUrl: text("image_url"),
  isPublished: integer("is_published", { mode: "boolean" }).default(true).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ==========================================
// 11. ERP ENTEGRASYON KAYITLARI & AUDIT LOG (FAZ 10)
// ==========================================
export const erpSyncLogs = sqliteTable("erp_sync_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").default("LOGO_GO3").notNull(), // LOGO_GO3, MIKRO_FLY, NETSIS, PARASUT, GIB_PORTAL
  entityType: text("entity_type").notNull(), // CUSTOMER, INVOICE, PURCHASE_INVOICE, PAYMENT, STOCK, RECEIPT
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // SYNC_SENT, SYNC_SUCCESS, SYNC_ERROR, RETRY
  status: text("status").notNull(), // SUCCESS, PENDING, FAILED, RETRYING
  retryCount: integer("retry_count").default(0).notNull(),
  errorMessage: text("error_message"),
  payload: text("payload"),
  response: text("response"),
  batchId: text("batch_id"),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ERP ASENKRON İŞ KUYRUĞU (Background Job Queue) — FAZ 10
export const erpSyncJobs = sqliteTable("erp_sync_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").default("LOGO_GO3").notNull(),
  entityType: text("entity_type").notNull(), // CUSTOMER, INVOICE, PAYMENT, STOCK
  entityId: text("entity_id").notNull(),
  payload: text("payload").notNull(),
  status: text("status").default("PENDING").notNull(), // PENDING, PROCESSING, COMPLETED, FAILED
  priority: integer("priority").default(10).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  lastError: text("last_error"),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// UYGULAMA AYARLARI — FAZ 8 (sadakat oranı, rezervasyon süresi vb.)
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("1"),
  userName: text("user_name").default("Yönetici"),
  action: text("action").notNull(), // CREATE_ORDER, ADJUST_STOCK, CLOSE_SHIFT, ERP_SYNC, etc.
  entity: text("entity").notNull(), // Product, Inventory, Shift, Order
  entityId: text("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address").default("127.0.0.1"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});
