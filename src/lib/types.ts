export interface Category {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  icon: string | null;
  description: string | null;
  displayOrder: number | null;
  isActive: boolean;
}

export interface Brand {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
}

export interface ProductVariant {
  id: number;
  productId: number;
  sku: string;
  barcode: string | null;
  colorName: string | null;
  colorHex: string | null;
  size: string | null;
  length: string | null;
  buyPrice: string | null;
  retailPrice: string;
  b2bPrice: string | null;
  imageUrl: string | null;
  isActive: boolean;
  stockQty?: number;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  sku: string;
  barcode: string | null;
  brandId: number | null;
  categoryId: number;
  shortDescription: string | null;
  description: string | null;
  unit: string;
  buyPrice: string;
  retailPrice: string;
  b2bPrice: string;
  minOrderQty: number;
  packageQty: number;
  vatRate: number;
  hasVariants: boolean;
  imageUrl: string | null;
  videoUrl: string | null;
  images?: string[];
  isFeatured: boolean | null;
  isActive: boolean;
  campaignPrice?: string | null;
  tags?: string | null;
  collection?: string | null;
  categoryName?: string;
  brandName?: string;
  variants?: ProductVariant[];
  totalStock?: number;
  totalAvailable?: number;
}

export interface Warehouse {
  id: number;
  name: string;
  code: string;
  type: string;
  address: string | null;
  isActive: boolean;
}

export interface InventoryItem {
  id: number;
  warehouseId: number;
  warehouseName?: string;
  productId: number;
  productName?: string;
  variantId: number | null;
  variantName?: string;
  sku?: string;
  barcode?: string;
  physicalQty: number;
  reservedQty: number;
  availableQty?: number;
  minStock: number;
  maxStock: number;
  reorderPoint: number;
  locationCode: string | null;
  unitPrice?: string;
}

export interface StockLedgerEntry {
  id: number;
  transactionType: string;
  warehouseId: number;
  warehouseName?: string;
  productId: number;
  productName?: string;
  variantId: number | null;
  quantity: number;
  unitCost: string | null;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string | Date;
}

export interface OrderItem {
  id?: number;
  productId: number;
  variantId?: number | null;
  productName: string;
  variantName?: string | null;
  sku: string;
  barcode?: string | null;
  unitPrice: number;
  quantity: number;
  taxRate: number;
  totalPrice: number;
}

export interface Order {
  id: number;
  orderNumber: string;
  orderType: "ONLINE_B2C" | "B2B" | "POS";
  customerId: number | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  shippingAddress: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  erpInvoiceNumber: string | null;
  notes: string | null;
  createdAt: string | Date;
  items?: OrderItem[];
}

export interface PosShift {
  id: number;
  shiftNumber?: string | null;
  terminalCode?: string | null;
  cashierName: string;
  warehouseId: number;
  openingAmount: string;
  closingAmount: string | null;
  expectedAmount: string | null;
  totalSalesCash: string | null;
  totalSalesCard: string | null;
  totalSalesSplit?: string | null;
  totalReturnsCash?: string | null;
  totalReturnsCard?: string | null;
  cashInTotal?: string | null;
  cashOutTotal?: string | null;
  zReportNumber?: string | null;
  status: string;
  openedAt: string | Date;
  closedAt: string | Date | null;
  notes: string | null;
}

export interface Customer {
  id: number;
  type: string;
  name: string;
  email: string | null;
  phone: string;
  companyName: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  creditLimit: string | null;
  balance: string | null;
  loyaltyPoints: number;
  segment: string | null;
  discountRate: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  createdAt: string | Date;
}

export interface Supplier {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  leadTimeDays: number;
  paymentTerms: string | null;
  rating: string | null;
  address: string | null;
  isActive: boolean;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierId: number;
  supplierName?: string;
  warehouseId: number;
  warehouseName?: string;
  status: string;
  totalAmount: string;
  notes: string | null;
  expectedDate: string | null;
  createdAt: string;
  items?: {
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    unitCost: string;
    receivedQty: number;
    totalCost: string;
  }[];
}

export interface Coupon {
  id: number;
  code: string;
  discountType: string;
  discountValue: string;
  minCartAmount: string | null;
  maxDiscount: string | null;
  usageLimit: number | null;
  usedCount: number | null;
  isActive: boolean;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: string | Date;
}
