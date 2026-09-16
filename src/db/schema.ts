import { mysqlTable, text, int, decimal, timestamp, boolean, varchar } from "drizzle-orm/mysql-core";

// ==========================================
// 1. KULLANICILAR & ROLLER
// ==========================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull().default("CASHIER"), // SUPER_ADMIN, STORE_MANAGER, WAREHOUSE_KEEPER, CASHIER, B2B_CUSTOMER, B2C_CUSTOMER
  phone: varchar("phone", { length: 255 }),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  customerId: int("customer_id"), // B2B portal müşterisinin cari karta bağlantısı
  // --- Güvenlik / 2FA alanları ---
  totpSecret: varchar("totp_secret", { length: 255 }), // Google Authenticator base32 gizli anahtarı
  totpSecretPrevious: varchar("totp_secret_previous", { length: 255 }), // Rotasyon sırasında eski kod da kabul edilir (kilitlenmeyi önler)
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  recoveryCodeHash: varchar("recovery_code_hash", { length: 255 }), // Tek kullanımlık kurtarma kodu özeti
  failedLoginCount: int("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"), // Brute-force hesap kilidi
  lastLoginAt: timestamp("last_login_at"),
  passwordChangedAt: timestamp("password_changed_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// OTURUM (SESSION) YÖNETİMİ — token iptali (revocation) ve cihaz takibi
export const adminSessions = mysqlTable("admin_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  jti: varchar("jti", { length: 255 }).notNull().unique(), // Token JWT-ID
  ip: varchar("ip", { length: 255 }),
  userAgent: varchar("user_agent", { length: 500 }),
  mfaVerified: boolean("mfa_verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
});

// TEK KULLANIMLIK GİRİŞ DOĞRULAMA NONCE'LARI (pre-auth / enrollment)
export const authNonces = mysqlTable("auth_nonces", {
  id: int("id").autoincrement().primaryKey(),
  tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
  userId: int("user_id").notNull(),
  scope: varchar("scope", { length: 255 }).notNull(), // PRE_AUTH | ENROLL
  attemptCount: int("attempt_count").notNull().default(0),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// ==========================================
// 2. MÜŞTERİLER (B2C & B2B) & CRM
// ==========================================
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 255 }).notNull().default("B2C"), // B2C, B2B
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 255 }).notNull(),
  companyName: varchar("company_name", { length: 255 }),
  taxOffice: varchar("tax_office", { length: 255 }),
  taxNumber: varchar("tax_number", { length: 255 }),
  creditLimit: decimal("credit_limit", { precision: 12, scale: 2 }).default("0.00"),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0.00"), // Cari Bakiye
  loyaltyPoints: int("loyalty_points").default(0).notNull(),
  segment: varchar("segment", { length: 255 }).default("YENİ"), // YENİ, AKTİF, VİP, TOPTANCI, RİSKLİ
  discountRate: decimal("discount_rate", { precision: 5, scale: 2 }).default("0.00"), // Özel B2B iskontosu
  // --- FAZ 9: B2B cari & fiyatlandırma ---
  priceListId: int("price_list_id"), // atanmış fiyat listesi
  paymentTermDays: int("payment_term_days").default(30).notNull(), // vade (gün)
  minOrderAmount: decimal("min_order_amount", { precision: 10, scale: 2 }).default("0.00"),
  isBlocked: boolean("is_blocked").notNull().default(false), // riskli/kapalı cari
  approvalStatus: varchar("approval_status", { length: 255 }).default("APPROVED"), // PENDING, APPROVED, REJECTED
  address: text("address"),
  city: varchar("city", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// 3. KATEGORİLER & MARKALAR
// ==========================================
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  parentId: int("parent_id"),
  icon: varchar("icon", { length: 255 }),
  description: text("description"),
  displayOrder: int("display_order").default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const brands = mysqlTable("brands", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  logoUrl: varchar("logo_url", { length: 500 }),
  isActive: boolean("is_active").notNull().default(true),
});

// ==========================================
// 4. ÜRÜNLER & VARYANTLAR
// ==========================================
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  sku: varchar("sku", { length: 255 }).notNull().unique(),
  barcode: varchar("barcode", { length: 255 }).unique(),
  brandId: int("brand_id"),
  categoryId: int("category_id").notNull(),
  shortDescription: text("short_description"),
  description: text("description"),
  unit: varchar("unit", { length: 255 }).default("Adet").notNull(), // Adet, Metre, Paket, Kutu, Rulo, Bobin
  buyPrice: decimal("buy_price", { precision: 10, scale: 2 }).notNull().default("0.00"),
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }).notNull().default("0.00"),
  b2bPrice: decimal("b2b_price", { precision: 10, scale: 2 }).notNull().default("0.00"),
  minOrderQty: int("min_order_qty").default(1).notNull(),
  packageQty: int("package_qty").default(1).notNull(), // Paket içi adet
  vatRate: int("vat_rate").default(20).notNull(), // KDV %10 veya %20
  hasVariants: boolean("has_variants").default(false).notNull(),
  imageUrl: varchar("image_url", { length: 500 }),
  campaignPrice: decimal("campaign_price", { precision: 10, scale: 2 }),
  tags: text("tags"), // virgülle ayrılmış etiketler: "fermuar,siyah,mont"
  collection: varchar("collection", { length: 255 }),
  seoTitle: varchar("seo_title", { length: 255 }),
  seoDescription: text("seo_description"),
  isFeatured: boolean("is_featured").default(false),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productImages = mysqlTable("product_images", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  url: varchar("url", { length: 500 }).notNull(),
  altText: varchar("alt_text", { length: 255 }),
  sortOrder: int("sort_order").default(0).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
});

export const productVariants = mysqlTable("product_variants", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  sku: varchar("sku", { length: 255 }).notNull().unique(),
  barcode: varchar("barcode", { length: 255 }).unique(),
  colorName: varchar("color_name", { length: 255 }),
  colorHex: varchar("color_hex", { length: 255 }),
  size: varchar("size", { length: 255 }), // e.g., "20 cm", "40 mm", "No: 50"
  length: varchar("length", { length: 255 }), // e.g., "100m", "500m"
  buyPrice: decimal("buy_price", { precision: 10, scale: 2 }),
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }).notNull(),
  b2bPrice: decimal("b2b_price", { precision: 10, scale: 2 }),
  imageUrl: varchar("image_url", { length: 500 }),
  isActive: boolean("is_active").default(true).notNull(),
});

// ==========================================
// 5. DEPOLAR, RAF/LOKASYON & STOK
// ==========================================
export const warehouses = mysqlTable("warehouses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 255 }).notNull().unique(), // MRK, KDK-MAG, ONL-DEP, TOPTAN
  type: varchar("type", { length: 255 }).notNull().default("STORE"), // CENTRAL, STORE, ONLINE, WHOLESALE
  address: text("address"),
  isActive: boolean("is_active").default(true).notNull(),
});

export const warehouseLocations = mysqlTable("warehouse_locations", {
  id: int("id").autoincrement().primaryKey(),
  warehouseId: int("warehouse_id").notNull(),
  locationCode: varchar("location_code", { length: 255 }).notNull(), // MRK-A-03-12
  zone: varchar("zone", { length: 255 }),
  aisle: varchar("aisle", { length: 255 }),
  rack: varchar("rack", { length: 255 }),
  shelf: varchar("shelf", { length: 255 }),
  bin: varchar("bin", { length: 255 }),
});

export const inventory = mysqlTable("inventory", {
  id: int("id").autoincrement().primaryKey(),
  warehouseId: int("warehouse_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  physicalQty: int("physical_qty").notNull().default(0),
  reservedQty: int("reserved_qty").notNull().default(0),
  minStock: int("min_stock").notNull().default(10),
  maxStock: int("max_stock").notNull().default(500),
  reorderPoint: int("reorder_point").notNull().default(15),
  locationCode: varchar("location_code", { length: 255 }).default("GENEL-A-01"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// STOK REZERVASYONLARI — checkout/sepet bazlı süreli stok kilitleme (FAZ 3)
export const inventoryReservations = mysqlTable("inventory_reservations", {
  id: int("id").autoincrement().primaryKey(),
  warehouseId: int("warehouse_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  qty: int("qty").notNull(),
  referenceType: varchar("reference_type", { length: 255 }).notNull().default("CART"), // CART, CHECKOUT, ORDER
  referenceId: varchar("reference_id", { length: 255 }), // sepet/checkout anahtarı veya sipariş no
  status: varchar("status", { length: 255 }).notNull().default("ACTIVE"), // ACTIVE, CONSUMED, RELEASED, EXPIRED
  expiresAt: timestamp("expires_at").notNull(),
  createdBy: varchar("created_by", { length: 255 }).default("Sistem"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// DEPOLAR ARASI TRANSFER İŞ AKIŞI: REQUESTED → APPROVED → SHIPPED → RECEIVED (FAZ 3)
export const stockTransfers = mysqlTable("stock_transfers", {
  id: int("id").autoincrement().primaryKey(),
  transferNumber: varchar("transfer_number", { length: 255 }).notNull().unique(), // TRF-2026-001
  fromWarehouseId: int("from_warehouse_id").notNull(),
  toWarehouseId: int("to_warehouse_id").notNull(),
  status: varchar("status", { length: 255 }).notNull().default("REQUESTED"), // REQUESTED, APPROVED, SHIPPED, RECEIVED, CANCELLED
  note: text("note"),
  createdBy: varchar("created_by", { length: 255 }).default("Depo Sorumlusu"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  shippedAt: timestamp("shipped_at"),
  receivedAt: timestamp("received_at"),
});

export const stockTransferItems = mysqlTable("stock_transfer_items", {
  id: int("id").autoincrement().primaryKey(),
  transferId: int("transfer_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  qty: int("qty").notNull(),
});

// STOK SAYIM OTURUMLARI — barkod taramalı sayım ve fark mutabakatı (FAZ 3)
export const stockCountSessions = mysqlTable("stock_count_sessions", {
  id: int("id").autoincrement().primaryKey(),
  countNumber: varchar("count_number", { length: 255 }).notNull().unique(), // COUNT-2026-001
  warehouseId: int("warehouse_id").notNull(),
  status: varchar("status", { length: 255 }).notNull().default("IN_PROGRESS"), // IN_PROGRESS, COMPLETED, CANCELLED
  startedBy: varchar("started_by", { length: 255 }).default("Sayım Ekibi"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const stockCountItems = mysqlTable("stock_count_items", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("session_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  expectedQty: int("expected_qty").notNull(),
  countedQty: int("counted_qty").notNull(),
  locationCode: varchar("location_code", { length: 255 }),
  scannedBarcode: varchar("scanned_barcode", { length: 255 }),
  countedAt: timestamp("counted_at").defaultNow().notNull(),
});

// STOK HAREKET DEFTERİ (STOCK LEDGER)
export const inventoryLedger = mysqlTable("inventory_ledger", {
  id: int("id").autoincrement().primaryKey(),
  transactionType: varchar("transaction_type", { length: 255 }).notNull(), // PURCHASE, SALE, RETURN, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT, COUNT_DIFF, DAMAGE, RESERVATION
  warehouseId: int("warehouse_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  quantity: int("quantity").notNull(), // + veya -
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).default("0.00"),
  referenceType: varchar("reference_type", { length: 255 }), // ORDER, POS_SALE, PO, TRANSFER, ADJUSTMENT
  referenceId: varchar("reference_id", { length: 255 }),
  note: text("note"),
  createdBy: varchar("created_by", { length: 255 }).default("Sistem"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// 6. SİPARİŞLER (E-TİCARET, B2B, POS)
// ==========================================
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("order_number", { length: 255 }).notNull().unique(), // OR-2026-001, POS-2026-042
  orderType: varchar("order_type", { length: 255 }).notNull().default("ONLINE_B2C"), // ONLINE_B2C, B2B, POS
  customerId: int("customer_id"),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 255 }),
  status: varchar("status", { length: 255 }).notNull().default("PAID"), // PENDING, PAID, PREPARING, READY_FOR_SHIPMENT, SHIPPED, DELIVERED, CANCELLED, REFUNDED
  paymentStatus: varchar("payment_status", { length: 255 }).notNull().default("PAID"), // PENDING, PAID, PARTIAL, REFUNDED
  paymentMethod: varchar("payment_method", { length: 255 }).notNull().default("CREDIT_CARD"), // CREDIT_CARD, CASH, EFT_HAVALE, B2B_CREDIT, SPLIT
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0.00"),
  discountTotal: decimal("discount_total", { precision: 10, scale: 2 }).notNull().default("0.00"),
  taxTotal: decimal("tax_total", { precision: 10, scale: 2 }).notNull().default("0.00"),
  shippingTotal: decimal("shipping_total", { precision: 10, scale: 2 }).notNull().default("0.00"),
  grandTotal: decimal("grand_total", { precision: 10, scale: 2 }).notNull().default("0.00"),
  shippingAddress: text("shipping_address"),
  trackingNumber: varchar("tracking_number", { length: 255 }),
  carrier: varchar("carrier", { length: 255 }).default("Yurtiçi Kargo"),
  posShiftId: int("pos_shift_id"),
  erpInvoiceNumber: varchar("erp_invoice_number", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("order_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  productName: varchar("product_name", { length: 255 }).notNull(),
  variantName: varchar("variant_name", { length: 255 }),
  sku: varchar("sku", { length: 255 }).notNull(),
  barcode: varchar("barcode", { length: 255 }),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  quantity: int("quantity").notNull(),
  taxRate: int("tax_rate").notNull().default(20),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
});

// SİPARİŞ DURUM GEÇMİŞİ (audit trail) — FAZ 4
export const orderStatusHistory = mysqlTable("order_status_history", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("order_id").notNull(),
  fromStatus: varchar("from_status", { length: 255 }),
  toStatus: varchar("to_status", { length: 255 }).notNull(),
  note: text("note"),
  changedBy: varchar("changed_by", { length: 255 }).default("Sistem"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// İADELER (RMA) — FAZ 4
export const orderReturns = mysqlTable("order_returns", {
  id: int("id").autoincrement().primaryKey(),
  returnNumber: varchar("return_number", { length: 255 }).notNull().unique(), // IAD-2026-001
  orderId: int("order_id").notNull(),
  orderNumber: varchar("order_number", { length: 255 }).notNull(),
  reason: varchar("reason", { length: 255 }),
  status: varchar("status", { length: 255 }).notNull().default("REQUESTED"), // REQUESTED, APPROVED, RECEIVED, REFUNDED, REJECTED
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).default("0.00"),
  restock: boolean("restock").notNull().default(true),
  warehouseId: int("warehouse_id").default(3),
  createdBy: varchar("created_by", { length: 255 }).default("Müşteri Hizmetleri"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const orderReturnItems = mysqlTable("order_return_items", {
  id: int("id").autoincrement().primaryKey(),
  returnId: int("return_id").notNull(),
  orderItemId: int("order_item_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  productName: varchar("product_name", { length: 255 }).notNull(),
  quantity: int("quantity").notNull(),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
});

// ==========================================
// 7. POS VARDİYA & KASA YÖNETİMİ — FAZ 7
// ==========================================
export const posShifts = mysqlTable("pos_shifts", {
  id: int("id").autoincrement().primaryKey(),
  shiftNumber: varchar("shift_number", { length: 255 }), // VARD-2026-001
  terminalCode: varchar("terminal_code", { length: 255 }).default("KASA-01").notNull(),
  cashierName: varchar("cashier_name", { length: 255 }).notNull(),
  warehouseId: int("warehouse_id").notNull(),
  openingAmount: decimal("opening_amount", { precision: 10, scale: 2 }).notNull().default("500.00"),
  closingAmount: decimal("closing_amount", { precision: 10, scale: 2 }),
  expectedAmount: decimal("expected_amount", { precision: 10, scale: 2 }),
  totalSalesCash: decimal("total_sales_cash", { precision: 10, scale: 2 }).default("0.00"),
  totalSalesCard: decimal("total_sales_card", { precision: 10, scale: 2 }).default("0.00"),
  totalSalesSplit: decimal("total_sales_split", { precision: 10, scale: 2 }).default("0.00"),
  totalReturnsCash: decimal("total_returns_cash", { precision: 10, scale: 2 }).default("0.00"),
  totalReturnsCard: decimal("total_returns_card", { precision: 10, scale: 2 }).default("0.00"),
  cashInTotal: decimal("cash_in_total", { precision: 10, scale: 2 }).default("0.00"),
  cashOutTotal: decimal("cash_out_total", { precision: 10, scale: 2 }).default("0.00"),
  status: varchar("status", { length: 255 }).notNull().default("OPEN"), // OPEN, CLOSED
  zReportNumber: varchar("z_report_number", { length: 255 }), // Z-2026-001
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  notes: text("notes"),
});

// KASA HAREKETLERİ (Nakit Giriş / Çıkış / Masraf / Avans) — FAZ 7
export const posCashTransactions = mysqlTable("pos_cash_transactions", {
  id: int("id").autoincrement().primaryKey(),
  shiftId: int("shift_id").notNull(),
  warehouseId: int("warehouse_id").notNull(),
  type: varchar("type", { length: 255 }).notNull(), // CASH_IN, CASH_OUT, EXPENSE, FLOAT_ADD
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  cashierName: varchar("cashier_name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// 8. TEDARİKÇİ & SATIN ALMA YÖNETİMİ
// ==========================================
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  contactPerson: varchar("contact_person", { length: 255 }),
  phone: varchar("phone", { length: 255 }),
  email: varchar("email", { length: 255 }),
  taxOffice: varchar("tax_office", { length: 255 }),
  taxNumber: varchar("tax_number", { length: 255 }),
  leadTimeDays: int("lead_time_days").default(3).notNull(),
  paymentTerms: varchar("payment_terms", { length: 255 }).default("30 Gün Vade"),
  rating: decimal("rating", { precision: 3, scale: 1 }).default("4.8"),
  address: text("address"),
  isActive: boolean("is_active").default(true).notNull(),
});

export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  poNumber: varchar("po_number", { length: 255 }).notNull().unique(), // SAT-2026-001
  supplierId: int("supplier_id").notNull(),
  warehouseId: int("warehouse_id").notNull(),
  status: varchar("status", { length: 255 }).notNull().default("ORDERED"), // DRAFT, APPROVED, ORDERED, RECEIVED, CANCELLED
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  notes: text("notes"),
  expectedDate: varchar("expected_date", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchaseOrderItems = mysqlTable("purchase_order_items", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchase_order_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  quantity: int("quantity").notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  receivedQty: int("received_qty").default(0).notNull(),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(),
});

// SATIN ALMA TALEPLERİ — FAZ 6: REQUESTED → APPROVED → ORDERED → REJECTED
export const purchaseRequests = mysqlTable("purchase_requests", {
  id: int("id").autoincrement().primaryKey(),
  requestNumber: varchar("request_number", { length: 255 }).notNull().unique(), // TAL-2026-001
  warehouseId: int("warehouse_id").notNull(),
  status: varchar("status", { length: 255 }).notNull().default("REQUESTED"), // REQUESTED, APPROVED, ORDERED, REJECTED
  priority: varchar("priority", { length: 255 }).notNull().default("NORMAL"), // LOW, NORMAL, HIGH, URGENT
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 255 }).default("Depo Sorumlusu"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by", { length: 255 }),
});

export const purchaseRequestItems = mysqlTable("purchase_request_items", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("request_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  qty: int("qty").notNull(),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }).default("0.00"),
});

// MAL KABUL FİŞLERİ — FAZ 6: kısmi kabul takibi
export const goodsReceipts = mysqlTable("goods_receipts", {
  id: int("id").autoincrement().primaryKey(),
  receiptNumber: varchar("receipt_number", { length: 255 }).notNull().unique(), // MK-2026-001
  purchaseOrderId: int("purchase_order_id").notNull(),
  warehouseId: int("warehouse_id").notNull(),
  receivedBy: varchar("received_by", { length: 255 }).default("Mal Kabul Görevlisi"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const goodsReceiptItems = mysqlTable("goods_receipt_items", {
  id: int("id").autoincrement().primaryKey(),
  receiptId: int("receipt_id").notNull(),
  purchaseOrderItemId: int("purchase_order_item_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  qty: int("qty").notNull(),
});

// ==========================================
// 8.5 B2B: FİYAT LİSTELERİ, KADEMELİ FİYAT & CARİ HESAP (FAZ 9)
// ==========================================
export const priceLists = mysqlTable("price_lists", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 255 }).notNull().unique(), // RETAIL, DEALER, WHOLESALE, VIP
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Liste geneli varsayılan iskonto (ürün bazlı override yoksa uygulanır)
  defaultDiscountRate: decimal("default_discount_rate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Ürün bazlı özel fiyat (liste × ürün)
export const priceListItems = mysqlTable("price_list_items", {
  id: int("id").autoincrement().primaryKey(),
  priceListId: int("price_list_id").notNull(),
  productId: int("product_id").notNull(),
  variantId: int("variant_id"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  minQty: int("min_qty").default(1).notNull(),
});

// Kademeli (hacim) fiyat baremleri: 1-9 / 10-49 / 50-99 / 100+
export const priceTiers = mysqlTable("price_tiers", {
  id: int("id").autoincrement().primaryKey(),
  priceListId: int("price_list_id").notNull(),
  productId: int("product_id"), // null = liste geneli barem
  minQty: int("min_qty").notNull(),
  maxQty: int("max_qty"), // null = üst sınırsız
  discountRate: decimal("discount_rate", { precision: 5, scale: 2 }), // yüzde iskonto
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }), // ya da sabit birim fiyat
});

// CARİ HESAP HAREKETLERİ (borç/alacak defteri)
export const accountTransactions = mysqlTable("account_transactions", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull(),
  type: varchar("type", { length: 255 }).notNull(), // DEBIT (borç: satış), CREDIT (alacak: tahsilat), ADJUSTMENT
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 2 }).notNull(),
  referenceType: varchar("reference_type", { length: 255 }), // ORDER, PAYMENT, MANUAL
  referenceId: varchar("reference_id", { length: 255 }),
  description: text("description"),
  dueDate: timestamp("due_date"), // vade tarihi (satış için)
  paidAt: timestamp("paid_at"),
  createdBy: varchar("created_by", { length: 255 }).default("Sistem"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// 9. KAMPANYALAR, KUPONLAR & SADAKAT
// ==========================================
// KAMPANYALAR — kural tabanlı promosyon motoru (FAZ 8)
// ruleType: PERCENT_CATEGORY | PERCENT_BRAND | THRESHOLD_DISCOUNT | BUY_X_PAY_Y | FREE_SHIPPING | BUNDLE_PERCENT
export const promotions = mysqlTable("promotions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ruleType: varchar("rule_type", { length: 255 }).notNull().default("PERCENT_CATEGORY"),
  // Hedef tanımlayıcılar
  categoryId: int("category_id"),
  brandId: int("brand_id"),
  productId: int("product_id"),
  // Kural parametreleri
  percentValue: decimal("percent_value", { precision: 5, scale: 2 }),
  fixedValue: decimal("fixed_value", { precision: 10, scale: 2 }),
  thresholdAmount: decimal("threshold_amount", { precision: 10, scale: 2 }), // ör. 1000 TL üzeri
  buyQty: int("buy_qty"),
  payQty: int("pay_qty"),
  minQty: int("min_qty").default(1),
  maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }),
  freeShipping: boolean("free_shipping").notNull().default(false),
  priority: int("priority").default(50).notNull(),
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  usedCount: int("used_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ÜRÜN YORUMLARI (moderasyonlu) — FAZ 8
export const productReviews = mysqlTable("product_reviews", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }),
  rating: int("rating").notNull(), // 1..5
  title: varchar("title", { length: 255 }),
  comment: text("comment").notNull(),
  verifiedPurchase: boolean("verified_purchase").notNull().default(false),
  status: varchar("status", { length: 255 }).notNull().default("PENDING"), // PENDING, APPROVED, REJECTED
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ÜRÜN SORU / CEVAP — FAZ 8
export const productQuestions = mysqlTable("product_questions", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  askerName: varchar("asker_name", { length: 255 }).notNull(),
  question: text("question").notNull(),
  answer: text("answer"),
  answeredBy: varchar("answered_by", { length: 255 }),
  status: varchar("status", { length: 255 }).notNull().default("OPEN"), // OPEN, ANSWERED, HIDDEN
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coupons = mysqlTable("coupons", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 255 }).notNull().unique(),
  discountType: varchar("discount_type", { length: 255 }).notNull().default("PERCENT"), // PERCENT, FIXED
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  minCartAmount: decimal("min_cart_amount", { precision: 10, scale: 2 }).default("0.00"),
  maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }),
  usageLimit: int("usage_limit").default(100),
  usedCount: int("used_count").default(0),
  isActive: boolean("is_active").default(true).notNull(),
});

export const loyaltyTransactions = mysqlTable("loyalty_transactions", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull(),
  points: int("points").notNull(),
  type: varchar("type", { length: 255 }).notNull(), // EARN, SPEND, BONUS
  description: text("description"),
  orderId: int("order_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// 10. CMS: BLOG & KURUMSAL İÇERİK
// ==========================================
export const blogPosts = mysqlTable("blog_posts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  category: varchar("category", { length: 255 }).default("Dikiş Rehberi"),
  author: varchar("author", { length: 255 }).default("Tuhafiye Uzmanı"),
  imageUrl: varchar("image_url", { length: 500 }),
  isPublished: boolean("is_published").default(true).notNull(),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
});

// ==========================================
// 11. ERP ENTEGRASYON KAYITLARI & AUDIT LOG (FAZ 10)
// ==========================================
export const erpSyncLogs = mysqlTable("erp_sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 255 }).default("LOGO_GO3").notNull(), // LOGO_GO3, MIKRO_FLY, NETSIS, PARASUT, GIB_PORTAL
  entityType: varchar("entity_type", { length: 255 }).notNull(), // CUSTOMER, INVOICE, PURCHASE_INVOICE, PAYMENT, STOCK, RECEIPT
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  action: varchar("action", { length: 255 }).notNull(), // SYNC_SENT, SYNC_SUCCESS, SYNC_ERROR, RETRY
  status: varchar("status", { length: 255 }).notNull(), // SUCCESS, PENDING, FAILED, RETRYING
  retryCount: int("retry_count").default(0).notNull(),
  errorMessage: text("error_message"),
  payload: text("payload"),
  response: text("response"),
  batchId: varchar("batch_id", { length: 255 }),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ERP ASENKRON İŞ KUYRUĞU (Background Job Queue) — FAZ 10
export const erpSyncJobs = mysqlTable("erp_sync_jobs", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 255 }).default("LOGO_GO3").notNull(),
  entityType: varchar("entity_type", { length: 255 }).notNull(), // CUSTOMER, INVOICE, PAYMENT, STOCK
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  payload: text("payload").notNull(),
  status: varchar("status", { length: 255 }).default("PENDING").notNull(), // PENDING, PROCESSING, COMPLETED, FAILED
  priority: int("priority").default(10).notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("max_attempts").default(3).notNull(),
  lastError: text("last_error"),
  nextRunAt: timestamp("next_run_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// UYGULAMA AYARLARI — FAZ 8 (sadakat oranı, rezervasyon süresi vb.)
export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: varchar("value", { length: 255 }).notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("user_id", { length: 255 }).default("1"),
  userName: varchar("user_name", { length: 255 }).default("Yönetici"),
  action: varchar("action", { length: 255 }).notNull(), // CREATE_ORDER, ADJUST_STOCK, CLOSE_SHIFT, ERP_SYNC, etc.
  entity: varchar("entity", { length: 255 }).notNull(), // Product, Inventory, Shift, Order
  entityId: varchar("entity_id", { length: 255 }),
  details: text("details"),
  ipAddress: varchar("ip_address", { length: 255 }).default("127.0.0.1"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
