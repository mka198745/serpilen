import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, numeric, index } from "drizzle-orm/sqlite-core";

// ==========================================
// 1. KULLANICILAR & ROLLER
// ==========================================
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("CASHIER"), // SUPER_ADMIN, STORE_MANAGER, WAREHOUSE_KEEPER, CASHIER
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  customerId: integer("customer_id"), // Müşteri cari kartına bağlantısı (varsa)
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
// 2. MÜŞTERİLER (B2C) & CRM
// ==========================================
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull().default("B2C"), // B2C (tek kanal)
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone").notNull(),
  companyName: text("company_name"),
  taxOffice: text("tax_office"),
  taxNumber: text("tax_number"),
  creditLimit: numeric("credit_limit").default("0.00"),
  balance: numeric("balance").default("0.00"), // Cari Bakiye
  loyaltyPoints: integer("loyalty_points").default(0).notNull(),
  segment: text("segment").default("YENİ"), // YENİ, AKTİF, VİP, RİSKLİ
  discountRate: numeric("discount_rate").default("0.00"), // Kişiye özel iskonto
  isBlocked: integer("is_blocked", { mode: "boolean" }).notNull().default(false), // riskli/engelli hesap
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
  imageUrl: text("image_url"),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
});

// ==========================================
// 5. DEPOLAR, RAF/LOKASYON & STOK
// ==========================================
export const warehouses = sqliteTable("warehouses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  code: text("code").notNull().unique(), // MRK, KDK-MAG, ONL-DEP
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
// 6. SİPARİŞLER (E-TİCARET, POS)
// ==========================================
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNumber: text("order_number").notNull().unique(), // OR-2026-001, POS-2026-042
  orderType: text("order_type").notNull().default("ONLINE_B2C"), // ONLINE_B2C, POS
  customerId: integer("customer_id"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  status: text("status").notNull().default("PAID"), // PENDING, PAID, PREPARING, READY_FOR_SHIPMENT, SHIPPED, DELIVERED, CANCELLED, REFUNDED
  paymentStatus: text("payment_status").notNull().default("PAID"), // PENDING, PAID, PARTIAL, REFUNDED
  paymentMethod: text("payment_method").notNull().default("CREDIT_CARD"), // CREDIT_CARD, CASH, EFT_HAVALE, SPLIT
  subtotal: numeric("subtotal").notNull().default("0.00"),
  discountTotal: numeric("discount_total").notNull().default("0.00"),
  taxTotal: numeric("tax_total").notNull().default("0.00"),
  shippingTotal: numeric("shipping_total").notNull().default("0.00"),
  grandTotal: numeric("grand_total").notNull().default("0.00"),
  shippingAddress: text("shipping_address"),
  trackingNumber: text("tracking_number"),
  carrier: text("carrier").default("Yurtiçi Kargo"),
  posShiftId: integer("pos_shift_id"),
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
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  seoKeywords: text("seo_keywords"),
  seoNoindex: integer("seo_noindex", { mode: "boolean" }).default(false).notNull(),
});

// ==========================================
// 11. AUDIT LOG
// ==========================================
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
  action: text("action").notNull(), // CREATE_ORDER, ADJUST_STOCK, CLOSE_SHIFT, etc.
  entity: text("entity").notNull(), // Product, Inventory, Shift, Order
  entityId: text("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address").default("127.0.0.1"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ==========================================
// 12. COMMERCE INTELLIGENCE ENGINE — FAZ 1 (TEMEL ZEKÂ)
// ==========================================
// Tahmin sonuçları: her "analyze" çalıştırmasında üretilen nokta tahminleri.
export const forecastResults = sqliteTable("forecast_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scope: text("scope").notNull(), // STORE, CATEGORY, PRODUCT
  scopeId: integer("scope_id"), // CATEGORY/PRODUCT ise id, STORE ise null
  scopeLabel: text("scope_label").notNull(),
  granularity: text("granularity").notNull().default("DAILY"), // DAILY, WEEKLY, MONTHLY
  horizonDays: integer("horizon_days").notNull(), // 7,14,30,60,90
  forecastDate: text("forecast_date").notNull(), // YYYY-MM-DD
  quantity: numeric("quantity").notNull().default("0"),
  revenue: numeric("revenue").notNull().default("0"),
  model: text("model").notNull(), // SMA, WMA, SES, HOLT, HOLT_WINTERS, LINEAR_REGRESSION, SEASONAL_NAIVE, CROSTON, SBA
  sampleSize: integer("sample_size").notNull().default(0),
  ciLower: numeric("ci_lower").notNull().default("0"), // %95 alt sınır (student-t yaklaşım, sigma*sqrt(h))
  ciUpper: numeric("ci_upper").notNull().default("0"),
  modelWape: numeric("model_wape"), // backtest WAPE (%)
  dataQuality: text("data_quality").notNull().default("OK"), // OK, LOW_DATA, INSUFFICIENT_DATA
  modelVersion: text("model_version").notNull().default("intelligence@1.0.0"),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp" }), // gerçekleşenle kıyaslandıysa
  generatedAt: integer("generated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("forecast_results_scope_idx").on(t.scope, t.scopeId, t.horizonDays),
  index("forecast_results_generated_idx").on(t.generatedAt),
]);

// Tahmin doğruluğu: backtesting + gerçekleşen vs kayıtlı tahmin karşılaştırması
export const forecastAccuracy = sqliteTable("forecast_accuracy", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scope: text("scope").notNull(), // STORE, PRODUCT
  scopeId: integer("scope_id"),
  scopeLabel: text("scope_label").notNull(),
  model: text("model").notNull(),
  horizonDays: integer("horizon_days").notNull(),
  mae: numeric("mae").notNull(),
  rmse: numeric("rmse").notNull(),
  mape: numeric("mape"), // actual=0 olanlarda null
  wape: numeric("wape"), // payda 0 ise null
  mase: numeric("mase"), // naive MAE=0 ise null
  bias: numeric("bias").notNull().default("0"), // ortalama (tahmin - gerçekleşen)
  sampleSize: integer("sample_size").notNull().default(0),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("forecast_accuracy_scope_idx").on(t.scope, t.scopeId),
  index("forecast_accuracy_evaluated_idx").on(t.evaluatedAt),
]);

// Anomali olayları: dedup'lı — aynı olay her çalıştırmada yeni kayıt ÜRETMEZ.
export const anomalyEvents = sqliteTable("anomaly_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  anomalyKey: text("anomaly_key").notNull().unique(), // metric|entityId|bucket (gün)
  metric: text("metric").notNull(), // DAILY_REVENUE, DAILY_ORDER_COUNT, AVG_BASKET, PRODUCT_DAILY_QTY, CANCEL_RATE, RETURN_RATE
  entityType: text("entity_type").notNull(), // STORE, PRODUCT
  entityId: text("entity_id").notNull().default("STORE"),
  entityLabel: text("entity_label").notNull(),
  observedValue: numeric("observed_value").notNull(),
  expectedValue: numeric("expected_value").notNull(),
  deviation: numeric("deviation").notNull(), // yüzde sapma
  detectionMethod: text("detection_method").notNull(), // MODIFIED_Z, Z_SCORE, IQR, EWMA, CUSUM, ROLLING
  severity: text("severity").notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  confidence: text("confidence").notNull().default("OK"), // OK, LOW_DATA_CONFIDENCE
  possibleCauses: text("possible_causes"), // JSON dizi — OLASI açıklamalar, kesin neden DEĞİL
  status: text("status").notNull().default("OPEN"), // OPEN, ACKNOWLEDGED, RESOLVED
  firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  occurrences: integer("occurrences").notNull().default(1),
}, (t) => [
  index("anomaly_events_status_idx").on(t.status),
  index("anomaly_events_metric_idx").on(t.metric),
]);

// RFM skorları: dönemsel hesaplama; her analizde ilgili dönem için üzerine yazılır.
export const rfmScores = sqliteTable("rfm_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  periodDays: integer("period_days").notNull().default(365),
  recencyDays: integer("recency_days").notNull(),
  frequency: integer("frequency").notNull(),
  monetary: numeric("monetary").notNull().default("0"),
  rScore: integer("r_score").notNull(),
  fScore: integer("f_score").notNull(),
  mScore: integer("m_score").notNull(),
  segment: text("segment").notNull(), // Champions, Loyal Customers, ... Lost
  calculatedAt: integer("calculated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("rfm_scores_customer_idx").on(t.customerId, t.periodDays),
  index("rfm_scores_segment_idx").on(t.segment),
]);

// ABC-XYZ sınıflandırması: ürün başına TEK satır (unique productId).
export const abcXyzClassifications = sqliteTable("abc_xyz_classifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().unique(),
  abcClass: text("abc_class").notNull(), // A, B, C, N/A
  xyzClass: text("xyz_class").notNull(), // X, Y, Z, N/A
  composite: text("composite").notNull(), // AX..CZ veya N/A
  annualQty: integer("annual_qty").notNull().default(0),
  annualValue: numeric("annual_value").notNull().default("0"),
  avgDailyDemand: numeric("avg_daily_demand").notNull().default("0"),
  demandCv: numeric("demand_cv"), // standart sapma/ortalama (aylık kovalar)
  inventoryValue: numeric("inventory_value").notNull().default("0"),
  turnover: numeric("turnover"), // yıllık COGS / ortalama stok değeri
  daysOfCover: numeric("days_of_cover"), // kullanılabilir stok / günlük talep
  risk: text("risk").notNull().default("NONE"), // STOCKOUT, OVERSTOCK, DEAD_STOCK, NONE
  calculatedAt: integer("calculated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("abc_xyz_composite_idx").on(t.composite),
]);

// Intelligence motoru ayarları: eşikler (admin tarafından yönetilir)
export const intelligenceSettings = sqliteTable("intelligence_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ==========================================
// 13. COMMERCE INTELLIGENCE ENGINE — FAZ 2 (TİCARİ OPTİMİZASYON)
// ==========================================
// Ticari fırsat havuzu: tüm modüllerin tespitlerini tek havuzda toplar.
export const commercialOpportunities = sqliteTable("commercial_opportunities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  opportunityKey: text("opportunity_key").notNull().unique(), // dedup anahtarı: type|entity|metric
  opportunityType: text("opportunity_type").notNull(), // PRICING_OPPORTUNITY, MARGIN_IMPROVEMENT, CAMPAIGN_OPPORTUNITY, ...
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  sourceModule: text("source_module").notNull(), // pricing, campaigns, basket, suppliers, quality, procurement
  relatedProductId: integer("related_product_id"),
  relatedCategoryId: integer("related_category_id"),
  relatedSupplierId: integer("related_supplier_id"),
  relatedCampaignId: integer("related_campaign_id"),
  estimatedRevenueImpact: numeric("estimated_revenue_impact").notNull().default("0"),
  estimatedProfitImpact: numeric("estimated_profit_impact").notNull().default("0"),
  estimatedCostSaving: numeric("estimated_cost_saving").notNull().default("0"),
  estimatedCashImpact: numeric("estimated_cash_impact").notNull().default("0"),
  confidenceScore: numeric("confidence_score").notNull().default("50"), // 0-100
  dataCoverage: numeric("data_coverage").notNull().default("50"), // 0-100
  priorityScore: numeric("priority_score").notNull().default("0"), // 0-100
  severity: text("severity").notNull().default("MEDIUM"), // LOW, MEDIUM, HIGH, CRITICAL
  evidence: text("evidence"), // JSON: ölçümler listesi
  assumptions: text("assumptions"), // JSON: varsayımlar listesi
  calculationMethod: text("calculation_method").notNull().default(""),
  recommendedAction: text("recommended_action").notNull().default(""),
  status: text("status").notNull().default("NEW"), // NEW, UNDER_REVIEW, APPROVED, REJECTED, IN_PROGRESS, COMPLETED, EXPIRED, CANCELLED
  ownerName: text("owner_name"),
  algorithmVersion: text("algorithm_version").notNull().default("commercial@1.0.0"),
  dataPeriodStart: text("data_period_start"),
  dataPeriodEnd: text("data_period_end"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
}, (t) => [
  index("commercial_opportunities_status_idx").on(t.status),
  index("commercial_opportunities_priority_idx").on(t.priorityScore),
  index("commercial_opportunities_type_idx").on(t.opportunityType),
  index("commercial_opportunities_product_idx").on(t.relatedProductId),
]);

// Fırsat yaşam döngüsü geçmişi (kim, ne zaman, hangi duruma)
export const opportunityHistory = sqliteTable("opportunity_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  opportunityId: integer("opportunity_id").notNull(),
  action: text("action").notNull(), // CREATED, UPDATED, REVIEWED, APPROVED, REJECTED, ASSIGNED, APPLIED, COMPLETED, EXPIRED, CANCELLED, REOPENED
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  details: text("details"),
  actorName: text("actor_name").notNull().default("Sistem"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("opportunity_history_opp_idx").on(t.opportunityId),
]);

// Beklenen vs gerçekleşen etki ölçümü
export const opportunityImpactResults = sqliteTable("opportunity_impact_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  opportunityId: integer("opportunity_id").notNull(),
  expectedProfitImpact: numeric("expected_profit_impact").notNull().default("0"),
  actualProfitImpact: numeric("actual_profit_impact").notNull().default("0"),
  realizationRate: numeric("realization_rate"), // % gerçekleşen / beklenen; beklenen 0 ise null
  evaluationWindowStart: text("evaluation_window_start"),
  evaluationWindowEnd: text("evaluation_window_end"),
  note: text("note"),
  measuredBy: text("measured_by").notNull().default("Yönetici"),
  measuredAt: integer("measured_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("opportunity_impact_opp_idx").on(t.opportunityId),
]);

// Reklam verisi — manuel giriş (harici platform entegrasyonu yok; sıfır-uydurma)
export const advertisingPerformance = sqliteTable("advertising_performance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // kampanya adı (serbest metin; promotions ile bağımsız)
  channel: text("channel").notNull().default("OTHER"), // GOOGLE_ADS, META_ADS, INSTAGRAM, E_MAIL, OTHER
  spend: numeric("spend").notNull().default("0"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  revenueAttributed: numeric("revenue_attributed").notNull().default("0"),
  startsOn: text("starts_on").notNull(), // YYYY-MM-DD
  endsOn: text("ends_on"), // YYYY-MM-DD; null = devam ediyor
  enteredBy: text("entered_by").notNull().default("Yönetici"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("advertising_performance_period_idx").on(t.startsOn, t.endsOn),
  index("advertising_performance_channel_idx").on(t.channel),
]);

// ==========================================
// 14. DECISION INTELLIGENCE ENGINE — FAZ 3 (KARAR ZEKÂSI)
// ==========================================
// Merkezi karar kayıtları: değiştirilemez analiz snapshot'ı ile.
export const decisionRecords = sqliteTable("decision_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  decisionKey: text("decision_key").notNull().unique(), // dedup anahtarı
  title: text("title").notNull(),
  decisionType: text("decision_type").notNull(), // PRICING_DECISION, PROCUREMENT_DECISION, ...
  status: text("status").notNull().default("RECOMMENDED"), // RECOMMENDED, UNDER_REVIEW, APPROVED, REJECTED, SCHEDULED, IMPLEMENTED, MONITORING, COMPLETED, EVALUATED, ARCHIVED
  sourceModules: text("source_modules").notNull().default("[]"), // JSON string[]
  relatedProductId: integer("related_product_id"),
  relatedCategoryId: integer("related_category_id"),
  relatedSupplierId: integer("related_supplier_id"),
  relatedCampaignId: integer("related_campaign_id"),
  analysisPeriodStart: text("analysis_period_start"),
  analysisPeriodEnd: text("analysis_period_end"),
  recommendationSummary: text("recommendation_summary").notNull().default(""),
  expectedRevenueImpact: numeric("expected_revenue_impact").notNull().default("0"),
  expectedProfitImpact: numeric("expected_profit_impact").notNull().default("0"),
  expectedCashImpact: numeric("expected_cash_impact").notNull().default("0"),
  riskScore: numeric("risk_score").notNull().default("50"), // 0-100
  successProbability: numeric("success_probability"), // 0-1; null = hesaplanamadı
  dataCoverage: numeric("data_coverage").notNull().default("50"), // 0-100
  confidenceLabel: text("confidence_label").notNull().default("LOW"), // HIGH, MEDIUM, LOW
  statisticalConfidence: numeric("statistical_confidence"), // 0-100; null = tahmin yok
  confidenceComponents: text("confidence_components"), // JSON: karar güveni bileşenleri
  methodNote: text("method_note").notNull().default(""), // örn. "Weighted Scoring + Cost-Benefit"
  evidence: text("evidence"), // JSON string[]
  assumptions: text("assumptions"), // JSON string[]
  explanation: text("explanation").notNull().default(""), // explanation report (insan okur)
  analysisSnapshot: text("analysis_snapshot"), // JSON: değiştirilemez analiz anlık görüntüsü
  opportunityKey: text("opportunity_key"), // FAZ 2 fırsat anahtarı (varsa)
  algorithmVersion: text("algorithm_version").notNull().default("decision@1.0.0"),
  createdBy: text("created_by").notNull().default("Sistem"),
  approvedBy: text("approved_by"),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  implementedAt: integer("implemented_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("decision_records_status_idx").on(t.status),
  index("decision_records_type_idx").on(t.decisionType),
  index("decision_records_product_idx").on(t.relatedProductId),
  index("decision_records_opportunity_idx").on(t.opportunityKey),
]);

export const decisionAlternatives = sqliteTable("decision_alternatives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  decisionId: integer("decision_id").notNull(),
  kind: text("kind").notNull(), // CURRENT_STATE, CONSERVATIVE, BALANCED, AGGRESSIVE, CUSTOM
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  expectedRevenue: numeric("expected_revenue").notNull().default("0"),
  expectedProfit: numeric("expected_profit").notNull().default("0"),
  expectedCost: numeric("expected_cost").notNull().default("0"),
  cashNeed: numeric("cash_need").notNull().default("0"),
  riskScore: numeric("risk_score").notNull().default("50"), // 0-100
  successProbability: numeric("success_probability"), // 0-1
  implementationDays: integer("implementation_days"),
  resourceNote: text("resource_note"),
  constraints: text("constraints"),
  score: numeric("score"), // 0-100 weighted; null = puanlanamadı
  rank: integer("rank"),
  criteriaScores: text("criteria_scores"), // JSON {criterion: score}
  assumptions: text("assumptions"), // JSON string[]
}, (t) => [
  index("decision_alternatives_decision_idx").on(t.decisionId),
]);

export const decisionConflicts = sqliteTable("decision_conflicts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conflictKey: text("conflict_key").notNull().unique(),
  conflictType: text("conflict_type").notNull(), // PRICE_UP_VS_DISCOUNT, PROCURE_VS_FREEZE
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  relatedProductId: integer("related_product_id"),
  items: text("items").notNull().default("[]"), // JSON [{source, refKey, recommendation, expectedProfit}]
  financialImpactDifference: numeric("financial_impact_difference"),
  resolutionOptions: text("resolution_options"), // JSON string[]
  status: text("status").notNull().default("OPEN"), // OPEN, RESOLVED, DISMISSED
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("decision_conflicts_status_idx").on(t.status),
  index("decision_conflicts_product_idx").on(t.relatedProductId),
]);

// Erken uyarı olayları: aynı koşul tekrarlanırsa occurrenceCount artar, yeni kayıt açılmaz.
export const earlyWarningEvents = sqliteTable("early_warning_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alertKey: text("alert_key").notNull().unique(),
  alertType: text("alert_type").notNull(), // SALES_DROP, MARGIN_DETERIORATION, STOCKOUT_RISK, ...
  category: text("category").notNull(), // FINANCIAL, SALES, INVENTORY, SUPPLIER, MARKETING, QUALITY, OPERATIONAL
  relatedEntityType: text("related_entity_type"), // PRODUCT, SUPPLIER, ORDER, CATEGORY, STORE, AD, GENERAL
  relatedEntityId: integer("related_entity_id"),
  relatedEntityLabel: text("related_entity_label"),
  riskScore: numeric("risk_score").notNull().default("0"), // 0-100
  severity: text("severity").notNull().default("LOW"), // LOW, MODERATE, HIGH, CRITICAL
  triggerCondition: text("trigger_condition").notNull().default(""),
  observedValue: numeric("observed_value"),
  expectedValue: numeric("expected_value"),
  deviationPct: numeric("deviation_pct"),
  potentialFinancialImpact: numeric("potential_financial_impact"),
  confidence: numeric("confidence").notNull().default("50"), // 0-100
  recommendedAction: text("recommended_action").notNull().default(""),
  evidence: text("evidence"), // JSON string[]
  assumption: text("assumption"),
  status: text("status").notNull().default("NEW"), // NEW, ACKNOWLEDGED, INVESTIGATING, ACTION_REQUIRED, RESOLVED, FALSE_POSITIVE, EXPIRED
  assignedUser: text("assigned_user"),
  resolutionNote: text("resolution_note"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("early_warning_events_status_idx").on(t.status),
  index("early_warning_events_category_idx").on(t.category),
  index("early_warning_events_lastseen_idx").on(t.lastSeenAt),
]);

export const earlyWarningHistory = sqliteTable("early_warning_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  action: text("action").notNull(), // CREATED, UPDATED, ACKNOWLEDGED, INVESTIGATING, ACTION_REQUIRED, RESOLVED, FALSE_POSITIVE, EXPIRED, REOPENED
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  details: text("details"),
  actorName: text("actor_name").notNull().default("Sistem"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("early_warning_history_event_idx").on(t.eventId),
]);

// What-if senaryo tanımı + çalıştırma sonucu (gerçek kayıtlar değişmez; snapshot JSON).
export const scenarioDefinitions = sqliteTable("scenario_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(), // PRICING, SALES, PROCUREMENT, MARKETING, INVENTORY, FINANCIAL
  scopeType: text("scope_type"), // PRODUCT, CATEGORY, STORE
  scopeId: integer("scope_id"),
  parameters: text("parameters").notNull().default("{}"), // JSON (doğrulanmış)
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  createdBy: text("created_by").notNull().default("Yönetici"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("scenario_definitions_category_idx").on(t.category),
]);

export const scenarioResults = sqliteTable("scenario_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scenarioId: integer("scenario_id").notNull(),
  runAt: integer("run_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  baselineMetrics: text("baseline_metrics").notNull().default("{}"),
  scenarioMetrics: text("scenario_metrics").notNull().default("{}"),
  baseCase: text("base_case"), // JSON
  expectedCase: text("expected_case"), // JSON
  bestCase: text("best_case"), // JSON (varsayımsal aralık — etiketli)
  worstCase: text("worst_case"), // JSON (varsayımsal aralık — etiketli)
  financialImpact: text("financial_impact").notNull().default("{}"), // JSON
  riskScore: numeric("risk_score"),
  confidence: numeric("confidence"),
  dataCoverage: numeric("data_coverage"),
  assumptions: text("assumptions"), // JSON string[]
  notes: text("notes"),
  algorithmVersion: text("algorithm_version").notNull().default("scenario@1.0.0"),
}, (t) => [
  index("scenario_results_scenario_idx").on(t.scenarioId),
]);

// Monte Carlo: yalnız parametreler + özet sonuçlar saklanır (binlerce kayıt DEĞİL).
export const monteCarloRuns = sqliteTable("monte_carlo_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  scenarioId: integer("scenario_id"),
  kind: text("kind").notNull(), // PRICE, COST, DEMAND, LEAD_TIME, CAMPAIGN, PROCUREMENT, CONTRIBUTION
  parameters: text("parameters").notNull().default("{}"), // dağılım seçimi + parametreleri + çıkış formülü
  seed: integer("seed").notNull(),
  iterations: integer("iterations").notNull(),
  results: text("results").notNull().default("{}"), // mean/median/stddev/min/max/p5..p95/olasılıklar
  sensitivity: text("sensitivity"), // JSON [{variable, pearson}]
  reliability: text("reliability"), // JSON: seed, yakınsama, aşırı değer, dağılım uygunluğu notları
  createdBy: text("created_by").notNull().default("Yönetici"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("monte_carlo_runs_created_idx").on(t.createdAt),
]);

// Yönetim hedefleri: AUTO ölçülebilir KPI + MANUAL giriş.
export const managementGoals = sqliteTable("management_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(), // FINANCIAL, SALES, INVENTORY, PROCUREMENT, MARKETING, QUALITY
  kpi: text("kpi").notNull(), // REVENUE, ORDER_COUNT, AVG_ORDER_VALUE, GROSS_PROFIT, CONTRIBUTION_MARGIN, RETURN_RATE, ROAS, DEAD_STOCK_VALUE, ON_TIME_PCT, FILL_RATE_PCT
  unit: text("unit").notNull().default("TL"),
  baselineValue: numeric("baseline_value"),
  targetValue: numeric("target_value").notNull(),
  currentValue: numeric("current_value"), // AUTO ölçümlerde anlık, MANUAL'da elle
  direction: text("direction").notNull().default("HIGHER_BETTER"), // HIGHER_BETTER | LOWER_BETTER
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  responsibleUser: text("responsible_user"),
  priority: text("priority").notNull().default("MEDIUM"), // LOW, MEDIUM, HIGH
  status: text("status").notNull().default("ACTIVE"), // ACTIVE, ACHIEVED, MISSED, CANCELLED
  measurementMethod: text("measurement_method").notNull().default("AUTO"), // AUTO | MANUAL
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("management_goals_status_idx").on(t.status),
  index("management_goals_category_idx").on(t.category),
]);

// Karar gerçekleşen sonuçları: beklenen vs gerçekleşen (karar bazında)
export const decisionOutcomes = sqliteTable("decision_outcomes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  decisionId: integer("decision_id").notNull(),
  expectedProfitImpact: numeric("expected_profit_impact").notNull().default("0"),
  actualProfitImpact: numeric("actual_profit_impact").notNull().default("0"),
  realizationRate: numeric("realization_rate"), // %
  evaluationWindowStart: text("evaluation_window_start"),
  evaluationWindowEnd: text("evaluation_window_end"),
  note: text("note"),
  measuredBy: text("measured_by").notNull().default("Yönetici"),
  measuredAt: integer("measured_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => [
  index("decision_outcomes_decision_idx").on(t.decisionId),
]);
