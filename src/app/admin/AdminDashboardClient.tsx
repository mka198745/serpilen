"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { MarketingCenter } from "@/components/admin/MarketingCenter";
import { AiAssistantCenter } from "@/components/admin/AiAssistantCenter";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { IntelligenceCenter } from "@/components/admin/intelligence/IntelligenceCenter";
import {
  LayoutDashboard,
  Package,
  Boxes,
  Barcode,
  ShoppingBag,
  Users,
  Users2,
  ScrollText,
  Truck,
  Tag,
  Sparkles,
  Brain,
  Search,
  Plus,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Printer,
  ChevronRight,
  TrendingUp,
  CreditCard,
  Check,
  X,
  ShieldCheck,
  Lock,
  RotateCcw,
  Save,
  UserPlus,
  Power,
  Pencil,
  Trash2,
  FolderTree,
  Layers,
  Palette,
  BarChart3,
  PieChart,
  Download,
  Wallet,
  TrendingDown,
  Boxes as BoxesIcon,
  MonitorCheck,
  Receipt,
  Coins,
  Banknote,
  Video,
  PanelTop,
  PanelBottom,
  Database,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingCart,
  Headset,
  MessageSquareQuote,
} from "lucide-react";
import { parseVideoUrl, VIDEO_HINT, VIDEO_UNKNOWN_HINT, videoWatchUrl } from "@/lib/video";
import { PhotoManager } from "@/components/admin/PhotoManager";
import { AuthorizedProductLinkImport } from "@/components/admin/ProductLinkImport";
import { EditProductVariants } from "@/components/admin/EditProductVariants";
import { NewProductVariants, type VariantDraft } from "@/components/admin/NewProductVariants";
import { validateNewProductVariants } from "@/lib/new-product-variants";
import { variantStockTotal, variantStockTarget } from "@/lib/variant-stock-total";
import { variantLabel } from "@/lib/variant-label";
import { ProductTechnicalFields } from "@/components/admin/ProductTechnicalFields";
import { parseProductSpecifications, type ProductSpecifications } from "@/lib/product-specifications";
import type { ImportedProduct } from "@/lib/product-import/extract";
import { YouTubePlayer } from "@/components/storefront/YouTubePlayer";
import { SiteManagement } from "@/components/admin/SiteManagement";
import { PaymentApiSettings } from "@/components/admin/PaymentApiSettings";
import { ContentManagement } from "@/components/admin/ContentManagement";

import { authFetch, downloadAuthenticated } from "@/lib/client-auth";
import { formatRegistrationDate } from "@/lib/registration-date";
import { SupportDesk } from "@/components/admin/SupportDesk";
import { ProductFeedback } from "@/components/admin/ProductFeedback";
import { CustomerCRM } from "@/components/admin/CustomerCRM";
import { ZReportsPanel } from "@/components/admin/ZReportsPanel";
import {
  ADMIN_MODULES,
  ADMIN_MODULE_GROUPS,
  MATRIX_ROLES,
  normalizeRoleMatrix,
  type RoleMatrix,
} from "@/lib/admin-modules";
interface AdminDashboardClientProps {
  currentRole?: string;
  currentUserName?: string;
  currentRoleLabel?: string;
  products: any[];
  categories: any[];
  brands: any[];
  warehouses: any[];
  initialSalesWarehouseId?: number | null;
  inventory: any[];
  ledger: any[];
  orders: any[];
  suppliers: any[];
  purchaseOrders: any[];
  coupons: any[];
  shifts: any[];
  dashboardStats?: {
    totalRevenue: number;
    totalOrders: number;
    salesCount: number;
    posCount: number;
    onlineCount: number;
    channelRevenue: { pos: number; online: number };
    avgBasket: number;
    grossProfit: number;
    monthRevenue: number;
    lastMonthRevenue: number;
    monthGrowth: number | null;
    pendingOrdersCount: number;
    returnedOrdersCount: number;
    customersCount: number;
  };
}

// Distinguish unlabelled variants without colliding with an actual color name.
const variantColorKey = (color: unknown) => typeof color === "string" && color.trim() ? `color:${color.trim().toLocaleLowerCase("tr-TR")}` : "unlabelled";

export function AdminDashboardClient({
  currentRole = "SUPER_ADMIN",
  currentUserName = "Yönetici",
  currentRoleLabel = "Süper Admin",
  products: initialProducts,
  categories,
  brands,
  warehouses,
  initialSalesWarehouseId = null,
  inventory: initialInventory,
  ledger: initialLedger,
  orders: initialOrders,
  suppliers: initialSuppliers,
  purchaseOrders: initialPOs,
  coupons: initialCoupons,
  shifts,
  dashboardStats,
}: AdminDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<
    | "dashboard"
    | "catalog"
    | "wms"
    | "barcode"
    | "pos"
    | "orders"
    | "crm"
    | "purchasing"
    | "coupons"
    | "ai"
    | "intelligence"
    | "support"
    | "productFeedback"
    | "users"
    | "registeredCustomers"
    | "roleMatrix"
    | "audit"
    | "reports"
    | "siteHeader"
    | "siteFooter"
    | "siteCart"
    | "paymentApi"
    | "database"
    | "content"
  >("dashboard");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("admin-sidebar-collapsed") === "1") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* localStorage erişilemiyorsa sorun değil */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("admin-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* yoksay */
    }
  }, [sidebarCollapsed]);

  /* --- FAZ 7: POS & Kasa Yönetimi (Admin) --- */
  const [shiftsList, setShiftsList] = useState(shifts);
  const [posSubTab, setPosSubTab] = useState<"shifts" | "zreports" | "transactions" | "stats">("shifts");
  const [posTransList, setPosTransList] = useState<any[]>([]);
  const [selectedShiftForModal, setSelectedShiftForModal] = useState<any | null>(null);

  const loadPosShifts = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/pos/shift", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setShiftsList(data.history || []);
        if (data.shiftTransactions) setPosTransList(data.shiftTransactions);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    if (activeTab === "pos") void loadPosShifts();
  }, [activeTab, loadPosShifts]);

  // Dynamic state
  const [products, setProducts] = useState(initialProducts);
  const [brandsList, setBrandsList] = useState(brands);
  const [categoriesList, setCategoriesList] = useState(categories);
  const [warehousesList, setWarehousesList] = useState(warehouses);
  const [salesWarehouseId, setSalesWarehouseId] = useState<number | null>(initialSalesWarehouseId);
  const [salesWarehouseChoice, setSalesWarehouseChoice] = useState(String(initialSalesWarehouseId || ""));
  const [salesWarehouseBusy, setSalesWarehouseBusy] = useState(false);
  const defaultWarehouseId = String(salesWarehouseId || (warehousesList.filter((w) => w.isActive !== false).sort((a, b) => Number(b.type === "CENTRAL") - Number(a.type === "CENTRAL") || a.id - b.id)[0])?.id || "");
  const secondWarehouseId = String(warehousesList.find((w) => w.isActive !== false && String(w.id) !== defaultWarehouseId)?.id || defaultWarehouseId);
  const [catalogSubTab, setCatalogSubTab] = useState<"products" | "categories" | "brands" | "variants">("products");
  const [catalogBrandFilter, setCatalogBrandFilter] = useState("ALL");
  const [catalogCatFilter, setCatalogCatFilter] = useState("ALL");
  const [variantFilters, setVariantFilters] = useState({category:"",brand:"",product:"",color:"",warehouse:""});
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [variantEditDirty, setVariantEditDirty] = useState(false);
  const [tableVariantEditor, setTableVariantEditor] = useState<{productId:number;variantId:number;name:string}|null>(null);
  const [deletingVariantId, setDeletingVariantId] = useState<number|null>(null);
  const deletingVariantLock = React.useRef(false);
  const [variantEditBusy, setVariantEditBusy] = useState(false);
  const [variantProductId, setVariantProductId] = useState<string>("");
  const [newVariant, setNewVariant] = useState({
    colorName: "",
    colorHex: "#111827",
    size: "",
    length: "",
    retailPrice: "",
    buyPrice: "",
    sku: "",
    barcode: "",
    initialStock: "20",
  });
  const [newCategory, setNewCategory] = useState({ name: "", parentId: "", description: "" });
  const [newBrandAdmin, setNewBrandAdmin] = useState("");
  const [newBrandCategories, setNewBrandCategories] = useState<number[]>([]);
  const [editingBrandCategories, setEditingBrandCategories] = useState<number[]>([]);
  const [editingBrandId, setEditingBrandId] = useState<number | null>(null);
  const [editingBrandName, setEditingBrandName] = useState("");
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const deletingProductLock = React.useRef(false);
  const [catalogFeedback, setCatalogFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [inventoryList, setInventoryList] = useState(initialInventory);
  const variantProducts = React.useMemo(() => products.filter(p => (p.variants || []).length > 0), [products]);
  const variantColors = React.useMemo(() => {
    const colors = new Map<string,string>();
    for (const p of variantProducts) for (const v of p.variants || []) {
      const key=variantColorKey(v.colorName);
      if(!colors.has(key)) colors.set(key, typeof v.colorName === "string" && v.colorName.trim() ? v.colorName.trim() : "Renk belirtilmemiş");
    }
    return [...colors].sort((a,b)=>a[1].localeCompare(b[1],"tr"));
  }, [variantProducts]);
  const variantTableRows = React.useMemo(() => {
    const stocksByVariant = new Map<number, typeof inventoryList>();
    for (const stock of inventoryList) if (stock.variantId != null) {
      const rows=stocksByVariant.get(stock.variantId) || [];rows.push(stock);stocksByVariant.set(stock.variantId,rows);
    }
    return variantProducts.flatMap(p => {
      if (variantFilters.category && String(p.categoryId)!==variantFilters.category) return [];
      if (variantFilters.brand && (variantFilters.brand==="unassigned" ? p.brandId!=null : String(p.brandId)!==variantFilters.brand)) return [];
      if (variantFilters.product && String(p.id)!==variantFilters.product) return [];
      return (p.variants || []).flatMap((v:any) => {
        if (variantFilters.color && variantColorKey(v.colorName)!==variantFilters.color) return [];
        const stocks=(stocksByVariant.get(v.id)||[]).slice().sort((a,b)=>a.warehouseId-b.warehouseId||a.id-b.id);
        const visible = !variantFilters.warehouse ? (stocks.length?stocks:[null]) : variantFilters.warehouse==="unassigned" ? (stocks.length?[]:[null]) : stocks.filter(s=>String(s.warehouseId)===variantFilters.warehouse);
        return visible.map(stock=>({p,v,stock}));
      });
    });
  }, [variantProducts,inventoryList,variantFilters]);
  const [ledger, setLedger] = useState(initialLedger);
  const [orders, setOrders] = useState(initialOrders);
  const [purchaseOrders, setPurchaseOrders] = useState(initialPOs);
  const [coupons, setCoupons] = useState(initialCoupons);

  // Search & Filter
  const [catalogSearch, setCatalogSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [selectedWhFilter, setSelectedWhFilter] = useState<string>("ALL");

  /* --- FAZ 3: Envanter (WMS alt sekmeleri) --- */
  const [wmsSubTab, setWmsSubTab] = useState<"balances" | "warehouses" | "transfers" | "counts" | "locations" | "reservations">("balances");
  const [transfers, setTransfers] = useState<any[]>([]);
  const [countSessions, setCountSessions] = useState<any[]>([]);
  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [reservationsList, setReservationsList] = useState<any[]>([]);
  const [wmsBusy, setWmsBusy] = useState(false);
  const [wmsFeedback, setWmsFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [activeCountSession, setActiveCountSession] = useState<any | null>(null);
  const [countBarcodeInput, setCountBarcodeInput] = useState("");
  const [countQtyInput, setCountQtyInput] = useState("1");
  const [countedItems, setCountedItems] = useState<any[]>([]);
  const [newTransfer, setNewTransfer] = useState({ fromWarehouseId: defaultWarehouseId, toWarehouseId: secondWarehouseId, productId: "", qty: "10", note: "" });
  const [newLocation, setNewLocation] = useState({ warehouseId: defaultWarehouseId, zone: "A", aisle: "01", rack: "01", shelf: "01" });
  const [newWarehouseForm, setNewWarehouseForm] = useState({ name: "", type: "CENTRAL", address: "" });
  const [addingWarehouseForm, setAddingWarehouseForm] = useState(false);

  /* --- FAZ 4: Sipariş yaşam döngüsü + İade --- */
  const [ordersSubTab, setOrdersSubTab] = useState<"orders" | "returns">("orders");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [reconciliation, setReconciliation] = useState<any|null>(null);
  const [reconciliationError, setReconciliationError] = useState("");
  const loadReconciliation = async (page=1) => {
    try {const res=await authFetch(`/api/orders/reconciliation?page=${page}`,{cache:"no-store"});const data=await res.json();if(data.success){setReconciliation(data.data);setReconciliationError("");}else setReconciliationError(data.error||"Liste yüklenemedi.");}
    catch {setReconciliationError("Mutabakat listesi yüklenemedi.");}
  };
  const [orderFeedback, setOrderFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [returnModalOrder, setReturnModalOrder] = useState<any | null>(null);
  const [returnSelections, setReturnSelections] = useState<Record<number, number>>({});
  const [deletionPreview, setDeletionPreview] = useState<{kind:"order"|"return";id:number;number:string;orderNumber:string;returnCount:number;fingerprint:string;rights:{loyalty:{customerId:number;current:number;delta:number;after:number}|null;discounts:{kind:string;id:number;name:string;current:number;after:number}[];legacyReviewRequired:boolean};stocks:{warehouseId:number;warehouseName:string;productId:number;productName:string;variantId:number|null;variantName:string|null;physical:number;reserved:number;delta:number;after:number}[]} | null>(null);
  const [deletionPhysical, setDeletionPhysical] = useState(false);
  const [deletionCascade, setDeletionCascade] = useState(false);
  const [deletionRights, setDeletionRights] = useState(false);
  const [deletionLegacy, setDeletionLegacy] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const deletionLock = React.useRef(false);


  /* --- FAZ 5: Raporlama Motoru --- */
  const [reportData, setReportData] = useState<any | null>(null);
  const [reportDays, setReportDays] = useState(30);
  const [reportSubTab, setReportSubTab] = useState<"sales" | "products" | "stock" | "customers" | "finance" | "zreports">("sales");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const reportRequestSequence = React.useRef(0);

  const downloadReportCsv = async () => {
    if (csvBusy) return;
    setCsvBusy(true);
    setCsvError(null);
    const result = await downloadAuthenticated(
      `/api/reports?days=${reportDays}&format=csv&export=${reportSubTab}`,
      `rapor-${reportSubTab}-${reportDays}gun.csv`
    );
    if (!result.ok) setCsvError(result.message);
    setCsvBusy(false);
  };

  /* --- FAZ 6: Satın Alma (sipariş→mal kabul + öneriler) --- */
  const [suppliersList, setSuppliersList] = useState(initialSuppliers.filter((s: any) => s.isActive !== false).map((s: any) => ({ ...s, rating: null })));
  const [purchasingSubTab, setPurchasingSubTab] = useState<"suggest" | "orders" | "receipts" | "suppliers">("suggest");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const [receiptsList, setReceiptsList] = useState<any[]>([]);
  const [purchasingBusy, setPurchasingBusy] = useState(false);
  const [purchasingFeedback, setPurchasingFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", contactPerson: "", phone: "", email: "", leadTimeDays: "5", paymentTerms: "" });
  const [isCreatePOOpen, setIsCreatePOOpen] = useState(false);
  const [poWizard, setPoWizard] = useState({ supplierId: "", warehouseId: defaultWarehouseId, expectedDate: "", lines: [{ productId: "", quantity: "50", unitCost: "" }] as any[] });
  const [receiveModalPO, setReceiveModalPO] = useState<any | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<number, number>>({});
  const [supplierReturnReceipt, setSupplierReturnReceipt] = useState<any | null>(null);
  const [supplierReturnLines, setSupplierReturnLines] = useState<Record<number, number>>({});
  const [supplierReturnReason, setSupplierReturnReason] = useState("");
  const [pendingPurchasing, setPendingPurchasing] = useState<Record<string, any> | null>(null);
  const [purchasingSubmitting, setPurchasingSubmitting] = useState(false);
  const purchasingSubmitLock = React.useRef(false);
  React.useEffect(() => {
    try { const saved = localStorage.getItem("serpilen.purchasing.pending.v1"); if (saved) setPendingPurchasing(JSON.parse(saved)); } catch { /* storage unavailable */ }
  }, []);

  const loadPurchasing = React.useCallback(async () => {
    setPurchasingBusy(true);
    try {
      const res = await authFetch("/api/suppliers", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setSuppliersList(data.suppliers);
        setPurchaseOrders(data.purchaseOrders);
        setReceiptsList(data.receipts || []);
        setSuggestions(data.suggestions || []);
        setSuggestionCount(data.suggestionCount || 0);
      }
    } finally {
      setPurchasingBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === "purchasing") void loadPurchasing();
  }, [activeTab, loadPurchasing]);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch("/api/suppliers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CREATE_SUPPLIER", ...newSupplier }),
    });
    const data = await res.json();
    if (data.success) {
      setSuppliersList((prev: any[]) => [{ ...data.data, rating: null }, ...prev]);
      setIsAddSupplierOpen(false);
      setNewSupplier({ name: "", contactPerson: "", phone: "", email: "", leadTimeDays: "5", paymentTerms: "" });
      setPurchasingFeedback({ text: "Tedarikçi eklendi.", isError: false });
    } else {
      setPurchasingFeedback({ text: data.error || "Tedarikçi eklenemedi.", isError: true });
    }
  };

  const deleteSupplier = async (supplier: any) => {
    if (!window.confirm(`${supplier.name} kaldırılsın mı? Geçmişi varsa silinmez, arşivlenir.`)) return;
    setPurchasingBusy(true);
    try {
      const res = await authFetch(`/api/suppliers?id=${encodeURIComponent(supplier.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Tedarikçi kaldırılamadı.");
      setPurchasingFeedback({ text: data.mode === "archived" ? "Tedarikçi arşivlendi; geçmişi korundu." : "Tedarikçi silindi.", isError: false });
      await loadPurchasing();
    } catch (error) {
      setPurchasingFeedback({text: error instanceof Error ? error.message : "Tedarikçi kaldırılamadı.", isError:true});
    } finally { setPurchasingBusy(false); }
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch("/api/suppliers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_PO",
        supplierId: Number(poWizard.supplierId),
        warehouseId: Number(poWizard.warehouseId),
        expectedDate: poWizard.expectedDate || null,
        items: poWizard.lines.filter((l) => l.productId).map((l) => ({ productId: Number(l.productId), quantity: Number(l.quantity), unitCost: l.unitCost || products.find((p: any) => p.id === Number(l.productId))?.buyPrice || "0" })),
      }),
    });
    const data = await res.json();
    if (data.success) {
      setIsCreatePOOpen(false);
      setPoWizard({ supplierId: "", warehouseId: defaultWarehouseId, expectedDate: "", lines: [{ productId: "", quantity: "50", unitCost: "" }] });
      setPurchasingFeedback({ text: `Sipariş oluşturuldu: ${data.data.poNumber}`, isError: false });
      void loadPurchasing();
    } else {
      setPurchasingFeedback({ text: data.error || "Sipariş oluşturulamadı.", isError: true });
    }
  };

  const openReceiveModal = (po: any) => {
    setReceiveModalPO(po);
    const init: Record<number, number> = {};
    (po.items || []).forEach((it: any) => { init[it.id] = Math.max(0, it.quantity - (it.receivedQty || 0)); });
    setReceiveLines(init);
  };

  // Preserve the exact command after a lost response or reload.
  const sendPurchasingCommand = async (command: Record<string, any>) => {
    if (purchasingSubmitLock.current) return;
    purchasingSubmitLock.current = true;
    setPurchasingSubmitting(true);
    try {
      const response = await authFetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "İşlem sonucu doğrulanamadı.");
      }
      localStorage.removeItem("serpilen.purchasing.pending.v1"); setPendingPurchasing(null);
      setReceiveModalPO(null); setSupplierReturnReceipt(null);
      setPurchasingFeedback({text: command.action === "RECEIVE_GOODS" ? `Mal kabul kaydedildi: ${data.data.receipt.receiptNumber}` : `Tedarikçiye iade kaydedildi: #${data.data.id}`, isError:false});
      await loadPurchasing();
    } catch (error) {
      setPurchasingFeedback({text: `${error instanceof Error ? error.message : "Bağlantı hatası."} Sonuç belirsizse aynı işlemi tekrar sorgulayın.`,isError:true});
    } finally { purchasingSubmitLock.current = false; setPurchasingSubmitting(false); }
  };
  const closePendingPurchasing = async () => {
    if (!pendingPurchasing || purchasingSubmitLock.current || !confirm("İşlemin sonucunu kontrol edip uygulanmadıysa gecikmiş isteği kalıcı olarak durdurmak istiyor musunuz?")) return;
    purchasingSubmitLock.current = true; setPurchasingSubmitting(true);
    try {
      const response = await authFetch("/api/suppliers", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"FENCE_PURCHASING",requestKey:pendingPurchasing.requestKey})});
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "İşlem sonucu doğrulanamadı.");
      localStorage.removeItem("serpilen.purchasing.pending.v1"); setPendingPurchasing(null);
      setReceiveModalPO(null); setSupplierReturnReceipt(null);
      setPurchasingFeedback({text:data.data.status === "completed" ? `İşlem daha önce tamamlanmış: ${data.data.kind === "return" ? "iade" : "mal kabul"} #${data.data.id}.` : "İşlem uygulanmamış; gecikmiş istek güvenli biçimde durduruldu.",isError:false});
      await loadPurchasing();
    } catch(error) {setPurchasingFeedback({text:error instanceof Error ? error.message : "Sonuç doğrulanamadı.",isError:true});}
    finally {purchasingSubmitLock.current = false;setPurchasingSubmitting(false);}
  };
  const startPurchasingCommand = async (command: Record<string, any>) => {
    if (pendingPurchasing || purchasingSubmitting || purchasingSubmitLock.current) return;
    try {
      const previous=localStorage.getItem("serpilen.purchasing.pending.v1");
      if (previous) {setPendingPurchasing(JSON.parse(previous)); setPurchasingFeedback({text:"Önceki işlemi sonuçlandırın.",isError:true});return;}
      localStorage.setItem("serpilen.purchasing.pending.v1",JSON.stringify(command));
    }
    catch { setPurchasingFeedback({text:"İşlem güvenli tekrar için saklanamadı; işlem yapılmadı.",isError:true}); return; }
    setPendingPurchasing(command);
    await sendPurchasingCommand(command);
  };
  const submitReceive = async () => {
    if (!receiveModalPO) return;
    const lines=Object.entries(receiveLines).map(([id,qty])=>({purchaseOrderItemId:Number(id),qty:Number(qty)})).filter(l=>l.qty>0);
    if (!lines.length || lines.some(l=>!Number.isSafeInteger(l.qty))) {setPurchasingFeedback({text:"Geçerli kabul miktarı girin.",isError:true});return;}
    if (!confirm("Seçilen miktarlar stoğa eklensin mi?")) return;
    await startPurchasingCommand({action:"RECEIVE_GOODS",purchaseOrderId:receiveModalPO.id,lines,requestKey:crypto.randomUUID()});
  };
  const openSupplierReturn = (receipt: any) => {
    setSupplierReturnReceipt(receipt); setSupplierReturnLines({}); setSupplierReturnReason("");
  };
  const submitSupplierReturn = async () => {
    if (!supplierReturnReceipt) return;
    const lines=Object.entries(supplierReturnLines).map(([id,qty])=>({receiptItemId:Number(id),qty:Number(qty)})).filter(l=>l.qty>0);
    if (!lines.length || lines.some(l=>!Number.isSafeInteger(l.qty)) || !supplierReturnReason.trim()) {setPurchasingFeedback({text:"İade nedeni ve geçerli miktar girin.",isError:true});return;}
    if (!confirm("Ürünler tedarikçiye iade olarak kaydedilip bu depodaki kullanılabilir stoktan düşülsün mü?")) return;
    await startPurchasingCommand({action:"RETURN_TO_SUPPLIER",receiptId:supplierReturnReceipt.id,lines,reason:supplierReturnReason.trim(),requestKey:crypto.randomUUID()});
  };

  const loadReport = React.useCallback(async (days: number) => {
    const sequence = ++reportRequestSequence.current;
    setReportBusy(true);
    setReportData(null);
    setReportError("");
    try {
      const res = await authFetch(`/api/reports?days=${days}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Rapor yüklenemedi. Yetkinizi ve bağlantınızı kontrol edin.");
      if (sequence === reportRequestSequence.current) setReportData(data);
    } catch {
      if (sequence === reportRequestSequence.current) setReportError("Rapor yüklenemedi. Yetkinizi ve bağlantınızı kontrol edin.");
    } finally {
      if (sequence === reportRequestSequence.current) setReportBusy(false);
    }
  }, []);

  const ORDER_STATUS_LABELS: Record<string, string> = {
    BACKORDER: "Stok Bekliyor", PENDING: "Ödeme Bekliyor", PAID: "Ödendi", PREPARING: "Hazırlanıyor",
    READY_FOR_SHIPMENT: "Sevke Hazır", SHIPPED: "Kargoda", DELIVERED: "Teslim Edildi",
    CANCELLED: "İptal", RETURN_REQUESTED: "İade Talebi", RETURNED: "İade Alındı", REFUNDED: "İade Ödendi",
  };
  const ORDER_NEXT: Record<string, string[]> = {
    BACKORDER: ["CANCELLED"], PENDING: ["PAID", "CANCELLED"], PAID: ["PREPARING", "CANCELLED"], PREPARING: ["READY_FOR_SHIPMENT", "CANCELLED"],
    READY_FOR_SHIPMENT: ["SHIPPED", "CANCELLED"], SHIPPED: ["DELIVERED"], DELIVERED: [], RETURN_REQUESTED: [], RETURNED: [], CANCELLED: [], REFUNDED: [],
  };

  const refreshOrders = async () => {
    try {
      const res = await authFetch("/api/orders", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) setOrders(data.data);
      else { setOrders([]); setOrderFeedback({ text: data.error || "Siparişler yüklenemedi.", isError: true }); }
    } catch { setOrderFeedback({ text: "Siparişler yüklenemedi: sunucuya ulaşılamadı.", isError: true }); }
  };

  const loadReturns = React.useCallback(async () => {
    const res = await authFetch("/api/returns", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setReturnsList(data.data);
  }, []);

  React.useEffect(() => {
    if (activeTab === "orders" && ordersSubTab === "returns") void loadReturns();
  }, [activeTab, ordersSubTab, loadReturns]);

  const openDeletion = async (kind:"order"|"return",id:number) => {
    if(deletionLock.current)return;deletionLock.current=true;setDeletionBusy(true);setOrderFeedback(null);
    try {
      const res=await authFetch(`/api/order-deletion?kind=${kind}&id=${id}`,{cache:"no-store"});const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.success){setOrderFeedback({text:typeof data.error==="string"?data.error:"Silme önizlemesi alınamadı.",isError:true});return;}
      setDeletionPhysical(false);setDeletionCascade(false);setDeletionRights(false);setDeletionLegacy(false);setDeletionPreview(data.data);
    } catch {setOrderFeedback({text:"Silme önizlemesi alınamadı; sunucuya ulaşılamadı.",isError:true});}
    finally {deletionLock.current=false;setDeletionBusy(false);}
  };
  const executeDeletion = async () => {
    const p=deletionPreview;if(!p||deletionLock.current||!deletionPhysical||(p.returnCount>0&&!deletionCascade)||((p.rights.loyalty?.delta||p.rights.discounts.length)&&!deletionRights)||(p.rights.legacyReviewRequired&&!deletionLegacy))return;
    deletionLock.current=true;setDeletionBusy(true);
    try {
      const res=await authFetch("/api/order-deletion",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:p.kind,id:p.id,fingerprint:p.fingerprint,physicalConfirmed:deletionPhysical,cascadeConfirmed:deletionCascade,rightsConfirmed:deletionRights,legacyConfirmed:deletionLegacy})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.success){setDeletionPreview(null);setOrderFeedback({text:typeof data.error==="string"?data.error:"Silme işlemi tamamlanamadı.",isError:true});return;}
      setDeletionPreview(null);await refreshOrders();await loadReturns();void loadInventory();
      setOrderFeedback({text:`${p.number} kalıcı olarak silindi.${data.data.promoted?` Stok sırasındaki ${data.data.promoted} siparişe stok ayrıldı.`:""}`,isError:false});
    } catch {setDeletionPreview(null);setOrderFeedback({text:"Sunucuya ulaşılamadı; işlemin sonucunu doğrulamak için listeleri yenileyin.",isError:true});}
    finally {deletionLock.current=false;setDeletionBusy(false);}
  };

  const advanceOrder = async (id: number, status: string) => {
    const ord = orders.find(o => o.id === id);
    if (ord?.status === "PENDING" && status === "PAID" && !window.confirm(`Banka hesabında ${ord.orderNumber} için ${Number(ord.grandTotal).toFixed(2)} TL ödemenin alındığını kontrol ettiniz mi?`)) return;
    if (["PENDING", "BACKORDER"].includes(ord?.status || "") && status === "CANCELLED" && !window.confirm(`${ord.orderNumber} siparişi iptal edilecek ve ayrılan stok serbest bırakılacak. Onaylıyor musunuz?`)) return;
    const res = await authFetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, changedBy: "Sipariş Yönetimi" }),
    });
    const data = await res.json();
    if (data.success) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...data.data } : o)));
      setOrderFeedback({ text: `Sipariş durumu güncellendi: ${ORDER_STATUS_LABELS[status] || status}`, isError: false });
    } else {
      setOrderFeedback({ text: data.error || "Durum güncellenemedi.", isError: true });
    }
  };

  // --- Sevke Hazır aşaması: kargo firması + takip no taslakları ---
  const CARGO_CARRIERS = [
    "Yurtiçi Kargo",
    "Aras Kargo",
    "MNG Kargo",
    "PTT Kargo",
    "Sürat Kargo",
    "Trendyol Express",
    "Hepsijet",
    "Kolay Gelsin",
    "UPS",
    "DHL",
  ];
  const [cargoDrafts, setCargoDrafts] = useState<Record<number, { carrier: string; trackingNumber: string }>>({});
  const cargoDraftFor = (ord: any) =>
    cargoDrafts[ord.id] ?? { carrier: ord.carrier || "Yurtiçi Kargo", trackingNumber: ord.trackingNumber || "" };
  const setCargoDraft = (ord: any, patch: Partial<{ carrier: string; trackingNumber: string }>) =>
    setCargoDrafts((prev) => {
      const base = prev[ord.id] ?? { carrier: ord.carrier || "Yurtiçi Kargo", trackingNumber: ord.trackingNumber || "" };
      return { ...prev, [ord.id]: { ...base, ...patch } };
    });

  const saveCargoInfo = async (ord: any, markShipped: boolean) => {
    const draft = cargoDraftFor(ord);
    const payload: Record<string, unknown> = {
      id: ord.id,
      carrier: draft.carrier,
      trackingNumber: draft.trackingNumber.trim() || undefined,
      changedBy: "Sipariş Yönetimi",
    };
    if (markShipped) payload.status = "SHIPPED";
    const res = await authFetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      setOrders((prev) => prev.map((o) => (o.id === ord.id ? { ...o, ...data.data } : o)));
      setCargoDrafts((prev) => {
        const next = { ...prev };
        delete next[ord.id];
        return next;
      });
      setOrderFeedback({
        text: markShipped
          ? `${ord.orderNumber} kargoya verildi — ${data.data?.carrier || draft.carrier}${data.data?.trackingNumber ? ` · Takip: ${data.data.trackingNumber}` : ""}`
          : `${ord.orderNumber} kargo bilgileri kaydedildi.`,
        isError: false,
      });
    } else {
      setOrderFeedback({ text: data.error || "Kargo bilgileri kaydedilemedi.", isError: true });
    }
  };

  const openReturnModal = (order: any) => {
    setReturnModalOrder(order);
    const initial: Record<number, number> = {};
    (order.items || []).forEach((it: any) => { initial[it.id] = 0; });
    setReturnSelections(initial);
  };

  const submitReturn = async () => {
    if (!returnModalOrder) return;
    const items = Object.entries(returnSelections)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId: Number(orderItemId), quantity: Number(quantity) }));
    if (items.length === 0) {
      setOrderFeedback({ text: "İade edilecek kalem/adet seçin.", isError: true });
      return;
    }
    const res = await authFetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CREATE", orderId: returnModalOrder.id, items, reason: "Müşteri iadesi" }),
    });
    const data = await res.json();
    if (data.success) {
      setOrderFeedback({ text: `İade talebi oluşturuldu: ${data.data.returnNumber}`, isError: false });
      setReturnModalOrder(null);
      await refreshOrders();
      void loadReturns();
    } else {
      setOrderFeedback({ text: data.error?.message || "İade oluşturulamadı.", isError: true });
    }
  };

  const returnAction = async (returnId: number, action: string) => {
    const ret = returnsList.find(r => r.id === returnId);
    if (action === "REFUND" && !window.confirm(`${Number(ret?.refundAmount || 0).toFixed(2)} TL tutarındaki para iadesini banka veya POS üzerinden gerçekten yaptınız mı? Bu düğme para transferi yapmaz.`)) return;
    const res = await authFetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, returnId, confirmRefund: action === "REFUND" }),
    });
    const data = await res.json();
    if (data.success) {
      void loadReturns();
      await refreshOrders();
      void loadInventory();
      setOrderFeedback({ text: "İade işlemi güncellendi.", isError: false });
    } else {
      setOrderFeedback({ text: data.error?.message || "İşlem başarısız.", isError: true });
    }
  };

  // Modals
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isAddCouponOpen, setIsAddCouponOpen] = useState(false);

  // Form states
  const emptyNewProduct = () => ({
    name: "",
    sku: "",
    barcode: "",
    categoryId: "1",
    brandId: "1",
    unit: "Adet",
    buyPrice: "30.00",
    retailPrice: "55.00",
    initialStock: "50",
    warehouseId: defaultWarehouseId,
    shortDescription: "",
    description: "",
    technicalDetails: {} as ProductSpecifications,
    photos: [] as string[],
    videoUrl: "",
  });
  const [newProd, setNewProd] = useState(emptyNewProduct);
  const [productVariantsDraft, setProductVariantsDraft] = useState<VariantDraft[]>([]);
  const variantsDraftRef = React.useRef<VariantDraft[]>([]);
  const [stockTarget, setStockTarget] = useState<string | null>(null);
  const stockTargetRef = React.useRef<string | null>(null);
  const [stockNotice, setStockNotice] = useState("");
  const productNameRef = React.useRef("");
  React.useEffect(() => { productNameRef.current = newProd.name; }, [newProd.name]);
  const setVariantTarget = (value: string | null) => {
    stockTargetRef.current = value;
    setStockTarget(value);
    if (value === null) setProductSaveError(previous => previous.startsWith("Toplam başlangıç stoğu hedefi") ? "" : previous);
  };
  const updateVariantsDraft = (draft: VariantDraft[], options?: { preserveBaseStock?: boolean }) => {
    const hadVariants = variantsDraftRef.current.length > 0;
    variantsDraftRef.current = draft;
    setProductVariantsDraft(draft);
    const sum = variantStockTotal(draft);
    const target = stockTargetRef.current === null ? null : variantStockTarget(stockTargetRef.current);
    if (!draft.length) {
      setVariantTarget(null);
      if (hadVariants && !options?.preserveBaseStock) {
        setNewProd(prev => ({ ...prev, initialStock: "0" }));
        setStockNotice("Son varyant kaldırıldı; tek ürün başlangıç stoğu 0 olarak ayarlandı.");
      }
    } else {
      setStockNotice("");
      if (target !== null && sum !== null && target === sum) {
        setProductSaveError(previous => previous.startsWith("Toplam başlangıç stoğu hedefi") ? "" : previous);
      }
    }
  };
  const variantStockSum = variantStockTotal(productVariantsDraft);
  const updateStockTarget = (value: string) => {
    setVariantTarget(value);
    const target = variantStockTarget(value);
    if (target !== null && target === variantStockSum) {
      setProductSaveError(previous => previous.startsWith("Toplam başlangıç stoğu hedefi") ? "" : previous);
    }
  };
  const [productSaving, setProductSaving] = useState(false);
  const [productImportBusy, setProductImportBusy] = useState(false);
  const [productSaveError, setProductSaveError] = useState("");
  const productSavingRef = React.useRef(false);

  const productSelectionTouched = React.useRef({ brand: false, category: false });

  const applyImportedProduct = (product: ImportedProduct) => {
    const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");
    const brandMatches = product.brand ? brandsList.filter((item) => normalize(String(item.name)) === normalize(product.brand)) : [];
    const categoryMatches = product.category ? categoriesList.filter((item) => normalize(String(item.name)) === normalize(product.category)) : [];
    const useBrand = !productSelectionTouched.current.brand && brandMatches.length === 1;
    const useCategory = !productSelectionTouched.current.category && categoryMatches.length === 1;
    const warnings: string[] = [];
    if (!useBrand) warnings.push("Markayı kontrol edip seçin; kaynak marka eşleşmedi veya mevcut seçim korundu.");
    if (!useCategory) warnings.push("Kategoriyi kontrol edip seçin; kaynak kategori eşleşmedi veya mevcut seçim korundu.");
    if (product.variants?.length) {
      const existingName = normalize(productNameRef.current), sourceName = normalize(product.name);
      if (existingName && existingName !== sourceName) warnings.push("Formdaki ürün adı kaynak ürünle farklı; varyantlar karışmaması için eklenmedi.");
      else if (variantsDraftRef.current.length) warnings.push("Mevcut varyantlar korunuyor; kaynak varyantlar otomatik eklenmedi.");
      else {
        updateVariantsDraft(product.variants.map(v => ({ colorName: v.colorName, colorHex: "", size: v.size, length: "", sku: "", barcode: "", imageUrl: v.imageUrl, previewImageUrl: v.imageUrl, buyPrice: "", retailPrice: "", initialStock: "0", imported: true })));
        warnings.push(`${product.variants.length} varyant taslağa eklendi; stok, fiyat ve fotoğrafları kontrol edin.`);
      }
    } else warnings.push("Kaynak sayfada doğrulanabilir varyant bulunamadı; gerekirse elle ekleyin.");
    if (useBrand) productSelectionTouched.current.brand = true;
    if (useCategory) productSelectionTouched.current.category = true;
    setNewProd(prev => ({
      ...prev,
      name: prev.name.trim() ? prev.name : product.name,
      description: prev.description.trim() ? prev.description : product.description,
      technicalDetails: {
        ...product.technicalDetails,
        ...Object.fromEntries(Object.entries(prev.technicalDetails).filter(([, value]) => value?.trim())),
      },
      sku: prev.sku.trim() ? prev.sku : product.sku,
      barcode: prev.barcode.trim() ? prev.barcode : product.barcode,
      brandId: useBrand ? String(brandMatches[0].id) : prev.brandId,
      categoryId: useCategory ? String(categoryMatches[0].id) : prev.categoryId,
      photos: [...new Set([...prev.photos, ...product.images])].slice(0, 6),
    }));
    return warnings;
  };

  const [transferData, setTransferData] = useState({
    fromWarehouseId: defaultWarehouseId,
    toWarehouseId: secondWarehouseId,
    productId: products[0]?.id || 1,
    quantity: 10,
    note: "Mağaza Kasa İhtiyacı İçin Sevk",
  });

  const [adjustData, setAdjustData] = useState({
    warehouseId: defaultWarehouseId,
    productId: products[0]?.id || 1,
    quantityDelta: 5,
    reason: "SAYIM",
    note: "Haftalık raf sayım mutabakatı",
  });

  const [newCoupon, setNewCoupon] = useState({
    code: "",
    discountType: "PERCENT",
    discountValue: "15.00",
    minCartAmount: "500.00",
    usageLimit: 100,
  });

  /* --- Rol × Modül görünürlük matrisi --- */
  const [roleMatrix, setRoleMatrix] = useState<RoleMatrix>(() => normalizeRoleMatrix(null));
  const [matrixLoaded, setMatrixLoaded] = useState(false);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [matrixMsg, setMatrixMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isSuper = currentRole === "SUPER_ADMIN";
  const myMatrixRow = (roleMatrix as Record<string, Record<string, boolean>>)[currentRole] || {};
  // Tanınmayan roller için varsayılan erişim verilmez.
  const canSee = (key: string) => key === "dashboard" || isSuper || myMatrixRow?.[key] === true;
  const reportsAllowed = matrixLoaded && canSee("reports");
  const customerReportsAllowed = reportsAllowed && canSee("crm");

  // Yetki sonradan açıldığında SSR'de gönderilmeyen listeyi sekme açılınca yükle.
  React.useEffect(() => {
    if (!matrixLoaded || activeTab !== "orders" || !canSee("orders")) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/orders", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) setOrders(data.data);
        else { setOrders([]); setOrderFeedback({ text: data.error || "Siparişler yüklenemedi.", isError: true }); }
      } catch { if (!cancelled) setOrderFeedback({ text: "Siparişler yüklenemedi: sunucuya ulaşılamadı.", isError: true }); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, matrixLoaded, roleMatrix, currentRole]);

  React.useEffect(() => {
    const sequence = reportRequestSequence;
    if (activeTab === "reports" && reportsAllowed) void loadReport(reportDays);
    else { setReportData(null); setReportBusy(false); setReportError(""); }
    return () => { sequence.current++; };
  }, [activeTab, reportDays, loadReport, reportsAllowed, customerReportsAllowed]);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/role-matrix", { cache: "no-store" });
        const data = await res.json();
        if (data?.success && data?.data?.matrix) {
          setRoleMatrix(normalizeRoleMatrix(data.data.matrix));
        }
      } catch {
        /* matris okunamazsa varsayılanlar kullanılır */
      } finally {
        setMatrixLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMatrixCell = (role: string, moduleKey: string) => {
    if (role === "SUPER_ADMIN" || moduleKey === "dashboard") return; // kilitli hücreler
    setRoleMatrix((prev) => ({
      ...prev,
      [role]: { ...prev[role as keyof RoleMatrix], [moduleKey]: !prev[role as keyof RoleMatrix]?.[moduleKey] },
    }) as RoleMatrix);
    setMatrixDirty(true);
    setMatrixMsg(null);
  };

  const saveMatrix = async (next?: RoleMatrix) => {
    const payload = next ?? roleMatrix;
    setMatrixSaving(true);
    setMatrixMsg(null);
    try {
      const res = await authFetch("/api/role-matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix: payload }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setRoleMatrix(normalizeRoleMatrix(data.data.matrix));
        setMatrixDirty(false);
        setMatrixMsg({ ok: true, text: "Matris kaydedildi; sol menü rolünüz için güncellendi." });
      } else {
        setMatrixMsg({ ok: false, text: data?.error?.message || "Matris kaydedilemedi." });
      }
    } catch {
      setMatrixMsg({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setMatrixSaving(false);
    }
  };

  const resetMatrixToDefaults = async () => {
    const defaults = normalizeRoleMatrix(null);
    setRoleMatrix(defaults);
    setMatrixDirty(true);
    await saveMatrix(defaults);
  };

  const matrixOpenCount = (role: string) =>
    ADMIN_MODULES.filter((m) => m.key === "dashboard" || role === "SUPER_ADMIN" || roleMatrix[role as keyof RoleMatrix]?.[m.key] !== false).length;

  // Rolünüzün göremediği sekmede kalınmasın (menü gizlense de durum güvenli kalsın)
  React.useEffect(() => {
    if (!matrixLoaded) return;
    if (canSee(activeTab)) return;
    const first = ADMIN_MODULES.find((m) => canSee(m.key));
    if (first && first.key !== activeTab) setActiveTab(first.key as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixLoaded, roleMatrix, currentRole]);

  /* --- FAZ 1: Kullanıcılar & Roller + Denetim Kaydı --- */
  const [usersList, setUsersList] = useState<any[]>([]);
  const [usersBusy, setUsersBusy] = useState(false);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [customersBusy, setCustomersBusy] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", phone: "", role: "CASHIER", password: "" });
  const [addingUser, setAddingUser] = useState(false);
  const [userFeedback, setUserFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const loadUsers = React.useCallback(async () => {
    setUsersBusy(true);
    try {
      const res = await authFetch("/api/users?type=staff", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data?.success) setUsersList(data.data);
      else { setUsersList([]); setUserFeedback({ text: data?.error?.message || "Personel listesi yüklenemedi.", isError: true }); }
    } catch {
      setUsersList([]); setUserFeedback({ text: "Personel listesi yüklenemedi.", isError: true });
    } finally {
      setUsersBusy(false);
    }
  }, []);

  const loadCustomers = React.useCallback(async () => {
    setCustomersBusy(true);
    try {
      const res = await authFetch("/api/users?type=customers", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data?.success) setCustomersList(data.data);
      else { setCustomersList([]); setUserFeedback({ text: data?.error?.message || "Müşteri listesi yüklenemedi.", isError: true }); }
    } catch {
      setCustomersList([]); setUserFeedback({ text: "Müşteri listesi yüklenemedi.", isError: true });
    } finally {
      setCustomersBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === "users") void loadUsers();
    if (activeTab === "registeredCustomers") void loadCustomers();
  }, [activeTab, loadUsers, loadCustomers]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingUser) return;
    if (
      newUser.password.length < 8 ||
      !/[A-Za-z]/.test(newUser.password) ||
      !/[0-9]/.test(newUser.password)
    ) {
      setUserFeedback({ text: "Şifre en az 8 karakter, en az bir harf ve bir rakam içermelidir.", isError: true });
      return;
    }
    setAddingUser(true);
    setUserFeedback(null);
    try {
      const res = await authFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!data.success) {
        setUserFeedback({ text: data?.error?.message || "Kullanıcı eklenemedi.", isError: true });
        return;
      }
      setUserFeedback({ text: `${data.data.name} kaydı oluşturuldu.`, isError: false });
      setUsersList((prev) => [data.data, ...prev]);
      setNewUser({ name: "", email: "", phone: "", role: "CASHIER", password: "" });
      setIsAddUserOpen(false);
    } catch {
      setUserFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setAddingUser(false);
    }
  };

  const updateAccount = async (id: number, patch: { role?: string; isActive?: boolean }, customer: boolean) => {
    setUserFeedback(null);
    try {
      const res = await authFetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setUserFeedback({ text: data?.error?.message || (typeof data?.error === "string" ? data.error : "Hesap güncellenemedi."), isError: true });
        return;
      }
      const update = (prev: any[]) => prev.map((u) => u.id === id ? { ...u, ...data.data } : u);
      if (customer) setCustomersList(update); else setUsersList(update);
      setUserFeedback({ text: "Hesap güncellendi.", isError: false });
    } catch {
      setUserFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    }
  };
  const updateUser = (id: number, patch: { role?: string; isActive?: boolean }) => updateAccount(id, patch, false);
  const updateCustomer = (id: number, patch: { isActive?: boolean }) => updateAccount(id, patch, true);

  const deleteUser = async (id: number, name: string, email: string) => {
    if (!window.confirm(`"${name}" (${email}) kullanıcısı silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      const res = await authFetch(`/api/users?id=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setUsersList((prev) => prev.filter((u) => u.id !== id));
        setUserFeedback({ text: `"${name}" kullanıcısı silindi.`, isError: false });
      } else setUserFeedback({ text: data?.error?.message || "Kullanıcı silinemedi.", isError: true });
    } catch { setUserFeedback({ text: "Sunucuya ulaşılamadı.", isError: true }); }
  };

  const refreshProducts = async () => {
    const pRes = await authFetch("/api/products?scope=all-warehouses");
    const pData = await pRes.json();
    if (pData.success) setProducts(pData.data);
  };

  const handleDeleteProduct = async (id: number, name: string) => {
    if (deletingProductLock.current) return;
    deletingProductLock.current = true;
    setDeletingProductId(id); setCatalogFeedback(null);
    try {
      const previewRes = await authFetch(`/api/products/deletion-preview?id=${id}`, { cache: "no-store" });
      const previewData = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok || !previewData.success) { setCatalogFeedback({ text: typeof previewData.error === "string" ? previewData.error : "Ürün silme bilgileri alınamadı.", isError: true }); return; }
      const preview = previewData.data as {name:string; totalStock:number; fingerprint:string; warehouses:{id:number; name:string; quantity:number}[]};
      const clean = (value: string) => value.replace(/[\r\n\t]/g, " ");
      const stockDetails = preview.totalStock > 0
        ? `\n\nTüm depolarda ${preview.totalStock} birim stok kalıcı olarak silinecek:\n${preview.warehouses.filter(w=>w.quantity > 0).map(w=>`• ${clean(w.name)} (ID ${w.id}): ${w.quantity}`).join("\n")}`
        : "\n\nSilinecek fiziksel stok bulunmuyor.";
      if (!window.confirm(`"${clean(preview.name)}" ürününü kalıcı olarak silmek istiyor musunuz? Varyantları ve ürün görsel kayıtları da silinir.${stockDetails}\n\nBu işlem geri alınamaz.`)) return;
      const res = await authFetch("/api/products", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, fingerprint: preview.fingerprint }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setCatalogFeedback({ text: typeof data.error === "string" ? data.error : "Ürün silinemedi.", isError: true }); return; }
      setProducts(prev => prev.filter(p => p.id !== id));
      setInventoryList(prev => prev.filter(row => row.productId !== id));
      setVariantProductId(prev => prev === String(id) ? "" : prev);
      setCatalogFeedback({ text: `"${name}" ürünü silindi.`, isError: false });
    } catch { setCatalogFeedback({ text: "Sunucuya ulaşılamadı; silme sonucu doğrulanamadı. Listeyi yenileyin.", isError: true }); }
    finally { deletingProductLock.current = false; setDeletingProductId(null); }
  };

  const handleDeleteVariant = async (id:number) => {
    if (deletingVariantLock.current) return;
    deletingVariantLock.current=true; setDeletingVariantId(id); setCatalogFeedback(null);
    try {
      const res=await authFetch(`/api/variant-deletion?id=${id}`,{cache:"no-store"});const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.success){setCatalogFeedback({text:data.error||"Varyant silme bilgileri alınamadı.",isError:true});return;}
      const p=data.data as import("@/lib/delete-variant").VariantDeletionPreview;
      const clean=(s:string)=>s.replace(/[\r\n\t]/g," ");
      const stock=p.stocks.length?p.stocks.map(s=>`• ${clean(s.warehouseName || "Bilinmeyen depo")} (ID ${s.warehouseId}): ${s.physicalQty} adet`).join("\n"):"Stok kaydı yok.";
      const base=p.lastVariant?`\n\nBu son varyant: Ürün varyantsız kalacak, ana ürün SKU/barkodu ve fiyatları geçerli olacak (satış ${clean(p.baseRetailPrice)} TL${p.baseCampaignPrice!==null?`, kampanya ${clean(p.baseCampaignPrice)} TL`:"; kampanya fiyatı yok"}). Varyant stoğu ana ürüne aktarılmaz. Mevcut ana ürün stokları:\n${p.baseStocks.length?p.baseStocks.map(s=>`• ${clean(s.warehouseName || "Bilinmeyen depo")} (ID ${s.warehouseId}): fiili ${s.physicalQty}, ayrılmış ${s.reservedQty}`).join("\n"):"Ana ürün stok kaydı yok."}\nSatış deposunda kullanılabilir ana stok varsa bekleyen siparişlere ayrılabilir.`:"";
      if(!window.confirm(`"${clean(p.productName)} — ${clean(p.variantName)}" (SKU ${clean(p.sku)}) varyantı kalıcı olarak silinsin mi?\n\nAşağıdaki stok kayıtları silinecek (toplam ${p.totalStock} adet):\n${stock}${base}\n\nBu işlem geri alınamaz.`))return;
      const response=await authFetch('/api/variant-deletion',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fingerprint:p.fingerprint,confirmed:true})});const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.success){setCatalogFeedback({text:result.error||"Varyant silinemedi.",isError:true});return;}
      setProducts(prev=>prev.map(product=>product.id===p.productId?{...product,hasVariants:!p.lastVariant,variants:(product.variants||[]).filter((v:any)=>v.id!==id)}:product));
      setInventoryList(prev=>prev.filter(row=>row.variantId!==id));
      setCatalogFeedback({text:`Varyant silindi.${result.data.promoted?` ${result.data.promoted} bekleyen siparişe stok ayrıldı.`:""}`,isError:false});
      await Promise.allSettled([refreshProducts(),loadInventory()]);
    }catch{setCatalogFeedback({text:"Bağlantı kesildi; silme sonucu doğrulanamadı. Listeyi yenileyip kontrol edin.",isError:true});}
    finally{deletingVariantLock.current=false;setDeletingVariantId(null);}
  };

  const handleSaveProductEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || variantEditBusy) return;
    if (variantEditDirty && !window.confirm("Kaydedilmemiş varyant değişiklikleri kaybolacak. Yalnızca ürün ana bilgileri kaydedilsin mi?")) return;
    const res = await authFetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingProduct.id,
        name: editingProduct.name,
        retailPrice: editingProduct.retailPrice,
        buyPrice: editingProduct.buyPrice,
        campaignPrice: editingProduct.campaignPrice || null,
        categoryId: editingProduct.categoryId,
        brandId: editingProduct.brandId,
        tags: editingProduct.tags || "",
        collection: editingProduct.collection || "",
        imageUrl: editingProduct.imageUrl,
        images: editingProduct._imagesTouched ? editingProduct.images : undefined,
        videoUrl: editingProduct.videoUrl || null,
        isFeatured: editingProduct.isFeatured,
        isActive: editingProduct.isActive,
        shortDescription: editingProduct.shortDescription,
        description: editingProduct.description,
        technicalDetails: parseProductSpecifications(editingProduct.technicalDetails),
      }),
    });
    const data = await res.json();
    if (data.success) {
      await refreshProducts();
      setEditingProduct(null);
      setCatalogFeedback({ text: "Ürün güncellendi.", isError: false });
    } else {
      setCatalogFeedback({ text: data.error || "Güncelleme başarısız.", isError: true });
    }
  };

  const toggleProductFlag = async (id: number, field: "isFeatured" | "isActive", value: boolean) => {
    const res = await authFetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });
    const data = await res.json();
    if (data.success) {
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.name.trim()) return;
    const res = await authFetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newCategory.name,
        parentId: newCategory.parentId ? Number(newCategory.parentId) : null,
        description: newCategory.description,
      }),
    });
    const data = await res.json();
    if (data.success) {
      if (!data.existed) setCategoriesList((prev) => [...prev, { ...data.data, productCount: 0, parentName: null }]);
      setNewCategory({ name: "", parentId: "", description: "" });
      setCatalogFeedback({ text: `"${data.data.name}" kategorisi kaydedildi.`, isError: false });
    } else {
      setCatalogFeedback({ text: data.error?.message || "Kategori eklenemedi.", isError: true });
    }
  };

  const handleAddBrandAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandAdmin.trim()) return;
    if (!newBrandCategories.length) { setCatalogFeedback({ text: "En az bir kategori seçin.", isError: true }); return; }
    try {
    const res = await authFetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBrandAdmin, categoryIds: newBrandCategories }),
    });
    const data = await res.json();
    if (data.success) {
      setBrandsList((prev) => prev.some(b => b.id === data.data.id) ? prev.map(b => b.id === data.data.id ? data.data : b) : [...prev, data.data]);
      setNewBrandAdmin("");
      setNewBrandCategories([]);
      setCatalogFeedback({ text: data.existed ? `"${data.data.name}" mevcut markasına seçilen kategoriler eklendi.` : `"${data.data.name}" markası kaydedildi.`, isError: false });
    } else {
      setCatalogFeedback({ text: data.error?.message || data.error || "Marka eklenemedi.", isError: true });
    }
    } catch { setCatalogFeedback({ text: "Sunucuya ulaşılamadı; marka kaydedilemedi.", isError: true }); }
  };

  const handleToggleBrand = async (b: any) => {
    const res = await authFetch("/api/brands", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, isActive: !(b.isActive !== false) }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.success) {
      setBrandsList((prev) => prev.map((x) => (x.id === b.id ? { ...x, isActive: data.data.isActive } : x)));
      setCatalogFeedback({ text: `"${b.name}" markası ${data.data.isActive ? "aktife alındı." : "pasife alındı."}`, isError: false });
    } else {
      setCatalogFeedback({ text: data?.error?.message || "Durum güncellenemedi.", isError: true });
    }
  };

  const handleSaveBrand = async () => {
    if (editingBrandId == null || !editingBrandName.trim()) return;
    const res = await authFetch("/api/brands", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingBrandId, name: editingBrandName.trim(), categoryIds: editingBrandCategories }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.success) {
      setBrandsList((prev) => prev.map((x) => (x.id === editingBrandId ? data.data : x)));
      setCatalogFeedback({ text: `Marka güncellendi: "${data.data.name}".`, isError: false });
      setEditingBrandId(null);
      setEditingBrandName("");
    } else {
      setCatalogFeedback({ text: data?.error?.message || "Marka güncellenemedi.", isError: true });
    }
  };

  const handleDeleteBrand = async (b: any) => {
    const linkedCount = products.filter((p) => p.brandId === b.id).length;
    if (linkedCount > 0) {
      setCatalogFeedback({ text: `"${b.name}" markasına bağlı ${linkedCount} ürün var; silmek için önce ürünleri başka markaya taşıyın veya markayı pasife alın.`, isError: true });
      return;
    }
    if (!window.confirm(`"${b.name}" markası silinsin mi? Bu işlem geri alınamaz.`)) return;
    const res = await authFetch("/api/brands", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.success) {
      setBrandsList((prev) => prev.filter((x) => x.id !== b.id));
      if (editingBrandId === b.id) { setEditingBrandId(null); setEditingBrandName(""); }
      setCatalogFeedback({ text: `"${b.name}" markası silindi.`, isError: false });
    } else {
      setCatalogFeedback({ text: data?.error?.message || "Marka silinemedi.", isError: true });
    }
  };

  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantProductId) {
      setCatalogFeedback({ text: "Önce bir ürün seçin.", isError: true });
      return;
    }
    const res = await authFetch("/api/variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: Number(variantProductId),
        ...newVariant,
      }),
    });
    const data = await res.json();
    if (data.success) {
      await Promise.all([refreshProducts(), loadInventory()]);
      setNewVariant({
        colorName: "",
        colorHex: "#111827",
        size: "",
        length: "",
        retailPrice: "",
        buyPrice: "",
        sku: "",
        barcode: "",
        initialStock: "20",
      });
      setCatalogFeedback({ text: `Varyant eklendi: ${data.data.sku}`, isError: false });
    } else {
      setCatalogFeedback({ text: data.error?.message || "Varyant eklenemedi.", isError: true });
    }
  };

  /* --- FAZ 3: WMS veri yükleyicileri ve aksiyonları --- */
  const loadWmsSection = React.useCallback(async () => {
    setWmsBusy(true);
    try {
      const [tRes, cRes, lRes, rRes, salesRes] = await Promise.all([
        authFetch("/api/transfers", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        authFetch("/api/counts", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        authFetch("/api/locations", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        authFetch("/api/reservations", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        authFetch("/api/warehouses/sales-warehouse", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      if (tRes?.success) setTransfers(tRes.data);
      if (cRes?.success) setCountSessions(cRes.data);
      if (lRes?.success) setLocationsList(lRes.data);
      if (rRes?.success) setReservationsList(rRes.data);
      if (salesRes?.success) {setSalesWarehouseId(salesRes.data.warehouseId);setSalesWarehouseChoice(String(salesRes.data.warehouseId || ""));}
    } finally {
      setWmsBusy(false);
    }
  }, []);

  const loadInventory = React.useCallback(async () => {
    const invRes = await authFetch("/api/inventory", { cache: "no-store" });
    const invData = await invRes.json();
    if (invData.success) {
      setInventoryList(invData.inventory);
      setLedger(invData.recentLedger);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === "wms") {
      void loadWmsSection();
      void loadInventory();
    }
  }, [activeTab, loadWmsSection, loadInventory]);

  const transferAction = async (action: string, transferId?: number, payload?: Record<string, unknown>) => {
    const res = await authFetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, transferId, ...payload }),
    });
    const data = await res.json();
    if (data.success) {
      setWmsFeedback({ text: "İşlem tamamlandı.", isError: false });
      void loadWmsSection();
      void loadInventory();
    } else {
      setWmsFeedback({ text: data.error?.message || "İşlem başarısız.", isError: true });
    }
    return data;
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTransfer.productId) {
      setWmsFeedback({ text: "Ürün seçin.", isError: true });
      return;
    }
    await transferAction("CREATE", undefined, {
      fromWarehouseId: Number(newTransfer.fromWarehouseId),
      toWarehouseId: Number(newTransfer.toWarehouseId),
      note: newTransfer.note || "Depolar arası sevk",
      items: [{ productId: Number(newTransfer.productId), variantId: null, qty: Number(newTransfer.qty) }],
    });
    setNewTransfer({ fromWarehouseId: defaultWarehouseId, toWarehouseId: secondWarehouseId, productId: "", qty: "10", note: "" });
  };

  const handleStartCount = async () => {
    const res = await authFetch("/api/counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "START", warehouseId: Number(selectedWhFilter === "ALL" ? defaultWarehouseId : selectedWhFilter) }),
    });
    const data = await res.json();
    if (data.success) {
      setActiveCountSession(data.data);
      setCountedItems([]);
      setWmsFeedback({ text: `Sayım başlatıldı: ${data.data.countNumber}`, isError: false });
      void loadWmsSection();
    }
  };

  const handleCountScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCountSession || !countBarcodeInput.trim()) return;
    const res = await authFetch("/api/counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ADD_ITEM",
        sessionId: activeCountSession.id,
        barcode: countBarcodeInput.trim(),
        countedQty: Number(countQtyInput),
      }),
    });
    const data = await res.json();
    if (data.success) {
      setCountedItems((prev) => [data.data, ...prev]);
      setCountBarcodeInput("");
      setWmsFeedback({
        text: data.data.difference === 0 ? "✓ Sayım eşleşti." : `Fark: ${data.data.difference > 0 ? "+" : ""}${data.data.difference}`,
        isError: data.data.difference !== 0,
      });
    } else {
      setWmsFeedback({ text: data.error?.message || "Barkod bulunamadı.", isError: true });
    }
  };

  const handleCompleteCount = async () => {
    if (!activeCountSession) return;
    const res = await authFetch("/api/counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "COMPLETE", sessionId: activeCountSession.id }),
    });
    const data = await res.json();
    if (data.success) {
      setWmsFeedback({ text: `Sayım kapandı. ${data.data.adjustments} düzeltme deftere işlendi.`, isError: false });
      setActiveCountSession(null);
      setCountedItems([]);
      void loadWmsSection();
      void loadInventory();
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLocation),
    });
    const data = await res.json();
    if (data.success) {
      setWmsFeedback({ text: `Lokasyon oluşturuldu: ${data.data.locationCode}`, isError: false });
      void loadWmsSection();
    } else {
      setWmsFeedback({ text: data.error?.message || "Lokasyon eklenemedi.", isError: true });
    }
  };

  const handleAddWarehouseForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newWarehouseForm.name.trim();
    if (!name || addingWarehouseForm) return;
    setAddingWarehouseForm(true);
    setWmsFeedback(null);
    try {
      const res = await authFetch("/api/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: newWarehouseForm.type,
          address: newWarehouseForm.address.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setWmsFeedback({ text: data?.error?.message || "Depo eklenemedi.", isError: true });
        return;
      }
      const created = data.data;
      if (!data.existed) setWarehousesList((prev) => [...prev, created]);
      setWmsFeedback({
        text: data.existed
          ? `"${created.name}" zaten kayıtlı (${created.code}).`
          : `Depo oluşturuldu: ${created.name} (${created.code}).`,
        isError: false,
      });
      setNewWarehouseForm({ name: "", type: "CENTRAL", address: "" });
    } catch {
      setWmsFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setAddingWarehouseForm(false);
    }
  };

  const handleToggleWarehouse = async (id: number, nextActive: boolean) => {
    setWmsFeedback(null);
    try {
      const res = await authFetch("/api/warehouses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: nextActive }),
      });
      const data = await res.json();
      if (!data.success) {
        setWmsFeedback({ text: data?.error?.message || "Depo güncellenemedi.", isError: true });
        return;
      }
      const newVal: boolean = typeof data.data?.isActive === "boolean" ? data.data.isActive : nextActive;
      setWarehousesList((prev) => prev.map((w) => (w.id === id ? { ...w, isActive: newVal } : w)));
      setWmsFeedback({ text: `Depo ${newVal ? "aktif" : "pasif"} duruma getirildi.`, isError: false });
    } catch {
      setWmsFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    }
  };

  const handleSelectSalesWarehouse = async () => {
    const id=Number(salesWarehouseChoice), wh=warehousesList.find((w)=>w.id===id);
    if(!wh || salesWarehouseBusy) return;
    if(!window.confirm(`POS ve online satış için ortak depo "${wh.name}" olarak seçilsin mi? Başka depolardaki stoklar otomatik taşınmaz.`)) return;
    setSalesWarehouseBusy(true);setWmsFeedback(null);
    try {
      const res=await authFetch("/api/warehouses/sales-warehouse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({warehouseId:id})});
      const data=await res.json();
      if(!data.success){setWmsFeedback({text:data.error||"Ortak depo seçilemedi.",isError:true});return;}
      setSalesWarehouseId(data.data.id);setNewProd(prev=>({...prev,warehouseId:String(id)}));setAdjustData(prev=>({...prev,warehouseId:String(id)}));setWmsFeedback({text:`POS ve online ortak deposu: ${wh.name}. Diğer depolardaki stoklar taşınmadı.`,isError:false});
    } catch {setWmsFeedback({text:"Sunucuya ulaşılamadı; sonucu kontrol edin.",isError:true});}
    finally{setSalesWarehouseBusy(false);}
  };

  const handleDeleteWarehouse = async (id: number, name: string) => {
    if (typeof window !== "undefined" && !window.confirm(`"${name}" deposu ve boş lokasyon tanımları silinsin mi? Stok veya geçmiş hareketi olan depolar silinmez. Bu işlem geri alınamaz.`)) return;
    setWmsFeedback(null);
    try {
      const res = await authFetch(`/api/warehouses?id=${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!data.success) {
        setWmsFeedback({ text: data?.error?.message || "Depo silinemedi.", isError: true });
        return;
      }
      const remaining = warehousesList.filter((w) => w.id !== id);
      const fallback = String(remaining.filter((w) => w.isActive !== false).sort((a, b) => Number(b.type === "CENTRAL") - Number(a.type === "CENTRAL") || a.id - b.id)[0]?.id || "");
      const other = String(remaining.find((w) => w.isActive !== false && String(w.id) !== fallback)?.id || fallback);
      setWarehousesList(remaining);
      setSelectedWhFilter("ALL");
      setLocationsList((prev) => prev.filter((location) => location.warehouseId !== id));
      setNewLocation((prev) => ({ ...prev, warehouseId: prev.warehouseId === String(id) ? fallback : prev.warehouseId }));
      setNewTransfer((prev) => ({ ...prev, fromWarehouseId: prev.fromWarehouseId === String(id) ? fallback : prev.fromWarehouseId, toWarehouseId: prev.toWarehouseId === String(id) ? other : prev.toWarehouseId }));
      setTransferData((prev) => ({ ...prev, fromWarehouseId: prev.fromWarehouseId === String(id) ? fallback : prev.fromWarehouseId, toWarehouseId: prev.toWarehouseId === String(id) ? other : prev.toWarehouseId }));
      setAdjustData((prev) => ({ ...prev, warehouseId: prev.warehouseId === String(id) ? fallback : prev.warehouseId }));
      setNewProd((prev) => ({ ...prev, warehouseId: prev.warehouseId === String(id) ? fallback : prev.warehouseId }));
      setPoWizard((prev) => ({ ...prev, warehouseId: prev.warehouseId === String(id) ? fallback : prev.warehouseId }));
      setWmsFeedback({ text: `Depo silindi: ${name}. ${data.data?.deletedLocations || 0} boş lokasyon kaldırıldı. Varsayılan depo: ${remaining.find((w) => String(w.id) === fallback)?.name || "yok"}. İşlem yapmadan önce seçimi kontrol edin.`, isError: false });
    } catch {
      setWmsFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    }
  };

  const handleReserveDemo = async () => {
    const res = await authFetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "RESERVE",
        warehouseId: Number(selectedWhFilter === "ALL" ? defaultWarehouseId : selectedWhFilter),
        productId: products[0]?.id,
        qty: 2,
        referenceType: "CHECKOUT",
        referenceId: `CHECK-${Date.now().toString(36).toUpperCase()}`,
        ttlMinutes: 15,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setWmsFeedback({ text: `Rezervasyon oluşturuldu (${data.data.referenceId}).`, isError: false });
      void loadWmsSection();
      void loadInventory();
    } else {
      setWmsFeedback({ text: data.error?.message || "Rezervasyon oluşturulamadı.", isError: true });
    }
  };

  const handleReleaseReservation = async (referenceId: string) => {
    const res = await authFetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "RELEASE", referenceId }),
    });
    const data = await res.json();
    if (data.success) {
      void loadWmsSection();
      void loadInventory();
    }
  };

  // Barcode generator state
  const [barcodeGenText, setBarcodeGenText] = useState("8690011223351");
  const [barcodeLabelTitle, setBarcodeLabelTitle] = useState("Gütermann Sew-All Dikiş İpliği Siyah");
  const [barcodeLabelPrice, setBarcodeLabelPrice] = useState("58.00 TL");
  const [barcodeLabelLocation, setBarcodeLabelLocation] = useState("MRK-A-01-01");

  // AI Assistant states

  // Dashboard KPI'ları — sunucuda DB'den hesaplanan (tüm zamanlar) gerçek rakamlar.
  // dashboardStats yoksa (eski derleme) istemci tarafında, sınırlı sipariş listesiyle hesaplanır.
  const clientRevenue = orders.filter(o => o.paymentStatus === "PAID" && o.status !== "CANCELLED").reduce((sum, o) => sum + Number(o.grandTotal), 0);
  const clientChannel = {
    pos: orders.filter((o) => o.orderType === "POS" && o.status !== "CANCELLED" && o.paymentStatus === "PAID").reduce((s, o) => s + Number(o.grandTotal), 0),
    online: orders.filter((o) => o.orderType === "ONLINE_B2C" && o.status !== "CANCELLED" && o.paymentStatus === "PAID").reduce((s, o) => s + Number(o.grandTotal), 0),
  };
  const totalRevenue = dashboardStats?.totalRevenue ?? clientRevenue;
  const salesCount = dashboardStats?.salesCount ?? orders.filter((o) => o.status !== "CANCELLED" && o.paymentStatus === "PAID").length;
  const totalOrders = dashboardStats?.totalOrders ?? orders.length;
  const posCount = dashboardStats?.posCount ?? orders.filter((o) => o.orderType === "POS" && o.status !== "CANCELLED" && o.paymentStatus === "PAID").length;
  const onlineCount = dashboardStats?.onlineCount ?? orders.filter((o) => o.orderType === "ONLINE_B2C" && o.status !== "CANCELLED" && o.paymentStatus === "PAID").length;
  const channelRevenue = dashboardStats?.channelRevenue ?? clientChannel;
  const estimatedGrossProfit =
    dashboardStats?.grossProfit ??
    orders
      .filter((o) => !["CANCELLED"].includes(o.status))
      .reduce((sum, o) => {
        const itemsCost = (o.items || []).reduce((c: number, it: any) => {
          const p = products.find((x) => x.id === it.productId);
          return c + Number(p?.buyPrice || 0) * it.quantity;
        }, 0);
        return sum + Number(o.grandTotal) - itemsCost;
      }, 0);
  const pendingOrdersCount = dashboardStats?.pendingOrdersCount ?? orders.filter((o) => ["PAID", "PREPARING", "READY_FOR_SHIPMENT"].includes(o.status)).length;
  const returnedOrdersCount = dashboardStats?.returnedOrdersCount ?? orders.filter((o) => ["RETURN_REQUESTED", "RETURNED", "REFUNDED"].includes(o.status)).length;
  const customersCount = dashboardStats?.customersCount ?? 0;
  const monthGrowth = dashboardStats ? dashboardStats.monthGrowth : null;
  // Kanal kartındaki mağaza adı: veritabanındaki mağaza/merkez deposundan alınır
  const storeName =
    (warehouses.find((w: any) => ["CENTRAL", "STORE"].includes(String(w.type).toUpperCase()) && w.isActive !== false) || warehouses[0])?.name ||
    "Mağaza";

  // Handlers
  /** Ürün ekleme modalını aç. */
  const openAddProductModal = () => {
    setIsAddProductOpen(true);
  };

  /* --- Ürün videosu önizleme --- */
  const newProdVideo = parseVideoUrl(newProd.videoUrl);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (productSavingRef.current || productImportBusy) return;
    const variantsForSave = productVariantsDraft.map(row => ({ ...row, buyPrice: "", retailPrice: "" }));
    let validatedVariants;
    try { validatedVariants = validateNewProductVariants(variantsForSave); }
    catch (error) { setProductSaveError(error instanceof Error ? error.message : "Varyant bilgileri geçersiz."); return; }
    if (validatedVariants.length && stockTargetRef.current !== null) {
      const target = variantStockTarget(stockTargetRef.current);
      const actual = variantStockTotal(variantsForSave);
      if (target === null || actual === null || target !== actual) {
        setProductSaveError("Toplam başlangıç stoğu hedefi varyant stokları toplamıyla eşleşmeli. Varyantları düzenleyin veya hedefi değiştirin.");
        return;
      }
    }
    productSavingRef.current = true;
    setProductSaving(true); setProductSaveError("");
    try {
      const { photos, ...rest } = newProd;
      const res = await authFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, initialStock: productVariantsDraft.length ? 0 : rest.initialStock, images: photos, variants: variantsForSave }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "Ürün kaydedilemedi.");
      alert("Ürün başarıyla oluşturuldu.");
      setNewProd(emptyNewProduct()); updateVariantsDraft([], { preserveBaseStock: true }); setStockNotice("");
      productSelectionTouched.current = { brand: false, category: false };
      setIsAddProductOpen(false);
      // A failed refresh must not be reported as a failed product creation.
      try {
        const pRes = await authFetch("/api/products?scope=all-warehouses");
        const pData = await pRes.json();
        if (pData.success) setProducts(pData.data);
      } catch { setCatalogFeedback({ text: "Ürün kaydedildi; listeyi görmek için sayfayı yenileyin.", isError: false }); }
    } catch (err) {
      setProductSaveError(err instanceof Error ? err.message : "Ürün kaydedilemedi.");
    } finally { productSavingRef.current = false; setProductSaving(false); }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TRANSFER",
          ...transferData,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Depolar arası transfer tamamlandı! Ref: " + data.ref);
        setIsTransferOpen(false);
        // Refresh inventory
        const invRes = await authFetch("/api/inventory");
        const invData = await invRes.json();
        if (invData.success) {
          setInventoryList(invData.inventory);
          setLedger(invData.recentLedger);
        }
      } else {
        alert("Transfer başarısız: " + data.error);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ADJUST",
          ...adjustData,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setIsAdjustOpen(false);
        const invRes = await authFetch("/api/inventory");
        const invData = await invRes.json();
        if (invData.success) {
          setInventoryList(invData.inventory);
          setLedger(invData.recentLedger);
        }
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // FAZ 11: AI analizleri AiAssistantCenter bileşeni tarafından yönetilir

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col md:flex-row text-stone-900">
      {/* 1. Admin Sidebar Navigation — sola kapanabilir / açılabilir */}
      <aside
        aria-hidden={sidebarCollapsed}
        className={`w-full md:w-64 bg-stone-900 text-stone-300 flex flex-col shrink-0 border-r border-stone-800 overflow-hidden transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? "max-h-0 border-r-0 opacity-0 pointer-events-none md:max-h-none md:w-0 md:-ml-64" : "max-h-[3000px]"
        }`}
      >
        <div className="p-4 border-b border-stone-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              İK
            </div>
            <div className="min-w-0">
              <span className="font-black text-white text-sm block tracking-tight">SERPİLEN COLLECTION</span>
              <span className="text-[10px] text-stone-400 font-mono block">Yönetim SaaS & WMS</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            title="Menüyü kapat (sola katla)"
            aria-label="Menüyü kapat"
            className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition shrink-0"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto text-xs font-semibold">
          {canSee("dashboard") && (
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "dashboard"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Genel Bakış (KPI)</span>
          </button>
          )}

          {canSee("catalog") && (
          <button
            onClick={() => setActiveTab("catalog")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "catalog"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Ürün & Katalog</span>
          </button>
          )}

          {canSee("wms") && (
          <button
            onClick={() => setActiveTab("wms")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "wms"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Çoklu Depo & WMS</span>
          </button>
          )}

          {canSee("barcode") && (
          <button
            onClick={() => setActiveTab("barcode")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "barcode"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Barcode className="w-4 h-4" />
            <span>Barkod & Etiket</span>
          </button>
          )}

          {canSee("pos") && (
          <button
            onClick={() => setActiveTab("pos")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "pos"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <MonitorCheck className="w-4 h-4" />
            <span>POS & Kasalar</span>
          </button>
          )}

          {canSee("orders") && (
          <button
            onClick={() => setActiveTab("orders")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "orders"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Siparişler ({orders.length})</span>
          </button>
          )}

          {canSee("crm") && (
          <button
            onClick={() => setActiveTab("crm")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "crm"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Müşteri CRM</span>
          </button>
          )}

          {canSee("purchasing") && (
          <button
            onClick={() => setActiveTab("purchasing")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "purchasing"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Satın Alma & Mal Kabul</span>
          </button>
          )}

          {canSee("reports") && (
          <button
            onClick={() => setActiveTab("reports")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "reports"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Raporlar & Analitik</span>
          </button>
          )}

          {canSee("coupons") && (
          <button
            onClick={() => setActiveTab("coupons")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "coupons"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Pazarlama & Kampanya</span>
          </button>
          )}


          {canSee("ai") && (
          <button
            onClick={() => setActiveTab("ai")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "ai"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>AI Yönetim Asistanı</span>
          </button>
          )}

          {canSee("intelligence") && (
          <button
            onClick={() => setActiveTab("intelligence")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "intelligence"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Brain className="w-4 h-4 text-violet-400" />
            <span>Intelligence Center</span>
          </button>
          )}

          {canSee("support") && (
          <button
            onClick={() => setActiveTab("support")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "support"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Headset className="w-4 h-4 text-emerald-400" />
            <span>Destek Masası</span>
          </button>
          )}

          {matrixLoaded && canSee("productFeedback") && (
          <button
            onClick={() => setActiveTab("productFeedback")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "productFeedback" ? "bg-amber-700 text-white shadow-sm" : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <MessageSquareQuote className="w-4 h-4 text-amber-400" />
            <span>Ürün Yorumları &amp; Soruları</span>
          </button>
          )}

          {(canSee("users") || canSee("registeredCustomers") || canSee("roleMatrix") || canSee("audit")) && (
            <div className="pt-3 border-t border-stone-800">
              <p className="px-3 pt-2 text-[9px] font-black uppercase tracking-widest text-stone-500">
                FAZ 1 — Temel
              </p>
            </div>
          )}

          {canSee("users") && (
          <button
            onClick={() => setActiveTab("users")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "users"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Users2 className="w-4 h-4" />
            <span>Kullanıcılar & Roller</span>
          </button>
          )}

          {canSee("registeredCustomers") && (
          <button
            onClick={() => setActiveTab("registeredCustomers")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "registeredCustomers"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Kayıtlı Müşteriler</span>
          </button>
          )}

          {canSee("roleMatrix") && (
          <button
            onClick={() => setActiveTab("roleMatrix")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "roleMatrix"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Rol Yetki Matrisi</span>
          </button>
          )}

          {canSee("audit") && (
          <button
            onClick={() => setActiveTab("audit")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "audit"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <ScrollText className="w-4 h-4" />
            <span>Denetim Kaydı (Audit)</span>
          </button>
          )}

          {canSee("content") && (
            <div className="pt-3 border-t border-stone-800">
              <p className="px-3 pt-2 text-[9px] font-black uppercase tracking-widest text-stone-500">
                İçerik Yönetimi
              </p>
            </div>
          )}

          {canSee("content") && (
          <button
            onClick={() => setActiveTab("content")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "content"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Newspaper className="w-4 h-4" />
            <span>İçerik Yönetimi</span>
          </button>
          )}

          {(canSee("siteHeader") || canSee("siteFooter") || canSee("siteCart") || canSee("paymentApi") || canSee("database")) && (
            <div className="pt-3 border-t border-stone-800">
              <p className="px-3 pt-2 text-[9px] font-black uppercase tracking-widest text-stone-500">
                Site Yönetimi
              </p>
            </div>
          )}

          {canSee("siteHeader") && (
          <button
            onClick={() => setActiveTab("siteHeader")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "siteHeader"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <PanelTop className="w-4 h-4" />
            <span>Header Ayarı</span>
          </button>
          )}

          {canSee("siteFooter") && (
          <button
            onClick={() => setActiveTab("siteFooter")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "siteFooter"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <PanelBottom className="w-4 h-4" />
            <span>Footer Ayarı</span>
          </button>
          )}

          {canSee("siteCart") && (
          <button
            onClick={() => setActiveTab("siteCart")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "siteCart"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Sepetim Ayarı</span>
          </button>
          )}

          {canSee("paymentApi") && (
          <button
            onClick={() => setActiveTab("paymentApi")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "paymentApi"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Ödeme API Ayarları</span>
          </button>
          )}

          {canSee("database") && (
          <button
            onClick={() => setActiveTab("database")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "database"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Veritabanı Ayarı</span>
          </button>
          )}

        </nav>

        {/* User profile footer */}
        <div className="p-3 bg-stone-950/80 border-t border-stone-800 text-[11px] flex items-center justify-between">
          <div className="min-w-0">
            <p className="font-bold text-white truncate">{currentUserName}</p>
            <p className="text-stone-400">{currentRoleLabel}</p>
          </div>
          <Link href="/" className="text-amber-400 hover:underline">
            Siteye Dön
          </Link>
        </div>
      </aside>

      {/* Sidebar kapalıyken solda "Aç" düğmesi */}
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          title="Menüyü aç"
          aria-label="Menüyü aç"
          className="fixed left-0 top-4 z-40 flex items-center gap-1.5 pl-2 pr-3 py-3 rounded-r-2xl bg-stone-900 text-amber-400 border border-stone-800 border-l-0 shadow-lg hover:bg-stone-800 hover:text-amber-300 transition"
        >
          <PanelLeftOpen className="w-5 h-5" />
          <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Menü</span>
        </button>
      )}

      {/* 2. Main Work Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6 min-w-0">
        {/* ============================================================ */}
        {/* TAB 1: DASHBOARD (KPIs) */}
        {/* ============================================================ */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-stone-900 tracking-tight">
                  Yönetim Paneli & Performans Göstergeleri
                </h2>
                <p className="text-xs text-stone-500">
                  Fiziki mağaza ve e-ticaret vitrini verilerinin anlık özeti.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/pos"
                  className="px-3 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl shadow-xs transition"
                >
                  POS Terminalini Aç
                </Link>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Toplam Ciro</span>
                <div className="text-2xl font-black text-stone-900">
                  {totalRevenue.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                </div>
                <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${monthGrowth === null || monthGrowth >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {monthGrowth === null ? (
                    <span className="text-stone-500">Geçen ay verisi yok — kıyas yapılamıyor</span>
                  ) : (
                    <>
                      {monthGrowth >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      <span>
                        Geçen aya göre {monthGrowth >= 0 ? "+" : ""}%{monthGrowth.toFixed(1)}
                        {dashboardStats ? ` • bu ay ${dashboardStats.monthRevenue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL` : ""}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Toplam Sipariş / Satış</span>
                <div className="text-2xl font-black text-stone-900">{totalOrders} İşlem</div>
                <div className="text-[11px] text-stone-500">
                  {posCount} POS • {onlineCount} Vitrin <span className="text-stone-400">(iptaller hariç satış: {salesCount})</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Ortalama Sepet</span>
                <div className="text-2xl font-black text-stone-900">
                  {(salesCount > 0 ? totalRevenue / salesCount : 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                </div>
                <div className="text-[11px] text-stone-500">Ciro ÷ satış adedi (iptaller hariç)</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Brüt Kâr (Tahmini)</span>
                <div className="text-2xl font-black text-emerald-800">{estimatedGrossProfit.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL</div>
                <div className="text-[11px] text-stone-500">Ciro − satılan malın maliyeti</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Bekleyen Sipariş</span>
                <div className="text-2xl font-black text-amber-800">{pendingOrdersCount}</div>
                {matrixLoaded && canSee("orders") && <button onClick={() => setActiveTab("orders")} className="text-[11px] text-amber-800 hover:underline font-semibold block text-left">
                  Siparişleri Yönet →
                </button>}
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">İade / Yeni Müşteri</span>
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-black text-rose-700">{returnedOrdersCount}</span>
                  <span className="text-xs text-stone-400">iade</span>
                  <span className="text-2xl font-black text-sky-700">{customersCount}</span>
                  <span className="text-xs text-stone-400">müşteri</span>
                </div>
              </div>
            </div>

            {/* Sales Channel Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                <span className="text-xs font-bold text-amber-900 uppercase">Fiziki Mağaza Web POS</span>
                <div className="text-xl font-black text-amber-950 mt-1">{posCount} Satış</div>
                <div className="text-sm font-bold text-amber-800">{channelRevenue.pos.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</div>
                <p className="text-xs text-amber-800 mt-1">
                  {storeName} • Anında Kasa Fişi & Stok Düşümü
                </p>
              </div>

              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
                <span className="text-xs font-bold text-emerald-900 uppercase">Online B2C E-Ticaret</span>
                <div className="text-xl font-black text-emerald-950 mt-1">{onlineCount} Sipariş</div>
                <div className="text-sm font-bold text-emerald-800">{channelRevenue.online.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</div>
                <p className="text-xs text-emerald-800 mt-1">
                  Havale / EFT / Yurtiçi Kargo
                </p>
              </div>
            </div>

            {/* Sipariş tablosu için menü değil, sunucu izin kontrolü de uygulanır. */}
            {matrixLoaded && canSee("orders") ? <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-stone-900">Son Sipariş & Satış Hareketleri</h3>
                <div className="flex gap-3">
                  <button onClick={() => void refreshOrders()} className="text-xs text-amber-800 hover:underline font-semibold">Listeyi Yenile</button>
                  <button onClick={() => setActiveTab("orders")} className="text-xs text-amber-800 hover:underline font-semibold">Tümünü Gör →</button>
                </div>
              </div>

              {orderFeedback?.isError && <p role="alert" className="text-xs text-rose-700">{orderFeedback.text}</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-2.5 px-3">Sipariş No</th>
                      <th className="py-2.5 px-3">Kanal</th>
                      <th className="py-2.5 px-3">Müşteri</th>
                      <th className="py-2.5 px-3">Tutar</th>
                      <th className="py-2.5 px-3">Ödeme</th>
                      <th className="py-2.5 px-3">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {orders.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-stone-400 text-xs">
                          Sipariş/satış kaydı yok. Yetkiniz yeni açıldıysa listeyi yenileyin.
                        </td>
                      </tr>
                    )}
                    {orders.slice(0, 5).map((ord) => (
                      <tr key={ord.id} className="hover:bg-stone-50/50">
                        <td className="py-3 px-3 font-mono font-bold">{ord.orderNumber}</td>
                        <td className="py-3 px-3">
                          <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded text-[10px] font-bold">
                            {ord.orderType}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold">{ord.customerName}</td>
                        <td className="py-3 px-3 font-bold text-stone-900">
                          {Number(ord.grandTotal).toFixed(2)} TL
                        </td>
                        <td className="py-3 px-3">{ord.paymentMethod}</td>
                        <td className="py-3 px-3">
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            {ord.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div> : <p className="text-xs text-stone-500">Son sipariş ayrıntıları için Siparişler modülü yetkisi gerekir. Özet göstergeler toplu değerlerdir.</p>}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: PRODUCT CATALOG */}
        {/* ============================================================ */}
        {activeTab === "catalog" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">FAZ 2 — Katalog</span>
                <h2 className="text-xl font-black text-stone-900">Ürün, Kategori, Marka & Varyant</h2>
                <p className="text-xs text-stone-500">
                  Merkezi katalog: vitrin ve POS aynı ürün/SKU/barkod kaydını kullanır.
                </p>
              </div>
              {catalogSubTab === "products" && (
                <button
                  onClick={openAddProductModal}
                  className="px-3.5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span>Yeni Ürün Ekle</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "products" as const, label: "Ürünler", icon: Package },
                { id: "categories" as const, label: "Kategoriler", icon: FolderTree },
                { id: "brands" as const, label: "Markalar", icon: Layers },
                { id: "variants" as const, label: "Varyantlar", icon: Palette },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setCatalogSubTab(t.id); setCatalogFeedback(null); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      catalogSubTab === t.id ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200 hover:border-amber-300"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {catalogFeedback && (
              <div className={`p-3 rounded-xl text-xs font-medium border ${catalogFeedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                {catalogFeedback.text}
              </div>
            )}

            {catalogSubTab === "products" && (
              <>
                <div className="bg-white p-3 rounded-2xl border border-stone-200 flex flex-wrap items-center gap-2">
                  <Search className="w-4 h-4 text-stone-400 ml-2" />
                  <input
                    type="text"
                    placeholder="Ad, SKU, barkod, marka, etiket, renk ara…"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="flex-1 min-w-[180px] text-xs bg-transparent focus:outline-none"
                  />
                  <select value={catalogCatFilter} onChange={(e) => setCatalogCatFilter(e.target.value)} className="text-xs border border-stone-200 rounded-lg px-2 py-1.5">
                    <option value="ALL">Tüm Kategoriler</option>
                    {categoriesList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={catalogBrandFilter} onChange={(e) => setCatalogBrandFilter(e.target.value)} className="text-xs border border-stone-200 rounded-lg px-2 py-1.5">
                    <option value="ALL">Tüm Markalar</option>
                    {brandsList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                        <tr>
                          <th className="py-3 px-3">Ürün</th>
                          <th className="py-3 px-3">SKU / Barkod</th>
                          <th className="py-3 px-3">Kategori</th>
                          <th className="py-3 px-3">Fiyatlar</th>
                          <th className="py-3 px-3">Stok</th>
                          <th className="py-3 px-3">Durum</th>
                          <th className="py-3 px-3">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {products
                          .filter((p) => {
                            if (catalogCatFilter !== "ALL" && String(p.categoryId) !== catalogCatFilter) return false;
                            if (catalogBrandFilter !== "ALL" && String(p.brandId) !== catalogBrandFilter) return false;
                            if (!catalogSearch) return true;
                            const q = catalogSearch.toLowerCase();
                            const varHit = (p.variants || []).some((v: any) =>
                              `${v.sku} ${v.barcode} ${v.colorName} ${v.size}`.toLowerCase().includes(q)
                            );
                            return (
                              p.name.toLowerCase().includes(q) ||
                              p.sku.toLowerCase().includes(q) ||
                              p.barcode?.toLowerCase().includes(q) ||
                              p.brandName?.toLowerCase().includes(q) ||
                              p.tags?.toLowerCase().includes(q) ||
                              varHit
                            );
                          })
                          .map((prod) => (
                            <tr key={prod.id} className="hover:bg-stone-50/50">
                              <td className="py-3 px-3">
                                <span className="font-bold text-stone-900 block">{prod.name}</span>
                                <span className="text-[10px] text-stone-400">{prod.brandName} · {prod.unit}</span>
                              </td>
                              <td className="py-3 px-3 font-mono">
                                <div>{prod.sku}</div>
                                <div className="text-[10px] text-stone-400">{prod.barcode}</div>
                              </td>
                              <td className="py-3 px-3">{prod.categoryName}</td>
                              <td className="py-3 px-3">
                                <div className="font-bold">{Number(prod.retailPrice).toFixed(2)} TL</div>
                                <div className="text-[10px] text-stone-400">Maliyet {Number(prod.buyPrice).toFixed(2)} TL</div>
                              </td>
                              <td className="py-3 px-3">
                                <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${prod.totalAvailable <= 10 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                                  {prod.totalAvailable ?? 0} {prod.unit}
                                </span>
                                <div className="text-[10px] text-amber-800 mt-0.5">
                                  {prod.variants?.length > 0 ? `${prod.variants.length} varyant` : "Tekil SKU"}
                                </div>
                              </td>
                              <td className="py-3 px-3 space-y-1">
                                <button
                                  onClick={() => void toggleProductFlag(prod.id, "isActive", !prod.isActive)}
                                  className={`block px-2 py-0.5 rounded-full text-[10px] font-bold ${prod.isActive ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-500"}`}
                                >
                                  {prod.isActive ? "Yayında" : "Taslak"}
                                </button>
                                <button
                                  onClick={() => void toggleProductFlag(prod.id, "isFeatured", !prod.isFeatured)}
                                  className={`block px-2 py-0.5 rounded-full text-[10px] font-bold ${prod.isFeatured ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-400"}`}
                                >
                                  {prod.isFeatured ? "Öne Çıkan" : "Vitrin dışı"}
                                </button>
                              </td>
                              <td className="py-3 px-3 space-y-1">
                                <button
                                  onClick={() => { setVariantEditDirty(false); setVariantEditBusy(false); setEditingProduct({ ...prod }); }}
                                  className="flex items-center gap-1 text-amber-800 font-bold hover:underline"
                                >
                                  <Pencil className="w-3 h-3" /> Düzenle
                                </button>
                                {(isSuper || (matrixLoaded && myMatrixRow.catalog === true && myMatrixRow.productDelete === true)) && <button type="button" aria-label={`${prod.name} ürününü sil`} disabled={deletingProductId !== null} onClick={() => void handleDeleteProduct(prod.id, prod.name)} className="flex items-center gap-1 text-rose-700 font-bold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"><Trash2 className="w-3 h-3" /> {deletingProductId === prod.id ? "Siliniyor..." : "Sil"}</button>}
                                <Link href={`/urun/${prod.slug}`} className="block text-stone-500 hover:underline">Vitrin →</Link>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {catalogSubTab === "categories" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <form onSubmit={handleAddCategory} className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3 h-max">
                  <h3 className="font-bold text-sm text-stone-900">Yeni Kategori / Alt Kategori</h3>
                  <input
                    required
                    placeholder="Kategori adı (örn. Gizli Fermuar)"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs"
                  />
                  <select
                    value={newCategory.parentId}
                    onChange={(e) => setNewCategory({ ...newCategory, parentId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs"
                  >
                    <option value="">Üst kategori (kök)</option>
                    {categoriesList.filter((c) => !c.parentId).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Kısa açıklama (opsiyonel)"
                    value={newCategory.description}
                    onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs"
                  />
                  <button type="submit" className="w-full py-2.5 bg-amber-800 text-white text-xs font-bold rounded-xl">Kategoriyi Kaydet</button>
                </form>
                <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-3">Kategori</th>
                        <th className="py-3 px-3">Üst</th>
                        <th className="py-3 px-3">Slug</th>
                        <th className="py-3 px-3">Kategoriler</th>
                        <th className="py-3 px-3">Ürün</th>
                        <th className="py-3 px-3">Durum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {categoriesList.map((c) => (
                        <tr key={c.id}>
                          <td className="py-3 px-3 font-bold text-stone-900">{c.name}</td>
                          <td className="py-3 px-3 text-stone-500">{categoriesList.find((p) => p.id === c.parentId)?.name || "—"}</td>
                          <td className="py-3 px-3 font-mono text-[10px]">{c.slug}</td>
                          <td className="py-3 px-3">{c.productCount ?? products.filter((p) => p.categoryId === c.id).length}</td>
                          <td className="py-3 px-3">
                            <button
                              onClick={async () => {
                                await authFetch("/api/categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, isActive: !c.isActive }) });
                                setCategoriesList((prev) => prev.map((x) => x.id === c.id ? { ...x, isActive: !x.isActive } : x));
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.isActive !== false ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-500"}`}
                            >
                              {c.isActive !== false ? "Aktif" : "Pasif"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {catalogSubTab === "brands" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <form onSubmit={handleAddBrandAdmin} className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3 h-max">
                  <h3 className="font-bold text-sm text-stone-900">Yeni Marka</h3>
                  <input
                    required
                    placeholder="Marka adı (örn. DMC, Kartopu)"
                    value={newBrandAdmin}
                    onChange={(e) => setNewBrandAdmin(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs"
                  />
                  <fieldset className="border border-stone-200 rounded-xl p-3 space-y-1 max-h-48 overflow-y-auto">
                    <legend className="font-bold text-stone-700 px-1">Kategoriler (en az birini seçin)</legend>
                    {categoriesList.length === 0 && <p>Önce Kategoriler bölümünden kategori ekleyin.</p>}
                    {categoriesList.map(c => <label key={c.id} className="flex gap-2 items-center"><input type="checkbox" checked={newBrandCategories.includes(c.id)} onChange={e => setNewBrandCategories(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} />{c.parentName ? `${c.parentName} / ` : ""}{c.name}</label>)}
                  </fieldset>
                  <button type="submit" className="w-full py-2.5 bg-amber-800 text-white text-xs font-bold rounded-xl">Markayı Kaydet</button>
                </form>
                <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-3">Marka</th>
                        <th className="py-3 px-3">Slug</th>
                        <th className="py-3 px-3">Ürün</th>
                        <th className="py-3 px-3">Durum</th>
                        <th className="py-3 px-3">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {brandsList.map((b) => {
                        const isEditing = editingBrandId === b.id;
                        return (
                        <tr key={b.id} className={isEditing ? "bg-amber-50/60" : undefined}>
                          <td className="py-3 px-3 font-bold">
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingBrandName}
                                onChange={(e) => setEditingBrandName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void handleSaveBrand();
                                  if (e.key === "Escape") { setEditingBrandId(null); setEditingBrandName(""); }
                                }}
                                className="w-full min-w-[140px] px-2 py-1.5 border border-amber-400 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-600"
                              />
                            ) : (
                              b.name
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-[10px]">{b.slug}</td>
                          <td className="py-3 px-3 min-w-[150px]">
                            {isEditing ? <fieldset className="max-h-40 overflow-y-auto space-y-1"><legend className="sr-only">Marka kategorilerini düzenle</legend>{categoriesList.map(c => <label key={c.id} className="flex gap-1 items-center"><input type="checkbox" checked={editingBrandCategories.includes(c.id)} onChange={e => setEditingBrandCategories(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} />{c.parentName ? `${c.parentName} / ` : ""}{c.name}</label>)}</fieldset> : (categoriesList.filter(c => (b.categoryIds || []).includes(c.id)).map(c => c.parentName ? `${c.parentName} / ${c.name}` : c.name).join(", ") || "Atanmamış")}
                          </td>
                          <td className="py-3 px-3">{products.filter((p) => p.brandId === b.id).length}</td>
                          <td className="py-3 px-3">
                            <button
                              onClick={() => void handleToggleBrand(b)}
                              title={b.isActive !== false ? "Pasife almak için tıklayın" : "Aktife almak için tıklayın"}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition ${b.isActive !== false ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-stone-200 text-stone-500 hover:bg-stone-300"}`}
                            >
                              {b.isActive !== false ? "Aktif" : "Pasif"}
                            </button>
                          </td>
                          <td className="py-3 px-3">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => void handleSaveBrand()}
                                  className="flex items-center gap-1 px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold transition"
                                >
                                  <Check className="w-3 h-3" /> Kaydet
                                </button>
                                <button
                                  onClick={() => { setEditingBrandId(null); setEditingBrandName(""); }}
                                  className="flex items-center gap-1 px-2 py-1 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-[11px] font-bold transition"
                                >
                                  <X className="w-3 h-3" /> Vazgeç
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => { setEditingBrandId(b.id); setEditingBrandName(b.name); setEditingBrandCategories(b.categoryIds || []); setCatalogFeedback(null); }}
                                  className="flex items-center gap-1 px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[11px] font-bold transition"
                                >
                                  <Pencil className="w-3 h-3" /> Düzenle
                                </button>
                                <button
                                  onClick={() => void handleDeleteBrand(b)}
                                  className="flex items-center gap-1 px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-[11px] font-bold transition"
                                >
                                  <Trash2 className="w-3 h-3" /> Sil
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {catalogSubTab === "variants" && (
              <div className="space-y-4">
                <form onSubmit={handleAddVariant} className="bg-white p-5 rounded-2xl border border-stone-200 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="md:col-span-4 font-bold text-sm text-stone-900">Yeni Varyant (renk × ölçü × SKU)</div>
                  <select
                    required
                    value={variantProductId}
                    onChange={(e) => setVariantProductId(e.target.value)}
                    className="px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    <option value="">Ürün seçin</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input placeholder="Renk adı (Siyah)" value={newVariant.colorName} onChange={(e) => setNewVariant({ ...newVariant, colorName: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <input type="color" value={newVariant.colorHex} onChange={(e) => setNewVariant({ ...newVariant, colorHex: e.target.value })} className="h-10 border border-stone-300 rounded-xl" />
                  <input placeholder="Ölçü (20 mm / 50 cm)" value={newVariant.size} onChange={(e) => setNewVariant({ ...newVariant, size: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <input placeholder="Uzunluk (100m)" value={newVariant.length} onChange={(e) => setNewVariant({ ...newVariant, length: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <input placeholder="Perakende fiyat" value={newVariant.retailPrice} onChange={(e) => setNewVariant({ ...newVariant, retailPrice: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <input placeholder="Başlangıç stok" value={newVariant.initialStock} onChange={(e) => setNewVariant({ ...newVariant, initialStock: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <button type="submit" className="md:col-span-4 py-2.5 bg-amber-800 text-white font-bold rounded-xl">Varyantı Oluştur (SKU otomatik)</button>
                </form>

                <section aria-label="Varyant tablosu filtreleri" className="bg-white p-4 rounded-2xl border border-stone-200 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-sm">Varyantları Filtrele</h3><button type="button" onClick={()=>setVariantFilters({category:"",brand:"",product:"",color:"",warehouse:""})} className="font-bold text-amber-800 hover:underline">Filtreleri temizle</button></div>
                  <p className="text-stone-500">Tek bir filtre seçebilirsiniz; birden fazla seçim birlikte uygulanır. Depo seçildiğinde yalnız o depodaki satırlar gösterilir.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <label className="font-bold">Kategori<select value={variantFilters.category} onChange={e=>setVariantFilters(f=>({...f,category:e.target.value}))} className="block w-full mt-1 p-2 border border-stone-300 rounded-xl font-normal"><option value="">Tüm kategoriler</option>{variantFilters.category&&!categoriesList.some(c=>String(c.id)===variantFilters.category)&&<option value={variantFilters.category}>Seçim artık bulunmuyor</option>}{categoriesList.map(c=><option key={c.id} value={String(c.id)}>{c.parentName?`${c.parentName} / `:""}{c.name}</option>)}</select></label>
                    <label className="font-bold">Marka<select value={variantFilters.brand} onChange={e=>setVariantFilters(f=>({...f,brand:e.target.value}))} className="block w-full mt-1 p-2 border border-stone-300 rounded-xl font-normal"><option value="">Tüm markalar</option><option value="unassigned">Markasız</option>{variantFilters.brand&&variantFilters.brand!=="unassigned"&&!brandsList.some(b=>String(b.id)===variantFilters.brand)&&<option value={variantFilters.brand}>Seçim artık bulunmuyor</option>}{brandsList.map(b=><option key={b.id} value={String(b.id)}>{b.name}</option>)}</select></label>
                    <label className="font-bold">Ürün<select value={variantFilters.product} onChange={e=>setVariantFilters(f=>({...f,product:e.target.value}))} className="block w-full mt-1 p-2 border border-stone-300 rounded-xl font-normal"><option value="">Tüm ürünler</option>{variantFilters.product&&!variantProducts.some(p=>String(p.id)===variantFilters.product)&&<option value={variantFilters.product}>Seçim artık bulunmuyor</option>}{variantProducts.map(p=><option key={p.id} value={String(p.id)}>{p.name} ({p.sku}){p.isActive===false?" — pasif":""}</option>)}</select></label>
                    <label className="font-bold">Renk<select value={variantFilters.color} onChange={e=>setVariantFilters(f=>({...f,color:e.target.value}))} className="block w-full mt-1 p-2 border border-stone-300 rounded-xl font-normal"><option value="">Tüm renkler</option>{variantFilters.color&&!variantColors.some(([key])=>key===variantFilters.color)&&<option value={variantFilters.color}>Seçim artık bulunmuyor</option>}{variantColors.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
                    <label className="font-bold">Stok Yeri<select value={variantFilters.warehouse} onChange={e=>setVariantFilters(f=>({...f,warehouse:e.target.value}))} className="block w-full mt-1 p-2 border border-stone-300 rounded-xl font-normal"><option value="">Tüm depolar</option><option value="unassigned">Stok kaydı yok</option>{variantFilters.warehouse&&variantFilters.warehouse!=="unassigned"&&!warehousesList.some(w=>String(w.id)===variantFilters.warehouse)&&<option value={variantFilters.warehouse}>Seçim artık bulunmuyor</option>}{warehousesList.map(w=><option key={w.id} value={String(w.id)}>{w.name}{w.isActive===false?" — pasif":""}</option>)}</select></label>
                  </div>
                </section>

                <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
                  <p className="px-3 py-2 text-xs text-stone-500">Fiili stok her depo için ayrı gösterilir; ayrılmış miktar parantez içindedir. Stok kaydı olmayan varyant için depo atanmış sayılmaz.</p>
                  <table className="w-full min-w-[1100px] text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200"><tr>
                      {["Kategori","Marka","Ürün","Renk","Alış Fiyatı","Satış Fiyatı","Stok Adedi","Stok Yeri","Barkod","İşlem"].map(h=><th key={h} scope="col" className="py-3 px-3">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {variantTableRows.map(({p,v,stock}) => <tr key={`${v.id}-${stock?.id ?? "none"}`}>
                          <td className="py-2.5 px-3">{categoriesList.find(c=>c.id===p.categoryId)?.name || "—"}</td>
                          <td className="py-2.5 px-3">{brandsList.find(b=>b.id===p.brandId)?.name || "—"}</td>
                          <td className="py-2.5 px-3 font-semibold">{p.name}{p.isActive===false&&<span className="block text-stone-500">Pasif ürün</span>}</td>
                          <td className="py-2.5 px-3"><span className="inline-flex items-center gap-1.5">{v.colorHex&&<span className="w-3 h-3 rounded-full border border-stone-300" style={{backgroundColor:v.colorHex}} />}{variantLabel(v)||"—"}</span>{v.isActive===false&&<span className="block text-stone-500">Pasif varyant</span>}</td>
                          <td className="py-2.5 px-3">{v.buyPrice===null||v.buyPrice===undefined?"—":`${Number(v.buyPrice).toFixed(2)} TL`}</td>
                          <td className="py-2.5 px-3 font-bold">{Number(v.retailPrice).toFixed(2)} TL</td>
                          <td className="py-2.5 px-3">{stock?<>{stock.physicalQty}<span className="block text-stone-500">Ayrılmış: {stock.reservedQty}</span></>:"0"}</td>
                          <td className="py-2.5 px-3">{stock?(warehousesList.find(w=>w.id===stock.warehouseId)?.name || `Bilinmeyen depo #${stock.warehouseId}`):"Stok kaydı yok"}{stock&&warehousesList.find(w=>w.id===stock.warehouseId)?.isActive===false&&" (pasif)"}{stock&&stock.productId!==p.id&&<span className="block text-rose-700">Ürün bağlantısı tutarsız</span>}</td>
                          <td className="py-2.5 px-3 font-mono">{v.barcode||"—"}</td>
                          <td className="py-2.5 px-3"><div className="flex gap-2">
                            <button type="button" aria-label={`${p.name} ${variantLabel(v)||v.sku} varyantını düzenle`} onClick={()=>{setVariantEditDirty(false);setVariantEditBusy(false);setTableVariantEditor({productId:p.id,variantId:v.id,name:p.name});}} className="font-bold text-amber-800 hover:underline">Düzenle</button>
                            {(isSuper||(matrixLoaded&&myMatrixRow.catalog===true&&myMatrixRow.productDelete===true))&&<button type="button" disabled={deletingVariantId!==null} aria-label={`${p.name} ${variantLabel(v)||v.sku} varyantını sil`} onClick={()=>void handleDeleteVariant(v.id)} className="font-bold text-rose-700 hover:underline disabled:opacity-50">{deletingVariantId===v.id?"Siliniyor…":"Sil"}</button>}
                          </div></td>
                        </tr>)}
                    </tbody>
                  </table>
                  {variantTableRows.length===0&&<p role="status" className="p-4 text-xs text-stone-500">Filtrelere uygun varyant bulunamadı.</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: WMS & MULTI-WAREHOUSE STOCKS */}
        {/* ============================================================ */}
        {activeTab === "wms" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-stone-900">Çoklu Depo Yönetimi & Stok Defteri</h2>
                <p className="text-xs text-stone-500">
                  Depo bazlı stok seviyeleri, raf lokasyonları ve değiştirilemez hareket kayıtları.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAdjustOpen(true)}
                  className="px-3 py-2 bg-stone-800 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Hızlı Düzeltme</span>
                </button>
              </div>
            </div>

            {/* FAZ 3 — WMS alt sekmeleri */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "warehouses" as const, label: `Depolar (${warehousesList.length})` },
                { id: "balances" as const, label: "Stok Bakiyeleri" },
                { id: "transfers" as const, label: `Transferler (${transfers.filter((t) => t.status !== "RECEIVED" && t.status !== "CANCELLED").length})` },
                { id: "counts" as const, label: "Sayım Oturumları" },
                { id: "locations" as const, label: `Lokasyonlar (${locationsList.length})` },
                { id: "reservations" as const, label: `Rezervasyonlar (${reservationsList.filter((r) => r.status === "ACTIVE").length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setWmsSubTab(t.id); setWmsFeedback(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    wmsSubTab === t.id ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200 hover:border-amber-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              {wmsBusy && <span className="text-[10px] text-stone-400 self-center ml-2">Yükleniyor…</span>}
            </div>

            {wmsFeedback && (
              <div className={`p-2.5 rounded-xl text-xs font-medium border ${wmsFeedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                {wmsFeedback.text}
              </div>
            )}

            {/* Warehouse Filter Chips */}
            {wmsSubTab === "balances" && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setSelectedWhFilter("ALL")}
                className={`px-3 py-1.5 rounded-xl font-bold transition ${
                  selectedWhFilter === "ALL" ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200"
                }`}
              >
                Tüm Depolar
              </button>
              {warehousesList.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedWhFilter(String(w.id))}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${
                    selectedWhFilter === String(w.id) ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200"
                  }`}
                >
                  {w.name} ({w.code})
                </button>
              ))}
            </div>
            )}

            {/* Inventory Balances Table */}
            {wmsSubTab === "balances" && (
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs space-y-3 p-4">
              <h3 className="font-bold text-sm text-stone-900">Depo Stok Bakiyeleri</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-2.5 px-3">Depo</th>
                      <th className="py-2.5 px-3">Ürün / Varyant</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Raf / Lokasyon</th>
                      <th className="py-2.5 px-3">Fiziksel Stok</th>
                      <th className="py-2.5 px-3">Rezerve</th>
                      <th className="py-2.5 px-3">Kullanılabilir Stok</th>
                      <th className="py-2.5 px-3">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {inventoryList
                      .filter((i) => selectedWhFilter === "ALL" || String(i.warehouseId) === selectedWhFilter)
                      .map((inv) => (
                        <tr key={inv.id} className="hover:bg-stone-50/50">
                          <td className="py-3 px-3 font-semibold text-stone-700">
                            {inv.warehouseName}
                            <span className="block text-[10px] text-stone-400 font-mono">{inv.warehouseCode}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-stone-900 block">{inv.productName}</span>
                            {inv.variantName && (
                              <span className="text-[10px] text-amber-800 font-semibold">{inv.variantName}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px]">{inv.sku}</td>
                          <td className="py-3 px-3">
                            <span className="bg-stone-100 text-stone-800 px-2 py-0.5 rounded font-mono font-bold text-[10px]">
                              {inv.locationCode}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold">{inv.physicalQty} Adet</td>
                          <td className="py-3 px-3 text-stone-400">{inv.reservedQty} Adet</td>
                          <td className="py-3 px-3 font-black text-sm text-stone-900">
                            {inv.available} Adet
                          </td>
                          <td className="py-3 px-3">
                            {inv.isCritical ? (
                              <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 w-max">
                                <AlertTriangle className="w-3 h-3" />
                                Kritik Stok
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                Yeterli
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* Immutable Stock Ledger Activity Feed */}
            {wmsSubTab === "balances" && (
            <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-stone-900">
                    Stok Hareket Defteri (Stock Ledger - Denetim Kayıtları)
                  </h3>
                  <p className="text-[11px] text-stone-400">
                    Her mal kabul, POS satışı, transfer ve sayım kalıcı olarak loglanır.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-2.5 px-3">Tarih</th>
                      <th className="py-2.5 px-3">İşlem Tipi</th>
                      <th className="py-2.5 px-3">Depo</th>
                      <th className="py-2.5 px-3">Miktar</th>
                      <th className="py-2.5 px-3">Ref Belge</th>
                      <th className="py-2.5 px-3">İşlemi Yapan</th>
                      <th className="py-2.5 px-3">Açıklama</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {ledger.map((lg) => (
                      <tr key={lg.id} className="hover:bg-stone-50/50">
                        <td className="py-2.5 px-3 text-stone-500 whitespace-nowrap">
                          {new Date(lg.createdAt).toLocaleString("tr-TR")}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              lg.transactionType.includes("TRANSFER")
                                ? "bg-sky-100 text-sky-800"
                                : lg.transactionType === "SALE"
                                ? "bg-amber-100 text-amber-900"
                                : lg.transactionType === "PURCHASE"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-stone-100 text-stone-800"
                            }`}
                          >
                            {lg.transactionType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold">{lg.warehouseName || "Depo"}</td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          <span className={lg.quantity > 0 ? "text-emerald-700" : "text-rose-700"}>
                            {lg.quantity > 0 ? `+${lg.quantity}` : lg.quantity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-stone-600">
                          {lg.referenceId || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-stone-600">{lg.createdBy}</td>
                        <td className="py-2.5 px-3 text-stone-500 truncate max-w-[200px]">{lg.note}</td>
                      </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* ---- FAZ 3 / WMS ALT-SEKME: DEPOLAR (Depo Ekleme) ---- */}
            {wmsSubTab === "warehouses" && (
              <div className="flex flex-col gap-4">
                <section className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
                  <h3 className="font-bold text-sm">POS ve online ortak satış deposu</h3>
                  <p className="text-xs text-stone-600">İki satış kanalı aynı depodaki stokları kullanır. Seçim diğer depolardaki stokları taşımaz. Açık vardiya, sipariş veya rezervasyon varsa önce sonuçlandırın.</p>
                  <p className="text-xs font-bold">Şu an: {warehousesList.find((w)=>w.id===salesWarehouseId)?.name || "Henüz seçilmedi"}</p>
                  <div className="flex gap-2"><select aria-label="Ortak satış deposu" value={salesWarehouseChoice} onChange={(e)=>setSalesWarehouseChoice(e.target.value)} className="border rounded-lg p-2 text-xs"><option value="">Depo seçin</option>{warehousesList.filter((w)=>w.isActive!==false).map((w)=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
                    <button type="button" disabled={!salesWarehouseChoice||salesWarehouseBusy||!["SUPER_ADMIN","STORE_MANAGER"].includes(currentRole)} onClick={handleSelectSalesWarehouse} className="rounded-lg bg-amber-800 text-white px-4 py-2 text-xs font-bold disabled:opacity-50">Ortak depoyu kaydet</button></div>
                </section>
                <form onSubmit={handleAddWarehouseForm} className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-stone-900">Yeni Depo Ekle</h3>
                    <p className="text-[11px] text-stone-400">Depo kodu addan otomatik üretilir (örn. Bursa Depo → BRD).</p>
                    <p className="mt-1 text-[11px] text-stone-500">Aktif depo ve mağazalar <Link href="/magazalarimiz" target="_blank" rel="noopener noreferrer" className="font-semibold text-amber-800 underline underline-offset-2">Mağazalarımız sayfasında</Link> gösterilir; pasif olanlar gizlenir.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-4">
                      <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Depo Adı *</label>
                      <input
                        value={newWarehouseForm.name}
                        onChange={(e) => setNewWarehouseForm({ ...newWarehouseForm, name: e.target.value })}
                        placeholder="örn. Bursa Bölge Deposu"
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs h-[38px]"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Depo Tipi</label>
                      <select
                        value={newWarehouseForm.type}
                        onChange={(e) => setNewWarehouseForm({ ...newWarehouseForm, type: e.target.value })}
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs h-[38px]"
                      >
                        <option value="CENTRAL">Merkez Depo (CENTRAL)</option>
                        <option value="STORE">Mağaza Deposu (STORE)</option>
                        <option value="ONLINE">E-Ticaret Deposu (ONLINE)</option>
                        <option value="WHOLESALE">Toptan Deposu (WHOLESALE)</option>
                      </select>
                    </div>
                    <div className="md:col-span-5">
                      <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Adres (opsiyonel)</label>
                      <input
                        value={newWarehouseForm.address}
                        onChange={(e) => setNewWarehouseForm({ ...newWarehouseForm, address: e.target.value })}
                        placeholder="Mahalle, cadde, şehir…"
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs h-[38px]"
                      />
                    </div>
                  </div>
                  <div className="flex md:justify-end">
                    <button
                      type="submit"
                      disabled={addingWarehouseForm}
                      className="w-full md:w-auto md:px-8 py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition"
                    >
                      {addingWarehouseForm ? "Ekleniyor…" : "Depo Oluştur"}
                    </button>
                  </div>
                </form>
                <div className="w-full bg-white rounded-2xl border border-stone-200 overflow-x-auto">
                  <table className="w-full text-xs text-left min-w-[760px]">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-2.5 px-3">Kod</th>
                        <th className="py-2.5 px-3">Depo Adı</th>
                        <th className="py-2.5 px-3">Tip</th>
                        <th className="py-2.5 px-3">Adres</th>
                        <th className="py-2.5 px-3">Durum</th>
                        <th className="py-2.5 px-3 text-right">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {warehousesList.map((w) => (
                        <tr key={w.id} className="hover:bg-stone-50/50">
                          <td className="py-2.5 px-3 font-mono font-bold">{w.code}</td>
                          <td className="py-2.5 px-3 font-semibold text-stone-800">{w.name}{w.id === salesWarehouseId && <span className="block text-xs text-amber-700">POS + online ortak depo</span>}</td>
                          <td className="py-2.5 px-3">
                            <span className="bg-stone-100 text-stone-800 px-2 py-0.5 rounded font-bold text-[10px]">{w.type}</span>
                          </td>
                          <td className="py-2.5 px-3 text-stone-500 truncate max-w-[220px]">{w.address || "-"}</td>
                          <td className="py-2.5 px-3">
                            {w.isActive === false ? (
                              <span className="bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full font-bold text-[10px]">Pasif</span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">Aktif</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleWarehouse(w.id, w.isActive === false)}
                                disabled={(w.id === salesWarehouseId || (!salesWarehouseId && (w.id === 2 || w.id === 3))) && w.isActive !== false}
                                title={w.isActive === false ? "Depoyu aktif yap" : "Depoyu pasife al"}
                                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition ${
                                  w.isActive === false
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                    : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                                }`}
                              >
                                <Power className="w-3 h-3" />
                                <span className="hidden sm:inline">{w.isActive === false ? "Aktife Al" : "Pasife Al"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWarehouse(w.id, w.name)}
                                disabled={w.id === salesWarehouseId || (!salesWarehouseId && (w.id === 2 || w.id === 3))}
                                title={w.id === salesWarehouseId ? "Ortak satış deposu silinemez" : "Depoyu sil"}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 transition"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span className="hidden sm:inline">Sil</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {warehousesList.length === 0 && (
                        <tr><td colSpan={6} className="py-8 text-center text-stone-400">Depo yok.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ---- FAZ 3 / WMS ALT-SEKME: TRANSFERLER ---- */}
            {wmsSubTab === "transfers" && (
              <div className="space-y-4">
                <form onSubmit={handleCreateTransfer} className="bg-white p-4 rounded-2xl border border-stone-200 grid grid-cols-1 md:grid-cols-6 gap-2 text-xs">
                  <div className="md:col-span-6 font-bold text-sm text-stone-900">Yeni Transfer Talebi (REQUESTED)</div>
                  <select value={newTransfer.fromWarehouseId} onChange={(e) => setNewTransfer({ ...newTransfer, fromWarehouseId: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl">
                    {warehousesList.map((w) => <option key={w.id} value={w.id}>Çıkış: {w.name}</option>)}
                  </select>
                  <select value={newTransfer.toWarehouseId} onChange={(e) => setNewTransfer({ ...newTransfer, toWarehouseId: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl">
                    {warehousesList.map((w) => <option key={w.id} value={w.id}>Varış: {w.name}</option>)}
                  </select>
                  <select value={newTransfer.productId} onChange={(e) => setNewTransfer({ ...newTransfer, productId: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl md:col-span-2">
                    <option value="">Ürün seçin…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min="1" value={newTransfer.qty} onChange={(e) => setNewTransfer({ ...newTransfer, qty: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" placeholder="Adet" />
                  <button type="submit" className="px-3 py-2 bg-sky-800 text-white font-bold rounded-xl">Talep Oluştur</button>
                </form>

                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-2.5 px-3">No</th>
                        <th className="py-2.5 px-3">Güzergâh</th>
                        <th className="py-2.5 px-3">Kalem</th>
                        <th className="py-2.5 px-3">Durum</th>
                        <th className="py-2.5 px-3">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {transfers.map((t) => (
                        <tr key={t.id} className="hover:bg-stone-50/50">
                          <td className="py-2.5 px-3 font-mono font-bold">{t.transferNumber}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-stone-800">{t.fromWarehouseName}</span>
                            <span className="text-stone-400"> → </span>
                            <span className="font-semibold text-sky-800">{t.toWarehouseName}</span>
                          </td>
                          <td className="py-2.5 px-3 text-stone-600">
                            {(t.items || []).map((it: any) => (
                              <span key={it.id} className="block truncate max-w-[240px]">{it.productName} × {it.qty}</span>
                            ))}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              t.status === "RECEIVED" ? "bg-emerald-100 text-emerald-800"
                              : t.status === "SHIPPED" ? "bg-sky-100 text-sky-800"
                              : t.status === "APPROVED" ? "bg-amber-100 text-amber-900"
                              : t.status === "CANCELLED" ? "bg-stone-200 text-stone-500"
                              : "bg-stone-100 text-stone-700"
                            }`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {t.status === "REQUESTED" && (
                                <>
                                  <button onClick={() => void transferAction("APPROVE", t.id)} className="px-2 py-1 bg-amber-700 text-white rounded-lg text-[10px] font-bold">Onayla</button>
                                  <button onClick={() => void transferAction("SHIP", t.id)} className="px-2 py-1 bg-sky-700 text-white rounded-lg text-[10px] font-bold">Sevk Et</button>
                                  <button onClick={() => void transferAction("CANCEL", t.id)} className="px-2 py-1 bg-stone-300 text-stone-700 rounded-lg text-[10px] font-bold">İptal</button>
                                </>
                              )}
                              {t.status === "APPROVED" && (
                                <button onClick={() => void transferAction("SHIP", t.id)} className="px-2 py-1 bg-sky-700 text-white rounded-lg text-[10px] font-bold">Sevk Et</button>
                              )}
                              {t.status === "SHIPPED" && (
                                <button onClick={() => void transferAction("RECEIVE", t.id)} className="px-2 py-1 bg-emerald-700 text-white rounded-lg text-[10px] font-bold">Teslim Al</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {transfers.length === 0 && (
                        <tr><td colSpan={5} className="py-8 text-center text-stone-400">Henüz transfer kaydı yok.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ---- FAZ 3 / WMS ALT-SEKME: SAYIM ---- */}
            {wmsSubTab === "counts" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3 h-max">
                  <h3 className="font-bold text-sm text-stone-900">Barkodlu Sayım Oturumu</h3>
                  {!activeCountSession ? (
                    <>
                      <p className="text-xs text-stone-500">
                        Seçili depo ({warehousesList.find((w) => String(w.id) === (selectedWhFilter === "ALL" ? defaultWarehouseId : selectedWhFilter))?.name || "depo seçilmedi"}) için sayım başlatın; ardından barkod okutup adet girin.
                      </p>
                      <button onClick={() => void handleStartCount()} className="w-full py-2.5 bg-amber-800 text-white text-xs font-bold rounded-xl">
                        Sayım Başlat
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs font-mono font-bold text-amber-900">
                        {activeCountSession.countNumber} — açık oturum
                      </div>
                      <form onSubmit={handleCountScan} className="space-y-2">
                        <input
                          autoFocus
                          value={countBarcodeInput}
                          onChange={(e) => setCountBarcodeInput(e.target.value)}
                          placeholder="Barkod okutun…"
                          className="w-full px-3 py-2 border border-amber-300 rounded-xl font-mono text-xs"
                        />
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            min="0"
                            value={countQtyInput}
                            onChange={(e) => setCountQtyInput(e.target.value)}
                            className="w-24 px-3 py-2 border border-stone-300 rounded-xl text-xs"
                          />
                          <button type="submit" className="flex-1 py-2 bg-stone-900 text-white text-xs font-bold rounded-xl">Kaydet</button>
                        </div>
                      </form>
                      <button onClick={() => void handleCompleteCount()} className="w-full py-2.5 bg-emerald-700 text-white text-xs font-bold rounded-xl">
                        Sayımı Tamamla & Farkları İşle ({countedItems.filter((i) => i.difference !== 0).length})
                      </button>
                    </>
                  )}
                  <div className="max-h-56 overflow-y-auto divide-y divide-stone-100 text-xs">
                    {countedItems.map((it) => (
                      <div key={it.id} className="py-2 flex justify-between">
                        <div className="min-w-0">
                          <span className="font-bold block truncate">{it.productName}</span>
                          <span className="text-[10px] text-stone-400">beklenen {it.expectedQty} → sayılan {it.countedQty}</span>
                        </div>
                        <span className={`font-black ${it.difference === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {it.difference === 0 ? "✓" : `${it.difference > 0 ? "+" : ""}${it.difference}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden h-max">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-2.5 px-3">Sayım No</th>
                        <th className="py-2.5 px-3">Depo</th>
                        <th className="py-2.5 px-3">Kalem</th>
                        <th className="py-2.5 px-3">Durum</th>
                        <th className="py-2.5 px-3">Tarih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {countSessions.map((s) => (
                        <tr key={s.id}>
                          <td className="py-2.5 px-3 font-mono font-bold">{s.countNumber}</td>
                          <td className="py-2.5 px-3">{s.warehouseName}</td>
                          <td className="py-2.5 px-3">{s.items?.length || 0} kalem / {s.items?.filter((i: any) => i.difference !== 0).length || 0} fark</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : s.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-900" : "bg-stone-200 text-stone-500"}`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-stone-400">{new Date(s.startedAt).toLocaleDateString("tr-TR")}</td>
                        </tr>
                      ))}
                      {countSessions.length === 0 && (
                        <tr><td colSpan={5} className="py-8 text-center text-stone-400">Sayım oturumu yok.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ---- FAZ 3 / WMS ALT-SEKME: LOKASYONLAR ---- */}
            {wmsSubTab === "locations" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <form onSubmit={handleAddLocation} className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3 h-max">
                  <h3 className="font-bold text-sm text-stone-900">Yeni Raf / Lokasyon</h3>
                  <select value={newLocation.warehouseId} onChange={(e) => setNewLocation({ ...newLocation, warehouseId: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs">
                    {warehousesList.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    {(["zone", "aisle", "rack", "shelf"] as const).map((f) => (
                      <div key={f}>
                        <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">{f === "zone" ? "Bölge" : f === "aisle" ? "Koridor" : f === "rack" ? "Raf" : "Göz"}</label>
                        <input
                          value={newLocation[f]}
                          onChange={(e) => setNewLocation({ ...newLocation, [f]: e.target.value })}
                          className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs font-mono"
                        />
                      </div>
                    ))}
                  </div>
                  <button type="submit" className="w-full py-2.5 bg-amber-800 text-white text-xs font-bold rounded-xl">Lokasyon Oluştur</button>
                </form>
                <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden h-max">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-2.5 px-3">Kod</th>
                        <th className="py-2.5 px-3">Depo</th>
                        <th className="py-2.5 px-3">Bölge</th>
                        <th className="py-2.5 px-3">Koridor</th>
                        <th className="py-2.5 px-3">Raf</th>
                        <th className="py-2.5 px-3">Göz</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {locationsList.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2.5 px-3 font-mono font-bold">{l.locationCode}</td>
                          <td className="py-2.5 px-3">{l.warehouseName}</td>
                          <td className="py-2.5 px-3">{l.zone}</td>
                          <td className="py-2.5 px-3">{l.aisle}</td>
                          <td className="py-2.5 px-3">{l.rack}</td>
                          <td className="py-2.5 px-3">{l.shelf}</td>
                        </tr>
                      ))}
                      {locationsList.length === 0 && (
                        <tr><td colSpan={6} className="py-8 text-center text-stone-400">Lokasyon yok.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ---- FAZ 3 / WMS ALT-SEKME: REZERVASYONLAR ---- */}
            {wmsSubTab === "reservations" && (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-stone-900">Stok Rezervasyon Motoru</h3>
                    <p className="text-[11px] text-stone-500">
                      Checkout sırasında stok {">"}15 dk kilitlenir; süre dolarsa otomatik serbest kalır (son ürün çift satışa kapanır).
                    </p>
                  </div>
                  <button onClick={() => void handleReserveDemo()} className="px-3 py-2 bg-amber-800 text-white text-xs font-bold rounded-xl">
                    Demo Rezervasyon (2 adet)
                  </button>
                </div>
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-2.5 px-3">Referans</th>
                        <th className="py-2.5 px-3">Ürün</th>
                        <th className="py-2.5 px-3">Depo</th>
                        <th className="py-2.5 px-3">Adet</th>
                        <th className="py-2.5 px-3">Bitiş</th>
                        <th className="py-2.5 px-3">Durum</th>
                        <th className="py-2.5 px-3">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {reservationsList.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 px-3 font-mono text-[10px]">{r.referenceId}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold block truncate max-w-[200px]">{r.productName}</span>
                            {r.variantName && <span className="text-[10px] text-amber-800">{r.variantName}</span>}
                          </td>
                          <td className="py-2.5 px-3">{r.warehouseName}</td>
                          <td className="py-2.5 px-3 font-bold">{r.qty}</td>
                          <td className="py-2.5 px-3 text-stone-500">{new Date(r.expiresAt).toLocaleTimeString("tr-TR")}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.status === "ACTIVE" ? "bg-sky-100 text-sky-800"
                              : r.status === "CONSUMED" ? "bg-emerald-100 text-emerald-800"
                              : "bg-stone-200 text-stone-500"
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {r.status === "ACTIVE" && (
                              <button onClick={() => void handleReleaseReservation(r.referenceId)} className="px-2 py-1 bg-stone-300 text-stone-700 rounded-lg text-[10px] font-bold">
                                Serbest Bırak
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {reservationsList.length === 0 && (
                        <tr><td colSpan={6} className="py-8 text-center text-stone-400">Aktif/geçmiş rezervasyon yok.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* FAZ 5 / TAB: RAPORLAR & ANALİTİK */}
        {/* ============================================================ */}
        {activeTab === "reports" && reportsAllowed && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">FAZ 5 — Yönetim</span>
                <h2 className="text-xl font-black text-stone-900">Raporlar & Analitik</h2>
                <p className="text-xs text-stone-500">Satış, ürün performansı, stok, müşteri ve finansal raporlar — CSV dışa aktarma destekli.</p>
              </div>
              <div className="flex items-center gap-1.5">
                {[7, 30, 90, 365].map((d) => (
                  <button
                    key={d}
                    onClick={() => setReportDays(d)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition ${reportDays === d ? "bg-stone-900 text-white" : "bg-white text-stone-600 border border-stone-200"}`}
                  >
                    {d === 365 ? "1 Yıl" : `${d} Gün`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "sales" as const, label: "Satış", icon: BarChart3 },
                { id: "products" as const, label: "Ürün Performansı", icon: Package },
                { id: "stock" as const, label: "Stok", icon: BoxesIcon },
                { id: "customers" as const, label: "Müşteri", icon: Users },
                { id: "finance" as const, label: "Finansal", icon: Wallet },
                { id: "zreports" as const, label: "Gün Sonu & Z-Raporları", icon: Receipt },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setReportSubTab(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      reportSubTab === t.id ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200 hover:border-amber-300"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
              <button
                onClick={downloadReportCsv}
                disabled={csvBusy || reportSubTab === "zreports" || (reportSubTab === "customers" && (!customerReportsAllowed || !reportData?.customers))}
                title={reportSubTab === "zreports" ? "Z raporları CSV olarak dışa aktarılmaz" : reportSubTab === "customers" && (!customerReportsAllowed || reportData?.customers === null) ? "Müşteri raporu için CRM yetkisi gerekir" : undefined}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-stone-900 text-white hover:bg-black disabled:opacity-60 transition ml-auto"
              >
                <Download className="w-3.5 h-3.5" />
                {csvBusy ? "İndiriliyor…" : "CSV İndir"}
              </button>
              {csvError && <span className="text-[11px] font-bold text-rose-700 basis-full text-right">{csvError}</span>}
            </div>

            {reportBusy && <div className="text-xs text-stone-500">Hesaplanıyor…</div>}
            {reportError && <p role="alert" className="text-xs text-rose-700">{reportError}</p>}

            {reportData && reportSubTab === "sales" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-stone-200">
                    <span className="text-[10px] font-bold uppercase text-stone-500">Bugünkü Ciro</span>
                    <div className="text-2xl font-black text-stone-900 mt-1">{reportData.sales.today.toFixed(2)} TL</div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-stone-200">
                    <span className="text-[10px] font-bold uppercase text-stone-500">{reportDays} Günlük Ciro</span>
                    <div className="text-2xl font-black text-emerald-800 mt-1">{reportData.sales.revenue.toFixed(2)} TL</div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-stone-200">
                    <span className="text-[10px] font-bold uppercase text-stone-500">Sipariş Sayısı</span>
                    <div className="text-2xl font-black text-stone-900 mt-1">{reportData.period.orderCount}</div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-stone-200">
                    <span className="text-[10px] font-bold uppercase text-stone-500">İndirimler</span>
                    <div className="text-2xl font-black text-rose-700 mt-1">{reportData.sales.discounts.toFixed(2)} TL</div>
                  </div>
                </div>

                {/* Kanal dağılımı */}
                <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
                  <h3 className="font-bold text-sm text-stone-900 flex items-center gap-1.5"><PieChart className="w-4 h-4 text-amber-800" /> Kanal Bazlı Satış</h3>
                  {reportData.sales.byChannel.map((ch: any) => (
                    <div key={ch.channel} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span>{ch.channel === "POS" ? "Fiziki Mağaza (POS)" : "Online B2C"}</span>
                        <span>{ch.revenue.toFixed(2)} TL · %{ch.share}</span>
                      </div>
                      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-700 rounded-full" style={{ width: `${Math.max(2, ch.share)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Günlük trend */}
                <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
                  <h3 className="font-bold text-sm text-stone-900">Günlük Ciro Trendi</h3>
                  {reportData.sales.dailySeries.length === 0 ? (
                    <p className="text-xs text-stone-400">Seçilen dönemde satış yok.</p>
                  ) : (
                    <div className="flex items-end gap-1 h-40">
                      {reportData.sales.dailySeries.slice(-30).map((d: any) => {
                        const max = Math.max(...reportData.sales.dailySeries.map((x: any) => x.total), 1);
                        return (
                          <div key={d.date} className="flex-1 flex flex-col items-center justify-end group relative" title={`${d.date}: ${d.total} TL`}>
                            <div className="w-full bg-gradient-to-t from-amber-800 to-amber-500 rounded-t group-hover:from-amber-900" style={{ height: `${Math.max(4, (d.total / max) * 100)}%` }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {reportData && reportSubTab === "products" && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                    <h3 className="font-bold text-sm text-stone-900">En Çok Satanlar (Ciro)</h3>
                    <span className="text-[10px] text-stone-400">{reportData.products.topSellers.length} ürün</span>
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr><th className="py-2.5 px-3">Ürün</th><th className="py-2.5 px-3">Marka</th><th className="py-2.5 px-3">Adet</th><th className="py-2.5 px-3">Ciro</th><th className="py-2.5 px-3">Brüt Kâr</th><th className="py-2.5 px-3">Marj</th></tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {reportData.products.topSellers.map((p: any) => (
                        <tr key={p.productId}>
                          <td className="py-2.5 px-3"><span className="font-semibold block truncate max-w-[220px]">{p.productName}</span><span className="text-[10px] text-stone-400 font-mono">{p.sku}</span></td>
                          <td className="py-2.5 px-3">{p.brandName}</td>
                          <td className="py-2.5 px-3 font-bold">{p.qtySold}</td>
                          <td className="py-2.5 px-3 font-bold">{p.revenue.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-emerald-700 font-semibold">{p.grossProfit.toFixed(2)}</td>
                          <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded font-bold text-[10px] ${p.margin >= 30 ? "bg-emerald-100 text-emerald-800" : p.margin >= 15 ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-800"}`}>%{p.margin}</span></td>
                        </tr>
                      ))}
                      {reportData.products.topSellers.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-stone-400">Dönemde satış yok.</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-stone-200">
                    <h3 className="font-bold text-sm text-stone-900 mb-3 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-emerald-700" /> En Kârlı Ürünler</h3>
                    <div className="space-y-2 text-xs">
                      {reportData.products.mostProfitable.map((p: any) => (
                        <div key={p.productId} className="flex justify-between"><span className="truncate max-w-[180px]">{p.productName}</span><span className="font-bold text-emerald-700">{p.grossProfit.toFixed(2)} TL</span></div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-rose-200">
                    <h3 className="font-bold text-sm text-stone-900 mb-3 flex items-center gap-1.5"><TrendingDown className="w-4 h-4 text-rose-700" /> Ölü Stok (Satılmayan)</h3>
                    <p className="text-[10px] text-rose-700 font-bold mb-2">Toplam bağlı sermaye: {reportData.products.deadStockValue.toFixed(2)} TL</p>
                    <div className="space-y-2 text-xs">
                      {reportData.products.deadStock.slice(0, 6).map((d: any, i: number) => (
                        <div key={i} className="flex justify-between"><span className="truncate max-w-[160px]">{d.productName}</span><span className="text-stone-500">{d.physicalQty} ad · {d.stockValue.toFixed(0)} TL</span></div>
                      ))}
                      {reportData.products.deadStock.length === 0 && <p className="text-stone-400">Ölü stok yok.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {reportData && reportSubTab === "stock" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-stone-200"><span className="text-[10px] font-bold uppercase text-stone-500">Toplam Stok Değeri</span><div className="text-2xl font-black text-stone-900 mt-1">{reportData.stock.totalStockValue.toFixed(0)} TL</div></div>
                  <div className="bg-white p-5 rounded-2xl border border-stone-200"><span className="text-[10px] font-bold uppercase text-stone-500">Kritik Stok</span><div className="text-2xl font-black text-rose-700 mt-1">{reportData.stock.criticalCount}</div></div>
                  <div className="bg-white p-5 rounded-2xl border border-stone-200"><span className="text-[10px] font-bold uppercase text-stone-500">Toplam Adet</span><div className="text-2xl font-black text-stone-900 mt-1">{reportData.stock.totalQty}</div></div>
                  <div className="bg-white p-5 rounded-2xl border border-stone-200"><span className="text-[10px] font-bold uppercase text-stone-500">Devir Hızı (yıllık)</span><div className="text-2xl font-black text-amber-800 mt-1">{reportData.stock.turnover}x</div></div>
                </div>
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-stone-100"><h3 className="font-bold text-sm text-stone-900">Depo Bazlı Stok Dağılımı</h3></div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200"><tr><th className="py-2.5 px-3">Depo</th><th className="py-2.5 px-3">SKU</th><th className="py-2.5 px-3">Toplam Adet</th><th className="py-2.5 px-3">Stok Değeri</th></tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {reportData.stock.byWarehouse.map((w: any) => (
                        <tr key={w.code}><td className="py-2.5 px-3 font-semibold">{w.warehouse}</td><td className="py-2.5 px-3">{w.skuCount}</td><td className="py-2.5 px-3">{w.totalQty}</td><td className="py-2.5 px-3 font-bold">{w.stockValue.toFixed(2)} TL</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {reportSubTab === "customers" && (!customerReportsAllowed || reportData?.customers === null) && (
              <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Müşteri raporunu ve CSV çıktısını görmek için Raporlar ve CRM erişim yetkileri birlikte gerekir.</p>
            )}
            {reportData?.customers && customerReportsAllowed && reportSubTab === "customers" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {[
                    { label: "Toplam Müşteri", value: reportData.customers.total, tone: "text-stone-900" },
                    { label: "Yeni", value: reportData.customers.newCount, tone: "text-sky-700" },
                    { label: "Aktif", value: reportData.customers.activeCount, tone: "text-emerald-700" },
                    { label: "Pasif (60+ gün)", value: reportData.customers.passiveCount, tone: "text-rose-700" },
                    { label: "VIP", value: reportData.customers.vipCount, tone: "text-amber-800" },
                  ].map((k) => (
                    <div key={k.label} className="bg-white p-4 rounded-2xl border border-stone-200">
                      <span className="text-[9px] font-bold uppercase text-stone-500 block">{k.label}</span>
                      <div className={`text-xl font-black mt-1 ${k.tone}`}>{k.value}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-stone-100"><h3 className="font-bold text-sm text-stone-900">Müşteri Yaşam Boyu Değer (LTV)</h3></div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200"><tr><th className="py-2.5 px-3">Müşteri</th><th className="py-2.5 px-3">Segment</th><th className="py-2.5 px-3">Sipariş</th><th className="py-2.5 px-3">Toplam</th><th className="py-2.5 px-3">Ort. Sepet</th><th className="py-2.5 px-3">Son (gün)</th><th className="py-2.5 px-3">Aktivite</th></tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {reportData.customers.top.map((c: any) => (
                        <tr key={c.name}>
                          <td className="py-2.5 px-3 font-semibold">{c.name}</td>
                          <td className="py-2.5 px-3">{c.segment}</td>
                          <td className="py-2.5 px-3">{c.orderCount}</td>
                          <td className="py-2.5 px-3 font-bold">{c.totalSpend.toFixed(2)} TL</td>
                          <td className="py-2.5 px-3">{c.avgBasket.toFixed(2)}</td>
                          <td className="py-2.5 px-3">{c.lastOrderDaysAgo ?? "—"}</td>
                          <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.activity === "AKTİF" ? "bg-emerald-100 text-emerald-800" : c.activity === "PASİF" ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-600"}`}>{c.activity}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {reportSubTab === "zreports" && <ZReportsPanel />}

            {reportData && reportSubTab === "finance" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-stone-200"><span className="text-[10px] font-bold uppercase text-stone-500">Ciro</span><div className="text-2xl font-black text-stone-900 mt-1">{reportData.finance.revenue.toFixed(2)} TL</div></div>
                  <div className="bg-white p-5 rounded-2xl border border-stone-200"><span className="text-[10px] font-bold uppercase text-stone-500">SMM (COGS)</span><div className="text-2xl font-black text-stone-600 mt-1">{reportData.finance.cogs.toFixed(2)} TL</div></div>
                  <div className="bg-white p-5 rounded-2xl border border-emerald-200 bg-emerald-50"><span className="text-[10px] font-bold uppercase text-emerald-700">Brüt Kâr</span><div className="text-2xl font-black text-emerald-800 mt-1">{reportData.finance.grossProfit.toFixed(2)} TL</div></div>
                  <div className="bg-white p-5 rounded-2xl border border-amber-200 bg-amber-50"><span className="text-[10px] font-bold uppercase text-amber-800">Brüt Marj</span><div className="text-2xl font-black text-amber-900 mt-1">%{reportData.finance.margin}</div></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-2.5 text-xs">
                    <h3 className="font-bold text-sm text-stone-900">Finansal Özet</h3>
                    {[
                      ["İndirimler", reportData.finance.discounts, "text-rose-700"],
                      ["Kargo Geliri", reportData.finance.shipping, "text-stone-700"],
                      ["İade Tutarları", reportData.finance.returns, "text-rose-700"],
                      ["Ortalama Sepet", reportData.finance.avgBasket, "text-stone-900"],
                    ].map(([label, val, tone]) => (
                      <div key={String(label)} className="flex justify-between border-b border-stone-100 pb-1.5"><span className="text-stone-500">{label as string}</span><span className={`font-bold ${tone as string}`}>{Number(val).toFixed(2)} TL</span></div>
                    ))}
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-stone-200">
                    <h3 className="font-bold text-sm text-stone-900 mb-3">Kâr Dağılımı</h3>
                    <div className="h-4 rounded-full overflow-hidden flex bg-stone-100">
                      <div className="bg-emerald-600" style={{ width: `${reportData.finance.revenue ? (reportData.finance.grossProfit / reportData.finance.revenue) * 100 : 0}%` }} title="Brüt Kâr" />
                      <div className="bg-stone-400" style={{ width: `${reportData.finance.revenue ? (reportData.finance.cogs / reportData.finance.revenue) * 100 : 0}%` }} title="SMM" />
                    </div>
                    <div className="flex gap-4 mt-2 text-[10px]">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-600" /> Brüt Kâr %{reportData.finance.margin}</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-stone-400" /> SMM %{(100 - reportData.finance.margin).toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: BARKOD & ETİKET MOTORU */}
        {/* ============================================================ */}
        {activeTab === "barcode" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-stone-900">Barkod & Raf Etiketi Motoru</h2>
              <p className="text-xs text-stone-500">
                EAN-13 / Code128 standardında dinamik barkod üretimi ve raf etiketi basımı.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Generator Settings */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-4">
                <h3 className="font-bold text-sm text-stone-900">Etiket Bilgilerini Belirle</h3>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Ürün Başlığı:</label>
                  <input
                    type="text"
                    value={barcodeLabelTitle}
                    onChange={(e) => setBarcodeLabelTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Barkod Numarası (EAN / SKU):</label>
                  <input
                    type="text"
                    value={barcodeGenText}
                    onChange={(e) => setBarcodeGenText(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Lokasyon (FAZ 3):</label>
                    <select
                      value={barcodeLabelLocation}
                      onChange={(e) => setBarcodeLabelLocation(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs font-mono"
                    >
                      {locationsList.length === 0 && <option value="MRK-A-01-01">MRK-A-01-01</option>}
                      {locationsList.map((l) => (
                        <option key={l.id} value={l.locationCode}>{l.locationCode} — {l.warehouseName}</option>
                      ))}
                    </select>
                  </div>

                  <label className="block text-xs font-bold text-stone-700 mb-1">Raf Satış Fiyatı:</label>
                  <input
                    type="text"
                    value={barcodeLabelPrice}
                    onChange={(e) => setBarcodeLabelPrice(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs font-bold"
                  />
                </div>

                <button
                  onClick={() => window.print()}
                  className="w-full py-3 bg-stone-900 hover:bg-black text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Termal Etiket Yazıcıya Gönder</span>
                </button>
              </div>

              {/* Printable Shelf Label Preview */}
              <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs flex flex-col items-center justify-center">
                <span className="text-xs text-stone-400 mb-3 font-semibold uppercase">
                  Termal Etiket Önizleme (50mm x 30mm)
                </span>

                <div className="w-64 p-4 border-2 border-stone-800 rounded-xl bg-white shadow-md text-center space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-stone-600">
                    SERPİLEN COLLECTION
                  </div>
                  <h4 className="text-xs font-bold text-stone-900 line-clamp-2 leading-tight">
                    {barcodeLabelTitle}
                  </h4>

                  {/* SVG Barcode Representation */}
                  <div className="py-1 flex justify-center">
                    <svg className="w-48 h-12" viewBox="0 0 200 50">
                      <rect x="0" y="0" width="200" height="50" fill="#fff" />
                      {Array.from({ length: 35 }).map((_, i) => (
                        <rect
                          key={i}
                          x={10 + i * 5}
                          y="5"
                          width={i % 3 === 0 ? 3 : 1.5}
                          height="40"
                          fill="#000"
                        />
                      ))}
                    </svg>
                  </div>
                  <div className="font-mono text-xs font-bold tracking-widest text-stone-900">
                    {barcodeGenText}
                  </div>

                  <div className="text-[9px] font-mono text-stone-500">
                    Lokasyon: {barcodeLabelLocation}
                  </div>

                  <div className="border-t border-stone-300 pt-1.5 flex items-baseline justify-between text-xs">
                    <span className="text-[10px] text-stone-500 font-semibold">KDV Dahil</span>
                    <span className="text-base font-black text-stone-900">{barcodeLabelPrice}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* FAZ 7 / TAB: POS & KASA YÖNETİMİ */}
        {/* ============================================================ */}
        {activeTab === "pos" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">FAZ 7 — POS & Kasa</span>
                <h2 className="text-xl font-black text-stone-900">Web POS Terminali & Kasa Yönetimi</h2>
                <p className="text-xs text-stone-500">
                  Fiziksel mağaza kasaları, vardiyalar, gün sonu Z raporları ve nakit kasa hareketleri.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/pos"
                  target="_blank"
                  className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                >
                  <MonitorCheck className="w-4 h-4" />
                  <span>Kasa Terminalini Aç (Yeni Sekme)</span>
                </Link>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "shifts" as const, label: `Kasa Vardiyaları (${shiftsList.length})` },
                { id: "zreports" as const, label: `Z-Raporları (${shiftsList.filter((s: any) => s.zReportNumber).length})` },
                { id: "transactions" as const, label: `Kasa Hareketleri (${posTransList.length})` },
                { id: "stats" as const, label: "Kasa İstatistikleri" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPosSubTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    posSubTab === t.id ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200 hover:border-amber-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Subtab 1: Shifts List */}
            {posSubTab === "shifts" && (
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-3">Vardiya No</th>
                        <th className="py-3 px-3">Kasa / Mağaza</th>
                        <th className="py-3 px-3">Kasiyer</th>
                        <th className="py-3 px-3">Açılış Devri</th>
                        <th className="py-3 px-3">Nakit Satış</th>
                        <th className="py-3 px-3">Kart Satış</th>
                        <th className="py-3 px-3">Beklenen Nakit</th>
                        <th className="py-3 px-3">Sayılan Nakit</th>
                        <th className="py-3 px-3">Durum</th>
                        <th className="py-3 px-3">Detay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {shiftsList.map((s: any) => {
                        const diff = Number(s.closingAmount || 0) - Number(s.expectedAmount || s.openingAmount);
                        return (
                          <tr key={s.id} className="hover:bg-stone-50/50">
                            <td className="py-3 px-3 font-mono font-bold text-stone-900">
                              {s.shiftNumber || `VARD-${s.id}`}
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-bold text-stone-800 block">{s.terminalCode || "KASA-01"}</span>
                              <span className="text-[10px] text-stone-400">{s.warehouseName || "Kadıköy Mağaza"}</span>
                            </td>
                            <td className="py-3 px-3 font-semibold">{s.cashierName}</td>
                            <td className="py-3 px-3 font-mono">{Number(s.openingAmount).toFixed(2)} TL</td>
                            <td className="py-3 px-3 font-mono text-emerald-700 font-bold">
                              +{Number(s.totalSalesCash || 0).toFixed(2)} TL
                            </td>
                            <td className="py-3 px-3 font-mono text-sky-700 font-bold">
                              +{Number(s.totalSalesCard || 0).toFixed(2)} TL
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-stone-900">
                              {Number(s.expectedAmount || s.openingAmount).toFixed(2)} TL
                            </td>
                            <td className="py-3 px-3 font-mono">
                              {s.closingAmount ? `${Number(s.closingAmount).toFixed(2)} TL` : "—"}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  s.status === "OPEN"
                                    ? "bg-emerald-100 text-emerald-800 animate-pulse"
                                    : "bg-stone-100 text-stone-700"
                                }`}
                              >
                                {s.status === "OPEN" ? "AÇIK (SATIŞTA)" : "KAPALI"}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <button
                                onClick={() => setSelectedShiftForModal(s)}
                                className="text-amber-800 hover:underline font-bold text-[11px]"
                              >
                                Z Raporu →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {shiftsList.length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-stone-400">
                            Henüz vardiya kaydı yok.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Subtab 2: Z-Reports Archive */}
            {posSubTab === "zreports" && (
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
                <div className="p-4 border-b border-stone-100">
                  <h3 className="font-bold text-sm text-stone-900">Resmi Gün Sonu Z Raporları Arşivi</h3>
                  <p className="text-[11px] text-stone-500">Mali ve idari kasa kapanış dökümleri.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-3">Z No</th>
                        <th className="py-3 px-3">Kasa</th>
                        <th className="py-3 px-3">Kasiyer</th>
                        <th className="py-3 px-3">Kapanış Tarihi</th>
                        <th className="py-3 px-3">Toplam Ciro</th>
                        <th className="py-3 px-3">Kasa Mutabakatı</th>
                        <th className="py-3 px-3">Döküm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {shiftsList
                        .filter((s: any) => s.status === "CLOSED")
                        .map((s: any) => {
                          const diff = Number(s.closingAmount || 0) - Number(s.expectedAmount || s.openingAmount);
                          const totalRev = Number(s.totalSalesCash || 0) + Number(s.totalSalesCard || 0);
                          return (
                            <tr key={s.id} className="hover:bg-stone-50/50">
                              <td className="py-3 px-3 font-mono font-bold text-amber-900">
                                {s.zReportNumber || `Z-${s.id}`}
                              </td>
                              <td className="py-3 px-3 font-semibold">{s.terminalCode || "KASA-01"}</td>
                              <td className="py-3 px-3">{s.cashierName}</td>
                              <td className="py-3 px-3 text-stone-500">
                                {s.closedAt ? new Date(s.closedAt).toLocaleString("tr-TR") : "—"}
                              </td>
                              <td className="py-3 px-3 font-bold text-stone-900">{totalRev.toFixed(2)} TL</td>
                              <td className="py-3 px-3 font-bold">
                                {diff === 0 ? (
                                  <span className="text-emerald-700 font-bold">✓ Tam Mutabık</span>
                                ) : diff > 0 ? (
                                  <span className="text-amber-800 font-bold">+{diff.toFixed(2)} TL Fazla</span>
                                ) : (
                                  <span className="text-rose-700 font-bold">{diff.toFixed(2)} TL Açık</span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <button
                                  onClick={() => setSelectedShiftForModal(s)}
                                  className="px-2.5 py-1 bg-stone-900 text-white font-bold rounded-lg text-[10px] hover:bg-black"
                                >
                                  Görüntüle
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      {shiftsList.filter((s: any) => s.status === "CLOSED").length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-stone-400">
                            Henüz kapatılmış Z Raporu bulunmuyor.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Subtab 3: Cash Transactions */}
            {posSubTab === "transactions" && (
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
                <div className="p-4 border-b border-stone-100">
                  <h3 className="font-bold text-sm text-stone-900">Kasa Nakit Giriş & Çıkış Hareketleri</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-3">Tarih</th>
                        <th className="py-3 px-3">İşlem Tipi</th>
                        <th className="py-3 px-3">Tutar</th>
                        <th className="py-3 px-3">Kasiyer</th>
                        <th className="py-3 px-3">Sebep / Açıklama</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {posTransList.map((t: any) => (
                        <tr key={t.id} className="hover:bg-stone-50/50">
                          <td className="py-3 px-3 text-stone-500 font-mono">
                            {new Date(t.createdAt).toLocaleString("tr-TR")}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                t.type === "CASH_IN" || t.type === "FLOAT_ADD"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {t.type === "CASH_IN"
                                ? "Nakit Giriş"
                                : t.type === "FLOAT_ADD"
                                ? "Bozuk Para İlave"
                                : t.type === "EXPENSE"
                                ? "Masraf / Gider"
                                : "Nakit Çıkış"}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-stone-900">
                            {Number(t.amount).toFixed(2)} TL
                          </td>
                          <td className="py-3 px-3 font-semibold">{t.cashierName}</td>
                          <td className="py-3 px-3 text-stone-600">{t.reason}</td>
                        </tr>
                      ))}
                      {posTransList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-stone-400">
                            Aktif vardiyaya ait nakit hareketi bulunamadı.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Subtab 4: POS Stats */}
            {posSubTab === "stats" && (!matrixLoaded || !canSee("orders") ? (
              <p className="text-xs text-stone-500">Bu özetin sipariş verileri için Siparişler modülü yetkisi gerekir.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
                  <span className="text-[10px] font-bold uppercase text-stone-500">POS Nakit Ciro</span>
                  <div className="text-2xl font-black text-emerald-800">
                    {orders
                      .filter((o: any) => o.orderType === "POS" && o.paymentMethod === "CASH")
                      .reduce((s: number, o: any) => s + Number(o.grandTotal), 0)
                      .toFixed(2)}{" "}
                    TL
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
                  <span className="text-[10px] font-bold uppercase text-stone-500">POS Kartlı Ciro</span>
                  <div className="text-2xl font-black text-sky-800">
                    {orders
                      .filter((o: any) => o.orderType === "POS" && o.paymentMethod === "CREDIT_CARD")
                      .reduce((s: number, o: any) => s + Number(o.grandTotal), 0)
                      .toFixed(2)}{" "}
                    TL
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
                  <span className="text-[10px] font-bold uppercase text-stone-500">Kasa Fiş Sayısı</span>
                  <div className="text-2xl font-black text-stone-900">
                    {orders.filter((o: any) => o.orderType === "POS").length} Satış
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
                  <span className="text-[10px] font-bold uppercase text-stone-500">Ortalama Kasa Sepeti</span>
                  <div className="text-2xl font-black text-amber-900">
                    {(() => {
                      const posOrders = orders.filter((o: any) => o.orderType === "POS");
                      const total = posOrders.reduce((s: number, o: any) => s + Number(o.grandTotal), 0);
                      return (total / (posOrders.length || 1)).toFixed(2);
                    })()}{" "}
                    TL
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: ORDERS MANAGEMENT */}
        {/* ============================================================ */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">FAZ 4 — E-Ticaret</span>
                <h2 className="text-xl font-black text-stone-900">Sipariş Yaşam Döngüsü & İade</h2>
                <p className="text-xs text-stone-500">
                  Durum ilerletme (Ödendi → Hazırlanıyor → Kargoda → Teslim), kargo takibi ve iade (RMA) yönetimi.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "orders" as const, label: `Siparişler (${orders.length})` },
                { id: "returns" as const, label: `İadeler (${returnsList.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setOrdersSubTab(t.id); setOrderFeedback(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    ordersSubTab === t.id ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200 hover:border-amber-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {orderFeedback && (
              <div className={`p-2.5 rounded-xl text-xs font-medium border ${orderFeedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                {orderFeedback.text}
              </div>
            )}

            {ordersSubTab === "orders" && (
              <>
                {["SUPER_ADMIN","STORE_MANAGER"].includes(currentRole) && <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                  <button type="button" onClick={()=>loadReconciliation()} className="font-bold underline">Eski sipariş ve e-posta mutabakatını göster / yenile</button>
                  {reconciliationError && <p role="alert">{reconciliationError}</p>}
                  {reconciliation && <div className="space-y-2 mt-2"><p>Toplam {reconciliation.total} incelenecek eski kayıt. Hak kaydının bulunmaması sayaç kullanımını kanıtlamaz; banka ve belgeleri kontrol edin. Buradan otomatik değişiklik yapılmaz.</p>
                    {reconciliation.rows.map((r:any)=><p key={r.id}><strong>{r.orderNumber}</strong> · {r.status} / {r.paymentStatus} · {Number(r.grandTotal).toFixed(2)} TL · {r.longHold?"uzun süreli rezervasyon · ":""}{r.noClaims&&Number(r.discountTotal)>0?"indirim hakkı belgesiz":""}</p>)}
                    <div className="flex gap-3"><button disabled={reconciliation.page<=1} onClick={()=>loadReconciliation(reconciliation.page-1)}>← Önceki</button><span>Sayfa {reconciliation.page}</span><button disabled={reconciliation.page*50>=reconciliation.total} onClick={()=>loadReconciliation(reconciliation.page+1)}>Sonraki →</button></div>
                    <p className="font-bold">Gönderilemeyen/bekleyen e-postalar (en fazla 50)</p>{reconciliation.notices.map((n:any)=><p key={n.id}>{n.orderNumber} · {n.status} · {n.attempts} deneme · {n.lastError||"bekliyor"}</p>)}{!reconciliation.notices.length&&<p>Bekleyen kayıt yok.</p>}
                  </div>}
                </section>}
                <div className="flex flex-wrap gap-1.5">
                  {["ALL", "BACKORDER", "PENDING", "PAID", "PREPARING", "READY_FOR_SHIPMENT", "SHIPPED", "DELIVERED", "CANCELLED"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setOrderStatusFilter(s)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${orderStatusFilter === s ? "bg-stone-900 text-white" : "bg-white text-stone-600 border border-stone-200"}`}
                    >
                      {s === "ALL" ? "Tümü" : ORDER_STATUS_LABELS[s] || s}
                    </button>
                  ))}
                </div>

                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                        <tr>
                          <th className="py-3 px-3">Sipariş</th>
                          <th className="py-3 px-3">Kanal</th>
                          <th className="py-3 px-3">Müşteri</th>
                          <th className="py-3 px-3">Tutar</th>
                          <th className="py-3 px-3">Kargo</th>
                          <th className="py-3 px-3">Durum</th>
                          <th className="py-3 px-3">Aksiyon</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {orders.filter((o) => orderStatusFilter === "ALL" || o.status === orderStatusFilter).map((ord) => (
                          <tr key={ord.id} className="hover:bg-stone-50/50">
                            <td className="py-3 px-3">
                              <span className="font-mono font-bold text-stone-900 block">{ord.orderNumber}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ord.orderType === "POS" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
                                {ord.orderType}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-semibold">{ord.customerName}</td>
                            <td className="py-3 px-3 font-bold">{Number(ord.grandTotal).toFixed(2)} TL</td>
                            <td className="py-3 px-3 text-stone-500">
                              {ord.trackingNumber ? (
                                <span className="font-mono text-[10px]">{ord.carrier}<br />{ord.trackingNumber}</span>
                              ) : (
                                <span className="text-stone-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                ["DELIVERED"].includes(ord.status) ? "bg-emerald-100 text-emerald-800"
                                : ["CANCELLED", "REFUNDED", "RETURNED"].includes(ord.status) ? "bg-rose-100 text-rose-800"
                                : ["SHIPPED"].includes(ord.status) ? "bg-sky-100 text-sky-800"
                                : "bg-amber-100 text-amber-900"
                              }`}>
                                {ORDER_STATUS_LABELS[ord.status] || ord.status}
                              </span>
                              {ord.status === "PENDING" && ord.paymentDeadline && <div className="text-[10px] mt-1">Son onay: {new Date(ord.paymentDeadline).toLocaleString("tr-TR")} · müşteriyle iletişim kurun</div>}

                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1 items-start">
                                {(ORDER_NEXT[ord.status] || [])
                                  .filter((next) => !(ord.status === "READY_FOR_SHIPMENT" && next === "SHIPPED") && !(ord.status === "PENDING" && next === "PAID" && !["SUPER_ADMIN", "STORE_MANAGER"].includes(currentRole)) && !(next === "CANCELLED" && ord.paymentStatus === "PAID"))
                                  .map((next) => (
                                  <button
                                    key={next}
                                    onClick={() => void advanceOrder(ord.id, next)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold ${next === "CANCELLED" ? "bg-stone-200 text-stone-600" : "bg-amber-700 text-white"}`}
                                  >
                                    {ord.status === "PENDING" && next === "PAID" ? "Banka ödemesini onayla" : ORDER_STATUS_LABELS[next] || next}
                                  </button>
                                ))}
                                {ord.status === "READY_FOR_SHIPMENT" && (() => {
                                  const draft = cargoDraftFor(ord);
                                  const carrierOptions = [...new Set([...CARGO_CARRIERS, draft.carrier])];
                                  return (
                                    <div className="flex flex-col gap-1 min-w-[160px]">
                                      <select
                                        value={draft.carrier}
                                        onChange={(e) => setCargoDraft(ord, { carrier: e.target.value })}
                                        aria-label="Kargo Firması Seç"
                                        className="px-1.5 py-1 border border-stone-200 rounded-lg text-[10px] bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-600"
                                      >
                                        {carrierOptions.map((c) => (
                                          <option key={c} value={c}>{c}</option>
                                        ))}
                                      </select>
                                      <input
                                        value={draft.trackingNumber}
                                        onChange={(e) => setCargoDraft(ord, { trackingNumber: e.target.value })}
                                        placeholder="Kargo Takip No"
                                        aria-label="Kargo Takip No"
                                        className="px-1.5 py-1 border border-stone-200 rounded-lg text-[10px] font-mono placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-600"
                                      />
                                      <div className="flex gap-1">
                                        <button
                                          onClick={() => void saveCargoInfo(ord, false)}
                                          title="Takip bilgisini kaydet (durum değişmez)"
                                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-stone-200 text-stone-700 hover:bg-stone-300"
                                        >
                                          Kaydet
                                        </button>
                                        <button
                                          onClick={() => void saveCargoInfo(ord, true)}
                                          title="Durumu Kargoda yap ve takip bilgisini kaydet"
                                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-700 text-white hover:bg-amber-800"
                                        >
                                          Kargoda →
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}
                                {(isSuper || (matrixLoaded && myMatrixRow.orders === true && myMatrixRow.orderReturnDelete === true)) && <button type="button" disabled={deletionBusy} onClick={()=>void openDeletion("order",ord.id)} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-100 text-rose-800 disabled:opacity-50">Sil</button>}
                                {ord.status === "DELIVERED" && (
                                  <button onClick={() => openReturnModal(ord)} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-600 text-white">
                                    İade Başlat
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {ordersSubTab === "returns" && (
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-3">İade No</th>
                      <th className="py-3 px-3">Sipariş</th>
                      <th className="py-3 px-3">Kalem</th>
                      <th className="py-3 px-3">İade Tutarı</th>
                      <th className="py-3 px-3">Durum</th>
                      <th className="py-3 px-3">Aksiyon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {returnsList.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 px-3 font-mono font-bold">{r.returnNumber}</td>
                        <td className="py-3 px-3 font-mono">{r.orderNumber}</td>
                        <td className="py-3 px-3">{r.items?.length || 0} kalem{r.restock ? " · stoğa geri" : ""}</td>
                        <td className="py-3 px-3 font-bold text-rose-700">{Number(r.refundAmount).toFixed(2)} TL</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.status === "REFUNDED" ? "bg-emerald-100 text-emerald-800"
                            : r.status === "REJECTED" ? "bg-stone-200 text-stone-500"
                            : r.status === "RECEIVED" ? "bg-sky-100 text-sky-800"
                            : "bg-amber-100 text-amber-900"
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {(isSuper || (matrixLoaded && myMatrixRow.orders === true && myMatrixRow.orderReturnDelete === true)) && <button type="button" disabled={deletionBusy} onClick={()=>void openDeletion("return",r.id)} className="px-2 py-1 bg-rose-100 text-rose-800 rounded-lg text-[10px] font-bold disabled:opacity-50">Sil</button>}
                            {r.status === "REQUESTED" && (
                              <>
                                <button onClick={() => void returnAction(r.id, "APPROVE")} className="px-2 py-1 bg-amber-700 text-white rounded-lg text-[10px] font-bold">Onayla</button>
                                <button onClick={() => void returnAction(r.id, "REJECT")} className="px-2 py-1 bg-stone-200 text-stone-600 rounded-lg text-[10px] font-bold">Reddet</button>
                              </>
                            )}
                            {r.status === "APPROVED" && (
                              <button onClick={() => void returnAction(r.id, "RECEIVE")} className="px-2 py-1 bg-sky-700 text-white rounded-lg text-[10px] font-bold">Teslim Al (+Stok)</button>
                            )}
                            {r.status === "RECEIVED" && ["SUPER_ADMIN", "STORE_MANAGER"].includes(currentRole) && (
                              <button onClick={() => void returnAction(r.id, "REFUND")} className="px-2 py-1 bg-emerald-700 text-white rounded-lg text-[10px] font-bold">Yapılmış İadeyi Onayla</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {returnsList.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-stone-400">İade kaydı yok.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 6: CRM */}
        {/* ============================================================ */}
        {activeTab === "crm" && matrixLoaded && canSee("crm") && <CustomerCRM canWrite={canSee("crmWrite")} />}

        {/* ============================================================ */}
        {/* TAB 7: PURCHASING & SUPPLIERS */}
        {/* ============================================================ */}
        {activeTab === "purchasing" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">FAZ 6 — Satın Alma</span>
                <h2 className="text-xl font-black text-stone-900">Sipariş → Mal Kabul</h2>
                <p className="text-xs text-stone-500">Otomatik yeniden sipariş önerileri, kısmi mal kabul ve tedarikçi karnesi.</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setIsCreatePOOpen(true)} className="px-3 py-2 bg-sky-800 text-white text-xs font-bold rounded-xl">+ Sipariş (PO)</button>
                <button onClick={() => setIsAddSupplierOpen(true)} className="px-3 py-2 bg-stone-900 text-white text-xs font-bold rounded-xl">+ Tedarikçi</button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "suggest" as const, label: `Öneriler (${suggestionCount})` },
                { id: "orders" as const, label: `Siparişler (${purchaseOrders.length})` },
                { id: "receipts" as const, label: `Mal Kabul (${receiptsList.length})` },
                { id: "suppliers" as const, label: `Tedarikçiler (${suppliersList.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setPurchasingSubTab(t.id); setPurchasingFeedback(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${purchasingSubTab === t.id ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200 hover:border-amber-300"}`}
                >
                  {t.label}
                </button>
              ))}
              {purchasingBusy && <span className="text-[10px] text-stone-400 self-center ml-2">Yükleniyor…</span>}
            </div>

            {pendingPurchasing && <div role="alert" className="p-3 rounded-xl bg-amber-100 text-amber-900 text-xs">Önceki mal kabul veya iadenin sonucu doğrulanmalı. Yeni işlem başlatılmadan aynı kayıt güvenle tekrar sorgulanır. <button disabled={purchasingSubmitting} onClick={() => void sendPurchasingCommand(pendingPurchasing)} className="ml-2 font-bold underline">Aynı işlemi tekrar sorgula</button> <button disabled={purchasingSubmitting} onClick={() => void closePendingPurchasing()} className="ml-2 font-bold underline">Sonucu kontrol et ve kapat</button></div>}
            {purchasingFeedback && (
              <div className={`p-2.5 rounded-xl text-xs font-medium border ${purchasingFeedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                {purchasingFeedback.text}
              </div>
            )}

            {purchasingSubTab === "suggest" && (
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100">
                  <h3 className="font-bold text-sm text-stone-900">Otomatik Yeniden Sipariş Önerileri</h3>
                  <p className="text-[11px] text-stone-500">Satış hızı × termin süresi + güvenlik stoğu formülüyle hesaplanır.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr><th className="py-2.5 px-3 whitespace-nowrap">Ürün</th><th className="py-2.5 px-3 whitespace-nowrap">Depo</th><th className="py-2.5 px-3 whitespace-nowrap">Mevcut</th><th className="py-2.5 px-3 whitespace-nowrap">Aylık Satış</th><th className="py-2.5 px-3 whitespace-nowrap">Önerilen</th><th className="py-2.5 px-3 whitespace-nowrap">Tahmini Maliyet</th><th className="py-2.5 px-3 whitespace-nowrap">Öncelik</th></tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {suggestions.map((s: any, i: number) => (
                        <tr key={`${s.productId}-${s.warehouseId}-${i}`}>
                          <td className="py-2.5 px-3 min-w-[220px]"><span className="font-semibold block leading-snug">{s.productName}</span><span className="text-[10px] text-stone-400 font-mono">{s.sku}</span></td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{s.warehouseName}</td>
                          <td className="py-2.5 px-3 font-bold">{s.available}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{s.monthlySales}/ay</td>
                          <td className="py-2.5 px-3 font-black text-amber-800 whitespace-nowrap">{s.suggestedQty} ad</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{s.estimatedCost.toFixed(2)} TL</td>
                          <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.priority === "URGENT" ? "bg-rose-600 text-white" : s.priority === "HIGH" ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-600"}`}>{s.priority}</span></td>
                        </tr>
                      ))}
                      {suggestions.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-stone-400">Öneri yok — stoklar yeterli.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchasingSubTab === "orders" && (
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr><th className="py-2.5 px-3">PO No</th><th className="py-2.5 px-3">Tedarikçi</th><th className="py-2.5 px-3">Tutar</th><th className="py-2.5 px-3">İlerleme</th><th className="py-2.5 px-3">Durum</th><th className="py-2.5 px-3">Aksiyon</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {purchaseOrders.map((po) => (
                      <tr key={po.id} className="hover:bg-stone-50/50">
                        <td className="py-3 px-3 font-mono font-bold">{po.poNumber}</td>
                        <td className="py-3 px-3 font-semibold">{po.supplierName}</td>
                        <td className="py-3 px-3 font-bold">{Number(po.totalAmount).toFixed(2)} TL</td>
                        <td className="py-3 px-3">
                          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden w-24"><div className="h-full bg-emerald-600" style={{ width: `${po.progress || 0}%` }} /></div>
                          <span className="text-[10px] text-stone-400">%{po.progress || 0}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${po.status === "RECEIVED" ? "bg-emerald-100 text-emerald-800" : po.status === "PARTIAL" ? "bg-sky-100 text-sky-800" : po.status === "CANCELLED" ? "bg-stone-200 text-stone-500" : "bg-amber-100 text-amber-900"}`}>
                            {po.status === "RECEIVED" ? "TAMAMLANDI" : po.status === "PARTIAL" ? "KISMİ KABUL" : po.status === "CANCELLED" ? "İPTAL" : "SİPARİŞTE"}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {!["RECEIVED", "CANCELLED"].includes(po.status) && (
                            <button onClick={() => openReceiveModal(po)} className="px-2.5 py-1 bg-emerald-700 text-white font-bold rounded-lg text-[10px]">Mal Kabul</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {purchasingSubTab === "receipts" && (
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr><th className="py-2.5 px-3">Fiş No</th><th className="py-2.5 px-3">PO / Tedarikçi</th><th className="py-2.5 px-3">Kabul Eden</th><th className="py-2.5 px-3">Tarih</th><th className="py-2.5 px-3">İşlem</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {receiptsList.map((r: any) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-3 font-mono font-bold">{r.receiptNumber}</td>
                        <td className="py-2.5 px-3">PO #{r.purchaseOrderId} · {r.supplierName}</td>
                        <td className="py-2.5 px-3">{r.receivedBy}</td>
                        <td className="py-2.5 px-3 text-stone-400">{new Date(r.createdAt).toLocaleString("tr-TR")}</td>
                        <td className="py-2.5 px-3">{r.returns?.map((x:any)=><p key={x.id} className="text-[10px] text-stone-500">İade #{x.id} · {new Date(x.createdAt).toLocaleDateString("tr-TR")} · {x.reason}</p>)}<button disabled={!!pendingPurchasing || purchasingSubmitting || !r.items?.length} onClick={() => openSupplierReturn(r)} className="font-bold text-rose-700 disabled:opacity-50">Tedarikçiye iade</button></td>
                      </tr>
                    ))}
                    {receiptsList.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-stone-400">Mal kabul fişi yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {purchasingSubTab === "suppliers" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suppliersList.map((sup: any) => (
                  <div key={sup.id} className="p-4 rounded-2xl border border-stone-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-stone-900">{sup.name}</h4>
                      <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded">{sup.rating == null ? "Henüz puanlanmadı" : `★ ${sup.rating}`}</span>
                    </div>
                    <p className="text-xs text-stone-600">Yetkili: {sup.contactPerson || "—"} ({sup.phone || "—"})</p>
                    <button disabled={purchasingBusy} onClick={() => void deleteSupplier(sup)} className="text-xs font-bold text-rose-700 disabled:opacity-50">Tedarikçiyi sil</button>
                    {sup.ratingDetails && <p className="text-[11px] text-stone-500">{sup.ratingDetails.score === null ? sup.ratingDetails.missing.join(" · ") : `Son 3 sipariş: zamanında %${Math.round(sup.ratingDetails.delivery*100)}, iadesiz %${Math.round(sup.ratingDetails.returns*100)}, göreli vade %${Math.round(sup.ratingDetails.terms*100)}.`}</p>}
                    <p className="text-[11px] text-stone-400">Vade: {sup.paymentTerms || "—"} | Termin: {sup.leadTimeDays} gün | {sup.totalPOs ?? 0} sipariş · {sup.completionRate == null ? "tamamlama verisi yok" : `%${sup.completionRate} tamamlama`}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 8: COUPONS & PROMOTIONS */}
        {/* ============================================================ */}

        {activeTab === "coupons" && (
          <MarketingCenter categories={categories} brands={brands} />
        )}

        {activeTab === "ai" && <AiAssistantCenter products={products} />}
        {activeTab === "intelligence" && <IntelligenceCenter />}

        {/* Destek Masası — İletişim formundan gelen mesajlar */}
        {activeTab === "support" && <SupportDesk />}

        {/* Ürün yorumları ve soruları — rol matrisine göre moderasyon */}
        {activeTab === "productFeedback" && matrixLoaded && canSee("productFeedback") && <ProductFeedback />}

        {/* ============================================================ */}
        {/* FAZ 1 / TAB: KULLANICILAR & ROLLER */}
        {/* ============================================================ */}
        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-stone-900">Kullanıcılar & Roller</h2>
                <p className="text-xs text-stone-500">
                  Personel listesini yetkili roller görebilir; personel oluşturma, değiştirme ve silme yalnız Süper Admin yetkisindedir. Siteye üye olan müşteriler ayrı sekmededir (Kayıtlı Müşteriler).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void loadUsers()}
                  className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${usersBusy ? "animate-spin" : ""}`} />
                  <span>Yenile</span>
                </button>
                <button
                  disabled={!isSuper}
                  title={isSuper ? "Yeni personel oluştur" : "Personel yönetimi yalnız Süper Admin yetkisindedir"}
                  onClick={() => setIsAddUserOpen(true)}
                  className="px-3.5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Yeni Kullanıcı</span>
                </button>
              </div>
            </div>

            {userFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-medium border ${
                  userFeedback.isError
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}
              >
                {userFeedback.text}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-3">Personel (Mağaza)</th>
                      <th className="py-3 px-3">E-posta</th>
                      <th className="py-3 px-3">Telefon</th>
                      <th className="py-3 px-3">Rol</th>
                      <th className="py-3 px-3">Durum</th>
                      <th className="py-3 px-3">Kayıt</th>
                      <th className="py-3 px-3 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-stone-50/50">
                        <td className="py-3 px-3">
                          <span className="font-bold text-stone-900 block">{u.name}</span>
                          <span className="text-[10px] text-stone-400 font-mono">ID: {u.id}</span>
                        </td>
                        <td className="py-3 px-3 text-stone-600">{u.email}</td>
                        <td className="py-3 px-3 text-stone-500">{u.phone || "—"}</td>
                        <td className="py-3 px-3">
                          <select
                            value={u.role}
                            disabled={!isSuper}
                            title={!isSuper ? "Personel yönetimi yalnız Süper Admin yetkisindedir" : "Personel rolü"}
                            onChange={(e) => void updateUser(u.id, { role: e.target.value })}
                            className="px-2 py-1.5 bg-amber-50 border border-amber-200 text-amber-950 rounded-lg text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="SUPER_ADMIN">Süper Admin</option>
                            <option value="STORE_MANAGER">Mağaza Müdürü</option>
                            <option value="WAREHOUSE_KEEPER">Depo Sorumlusu</option>
                            <option value="CASHIER">POS Kasiyeri</option>
                          </select>
                        </td>
                        <td className="py-3 px-3">
                          <button
                            disabled={!isSuper}
                            onClick={() => void updateUser(u.id, { isActive: !u.isActive })}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 transition ${
                              u.isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                            title={u.isActive ? "Aktif — pasife almak için tıkla" : "Pasif — aktifleştirmek için tıkla"}
                          >
                            <Power className="w-3 h-3" />
                            <span>{u.isActive ? "Aktif" : "Pasif"}</span>
                          </button>
                        </td>
                        <td className="py-3 px-3 text-stone-400 whitespace-nowrap">
                          {formatRegistrationDate(u.createdAt)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => void deleteUser(u.id, u.name, u.email)}
                            disabled={!isSuper}
                            title={isSuper ? "Kullanıcıyı sil" : "Kullanıcı silme yalnız Süper Admin yetkisindedir"}
                            className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label={`${u.name} kullanıcısını sil`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {usersList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-stone-400">
                          {usersBusy ? "Yükleniyor…" : "Kayıt yok."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[10px] text-stone-400">
              Kırmızı çöp düğmesi kullanıcıyı kalıcı olarak siler (bağlı oturumlar da temizlenir). Kendi hesabınızı ve son Süper Admin hesabını silemezsiniz; silme yalnız Süper Admin yetkisindedir ve denetim kaydına işlenir.
            </p>

          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: KAYITLI MÜŞTERİLER (siteye üye olan hesaplar) */}
        {/* ============================================================ */}
        {activeTab === "registeredCustomers" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-stone-900">Kayıtlı Müşteriler</h2>
                <p className="text-xs text-stone-500">
                  Siteye üye olan müşteri hesapları. Bu hesaplar personel rolü taşımaz; yalnız üye girişi, sipariş takibi ve hesap işlemlerini kullanır. Satış/stok/POS yetkisi yoktur.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void loadCustomers()}
                  className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${customersBusy ? "animate-spin" : ""}`} />
                  <span>Yenile</span>
                </button>
                <button
                  onClick={() => setActiveTab("crm")}
                  className="px-3 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                >
                  <Users className="w-4 h-4" />
                  <span>CRM 360'a Git</span>
                </button>
              </div>
            </div>

            {userFeedback && <div role="status" className={`p-3 rounded-xl text-xs font-medium border ${userFeedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>{userFeedback.text}</div>}

            <div className="flex items-start gap-2 text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-sky-700" />
              <span>
                Bu liste <strong>Kayıtlı Müşteriler</strong> (üye hesapları) içindir ve personel listesinden tamamen ayrıdır.
                Mağaza Müdürü, Depo Sorumlusu ve POS Kasiyeri gibi mağaza rolleri yalnızca <strong>Kullanıcılar &amp; Roller</strong> sekmesinde yönetilir; buradaki hesaplara rol atanamaz.
                Satın alma geçmişi ve sadakat puanları için <strong>Müşteri CRM</strong> sekmesine bakın.
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-3">Müşteri</th>
                      <th className="py-3 px-3">E-posta</th>
                      <th className="py-3 px-3">Telefon</th>
                      <th className="py-3 px-3">Hesap</th>
                      <th className="py-3 px-3">Durum</th>
                      <th className="py-3 px-3">Kayıt</th>
                      <th className="py-3 px-3">Son Giriş</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {customersList.map((u) => (
                      <tr key={u.id} className="hover:bg-stone-50/50">
                        <td className="py-3 px-3">
                          <span className="font-bold text-stone-900 block">{u.name}</span>
                          <span className="text-[10px] text-stone-400 font-mono">ID: {u.id}</span>
                        </td>
                        <td className="py-3 px-3 text-stone-600">{u.email}</td>
                        <td className="py-3 px-3 text-stone-500">{u.phone || "—"}</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 uppercase">
                            Müşteri Üye
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <button
                            onClick={() => void updateCustomer(u.id, { isActive: !u.isActive })}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 transition ${
                              u.isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                            title={u.isActive ? "Aktif — üyeliği askıya almak için tıkla" : "Pasif — üyeliği yeniden aktifleştirmek için tıkla"}
                          >
                            <Power className="w-3 h-3" />
                            <span>{u.isActive ? "Aktif" : "Pasif"}</span>
                          </button>
                        </td>
                        <td className="py-3 px-3 text-stone-400 whitespace-nowrap">
                          {formatRegistrationDate(u.createdAt)}
                        </td>
                        <td className="py-3 px-3 text-stone-400 whitespace-nowrap">
                          {u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                    {customersList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-stone-400">
                          {customersBusy ? "Yükleniyor…" : "Kayıtlı müşteri hesabı yok."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[10px] text-stone-400">
              Toplam {customersList.length} kayıtlı müşteri hesabı listeleniyor. Üyeliği pasife alınan müşteri giriş yapamaz; sipariş geçmişi silinmez.
            </p>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: ROL YETKİ MATRİSİ (ayrı sekme) */}
        {/* ============================================================ */}
        {activeTab === "roleMatrix" && (
          <div className="space-y-6">
            {/* Başlık + kaydet/varsayılan düğmeleri */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-stone-900">Rol Yetki Matrisi</h2>
                <p className="text-xs text-stone-500">
                  Modül ve işlem yetkilerini rollere göre belirleyin. Ürün linki ve ürün silme işlemleri için hem Ürün & Katalog hem de ilgili işlem yetkisi gereklidir. Ürün silme diğer rollerde varsayılan olarak kapalıdır. Değişiklikler kaydedilince uygulanır.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {matrixDirty && (
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    Kaydedilmemiş değişiklikler var
                  </span>
                )}
                {matrixMsg && (
                  <span className={`text-[10px] font-bold ${matrixMsg.ok ? "text-emerald-700" : "text-rose-600"}`}>
                    {matrixMsg.text}
                  </span>
                )}
                <button
                  onClick={() => setActiveTab("users")}
                  className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                >
                  <Users2 className="w-4 h-4" />
                  <span>Kullanıcılar & Roller'e Git</span>
                </button>
                {isSuper && (
                  <>
                    <button
                      onClick={() => void resetMatrixToDefaults()}
                      disabled={matrixSaving}
                      className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-stone-200 transition disabled:opacity-60"
                      title="Tüm rolleri fabrika ayarlarına döndürür ve hemen kaydeder"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Varsayılanlara Dön</span>
                    </button>
                    <button
                      onClick={() => void saveMatrix()}
                      disabled={matrixSaving || !matrixDirty}
                      className="px-3.5 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>{matrixSaving ? "Kaydediliyor…" : "Tümünü Kaydet"}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {!isSuper && (
              <div className="flex items-start gap-2 text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-sky-700" />
                <span>Bu matris <strong>salt okunurdur</strong>; yalnız Süper Admin (SUPER_ADMIN) hücreleri açıp kapatabilir.</span>
              </div>
            )}

            {/* Detaylı matris tablosu */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-stone-900">Rol → Modül ve İşlem Yetki Matrisi</h3>
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">{ADMIN_MODULES.length} modül × {MATRIX_ROLES.length} rol</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-2.5 px-3 min-w-[210px]">Modül / İşlem</th>
                      {MATRIX_ROLES.map((role) => (
                        <th key={role} className="py-2.5 px-2 text-center min-w-[108px]">
                          <div>{role === "SUPER_ADMIN" ? "Süper Admin" : role === "STORE_MANAGER" ? "Mağaza Müdürü" : role === "WAREHOUSE_KEEPER" ? "Depo Sorumlusu" : "POS Kasiyeri"}</div>
                          <div className="text-[8px] font-mono font-normal text-stone-400 normal-case">{role}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {ADMIN_MODULE_GROUPS.map((group) => (
                      <React.Fragment key={group}>
                        <tr className="bg-stone-100/70">
                          <td colSpan={MATRIX_ROLES.length + 1} className="py-1.5 px-3 text-[9px] font-black uppercase tracking-widest text-stone-500">
                            {group}
                          </td>
                        </tr>
                        {ADMIN_MODULES.filter((m) => m.group === group).map((mod) => (
                          <tr key={mod.key} className="hover:bg-stone-50/60">
                            <td className="py-2 px-3">
                              <span className="font-bold text-stone-800 block">{mod.label}</span>
                              {mod.key === "audit" && <span className="block text-[10px] text-rose-800">Müşteri ve diğer hassas kayıtların tüm ayrıntılarını açar.</span>}
                              {mod.key === "productDelete" && <span className="block text-[10px] text-rose-800">Kalıcı silme yetkisidir; katalog erişimi de gerekir. Stok ve geçmiş korumaları sürer.</span>}
                              {mod.key === "orderReturnDelete" && <span className="block text-[10px] text-rose-800">Sipariş ve iade kalıcı silme yetkisidir; Siparişler erişimi de gerekir. Silme işlemi henüz kullanıma açılmadı.</span>}
                              <span className="text-[9px] font-mono text-stone-400">{mod.key}</span>
                            </td>
                            {MATRIX_ROLES.map((role) => {
                              const locked = role === "SUPER_ADMIN" || mod.key === "dashboard";
                              const granted = mod.key === "dashboard" || role === "SUPER_ADMIN"
                                ? true
                                : roleMatrix[role]?.[mod.key] !== false;
                              return (
                                <td key={role} className="py-2 px-2 text-center">
                                  <button
                                    type="button"
                                    disabled={locked || !isSuper || !matrixLoaded}
                                    onClick={() => toggleMatrixCell(role, mod.key)}
                                    title={
                                      locked
                                        ? role === "SUPER_ADMIN"
                                          ? "Süper Admin tüm modülleri görür (kilitli)"
                                          : "Genel Bakış herkese açık taban erişimdir (kilitli)"
                                        : granted
                                        ? "Görünür — gizlemek için tıklayın"
                                        : "Gizli — göstermek için tıklayın"
                                    }
                                    className={`w-9 h-9 inline-flex items-center justify-center rounded-xl border transition ${
                                      granted
                                        ? locked
                                          ? "bg-amber-100 border-amber-300 text-amber-800 cursor-not-allowed"
                                          : "bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200"
                                        : "bg-rose-50 border-rose-200 text-rose-400 hover:bg-rose-100"
                                    } disabled:cursor-not-allowed disabled:hover:bg-inherit`}
                                  >
                                    {locked ? <Lock className="w-4 h-4" /> : granted ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-stone-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-stone-500">
                <span className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-amber-700" /> Kilitli hücre (Süper Admin / Genel Bakış)</span>
                <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-600" /> Açık</span>
                <span className="flex items-center gap-1.5"><X className="w-3 h-3 text-rose-400" /> Kapalı</span>
                <span className="text-stone-400">Ürün linki ve silme yetkileri sunucuda da doğrulanır; diğer API uçları kendi yetki kontrollerini uygular.</span>
              </div>
            </div>

            {/* Rol özet kartları */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MATRIX_ROLES.map((role) => {
                const label = role === "SUPER_ADMIN" ? "Süper Admin" : role === "STORE_MANAGER" ? "Mağaza Müdürü" : role === "WAREHOUSE_KEEPER" ? "Depo Sorumlusu" : "POS Kasiyeri";
                const desc =
                  role === "SUPER_ADMIN"
                    ? "Sistemin tüm modüllerine tam erişim: kullanıcı yönetimi, ayarlar, finans ve stok."
                    : role === "STORE_MANAGER"
                    ? "Mağaza operasyonu: stok, sipariş, POS, raporlar ve içerik. Kullanıcı yönetimi ve kritik sistem ayarları bu rolde kapalı gelir."
                    : role === "WAREHOUSE_KEEPER"
                    ? "Depo/WMS: stok hareketleri, sayım, transfer, mal kabul. POS ve finansal ekranlar bu rolde kapalı gelir."
                    : "Yalnızca Web POS: satış, vardiya ve sipariş iade işlemleri. Diğer modüller bu rolde kapalı gelir.";
                return (
                  <div key={role} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-stone-900">{label}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          {matrixOpenCount(role)}/{ADMIN_MODULES.length} modül açık
                        </span>
                        <code className="text-[10px] font-mono text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">{role}</code>
                      </div>
                    </div>
                    <p className="text-[11px] text-stone-500 leading-relaxed">{desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* FAZ 1 / TAB: DENETİM KAYDI */}
        {/* ============================================================ */}
        {activeTab === "audit" && matrixLoaded && canSee("audit") && <AuditLogPanel />}

        {/* SİTE YÖNETİMİ bölümleri */}
        {activeTab === "siteHeader" && <SiteManagement tab="header" />}
        {activeTab === "siteFooter" && <SiteManagement tab="footer" />}
        {activeTab === "database" && <SiteManagement tab="database" />}
        {activeTab === "siteCart" && <SiteManagement tab="cart" />}
        {activeTab === "paymentApi" && <PaymentApiSettings />}
        {activeTab === "content" && <ContentManagement />}
      </main>


      {tableVariantEditor && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Varyant düzenle" className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2"><h3 className="font-black">{tableVariantEditor.name} — Varyant Düzenle</h3><button type="button" disabled={variantEditBusy} aria-label="Varyant düzenlemeyi kapat" onClick={()=>{if(!variantEditDirty||window.confirm("Kaydedilmemiş varyant değişiklikleri kaybolacak. Kapatılsın mı?"))setTableVariantEditor(null);}}><X className="w-5 h-5" /></button></div>
            <EditProductVariants key={tableVariantEditor.productId} productId={tableVariantEditor.productId} selectedVariantId={tableVariantEditor.variantId} onDirtyChange={setVariantEditDirty} onBusyChange={setVariantEditBusy} onSaved={async()=>{await Promise.all([refreshProducts(),loadInventory()]);}} />
          </div>
        </div>
      )}

      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Ürün Düzenle</h3>
              <button type="button" disabled={variantEditBusy} onClick={() => { if (!variantEditDirty || window.confirm("Kaydedilmemiş varyant değişiklikleri kaybolacak. Kapatılsın mı?")) setEditingProduct(null); }} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProductEdit} className="space-y-3 text-xs">
              <input required value={editingProduct.name} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Alış</label>
                  <input value={editingProduct.buyPrice} onChange={(e) => setEditingProduct({ ...editingProduct, buyPrice: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Perakende</label>
                  <input required value={editingProduct.retailPrice} onChange={(e) => setEditingProduct({ ...editingProduct, retailPrice: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Kampanya Fiyatı</label>
                  <input placeholder="Opsiyonel" value={editingProduct.campaignPrice || ""} onChange={(e) => setEditingProduct({ ...editingProduct, campaignPrice: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Etiketler</label>
                  <input placeholder="fermuar,siyah,mont" value={editingProduct.tags || ""} onChange={(e) => setEditingProduct({ ...editingProduct, tags: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={editingProduct.categoryId} onChange={(e) => setEditingProduct({ ...editingProduct, categoryId: Number(e.target.value) })} className="px-3 py-2 border border-stone-300 rounded-xl">
                  {categoriesList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select value={editingProduct.brandId || ""} onChange={(e) => setEditingProduct({ ...editingProduct, brandId: e.target.value ? Number(e.target.value) : null })} className="px-3 py-2 border border-stone-300 rounded-xl">
                  {brandsList.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <PhotoManager
                photos={
                  Array.isArray(editingProduct.images) && editingProduct.images.length > 0
                    ? editingProduct.images
                    : editingProduct.imageUrl
                      ? [editingProduct.imageUrl]
                      : []
                }
                onChange={(photos) => setEditingProduct({ ...editingProduct, images: photos, _imagesTouched: true })}
              />
              <input placeholder="Video URL (YouTube / Dailymotion / Vimeo / TikTok / Instagram / Facebook)" value={editingProduct.videoUrl || ""} onChange={(e) => setEditingProduct({ ...editingProduct, videoUrl: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
              <textarea placeholder="Kısa açıklama" value={editingProduct.shortDescription || ""} onChange={(e) => setEditingProduct({ ...editingProduct, shortDescription: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" rows={2} />
              <textarea placeholder="Detaylı açıklama (ürün sayfasında görünür)" value={editingProduct.description || ""} onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" rows={3} />
              <ProductTechnicalFields value={editingProduct.technicalDetails && typeof editingProduct.technicalDetails === "object" ? editingProduct.technicalDetails : parseProductSpecifications(editingProduct.technicalDetails)} onChange={(technicalDetails) => setEditingProduct({ ...editingProduct, technicalDetails })} />
              <label className="flex items-center gap-2 font-bold">
                <input type="checkbox" checked={!!editingProduct.isFeatured} onChange={(e) => setEditingProduct({ ...editingProduct, isFeatured: e.target.checked })} />
                Öne çıkan ürün
              </label>
              <button type="submit" disabled={variantEditBusy} className="w-full py-3 bg-amber-800 text-white font-bold rounded-xl disabled:opacity-50">Ürün ana bilgilerini kaydet</button>
            </form>
            {editingProduct.hasVariants && <EditProductVariants key={editingProduct.id} productId={editingProduct.id} onDirtyChange={setVariantEditDirty} onBusyChange={setVariantEditBusy} onSaved={async () => { await Promise.all([refreshProducts(), loadInventory()]); }} />}
          </div>
        </div>
      )}

      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Yeni Tuhafiye Ürünü Ekle</h3>
              <button disabled={productSaving} onClick={() => setIsAddProductOpen(false)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-3 text-xs">
              <fieldset disabled={productSaving} className="space-y-3">
              <AuthorizedProductLinkImport onImport={applyImportedProduct} onBusyChange={setProductImportBusy} />
              <div>
                <label className="block font-bold text-stone-700 mb-1">Ürün Adı:</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Gütermann 100m Dikiş İpliği No: 120"
                  value={newProd.name}
                  onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Ürün Açıklaması:</label>
                <textarea
                  placeholder="Ürünün detaylı açıklaması… (ürün sayfasında görünür)"
                  value={newProd.description}
                  onChange={(e) => setNewProd({ ...newProd, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <ProductTechnicalFields value={newProd.technicalDetails} onChange={(technicalDetails) => setNewProd(prev => ({ ...prev, technicalDetails }))} />

              {/* ÜRÜN FOTOĞRAFLARI — en fazla 6 adet (link veya site deposuna yükleme) */}
              <PhotoManager
                photos={newProd.photos}
                onChange={(photos) => setNewProd({ ...newProd, photos })}
              />

              {/* ÜRÜN VİDEOSU — YouTube / Dailymotion / Vimeo bağlantısı */}
              <div className="p-2.5 rounded-xl bg-violet-50/70 border border-violet-200 space-y-2">
                <p className="text-[11px] font-bold text-violet-900 flex items-center gap-1">
                  <Video className="w-3.5 h-3.5" />
                  Ürün Videosu Ekle
                </p>
                <input
                  type="url"
                  value={newProd.videoUrl}
                  onChange={(e) => setNewProd({ ...newProd, videoUrl: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="w-full px-3 py-2 bg-white border border-violet-300 rounded-xl"
                />
                <p className="text-[9px] text-stone-500">{VIDEO_HINT}</p>
                {newProd.videoUrl.trim() !== "" && newProdVideo.kind !== "unknown" && (
                  <div className="space-y-1">
                    <div className="aspect-video rounded-lg overflow-hidden border border-violet-200 bg-black">
                      {newProdVideo.kind === "youtube" && newProdVideo.mediaId ? (
                        <YouTubePlayer
                          videoId={newProdVideo.mediaId}
                          embedUrl={newProdVideo.embedUrl}
                          title="Video önizleme"
                          watchUrl={newProdVideo.watchUrl}
                        />
                      ) : newProdVideo.kind === "file" ? (
                        <video src={newProd.videoUrl} controls className="w-full h-full" />
                      ) : (
                        <iframe
                          key={newProdVideo.embedUrl}
                          src={newProdVideo.embedUrl}
                          title="Video önizleme"
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      )}
                    </div>
                    <a
                      href={videoWatchUrl(newProd.videoUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-[10px] font-bold text-violet-800 hover:underline"
                    >
                      Orijinal videoyu yeni sekmede aç ↗
                    </a>
                  </div>
                )}
                {newProd.videoUrl.trim() !== "" && newProdVideo.kind === "unknown" && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-amber-800">{VIDEO_UNKNOWN_HINT}</p>
                    <a
                      href={videoWatchUrl(newProd.videoUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-[10px] font-bold text-violet-800 hover:underline"
                    >
                      Bağlantıyı yeni sekmede aç ↗
                    </a>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">SKU:</label>
                  <input
                    type="text"
                    required
                    placeholder="GUT-120-SIY"
                    value={newProd.sku}
                    onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Barkod:</label>
                  <input
                    type="text"
                    placeholder="869001122..."
                    value={newProd.barcode}
                    onChange={(e) => setNewProd({ ...newProd, barcode: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Kategori:</label>
                  <select
                    value={newProd.categoryId}
                    onChange={(e) => { productSelectionTouched.current.category = true; setNewProd({ ...newProd, categoryId: e.target.value }); }}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    {categoriesList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Marka:</label>
                  <select
                    value={newProd.brandId}
                    onChange={(e) => { productSelectionTouched.current.brand = true; setNewProd({ ...newProd, brandId: e.target.value }); }}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    <optgroup label="Seçilen kategoriye bağlı markalar">
                      {brandsList.filter(b => (b.categoryIds || []).includes(Number(newProd.categoryId))).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </optgroup>
                    <optgroup label="Diğer ve kategorisi atanmamış markalar">
                      {brandsList.filter(b => !(b.categoryIds || []).includes(Number(newProd.categoryId))).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </optgroup>
                  </select>
                  <p className="text-[10px] text-stone-500 mt-1">Diğer markalar da seçilebilir; mevcut seçim değiştirilmez.</p>
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Birim:</label>
                  <select
                    value={newProd.unit}
                    onChange={(e) => setNewProd({ ...newProd, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    <option value="Adet">Adet</option>
                    <option value="Metre">Metre</option>
                    <option value="Paket">Paket</option>
                    <option value="Rulo">Rulo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Alış Fiyatı (TL):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProd.buyPrice}
                    onChange={(e) => setNewProd({ ...newProd, buyPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Satış Fiyatı (TL):</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newProd.retailPrice}
                    onChange={(e) => setNewProd({ ...newProd, retailPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
              </div>

              <NewProductVariants value={productVariantsDraft} onChange={updateVariantsDraft} disabled={productSaving} productName={newProd.name} />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Başlangıç Stoğu:</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    max={productVariantsDraft.length ? 5000000000 : undefined}
                    value={productVariantsDraft.length ? (stockTarget ?? (variantStockSum === null ? "" : String(variantStockSum))) : newProd.initialStock}
                    onChange={(e) => productVariantsDraft.length ? updateStockTarget(e.target.value) : setNewProd({ ...newProd, initialStock: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Giriş Deposu:</label>
                  <select
                    value={newProd.warehouseId}
                    onChange={(e) => setNewProd({ ...newProd, warehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    {warehousesList.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {productVariantsDraft.length > 0 && <p className="text-stone-600" aria-live="polite">{stockTarget !== null ? `Hedef: ${stockTarget || "—"} · Varyant stokları toplamı: ${variantStockSum ?? "eksik veya geçersiz"}. Kaydetmek için hedefle toplam eşleşmeli.` : variantStockSum === null ? "Toplam için tüm varyant stoklarını geçerli tam sayı olarak girin." : "Başlangıç stoğu varyantların toplamıdır. Değiştirirseniz varyantları hedefe göre siz düzenlersiniz; ayrı bir ana stok oluşturulmaz."}</p>}
              {stockNotice && <p className="text-stone-600" aria-live="polite">{stockNotice}</p>}
              {productSaveError && <p role="alert" className="text-rose-700 font-semibold">{productSaveError}</p>}
              <button
                type="submit"
                disabled={productImportBusy || productSaving}
                className="w-full py-3 bg-amber-800 disabled:opacity-50 hover:bg-amber-900 text-white font-bold rounded-xl text-xs transition"
              >
                {productSaving ? "Kaydediliyor…" : productImportBusy ? "Ürün bilgileri getiriliyor…" : "Ürünü Kaydet & Stoğa Al"}
              </button>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: INTER-WAREHOUSE TRANSFER */}
      {/* ============================================================ */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Depolar Arası Stok Transferi</h3>
              <button onClick={() => setIsTransferOpen(false)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransfer} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Çıkış Deposu:</label>
                  <select
                    value={transferData.fromWarehouseId}
                    onChange={(e) => setTransferData({ ...transferData, fromWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    {warehousesList.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Varış Deposu:</label>
                  <select
                    value={transferData.toWarehouseId}
                    onChange={(e) => setTransferData({ ...transferData, toWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    {warehousesList.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Transfer Edilecek Ürün:</label>
                <select
                  value={transferData.productId}
                  onChange={(e) => setTransferData({ ...transferData, productId: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Sevk Miktarı:</label>
                <input
                  type="number"
                  min="1"
                  value={transferData.quantity}
                  onChange={(e) => setTransferData({ ...transferData, quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Sevk Notu / İrsaliye:</label>
                <input
                  type="text"
                  value={transferData.note}
                  onChange={(e) => setTransferData({ ...transferData, note: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-sky-800 hover:bg-sky-900 text-white font-bold rounded-xl text-xs transition"
              >
                Transferi Onayla & Sevk Et
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: INVENTORY ADJUSTMENT */}
      {/* ============================================================ */}
      {isAdjustOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Stok Sayım / Fire Düzeltme</h3>
              <button onClick={() => setIsAdjustOpen(false)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjust} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Depo:</label>
                <select
                  value={adjustData.warehouseId}
                  onChange={(e) => setAdjustData({ ...adjustData, warehouseId: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                >
                  {warehousesList.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Ürün:</label>
                <select
                  value={adjustData.productId}
                  onChange={(e) => setAdjustData({ ...adjustData, productId: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Fark Miktarı (+ veya -):</label>
                  <input
                    type="number"
                    value={adjustData.quantityDelta}
                    onChange={(e) => setAdjustData({ ...adjustData, quantityDelta: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Sebep:</label>
                  <select
                    value={adjustData.reason}
                    onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    <option value="SAYIM">Sayım Farkı</option>
                    <option value="DAMAGE">Hasarlı / Fire</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Açıklama / Tutanak:</label>
                <input
                  type="text"
                  value={adjustData.note}
                  onChange={(e) => setAdjustData({ ...adjustData, note: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-stone-900 hover:bg-black text-white font-bold rounded-xl text-xs transition"
              >
                Stok Defterine Düzeltme İşle
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FAZ 4 / MODAL: İADE BAŞLAT */}
      {/* ============================================================ */}
      {deletionPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="order-delete-title">
          <div className="bg-white rounded-2xl p-5 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            <h3 id="order-delete-title" className="font-black text-lg">{deletionPreview.kind === "order" ? "Siparişi" : "İadeyi"} kalıcı sil</h3>
            <p className="text-sm font-bold">{deletionPreview.number} · Sipariş {deletionPreview.orderNumber}</p>
            <p className="text-xs text-rose-800">Bu işlem geri alınamaz. Bankada tahsilat veya iade yapılmaz; kasa hareketleri ve işlem güvenlik kayıtları korunur.</p>
            {deletionPreview.returnCount>0 && <p className="text-sm font-bold text-rose-700">Bu siparişe bağlı {deletionPreview.returnCount} sonuçlanmış iade de kalıcı olarak silinecek.</p>}
            <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead><tr><th>Depo</th><th>Ürün / varyant</th><th>Fiili</th><th>Ayrılmış</th><th>Değişim</th><th>Sonra</th></tr></thead><tbody>
              {deletionPreview.stocks.map(x=><tr key={`${x.warehouseId}:${x.productId}:${x.variantId}`}><td>{x.warehouseName} (#{x.warehouseId})</td><td>{x.productName} {x.variantId!==null?`· ${x.variantName || "Varyant"} (#${x.variantId})`:"· ana ürün"}</td><td>{x.physical}</td><td>{x.reserved}</td><td>{x.delta>0?"+":""}{x.delta}</td><td>{x.after}</td></tr>)}
            </tbody></table>{!deletionPreview.stocks.length&&<p className="text-xs">Terslenecek stok hareketi yok.</p>}</div>
            <p className="text-xs text-stone-600">Stok geri eklendiğinde bekleyen siparişlere FIFO sırasıyla rezervasyon yapılabilir; bu nedenle sonraki ayrılmış miktar değişebilir.</p>
            {(deletionPreview.rights.loyalty || deletionPreview.rights.discounts.length>0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs space-y-1"><p className="font-bold">Puan ve indirim hakları terslenecek</p>{deletionPreview.rights.loyalty && <p>Müşteri #{deletionPreview.rights.loyalty.customerId}: {deletionPreview.rights.loyalty.current} puan → {deletionPreview.rights.loyalty.after} puan (değişim {deletionPreview.rights.loyalty.delta>0?"+":""}{deletionPreview.rights.loyalty.delta}).</p>}{deletionPreview.rights.discounts.map(d=><p key={`${d.kind}:${d.id}`}>{d.kind==="COUPON"?"Kupon":"Kampanya"} {d.name} (#{d.id}): kullanım {d.current} → {d.after}</p>)}</div>}
            {deletionPreview.rights.legacyReviewRequired && <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900"><p className="font-bold">Eski sipariş: kupon/kampanya geçmişinin eksiksizliği otomatik kanıtlanamıyor.</p><p>{deletionPreview.rights.discounts.length===0 ? "Sistemde kayıtlı kupon veya kampanya hakkı bulunmuyor." : "Sistemde kayıtlı haklar yukarıda listelenmiştir."} Dış belgelerle tüm kullanılan hakları kontrol edin. Eksik hak varsa veya doğrulayamıyorsanız silmeyin.</p></div>}
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={deletionPhysical} onChange={e=>setDeletionPhysical(e.target.checked)} />Depo ve varyant bazındaki fiziksel durumu kontrol ettim; yukarıdaki stok değişimini doğruluyorum.</label>
            {deletionPreview.returnCount>0 && <label className="flex gap-2 text-sm"><input type="checkbox" checked={deletionCascade} onChange={e=>setDeletionCascade(e.target.checked)} />Bağlı {deletionPreview.returnCount} iadenin de kalıcı silinmesini ayrıca onaylıyorum.</label>}
            {((deletionPreview.rights.loyalty?.delta||0)!==0 || deletionPreview.rights.discounts.length>0) && <label className="flex gap-2 text-sm"><input type="checkbox" checked={deletionRights} onChange={e=>setDeletionRights(e.target.checked)} />Yukarıdaki puan ve indirim hakkı değişikliklerini ayrıca onaylıyorum.</label>}
            {deletionPreview.rights.legacyReviewRequired && <label className="flex gap-2 text-sm"><input type="checkbox" checked={deletionLegacy} onChange={e=>setDeletionLegacy(e.target.checked)} />Dış belgeleri inceledim; listelenen kupon ve kampanya haklarının eksiksiz olduğunu ayrıca doğruluyorum.</label>}
            <div className="flex gap-2"><button type="button" disabled={deletionBusy||!deletionPhysical||(deletionPreview.returnCount>0&&!deletionCascade)||(((deletionPreview.rights.loyalty?.delta||0)!==0||deletionPreview.rights.discounts.length>0)&&!deletionRights)||(deletionPreview.rights.legacyReviewRequired&&!deletionLegacy)} onClick={()=>void executeDeletion()} className="px-4 py-2 rounded-xl bg-rose-700 text-white font-bold disabled:opacity-50">{deletionBusy?"Siliniyor…":"Kalıcı sil"}</button><button type="button" disabled={deletionBusy} onClick={()=>setDeletionPreview(null)} className="px-4 py-2 rounded-xl bg-stone-200">Vazgeç</button></div>
          </div>
        </div>
      )}

      {returnModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div>
                <h3 className="font-black text-base text-stone-900">İade Başlat</h3>
                <p className="text-xs text-stone-500 font-mono">{returnModalOrder.orderNumber}</p>
              </div>
              <button onClick={() => setReturnModalOrder(null)} className="p-1 text-stone-400 hover:text-stone-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-2">
              {(returnModalOrder.items || []).map((it: any) => (
                <div key={it.id} className="flex items-center justify-between gap-3 p-3 border border-stone-200 rounded-xl">
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-stone-900 block truncate">{it.productName}</span>
                    <span className="text-[10px] text-stone-400">Satın alınan: {it.quantity} × {Number(it.unitPrice).toFixed(2)} TL</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={it.quantity}
                    value={returnSelections[it.id] ?? 0}
                    onChange={(e) => setReturnSelections({ ...returnSelections, [it.id]: Math.min(Number(e.target.value), it.quantity) })}
                    className="w-20 px-2 py-1.5 border border-stone-300 rounded-lg text-xs text-center"
                  />
                </div>
              ))}
            </div>
            <button onClick={() => void submitReturn()} className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition">
              İade Talebi Oluştur
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FAZ 6 / MODAL: TEDARİKÇİ EKLE */}
      {/* ============================================================ */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Yeni Tedarikçi</h3>
              <button onClick={() => setIsAddSupplierOpen(false)} className="p-1 text-stone-400 hover:text-stone-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateSupplier} className="space-y-3 text-xs">
              <div><label className="block font-bold mb-1">Firma Adı *</label><input required value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block font-bold mb-1">Yetkili</label><input value={newSupplier.contactPerson} onChange={(e) => setNewSupplier({ ...newSupplier, contactPerson: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" /></div>
                <div><label className="block font-bold mb-1">Telefon</label><input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" /></div>
              </div>
              <div><label className="block font-bold mb-1">E-posta</label><input type="email" value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="block font-bold mb-1">Termin (gün)</label><input type="number" min="1" value={newSupplier.leadTimeDays} onChange={(e) => setNewSupplier({ ...newSupplier, leadTimeDays: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" /></div>
                <div><label className="block font-bold mb-1">Vade</label><input required placeholder="Örn. 30 Gün Vade / Peşin" value={newSupplier.paymentTerms} onChange={(e) => setNewSupplier({ ...newSupplier, paymentTerms: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" /></div>
              </div>
              <button type="submit" className="w-full py-3 bg-stone-900 text-white font-bold rounded-xl">Tedarikçiyi Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FAZ 6 / MODAL: DOĞRUDAN PO SİHİRBAZI */}
      {/* ============================================================ */}
      {isCreatePOOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Doğrudan Satın Alma Siparişi</h3>
              <button onClick={() => setIsCreatePOOpen(false)} className="p-1 text-stone-400 hover:text-stone-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreatePO} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <select required value={poWizard.supplierId} onChange={(e) => setPoWizard({ ...poWizard, supplierId: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl">
                  <option value="">Tedarikçi seç…</option>
                  {suppliersList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={poWizard.warehouseId} onChange={(e) => setPoWizard({ ...poWizard, warehouseId: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl">
                  {warehousesList.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <label className="block font-bold">Beklenen teslim tarihi <input required type="date" value={poWizard.expectedDate} onChange={e=>setPoWizard({...poWizard,expectedDate:e.target.value})} className="w-full px-3 py-2 border border-stone-300 rounded-xl" /></label>
              {poWizard.lines.map((ln, i) => (
                <div key={i} className="grid grid-cols-[1fr_64px_80px_32px] gap-1.5">
                  <select required value={ln.productId} onChange={(e) => { const lines = [...poWizard.lines]; lines[i] = { ...lines[i], productId: e.target.value, unitCost: products.find((p: any) => p.id === Number(e.target.value))?.buyPrice || "" }; setPoWizard({ ...poWizard, lines }); }} className="px-3 py-2 border border-stone-300 rounded-xl">
                    <option value="">Ürün…</option>
                    {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min="1" value={ln.quantity} onChange={(e) => { const lines = [...poWizard.lines]; lines[i] = { ...lines[i], quantity: e.target.value }; setPoWizard({ ...poWizard, lines }); }} className="px-2 py-2 border border-stone-300 rounded-xl" placeholder="Adet" />
                  <input value={ln.unitCost} onChange={(e) => { const lines = [...poWizard.lines]; lines[i] = { ...lines[i], unitCost: e.target.value }; setPoWizard({ ...poWizard, lines }); }} className="px-2 py-2 border border-stone-300 rounded-xl" placeholder="Birim ₺" />
                  <button type="button" onClick={() => setPoWizard({ ...poWizard, lines: poWizard.lines.filter((_, j) => j !== i) })} className="text-rose-600 font-bold">×</button>
                </div>
              ))}
              <button type="button" onClick={() => setPoWizard({ ...poWizard, lines: [...poWizard.lines, { productId: "", quantity: "50", unitCost: "" }] })} className="text-[11px] font-bold text-amber-800">+ Kalem ekle</button>
              <button type="submit" className="w-full py-3 bg-sky-800 text-white font-bold rounded-xl">Siparişi Oluştur</button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FAZ 6 / MODAL: KISMİ MAL KABUL */}
      {/* ============================================================ */}
      {receiveModalPO && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div><h3 className="font-black text-base text-stone-900">Kısmi Mal Kabul</h3><p className="text-xs text-stone-500 font-mono">{receiveModalPO.poNumber}</p></div>
              <button onClick={() => setReceiveModalPO(null)} className="p-1 text-stone-400 hover:text-stone-700"><X className="w-5 h-5" /></button>
            </div>
            {purchasingFeedback?.isError && <p role="alert" className="text-xs text-rose-700">{purchasingFeedback.text}</p>}
            {pendingPurchasing && <div><button disabled={purchasingSubmitting} onClick={()=>void sendPurchasingCommand(pendingPurchasing)} className="text-xs underline">Önceki işlemi tekrar sorgula</button> <button disabled={purchasingSubmitting} onClick={()=>void closePendingPurchasing()} className="text-xs underline">Sonucu kontrol et ve kapat</button></div>}
            <div className="space-y-2">
              {(receiveModalPO.items || []).map((it: any) => {
                const remaining = it.quantity - (it.receivedQty || 0);
                return (
                  <div key={it.id} className="flex items-center justify-between gap-2 p-2.5 border border-stone-200 rounded-xl text-xs">
                    <div className="min-w-0"><span className="font-bold block truncate">{it.productName} {it.variantName && `· ${it.variantName}`} · {it.sku}</span><span className="text-stone-400">Sipariş {it.quantity} · Alınan {it.receivedQty || 0} · Kalan {remaining}</span></div>
                    <input type="number" min="0" max={remaining} value={receiveLines[it.id] ?? remaining} onChange={(e) => setReceiveLines({ ...receiveLines, [it.id]: Math.min(Number(e.target.value), remaining) })} className="w-20 px-2 py-1.5 border border-stone-300 rounded-lg text-center" />
                  </div>
                );
              })}
            </div>
            <button disabled={!!pendingPurchasing || purchasingSubmitting} onClick={() => void submitReceive()} className="w-full py-3 bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs">Kabul Et & Stoğa İşle</button>
          </div>
        </div>
      )}

      {supplierReturnReceipt && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between"><h3 className="font-bold">Tedarikçiye iade · {supplierReturnReceipt.receiptNumber}</h3><button onClick={()=>setSupplierReturnReceipt(null)} aria-label="Kapat">×</button></div>
            {purchasingFeedback?.isError && <p role="alert" className="text-xs text-rose-700">{purchasingFeedback.text}</p>}
            {pendingPurchasing && <div><button disabled={purchasingSubmitting} onClick={()=>void sendPurchasingCommand(pendingPurchasing)} className="text-xs underline">Önceki işlemi tekrar sorgula</button> <button disabled={purchasingSubmitting} onClick={()=>void closePendingPurchasing()} className="text-xs underline">Sonucu kontrol et ve kapat</button></div>}
            <p className="text-xs">Depo: <strong>{supplierReturnReceipt.warehouseName}</strong>. İade onaylandığında bu mal kabulün deposundaki kullanılabilir stok azalır; ayrılmış stok kullanılamaz.</p>
            {(supplierReturnReceipt.items || []).map((item:any)=><label key={item.id} className="flex justify-between gap-3 text-xs"><span>{item.productName || `Ürün #${item.productId}`} {item.variantId ? `· ${[item.colorName,item.size,item.length].filter(Boolean).join(" / ")} · ${item.sku || `Varyant #${item.variantId}`}` : item.sku ? `· ${item.sku}` : ""} · Kabul {item.qty} · İade {item.returnedQty}</span><input aria-label={`${item.productName} iade miktarı`} type="number" min="0" max={item.qty-item.returnedQty} value={supplierReturnLines[item.id] ?? 0} onChange={e=>setSupplierReturnLines({...supplierReturnLines,[item.id]:Number(e.target.value)})} className="w-20 border rounded p-1" /></label>)}
            <label className="block text-xs font-bold">İade nedeni <textarea value={supplierReturnReason} maxLength={500} onChange={e=>setSupplierReturnReason(e.target.value)} className="w-full border rounded p-2" /></label>
            <button disabled={!!pendingPurchasing || purchasingSubmitting} onClick={()=>void submitSupplierReturn()} className="w-full py-3 bg-rose-700 text-white font-bold rounded-xl text-xs disabled:opacity-50">İadeyi Onayla ve Stoktan Düş</button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FAZ 1 / MODAL: YENİ KULLANICI */}
      {/* ============================================================ */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Yeni Personel Kaydı</h3>
              <button onClick={() => setIsAddUserOpen(false)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-3 text-xs">
              {userFeedback?.isError && <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-800">{userFeedback.text}</p>}
              <div>
                <label className="block font-bold text-stone-700 mb-1">Ad Soyad:</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Ayşe Çetin"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Kurumsal E-posta:</label>
                <input
                  type="email"
                  required
                  placeholder="ayse@serpilencollection.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Telefon:</label>
                  <input
                    type="text"
                    placeholder="0532 000 00 00"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Rol:</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    <option value="SUPER_ADMIN">Süper Admin</option>
                    <option value="STORE_MANAGER">Mağaza Müdürü</option>
                    <option value="WAREHOUSE_KEEPER">Depo Sorumlusu</option>
                    <option value="CASHIER">POS Kasiyeri</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Geçici Şifre:</label>
                <input
                  type="text"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="Örn: Magaza2026!"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono tracking-wide"
                />
                <p className="text-[10px] text-stone-400 mt-1">
                  En az 8 karakter, en az bir harf ve bir rakam. Personel ilk girişte şifresini <strong>Hesabım</strong> sayfasından değiştirebilir — şifreyi güvenli yolla iletin.
                </p>
              </div>

              <button
                type="submit"
                disabled={addingUser}
                className="w-full py-3 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs transition disabled:opacity-60"
              >
                {addingUser ? "Ekleniyor…" : "Personeli Kaydet"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FAZ 7 / MODAL: VARDİYA & Z RAPORU DETAYI */}
      {/* ============================================================ */}
      {selectedShiftForModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div>
                <h3 className="font-black text-base text-stone-900">
                  {selectedShiftForModal.zReportNumber ? "Gün Sonu Z Raporu" : "Vardiya Detayı"}
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  {selectedShiftForModal.zReportNumber || selectedShiftForModal.shiftNumber || `VARD-${selectedShiftForModal.id}`}
                </p>
              </div>
              <button onClick={() => setSelectedShiftForModal(null)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 text-xs space-y-2 font-mono">
              <div className="flex justify-between border-b border-stone-200 pb-1">
                <span>Kasa No:</span>
                <span className="font-bold">{selectedShiftForModal.terminalCode || "KASA-01"}</span>
              </div>
              <div className="flex justify-between border-b border-stone-200 pb-1">
                <span>Kasiyer:</span>
                <span className="font-bold">{selectedShiftForModal.cashierName}</span>
              </div>
              <div className="flex justify-between border-b border-stone-200 pb-1">
                <span>Açılış Tarihi:</span>
                <span>{new Date(selectedShiftForModal.openedAt).toLocaleString("tr-TR")}</span>
              </div>
              {selectedShiftForModal.closedAt && (
                <div className="flex justify-between border-b border-stone-200 pb-1">
                  <span>Kapanış Tarihi:</span>
                  <span>{new Date(selectedShiftForModal.closedAt).toLocaleString("tr-TR")}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Açılış Devri:</span>
                <span className="font-bold">{Number(selectedShiftForModal.openingAmount).toFixed(2)} TL</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Nakit Satışlar:</span>
                <span>+{Number(selectedShiftForModal.totalSalesCash || 0).toFixed(2)} TL</span>
              </div>
              <div className="flex justify-between text-sky-700 font-bold">
                <span>Kredi Kartı Satışlar:</span>
                <span>+{Number(selectedShiftForModal.totalSalesCard || 0).toFixed(2)} TL</span>
              </div>
              {Number(selectedShiftForModal.totalReturnsCash || 0) > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>Nakit İadeler:</span>
                  <span>-{Number(selectedShiftForModal.totalReturnsCash).toFixed(2)} TL</span>
                </div>
              )}
              <div className="border-t border-stone-300 pt-2 flex justify-between font-black text-sm text-stone-900">
                <span>Kasada Olması Gereken:</span>
                <span>{Number(selectedShiftForModal.expectedAmount || selectedShiftForModal.openingAmount).toFixed(2)} TL</span>
              </div>
              <div className="flex justify-between font-black text-sm text-amber-900">
                <span>Sayılan Fiili Nakit:</span>
                <span>{selectedShiftForModal.closingAmount ? `${Number(selectedShiftForModal.closingAmount).toFixed(2)} TL` : "—"}</span>
              </div>
              {selectedShiftForModal.notes && (
                <div className="border-t border-stone-200 pt-2 text-[11px] text-stone-600 font-sans">
                  <strong>Notlar:</strong> {selectedShiftForModal.notes}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-stone-900 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Yazdır</span>
              </button>
              <button
                onClick={() => setSelectedShiftForModal(null)}
                className="py-2.5 px-4 bg-stone-200 text-stone-800 font-bold text-xs rounded-xl"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
