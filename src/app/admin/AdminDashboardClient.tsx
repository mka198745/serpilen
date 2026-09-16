"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MarketingCenter } from "@/components/admin/MarketingCenter";
import { B2BCenter } from "@/components/admin/B2BCenter";
import { ErpIntegrationConsole } from "@/components/admin/ErpIntegrationConsole";
import { AiAssistantCenter } from "@/components/admin/AiAssistantCenter";
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
  FileText,
  Sparkles,
  BookOpen,
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
  Building2,
  Check,
  X,
  ShieldCheck,
  UserPlus,
  Power,
  Pencil,
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
} from "lucide-react";

interface AdminDashboardClientProps {
  products: any[];
  categories: any[];
  brands: any[];
  warehouses: any[];
  inventory: any[];
  ledger: any[];
  orders: any[];
  customers: any[];
  suppliers: any[];
  purchaseOrders: any[];
  coupons: any[];
  erpLogs: any[];
  shifts: any[];
}

export function AdminDashboardClient({
  products: initialProducts,
  categories,
  brands,
  warehouses,
  inventory: initialInventory,
  ledger: initialLedger,
  orders: initialOrders,
  customers: initialCustomers,
  suppliers: initialSuppliers,
  purchaseOrders: initialPOs,
  coupons: initialCoupons,
  erpLogs: initialErpLogs,
  shifts,
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
    | "erp"
    | "ai"
    | "users"
    | "audit"
    | "reports"
    | "b2b"
  >("dashboard");

  /* --- FAZ 7: POS & Kasa Yönetimi (Admin) --- */
  const [shiftsList, setShiftsList] = useState(shifts);
  const [posSubTab, setPosSubTab] = useState<"shifts" | "zreports" | "transactions" | "stats">("shifts");
  const [posTransList, setPosTransList] = useState<any[]>([]);
  const [selectedShiftForModal, setSelectedShiftForModal] = useState<any | null>(null);

  const loadPosShifts = React.useCallback(async () => {
    try {
      const res = await fetch("/api/pos/shift?warehouseId=2", { cache: "no-store" });
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
  const [catalogSubTab, setCatalogSubTab] = useState<"products" | "categories" | "brands" | "variants">("products");
  const [catalogBrandFilter, setCatalogBrandFilter] = useState("ALL");
  const [catalogCatFilter, setCatalogCatFilter] = useState("ALL");
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [variantProductId, setVariantProductId] = useState<string>("");
  const [newVariant, setNewVariant] = useState({
    colorName: "",
    colorHex: "#111827",
    size: "",
    length: "",
    retailPrice: "",
    b2bPrice: "",
    buyPrice: "",
    sku: "",
    barcode: "",
    initialStock: "20",
  });
  const [newCategory, setNewCategory] = useState({ name: "", parentId: "", description: "" });
  const [newBrandAdmin, setNewBrandAdmin] = useState("");
  const [catalogFeedback, setCatalogFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [inventoryList, setInventoryList] = useState(initialInventory);
  const [ledger, setLedger] = useState(initialLedger);
  const [orders, setOrders] = useState(initialOrders);
  const [customers, setCustomers] = useState(initialCustomers);
  const [purchaseOrders, setPurchaseOrders] = useState(initialPOs);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [erpLogs, setErpLogs] = useState(initialErpLogs);

  // Search & Filter
  const [catalogSearch, setCatalogSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [selectedWhFilter, setSelectedWhFilter] = useState<string>("ALL");

  /* --- FAZ 3: Envanter (WMS alt sekmeleri) --- */
  const [wmsSubTab, setWmsSubTab] = useState<"balances" | "transfers" | "counts" | "locations" | "reservations">("balances");
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
  const [newTransfer, setNewTransfer] = useState({ fromWarehouseId: "1", toWarehouseId: "2", productId: "", qty: "10", note: "" });
  const [newLocation, setNewLocation] = useState({ warehouseId: "1", zone: "A", aisle: "01", rack: "01", shelf: "01" });

  /* --- FAZ 4: Sipariş yaşam döngüsü + İade --- */
  const [ordersSubTab, setOrdersSubTab] = useState<"orders" | "returns">("orders");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [orderFeedback, setOrderFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [returnModalOrder, setReturnModalOrder] = useState<any | null>(null);
  const [returnSelections, setReturnSelections] = useState<Record<number, number>>({});

  /* --- FAZ 5: Raporlama Motoru --- */
  const [reportData, setReportData] = useState<any | null>(null);
  const [reportDays, setReportDays] = useState(30);
  const [reportSubTab, setReportSubTab] = useState<"sales" | "products" | "stock" | "customers" | "finance">("sales");
  const [reportBusy, setReportBusy] = useState(false);

  /* --- FAZ 6: Satın Alma (talep→onay→sipariş→kabul + öneriler) --- */
  const [suppliersList, setSuppliersList] = useState(initialSuppliers);
  const [purchasingSubTab, setPurchasingSubTab] = useState<"suggest" | "requests" | "orders" | "receipts" | "suppliers">("suggest");
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const [receiptsList, setReceiptsList] = useState<any[]>([]);
  const [purchasingBusy, setPurchasingBusy] = useState(false);
  const [purchasingFeedback, setPurchasingFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", contactPerson: "", phone: "", email: "", leadTimeDays: "5", paymentTerms: "30 Gün Vade", rating: "4.5" });
  const [isCreatePOOpen, setIsCreatePOOpen] = useState(false);
  const [poWizard, setPoWizard] = useState({ supplierId: "", warehouseId: "1", expectedDate: "", lines: [{ productId: "", quantity: "50", unitCost: "" }] as any[] });
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [requestWizard, setRequestWizard] = useState({ warehouseId: "1", priority: "NORMAL", notes: "", lines: [{ productId: "", qty: "50" }] as any[] });
  const [receiveModalPO, setReceiveModalPO] = useState<any | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<number, number>>({});

  const loadPurchasing = React.useCallback(async () => {
    setPurchasingBusy(true);
    try {
      const res = await fetch("/api/suppliers", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setSuppliersList(data.suppliers);
        setPurchaseOrders(data.purchaseOrders);
        setPurchaseRequests(data.requests || []);
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
    const res = await fetch("/api/suppliers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CREATE_SUPPLIER", ...newSupplier }),
    });
    const data = await res.json();
    if (data.success) {
      setSuppliersList((prev: any[]) => [data.data, ...prev]);
      setIsAddSupplierOpen(false);
      setNewSupplier({ name: "", contactPerson: "", phone: "", email: "", leadTimeDays: "5", paymentTerms: "30 Gün Vade", rating: "4.5" });
      setPurchasingFeedback({ text: "Tedarikçi eklendi.", isError: false });
    } else {
      setPurchasingFeedback({ text: data.error || "Tedarikçi eklenemedi.", isError: true });
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/suppliers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_REQUEST",
        warehouseId: Number(requestWizard.warehouseId),
        priority: requestWizard.priority,
        notes: requestWizard.notes,
        items: requestWizard.lines.filter((l) => l.productId).map((l) => ({ productId: Number(l.productId), qty: Number(l.qty) })),
      }),
    });
    const data = await res.json();
    if (data.success) {
      setIsRequestOpen(false);
      setRequestWizard({ warehouseId: "1", priority: "NORMAL", notes: "", lines: [{ productId: "", qty: "50" }] });
      setPurchasingFeedback({ text: `Talep oluşturuldu: ${data.data.requestNumber}`, isError: false });
      void loadPurchasing();
    } else {
      setPurchasingFeedback({ text: data.error || "Talep oluşturulamadı.", isError: true });
    }
  };

  const handleRequestAction = async (requestId: number, action: "APPROVE_REQUEST" | "REJECT_REQUEST" | "CONVERT_REQUEST", extra?: any) => {
    const res = await fetch("/api/suppliers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, requestId, ...extra }),
    });
    const data = await res.json();
    if (data.success) {
      setPurchasingFeedback({ text: "Talep işlemi tamamlandı.", isError: false });
      void loadPurchasing();
    } else {
      setPurchasingFeedback({ text: data.error || "İşlem başarısız.", isError: true });
    }
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/suppliers", {
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
      setPoWizard({ supplierId: "", warehouseId: "1", expectedDate: "", lines: [{ productId: "", quantity: "50", unitCost: "" }] });
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

  const submitReceive = async () => {
    if (!receiveModalPO) return;
    const lines = Object.entries(receiveLines)
      .map(([purchaseOrderItemId, qty]) => ({ purchaseOrderItemId: Number(purchaseOrderItemId), qty: Number(qty) }))
      .filter((l) => l.qty > 0);
    if (!lines.length) {
      setPurchasingFeedback({ text: "Kabul edilecek miktar girin.", isError: true });
      return;
    }
    const res = await fetch("/api/suppliers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "RECEIVE_GOODS", purchaseOrderId: receiveModalPO.id, lines }),
    });
    const data = await res.json();
    if (data.success) {
      setPurchasingFeedback({ text: `Mal kabul fişi ${data.data.receipt.receiptNumber} — ${data.data.receivedQty} adet stoğa girdi (${data.data.poStatus}).`, isError: false });
      setReceiveModalPO(null);
      void loadPurchasing();
      const invRes = await fetch("/api/inventory");
      const invData = await invRes.json();
      if (invData.success) setInventoryList(invData.inventory);
    } else {
      setPurchasingFeedback({ text: data.error || "Mal kabul başarısız.", isError: true });
    }
  };

  const loadReport = React.useCallback(async (days: number) => {
    setReportBusy(true);
    try {
      const res = await fetch(`/api/reports?days=${days}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) setReportData(data);
    } finally {
      setReportBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === "reports") void loadReport(reportDays);
  }, [activeTab, reportDays, loadReport]);

  const ORDER_STATUS_LABELS: Record<string, string> = {
    PENDING: "Ödeme Bekliyor", PAID: "Ödendi", PREPARING: "Hazırlanıyor",
    READY_FOR_SHIPMENT: "Sevke Hazır", SHIPPED: "Kargoda", DELIVERED: "Teslim Edildi",
    CANCELLED: "İptal", RETURN_REQUESTED: "İade Talebi", RETURNED: "İade Alındı", REFUNDED: "İade Ödendi",
  };
  const ORDER_NEXT: Record<string, string[]> = {
    PENDING: ["PAID", "CANCELLED"], PAID: ["PREPARING", "CANCELLED"], PREPARING: ["READY_FOR_SHIPMENT", "CANCELLED"],
    READY_FOR_SHIPMENT: ["SHIPPED", "CANCELLED"], SHIPPED: ["DELIVERED"], DELIVERED: [], RETURN_REQUESTED: [], RETURNED: [], CANCELLED: [], REFUNDED: [],
  };

  const refreshOrders = async () => {
    const res = await fetch("/api/orders", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setOrders(data.data);
  };

  const loadReturns = React.useCallback(async () => {
    const res = await fetch("/api/returns", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setReturnsList(data.data);
  }, []);

  React.useEffect(() => {
    if (activeTab === "orders" && ordersSubTab === "returns") void loadReturns();
  }, [activeTab, ordersSubTab, loadReturns]);

  const advanceOrder = async (id: number, status: string) => {
    const res = await fetch("/api/orders", {
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
    const res = await fetch("/api/returns", {
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
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, returnId }),
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
  const [isAddB2BOpen, setIsAddB2BOpen] = useState(false);
  const [isAddCouponOpen, setIsAddCouponOpen] = useState(false);

  // Form states
  const [newProd, setNewProd] = useState({
    name: "",
    sku: "",
    barcode: "",
    categoryId: "1",
    brandId: "1",
    unit: "Adet",
    buyPrice: "30.00",
    retailPrice: "55.00",
    b2bPrice: "40.00",
    initialStock: "50",
    warehouseId: "1",
    shortDescription: "",
  });

  const [transferData, setTransferData] = useState({
    fromWarehouseId: "1",
    toWarehouseId: "2",
    productId: products[0]?.id || 1,
    quantity: 10,
    note: "Mağaza Kasa İhtiyacı İçin Sevk",
  });

  const [adjustData, setAdjustData] = useState({
    warehouseId: "1",
    productId: products[0]?.id || 1,
    quantityDelta: 5,
    reason: "SAYIM",
    note: "Haftalık raf sayım mutabakatı",
  });

  const [newB2B, setNewB2B] = useState({
    name: "",
    companyName: "",
    phone: "",
    email: "",
    taxOffice: "Kadıköy V.D.",
    taxNumber: "",
    creditLimit: "100000.00",
    discountRate: "10.00",
  });

  const [newCoupon, setNewCoupon] = useState({
    code: "",
    discountType: "PERCENT",
    discountValue: "15.00",
    minCartAmount: "500.00",
    usageLimit: 100,
  });

  /* --- FAZ 1: Kullanıcılar & Roller + Denetim Kaydı --- */
  const [usersList, setUsersList] = useState<any[]>([]);
  const [usersBusy, setUsersBusy] = useState(false);
  const [auditList, setAuditList] = useState<any[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", phone: "", role: "CASHIER" });
  const [addingUser, setAddingUser] = useState(false);
  const [userFeedback, setUserFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const loadUsers = React.useCallback(async () => {
    setUsersBusy(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) setUsersList(data.data);
    } catch {
      /* sessiz */
    } finally {
      setUsersBusy(false);
    }
  }, []);

  const loadAudit = React.useCallback(async () => {
    setAuditBusy(true);
    try {
      const res = await fetch("/api/audit", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) setAuditList(data.data || []);
    } catch {
      /* sessiz */
    } finally {
      setAuditBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === "users") void loadUsers();
    if (activeTab === "audit") void loadAudit();
  }, [activeTab, loadUsers, loadAudit]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingUser) return;
    setAddingUser(true);
    setUserFeedback(null);
    try {
      const res = await fetch("/api/users", {
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
      setNewUser({ name: "", email: "", phone: "", role: "CASHIER" });
      setIsAddUserOpen(false);
    } catch {
      setUserFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setAddingUser(false);
    }
  };

  const updateUser = async (id: number, patch: { role?: string; isActive?: boolean }) => {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    if (data?.success) {
      setUsersList((prev) => prev.map((u) => (u.id === id ? { ...u, ...data.data } : u)));
    }
  };

  /* --- Satır içi "manuel ekleme" durumu (Marka / Giriş Deposu) --- */
  const [newBrandName, setNewBrandName] = useState("");
  const [addingBrand, setAddingBrand] = useState(false);
  const [brandFeedback, setBrandFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newWarehouseType, setNewWarehouseType] = useState("CENTRAL");
  const [addingWarehouse, setAddingWarehouse] = useState(false);
  const [warehouseFeedback, setWarehouseFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const handleAddBrand = async () => {
    const name = newBrandName.trim();
    if (!name || addingBrand) return;
    setAddingBrand(true);
    setBrandFeedback(null);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) {
        setBrandFeedback({ text: data?.error?.message || "Marka eklenemedi.", isError: true });
        return;
      }
      const created = data.data;
      if (!data.existed) setBrandsList((prev) => [...prev, created]);
      setNewProd((prev) => ({ ...prev, brandId: String(created.id) }));
      setBrandFeedback({
        text: data.existed ? `"${created.name}" zaten kayıtlı — seçildi.` : `"${created.name}" marka listesine eklendi ve seçildi.`,
        isError: false,
      });
      setNewBrandName("");
    } catch {
      setBrandFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setAddingBrand(false);
    }
  };

  const handleAddWarehouse = async () => {
    const name = newWarehouseName.trim();
    if (!name || addingWarehouse) return;
    setAddingWarehouse(true);
    setWarehouseFeedback(null);
    try {
      const res = await fetch("/api/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: newWarehouseType }),
      });
      const data = await res.json();
      if (!data.success) {
        setWarehouseFeedback({ text: data?.error?.message || "Depo eklenemedi.", isError: true });
        return;
      }
      const created = data.data;
      if (!data.existed) setWarehousesList((prev) => [...prev, created]);
      setNewProd((prev) => ({ ...prev, warehouseId: String(created.id) }));
      setWarehouseFeedback({
        text: data.existed ? `"${created.name}" zaten kayıtlı — seçildi.` : `"${created.name}" (${created.code}) depo oluşturuldu ve seçildi.`,
        isError: false,
      });
      setNewWarehouseName("");
    } catch {
      setWarehouseFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setAddingWarehouse(false);
    }
  };

  const refreshProducts = async () => {
    const pRes = await fetch("/api/products");
    const pData = await pRes.json();
    if (pData.success) setProducts(pData.data);
  };

  const handleSaveProductEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    const res = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingProduct.id,
        name: editingProduct.name,
        retailPrice: editingProduct.retailPrice,
        b2bPrice: editingProduct.b2bPrice,
        buyPrice: editingProduct.buyPrice,
        campaignPrice: editingProduct.campaignPrice || null,
        categoryId: editingProduct.categoryId,
        brandId: editingProduct.brandId,
        tags: editingProduct.tags || "",
        collection: editingProduct.collection || "",
        imageUrl: editingProduct.imageUrl,
        isFeatured: editingProduct.isFeatured,
        isActive: editingProduct.isActive,
        shortDescription: editingProduct.shortDescription,
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
    const res = await fetch("/api/products", {
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
    const res = await fetch("/api/categories", {
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
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBrandAdmin }),
    });
    const data = await res.json();
    if (data.success) {
      if (!data.existed) setBrandsList((prev) => [...prev, data.data]);
      setNewBrandAdmin("");
      setCatalogFeedback({ text: `"${data.data.name}" markası kaydedildi.`, isError: false });
    } else {
      setCatalogFeedback({ text: data.error?.message || "Marka eklenemedi.", isError: true });
    }
  };

  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantProductId) {
      setCatalogFeedback({ text: "Önce bir ürün seçin.", isError: true });
      return;
    }
    const res = await fetch("/api/variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: Number(variantProductId),
        ...newVariant,
      }),
    });
    const data = await res.json();
    if (data.success) {
      await refreshProducts();
      setNewVariant({
        colorName: "",
        colorHex: "#111827",
        size: "",
        length: "",
        retailPrice: "",
        b2bPrice: "",
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
      const [tRes, cRes, lRes, rRes] = await Promise.all([
        fetch("/api/transfers", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/counts", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/locations", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/reservations", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      if (tRes?.success) setTransfers(tRes.data);
      if (cRes?.success) setCountSessions(cRes.data);
      if (lRes?.success) setLocationsList(lRes.data);
      if (rRes?.success) setReservationsList(rRes.data);
    } finally {
      setWmsBusy(false);
    }
  }, []);

  const loadInventory = React.useCallback(async () => {
    const invRes = await fetch("/api/inventory", { cache: "no-store" });
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
    const res = await fetch("/api/transfers", {
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
    setNewTransfer({ fromWarehouseId: "1", toWarehouseId: "2", productId: "", qty: "10", note: "" });
  };

  const handleStartCount = async () => {
    const res = await fetch("/api/counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "START", warehouseId: Number(selectedWhFilter === "ALL" ? "1" : selectedWhFilter) }),
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
    const res = await fetch("/api/counts", {
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
    const res = await fetch("/api/counts", {
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
    const res = await fetch("/api/locations", {
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

  const handleReserveDemo = async () => {
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "RESERVE",
        warehouseId: Number(selectedWhFilter === "ALL" ? "1" : selectedWhFilter),
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
    const res = await fetch("/api/reservations", {
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

  // Dashboard calculations
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.grandTotal), 0);
  const posCount = orders.filter((o) => o.orderType === "POS").length;
  const onlineCount = orders.filter((o) => o.orderType === "ONLINE_B2C").length;
  const b2bCount = orders.filter((o) => o.orderType === "B2B").length;
  const criticalStockCount = inventoryList.filter((i) => i.isCritical).length;

  // FAZ 5: Dashboard KPI genişletmeleri
  const estimatedGrossProfit = orders
    .filter((o) => !["CANCELLED"].includes(o.status))
    .reduce((sum, o) => {
      const itemsCost = (o.items || []).reduce((c: number, it: any) => {
        const p = products.find((x) => x.id === it.productId);
        return c + Number(p?.buyPrice || 0) * it.quantity;
      }, 0);
      return sum + Number(o.grandTotal) - itemsCost;
    }, 0);
  const pendingOrdersCount = orders.filter((o) => ["PAID", "PREPARING", "READY_FOR_SHIPMENT"].includes(o.status)).length;
  const returnedOrdersCount = orders.filter((o) => ["RETURN_REQUESTED", "RETURNED", "REFUNDED"].includes(o.status)).length;
  const channelRevenue = {
    pos: orders.filter((o) => o.orderType === "POS" && !["CANCELLED"].includes(o.status)).reduce((s, o) => s + Number(o.grandTotal), 0),
    online: orders.filter((o) => o.orderType === "ONLINE_B2C" && !["CANCELLED"].includes(o.status)).reduce((s, o) => s + Number(o.grandTotal), 0),
    b2b: orders.filter((o) => o.orderType === "B2B" && !["CANCELLED"].includes(o.status)).reduce((s, o) => s + Number(o.grandTotal), 0),
  };

  // Handlers
  /** Ürün ekleme modalını taze durumya aç (önceki inline ekleme formunu temizler). */
  const openAddProductModal = () => {
    setNewBrandName("");
    setBrandFeedback(null);
    setNewWarehouseName("");
    setWarehouseFeedback(null);
    setIsAddProductOpen(true);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProd),
      });
      const data = await res.json();
      if (data.success) {
        alert("Ürün başarıyla oluşturuldu.");
        setIsAddProductOpen(false);
        // Refresh product list
        const pRes = await fetch("/api/products");
        const pData = await pRes.json();
        if (pData.success) setProducts(pData.data);
      } else {
        alert("Hata: " + data.error);
      }
    } catch (err: any) {
      alert("Hata: " + err.message);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/inventory", {
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
        const invRes = await fetch("/api/inventory");
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
      const res = await fetch("/api/inventory", {
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
        const invRes = await fetch("/api/inventory");
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

  const handleReceiveGoods = async (poId: number) => {
    if (!confirm("Bu satın alma siparişinin mal kabulünü onaylıyor musunuz? (Depo stokları otomatik artacaktır)")) return;
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RECEIVE_GOODS",
          purchaseOrderId: poId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        // Refresh POs
        const poRes = await fetch("/api/suppliers");
        const poData = await poRes.json();
        if (poData.success) setPurchaseOrders(poData.purchaseOrders);
        const invRes = await fetch("/api/inventory");
        const invData = await invRes.json();
        if (invData.success) setInventoryList(invData.inventory);
      } else {
        alert("Hata: " + data.error);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddB2B = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/b2b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newB2B),
      });
      const data = await res.json();
      if (data.success) {
        alert("B2B Cari Kartı Başarıyla Açıldı.");
        setIsAddB2BOpen(false);
        const cRes = await fetch("/api/b2b");
        const cData = await cRes.json();
        if (cData.success) setCustomers((prev) => [...prev, data.data]);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // FAZ 10: ERP entegrasyon aksiyonları ErpIntegrationConsole bileşeni tarafından yönetilir

  // FAZ 11: AI analizleri AiAssistantCenter bileşeni tarafından yönetilir

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col md:flex-row text-stone-900">
      {/* 1. Admin Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-stone-900 text-stone-300 flex flex-col shrink-0 border-r border-stone-800">
        <div className="p-4 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center text-white font-bold text-sm">
              İK
            </div>
            <div>
              <span className="font-black text-white text-sm block tracking-tight">İPEK TUHAFİYE</span>
              <span className="text-[10px] text-stone-400 font-mono block">Yönetim SaaS & WMS</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto text-xs font-semibold">
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

          <button
            onClick={() => setActiveTab("crm")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "crm"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Müşteri CRM & B2B</span>
          </button>

          <button
            onClick={() => setActiveTab("b2b")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "b2b"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>B2B Cari & Fiyat Listesi</span>
          </button>

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

          <button
            onClick={() => setActiveTab("erp")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
              activeTab === "erp"
                ? "bg-amber-700 text-white shadow-sm"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>ERP & e-Fatura Entegrasyon</span>
          </button>

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

          <div className="pt-3 border-t border-stone-800">
            <p className="px-3 pt-2 text-[9px] font-black uppercase tracking-widest text-stone-500">
              FAZ 1 — Temel
            </p>
          </div>

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

          <div className="pt-3 border-t border-stone-800">
            <Link
              href="/mimari"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition"
            >
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>Mimari Doküman (FAZ 0)</span>
            </Link>
          </div>
        </nav>

        {/* User profile footer */}
        <div className="p-3 bg-stone-950/80 border-t border-stone-800 text-[11px] flex items-center justify-between">
          <div>
            <p className="font-bold text-white">Ahmet Yılmaz</p>
            <p className="text-stone-400">Süper Admin</p>
          </div>
          <Link href="/" className="text-amber-400 hover:underline">
            Siteye Dön
          </Link>
        </div>
      </aside>

      {/* 2. Main Work Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6">
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
                  Fiziki mağaza, e-ticaret vitrini ve B2B toptan satış verilerinin anlık özeti.
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
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Geçen aya göre +%18 artış</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Toplam Sipariş / Satış</span>
                <div className="text-2xl font-black text-stone-900">{orders.length} İşlem</div>
                <div className="text-[11px] text-stone-500">
                  {posCount} POS • {onlineCount} Vitrin • {b2bCount} B2B
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Ortalama Sepet</span>
                <div className="text-2xl font-black text-stone-900">
                  {(totalRevenue / (orders.length || 1)).toFixed(2)} TL
                </div>
                <div className="text-[11px] text-stone-500">Kasiyer ve Vitrin Ortalaması</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Kritik Stok Uyarısı</span>
                <div className="text-2xl font-black text-rose-700">{criticalStockCount} Ürün</div>
                <button
                  onClick={() => setActiveTab("wms")}
                  className="text-[11px] text-rose-600 hover:underline font-semibold block text-left"
                >
                  Stok Yönetimini Aç →
                </button>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Brüt Kâr (Tahmini)</span>
                <div className="text-2xl font-black text-emerald-800">{estimatedGrossProfit.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL</div>
                <div className="text-[11px] text-stone-500">Ciro − satılan malın maliyeti</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">Bekleyen Sipariş</span>
                <div className="text-2xl font-black text-amber-800">{pendingOrdersCount}</div>
                <button onClick={() => setActiveTab("orders")} className="text-[11px] text-amber-800 hover:underline font-semibold block text-left">
                  Siparişleri Yönet →
                </button>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase">İade / Yeni Müşteri</span>
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-black text-rose-700">{returnedOrdersCount}</span>
                  <span className="text-xs text-stone-400">iade</span>
                  <span className="text-2xl font-black text-sky-700">{customers.length}</span>
                  <span className="text-xs text-stone-400">müşteri</span>
                </div>
                <button onClick={() => setActiveTab("reports")} className="text-[11px] text-stone-500 hover:underline font-semibold block text-left">
                  Detaylı Raporlar →
                </button>
              </div>
            </div>

            {/* Sales Channel Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                <span className="text-xs font-bold text-amber-900 uppercase">Fiziki Mağaza Web POS</span>
                <div className="text-xl font-black text-amber-950 mt-1">{posCount} Satış</div>
                <div className="text-sm font-bold text-amber-800">{channelRevenue.pos.toFixed(2)} TL</div>
                <p className="text-xs text-amber-800 mt-1">
                  Kadıköy Mağazası • Anında Kasa Fişi & Stok Düşümü
                </p>
              </div>

              <div className="bg-sky-50 p-4 rounded-2xl border border-sky-200">
                <span className="text-xs font-bold text-sky-900 uppercase">B2B Toptan Sevk</span>
                <div className="text-xl font-black text-sky-950 mt-1">{b2bCount} Sipariş</div>
                <div className="text-sm font-bold text-sky-800">{channelRevenue.b2b.toFixed(2)} TL</div>
                <p className="text-xs text-sky-800 mt-1">
                  Cari Açık Hesap & Toptan İskontolu Siparişler
                </p>
              </div>

              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
                <span className="text-xs font-bold text-emerald-900 uppercase">Online B2C E-Ticaret</span>
                <div className="text-xl font-black text-emerald-950 mt-1">{onlineCount} Sipariş</div>
                <div className="text-sm font-bold text-emerald-800">{channelRevenue.online.toFixed(2)} TL</div>
                <p className="text-xs text-emerald-800 mt-1">
                  Kredi Kartı / 3D Secure / Yurtiçi Kargo
                </p>
              </div>
            </div>

            {/* Recent Orders Table */}
            <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-stone-900">Son Sipariş & Satış Hareketleri</h3>
                <button
                  onClick={() => setActiveTab("orders")}
                  className="text-xs text-amber-800 hover:underline font-semibold"
                >
                  Tümünü Gör →
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-2.5 px-3">Sipariş No</th>
                      <th className="py-2.5 px-3">Kanal</th>
                      <th className="py-2.5 px-3">Müşteri</th>
                      <th className="py-2.5 px-3">Tutar</th>
                      <th className="py-2.5 px-3">Ödeme</th>
                      <th className="py-2.5 px-3">Fatura (e-Arşiv)</th>
                      <th className="py-2.5 px-3">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
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
                        <td className="py-3 px-3 font-mono text-[11px] text-stone-500">
                          {ord.erpInvoiceNumber || "-"}
                        </td>
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
            </div>
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
                  Merkezi katalog: vitrin, POS ve B2B aynı ürün/SKU/barkod kaydını kullanır.
                </p>
              </div>
              {catalogSubTab === "products" && (
                <button
                  onClick={openAddProductModal}
                  className="px-3.5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
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
                                <div className="text-[10px] text-sky-800">B2B {Number(prod.b2bPrice).toFixed(2)} TL</div>
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
                                  onClick={() => setEditingProduct({ ...prod })}
                                  className="flex items-center gap-1 text-amber-800 font-bold hover:underline"
                                >
                                  <Pencil className="w-3 h-3" /> Düzenle
                                </button>
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
                                await fetch("/api/categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, isActive: !c.isActive }) });
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {brandsList.map((b) => (
                        <tr key={b.id}>
                          <td className="py-3 px-3 font-bold">{b.name}</td>
                          <td className="py-3 px-3 font-mono text-[10px]">{b.slug}</td>
                          <td className="py-3 px-3">{products.filter((p) => p.brandId === b.id).length}</td>
                          <td className="py-3 px-3">
                            <button
                              onClick={async () => {
                                await fetch("/api/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, isActive: !b.isActive }) });
                                setBrandsList((prev) => prev.map((x) => x.id === b.id ? { ...x, isActive: !x.isActive } : x));
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${b.isActive !== false ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-500"}`}
                            >
                              {b.isActive !== false ? "Aktif" : "Pasif"}
                            </button>
                          </td>
                        </tr>
                      ))}
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
                  <input placeholder="B2B fiyat" value={newVariant.b2bPrice} onChange={(e) => setNewVariant({ ...newVariant, b2bPrice: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <input placeholder="Başlangıç stok" value={newVariant.initialStock} onChange={(e) => setNewVariant({ ...newVariant, initialStock: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <button type="submit" className="md:col-span-4 py-2.5 bg-amber-800 text-white font-bold rounded-xl">Varyantı Oluştur (SKU otomatik)</button>
                </form>

                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-3">Ürün</th>
                        <th className="py-3 px-3">SKU</th>
                        <th className="py-3 px-3">Renk / Ölçü</th>
                        <th className="py-3 px-3">Fiyat</th>
                        <th className="py-3 px-3">Barkod</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {products.flatMap((p) => (p.variants || []).map((v: any) => (
                        <tr key={v.id}>
                          <td className="py-2.5 px-3 font-semibold">{p.name}</td>
                          <td className="py-2.5 px-3 font-mono">{v.sku}</td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1.5">
                              {v.colorHex && <span className="w-3 h-3 rounded-full border border-stone-300" style={{ backgroundColor: v.colorHex }} />}
                              {v.colorName || "—"} {v.size ? `· ${v.size}` : ""}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold">{Number(v.retailPrice).toFixed(2)} TL</td>
                          <td className="py-2.5 px-3 font-mono text-[10px]">{v.barcode}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
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
                        Seçili depo ({warehousesList.find((w) => String(w.id) === (selectedWhFilter === "ALL" ? "1" : selectedWhFilter))?.name || "Merkez"}) için sayım başlatın; ardından barkod okutup adet girin.
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
                        <tr><td colSpan={7} className="py-8 text-center text-stone-400">Aktif/geçmiş rezervasyon yok.</td></tr>
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
        {activeTab === "reports" && (
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
              <a
                href={`/api/reports?days=${reportDays}&format=csv&export=${reportSubTab}`}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-stone-900 text-white hover:bg-black transition ml-auto"
              >
                <Download className="w-3.5 h-3.5" />
                CSV İndir
              </a>
            </div>

            {reportBusy && <div className="text-xs text-stone-500">Hesaplanıyor…</div>}

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
                        <span>{ch.channel === "POS" ? "Fiziki Mağaza (POS)" : ch.channel === "B2B" ? "B2B Toptan" : "Online B2C"}</span>
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

            {reportData && reportSubTab === "customers" && (
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
                    İPEK TUHAFİYE
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
                          <td colSpan={7} className="py-8 text-center text-stone-400">
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
            {posSubTab === "stats" && (
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
            )}
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
                <div className="flex flex-wrap gap-1.5">
                  {["ALL", "PAID", "PREPARING", "READY_FOR_SHIPMENT", "SHIPPED", "DELIVERED", "CANCELLED"].map((s) => (
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
                              <span className="text-[10px] text-stone-400">{ord.erpInvoiceNumber}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ord.orderType === "B2B" ? "bg-sky-100 text-sky-800" : ord.orderType === "POS" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
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
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1">
                                {(ORDER_NEXT[ord.status] || []).map((next) => (
                                  <button
                                    key={next}
                                    onClick={() => void advanceOrder(ord.id, next)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold ${next === "CANCELLED" ? "bg-stone-200 text-stone-600" : "bg-amber-700 text-white"}`}
                                  >
                                    {ORDER_STATUS_LABELS[next] || next}
                                  </button>
                                ))}
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
                            {r.status === "REQUESTED" && (
                              <>
                                <button onClick={() => void returnAction(r.id, "APPROVE")} className="px-2 py-1 bg-amber-700 text-white rounded-lg text-[10px] font-bold">Onayla</button>
                                <button onClick={() => void returnAction(r.id, "REJECT")} className="px-2 py-1 bg-stone-200 text-stone-600 rounded-lg text-[10px] font-bold">Reddet</button>
                              </>
                            )}
                            {r.status === "APPROVED" && (
                              <button onClick={() => void returnAction(r.id, "RECEIVE")} className="px-2 py-1 bg-sky-700 text-white rounded-lg text-[10px] font-bold">Teslim Al (+Stok)</button>
                            )}
                            {r.status === "RECEIVED" && (
                              <button onClick={() => void returnAction(r.id, "REFUND")} className="px-2 py-1 bg-emerald-700 text-white rounded-lg text-[10px] font-bold">İade Bedeli Öde</button>
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
        {/* TAB 6: CRM & B2B WHOLESALE CLIENTS */}
        {/* ============================================================ */}
        {activeTab === "crm" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-stone-900">Müşteri CRM 360 & B2B Cari Yönetimi</h2>
                <p className="text-xs text-stone-500">
                  Perakende sadakat puanları, toptan cari kredi limitleri ve vergi mükellefleri.
                </p>
              </div>

              <button
                onClick={() => setIsAddB2BOpen(true)}
                className="px-3 py-2 bg-sky-800 hover:bg-sky-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni B2B Cari Aç</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-3">Müşteri / Şirket</th>
                      <th className="py-3 px-3">Tip</th>
                      <th className="py-3 px-3">İletişim</th>
                      <th className="py-3 px-3">Vergi Dairesi / No</th>
                      <th className="py-3 px-3">Cari Bakiye</th>
                      <th className="py-3 px-3">Kredi Limiti</th>
                      <th className="py-3 px-3">Sadakat Puanı</th>
                      <th className="py-3 px-3">Segment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {customers.map((c) => (
                      <tr key={c.id} className="hover:bg-stone-50/50">
                        <td className="py-3 px-3">
                          <span className="font-bold text-stone-900 block">{c.name}</span>
                          {c.companyName && (
                            <span className="text-[10px] text-stone-500">{c.companyName}</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              c.type === "B2B" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {c.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-stone-600">
                          <div>{c.phone}</div>
                          <div className="text-[10px] text-stone-400">{c.email}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-stone-600">
                          {c.taxNumber ? `${c.taxOffice} / ${c.taxNumber}` : "-"}
                        </td>
                        <td className="py-3 px-3 font-bold text-stone-900">
                          {Number(c.balance || 0).toFixed(2)} TL
                        </td>
                        <td className="py-3 px-3 text-stone-500">
                          {Number(c.creditLimit || 0).toFixed(2)} TL
                        </td>
                        <td className="py-3 px-3 font-bold text-amber-800">
                          {c.loyaltyPoints} Puan
                        </td>
                        <td className="py-3 px-3">
                          <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-bold text-[10px]">
                            {c.segment}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 7: PURCHASING & SUPPLIERS */}
        {/* ============================================================ */}
        {activeTab === "purchasing" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">FAZ 6 — Satın Alma</span>
                <h2 className="text-xl font-black text-stone-900">Talep → Onay → Sipariş → Mal Kabul</h2>
                <p className="text-xs text-stone-500">Otomatik yeniden sipariş önerileri, kısmi mal kabul ve tedarikçi karnesi.</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setIsRequestOpen(true)} className="px-3 py-2 bg-amber-800 text-white text-xs font-bold rounded-xl">+ Satın Alma Talebi</button>
                <button onClick={() => setIsCreatePOOpen(true)} className="px-3 py-2 bg-sky-800 text-white text-xs font-bold rounded-xl">+ Sipariş (PO)</button>
                <button onClick={() => setIsAddSupplierOpen(true)} className="px-3 py-2 bg-stone-900 text-white text-xs font-bold rounded-xl">+ Tedarikçi</button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "suggest" as const, label: `Öneriler (${suggestionCount})` },
                { id: "requests" as const, label: `Talepler (${purchaseRequests.length})` },
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
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr><th className="py-2.5 px-3">Ürün</th><th className="py-2.5 px-3">Depo</th><th className="py-2.5 px-3">Mevcut</th><th className="py-2.5 px-3">Aylık Satış</th><th className="py-2.5 px-3">Önerilen</th><th className="py-2.5 px-3">Tahmini Maliyet</th><th className="py-2.5 px-3">Öncelik</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {suggestions.map((s: any, i: number) => (
                      <tr key={`${s.productId}-${s.warehouseId}-${i}`}>
                        <td className="py-2.5 px-3"><span className="font-semibold block truncate max-w-[220px]">{s.productName}</span><span className="text-[10px] text-stone-400 font-mono">{s.sku}</span></td>
                        <td className="py-2.5 px-3">{s.warehouseName}</td>
                        <td className="py-2.5 px-3 font-bold">{s.available}</td>
                        <td className="py-2.5 px-3">{s.monthlySales}/ay</td>
                        <td className="py-2.5 px-3 font-black text-amber-800">{s.suggestedQty} ad</td>
                        <td className="py-2.5 px-3">{s.estimatedCost.toFixed(2)} TL</td>
                        <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.priority === "URGENT" ? "bg-rose-600 text-white" : s.priority === "HIGH" ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-600"}`}>{s.priority}</span></td>
                      </tr>
                    ))}
                    {suggestions.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-stone-400">Öneri yok — stoklar yeterli.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {purchasingSubTab === "requests" && (
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr><th className="py-2.5 px-3">Talep No</th><th className="py-2.5 px-3">Depo</th><th className="py-2.5 px-3">Kalem</th><th className="py-2.5 px-3">Öncelik</th><th className="py-2.5 px-3">Durum</th><th className="py-2.5 px-3">Aksiyon</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {purchaseRequests.map((r: any) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-3 font-mono font-bold">{r.requestNumber}</td>
                        <td className="py-2.5 px-3">{r.warehouseName}</td>
                        <td className="py-2.5 px-3">{(r.items || []).map((it: any) => <span key={it.id} className="block truncate max-w-[220px]">{it.productName} × {it.qty}</span>)}</td>
                        <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.priority === "URGENT" ? "bg-rose-600 text-white" : r.priority === "HIGH" ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-600"}`}>{r.priority}</span></td>
                        <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : r.status === "ORDERED" ? "bg-sky-100 text-sky-800" : r.status === "REJECTED" ? "bg-stone-200 text-stone-500" : "bg-amber-100 text-amber-900"}`}>{r.status}</span></td>
                        <td className="py-2.5 px-3">
                          <div className="flex gap-1 flex-wrap">
                            {r.status === "REQUESTED" && (
                              <>
                                <button onClick={() => void handleRequestAction(r.id, "APPROVE_REQUEST")} className="px-2 py-1 bg-emerald-700 text-white rounded-lg text-[10px] font-bold">Onayla</button>
                                <button onClick={() => void handleRequestAction(r.id, "REJECT_REQUEST")} className="px-2 py-1 bg-stone-200 text-stone-600 rounded-lg text-[10px] font-bold">Reddet</button>
                              </>
                            )}
                            {r.status === "APPROVED" && (
                              <select
                                defaultValue=""
                                onChange={(e) => { if (e.target.value) void handleRequestAction(r.id, "CONVERT_REQUEST", { supplierId: Number(e.target.value) }); e.target.value = ""; }}
                                className="px-2 py-1 border border-sky-300 rounded-lg text-[10px] font-bold text-sky-800"
                              >
                                <option value="">Siparişe dönüştür…</option>
                                {suppliersList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {purchaseRequests.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-stone-400">Talep yok.</td></tr>}
                  </tbody>
                </table>
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
                    <tr><th className="py-2.5 px-3">Fiş No</th><th className="py-2.5 px-3">PO</th><th className="py-2.5 px-3">Kabul Eden</th><th className="py-2.5 px-3">Tarih</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {receiptsList.map((r: any) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-3 font-mono font-bold">{r.receiptNumber}</td>
                        <td className="py-2.5 px-3 font-mono">PO #{r.purchaseOrderId}</td>
                        <td className="py-2.5 px-3">{r.receivedBy}</td>
                        <td className="py-2.5 px-3 text-stone-400">{new Date(r.createdAt).toLocaleString("tr-TR")}</td>
                      </tr>
                    ))}
                    {receiptsList.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-stone-400">Mal kabul fişi yok.</td></tr>}
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
                      <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded">★ {sup.rating}</span>
                    </div>
                    <p className="text-xs text-stone-600">Yetkili: {sup.contactPerson || "—"} ({sup.phone || "—"})</p>
                    <p className="text-[11px] text-stone-400">Vade: {sup.paymentTerms} | Termin: {sup.leadTimeDays} gün | {sup.totalPOs ?? 0} sipariş · %{sup.completionRate ?? 100} tamamlama</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 8: COUPONS & PROMOTIONS */}
        {/* ============================================================ */}
        {activeTab === "b2b" && <B2BCenter />}

        {activeTab === "coupons" && (
          <MarketingCenter categories={categories} brands={brands} />
        )}

        {/* ============================================================ */}
        {/* FAZ 10 / TAB: ERP & E-FATURA INTEGRATION CONSOLE */}
        {/* ============================================================ */}
        {activeTab === "erp" && (
          <ErpIntegrationConsole />
        )}

        {activeTab === "ai" && <AiAssistantCenter products={products} />}

        {/* ============================================================ */}
        {/* FAZ 1 / TAB: KULLANICILAR & ROLLER */}
        {/* ============================================================ */}
        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-stone-900">Kullanıcılar & Roller</h2>
                <p className="text-xs text-stone-500">
                  Personel kayıtları, rol atamaları ve hesap durumu (FAZ 1 — Temel modülü).
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
                      <th className="py-3 px-3">Personel</th>
                      <th className="py-3 px-3">E-posta</th>
                      <th className="py-3 px-3">Telefon</th>
                      <th className="py-3 px-3">Rol</th>
                      <th className="py-3 px-3">Durum</th>
                      <th className="py-3 px-3">Kayıt</th>
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
                            onChange={(e) => void updateUser(u.id, { role: e.target.value })}
                            className="px-2 py-1.5 bg-amber-50 border border-amber-200 text-amber-950 rounded-lg text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-amber-700"
                          >
                            <option value="SUPER_ADMIN">Süper Admin</option>
                            <option value="STORE_MANAGER">Mağaza Müdürü</option>
                            <option value="WAREHOUSE_KEEPER">Depo Sorumlusu</option>
                            <option value="CASHIER">POS Kasiyeri</option>
                            <option value="B2B_MANAGER">B2B Satış Temsilcisi</option>
                          </select>
                        </td>
                        <td className="py-3 px-3">
                          <button
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
                          {new Date(u.createdAt).toLocaleDateString("tr-TR")}
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

            {/* Rol → Modül yetki matrisi (bilgilendirme) */}
            <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-stone-900">Rol Yetki Matrisi</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-2 px-3">Rol</th>
                      <th className="py-2 px-3 text-center">Yönetim & WMS</th>
                      <th className="py-2 px-3 text-center">Web POS</th>
                      <th className="py-2 px-3 text-center">B2B Toptan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {[
                      ["SUPER_ADMIN", "Süper Admin", true, true, true],
                      ["STORE_MANAGER", "Mağaza Müdürü", true, true, true],
                      ["WAREHOUSE_KEEPER", "Depo Sorumlusu", true, false, false],
                      ["CASHIER", "POS Kasiyeri", false, true, false],
                      ["B2B_MANAGER", "B2B Temsilcisi", false, false, true],
                    ].map(([key, label, adm, pos, b2b]) => (
                      <tr key={String(key)}>
                        <td className="py-2 px-3 font-bold text-stone-800">{String(label)}</td>
                        {[adm, pos, b2b].map((granted, i) => (
                          <td key={i} className="py-2 px-3 text-center">
                            {granted ? (
                              <Check className="w-4 h-4 text-emerald-600 inline" />
                            ) : (
                              <X className="w-4 h-4 text-rose-400 inline" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-stone-400">
                Matris bilgilendirme amaçlıdır; roller veritabanında tutulur ve ileride modül erişim kısıtları bu tabloya bağlanabilir.
              </p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* FAZ 1 / TAB: DENETİM KAYDI */}
        {/* ============================================================ */}
        {activeTab === "audit" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-stone-900">Denetim Kaydı (Audit Log)</h2>
                <p className="text-xs text-stone-500">
                  Kritik işlemlerin kim / ne zaman / hangi IP ile yapıldığının değiştirilemez kayıtları.
                </p>
              </div>
              <button
                onClick={() => void loadAudit()}
                className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${auditBusy ? "animate-spin" : ""}`} />
                <span>Yenile</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-3">Tarih</th>
                      <th className="py-3 px-3">İşlem</th>
                      <th className="py-3 px-3">Kayıt</th>
                      <th className="py-3 px-3">Detay</th>
                      <th className="py-3 px-3">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {auditList.map((row) => (
                      <tr key={row.id} className="hover:bg-stone-50/50">
                        <td className="py-3 px-3 text-stone-500 whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString("tr-TR")}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              String(row.action).includes("FAIL") || String(row.action).includes("LOCK")
                                ? "bg-rose-100 text-rose-800"
                                : String(row.action).includes("SUCCESS")
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-stone-100 text-stone-700"
                            }`}
                          >
                            {row.action}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-stone-800">{row.userName}</span>
                          <span className="block text-[10px] text-stone-400 font-mono">{row.entity} #{row.entityId}</span>
                        </td>
                        <td className="py-3 px-3 text-stone-500 max-w-md truncate">{row.details}</td>
                        <td className="py-3 px-3 font-mono text-[10px] text-stone-400">{row.ipAddress}</td>
                      </tr>
                    ))}
                    {auditList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-stone-400">
                          {auditBusy ? "Yükleniyor…" : "Henüz denetim kaydı yok."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>


      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Ürün Düzenle</h3>
              <button type="button" onClick={() => setEditingProduct(null)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProductEdit} className="space-y-3 text-xs">
              <input required value={editingProduct.name} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold mb-1">Alış</label>
                  <input value={editingProduct.buyPrice} onChange={(e) => setEditingProduct({ ...editingProduct, buyPrice: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Perakende</label>
                  <input required value={editingProduct.retailPrice} onChange={(e) => setEditingProduct({ ...editingProduct, retailPrice: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                </div>
                <div>
                  <label className="block font-bold mb-1">B2B</label>
                  <input value={editingProduct.b2bPrice} onChange={(e) => setEditingProduct({ ...editingProduct, b2bPrice: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
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
              <input placeholder="Görsel URL" value={editingProduct.imageUrl || ""} onChange={(e) => setEditingProduct({ ...editingProduct, imageUrl: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
              <textarea placeholder="Kısa açıklama" value={editingProduct.shortDescription || ""} onChange={(e) => setEditingProduct({ ...editingProduct, shortDescription: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" rows={2} />
              <label className="flex items-center gap-2 font-bold">
                <input type="checkbox" checked={!!editingProduct.isFeatured} onChange={(e) => setEditingProduct({ ...editingProduct, isFeatured: e.target.checked })} />
                Öne çıkan ürün
              </label>
              <button type="submit" className="w-full py-3 bg-amber-800 text-white font-bold rounded-xl">Değişiklikleri Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Yeni Tuhafiye Ürünü Ekle</h3>
              <button onClick={() => setIsAddProductOpen(false)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-3 text-xs">
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
                    onChange={(e) => setNewProd({ ...newProd, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    {categoriesList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-stone-700">Marka:</label>
                      {brandFeedback && !brandFeedback.isError && (
                        <span className="text-[10px] font-bold text-emerald-700">✓ {brandFeedback.text}</span>
                      )}
                    </div>
                    <select
                      value={newProd.brandId}
                      onChange={(e) => setNewProd({ ...newProd, brandId: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                    >
                      {brandsList.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>

                    {/* MANUEL MARKA EKLEME — her zaman görünür */}
                    <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
                      <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                        + Yeni Marka Ekle
                      </p>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newBrandName}
                          onChange={(e) => setNewBrandName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleAddBrand();
                            }
                          }}
                          placeholder="Marka adı yazın… (örn. Kartopu)"
                          className="flex-1 min-w-0 px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-700/50"
                        />
                        <button
                          type="button"
                          onClick={() => void handleAddBrand()}
                          disabled={addingBrand || !newBrandName.trim()}
                          className="px-3 py-2 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition whitespace-nowrap flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{addingBrand ? "Ekleniyor…" : "Ekle & Seç"}</span>
                        </button>
                      </div>
                      {brandFeedback?.isError && (
                        <p className="text-[10px] font-bold text-rose-700">{brandFeedback.text}</p>
                      )}
                      <p className="text-[9px] text-stone-500">
                        Eklediğiniz marka listeye işlenir ve bu ürün için otomatik seçilir. Aynı isim varsa yenisi açılmaz.
                      </p>
                    </div>
                  </div>
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

              <div className="grid grid-cols-3 gap-2">
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
                <div>
                  <label className="block font-bold text-stone-700 mb-1">B2B Fiyatı (TL):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProd.b2bPrice}
                    onChange={(e) => setNewProd({ ...newProd, b2bPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Başlangıç Stoğu:</label>
                  <input
                    type="number"
                    value={newProd.initialStock}
                    onChange={(e) => setNewProd({ ...newProd, initialStock: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-stone-700">Giriş Deposu:</label>
                      {warehouseFeedback && !warehouseFeedback.isError && (
                        <span className="text-[10px] font-bold text-emerald-700">✓ {warehouseFeedback.text}</span>
                      )}
                    </div>
                  </div>
                  <select
                    value={newProd.warehouseId}
                    onChange={(e) => setNewProd({ ...newProd, warehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  >
                    {warehousesList.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>

                  {/* MANUEL DEPO EKLEME — her zaman görünür */}
                  <div className="mt-1.5 p-2 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
                    <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                      + Yeni Depo Ekle
                    </p>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <input
                        type="text"
                        value={newWarehouseName}
                        onChange={(e) => setNewWarehouseName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleAddWarehouse();
                          }
                        }}
                        placeholder="Depo adı yazın… (örn. Bursa Bölge)"
                        className="px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-700/50"
                      />
                      <select
                        value={newWarehouseType}
                        onChange={(e) => setNewWarehouseType(e.target.value)}
                        className="px-2 py-2 bg-white border border-amber-300 rounded-xl text-xs"
                      >
                        <option value="CENTRAL">Merkez</option>
                        <option value="STORE">Mağaza</option>
                        <option value="ONLINE">Online</option>
                        <option value="WHOLESALE">Toptan</option>
                      </select>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleAddWarehouse()}
                        disabled={addingWarehouse || !newWarehouseName.trim()}
                        className="flex-1 py-2 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{addingWarehouse ? "Ekleniyor…" : "Depoyu Ekle & Seç"}</span>
                      </button>
                    </div>
                    {warehouseFeedback?.isError && (
                      <p className="text-[10px] font-bold text-rose-700">{warehouseFeedback.text}</p>
                    )}
                    <p className="text-[9px] text-stone-500">
                      Depo kodu otomatik üretilir (örn. Bursa Bölge → BBD). Çakışırsa -2, -3 eklenir.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs transition"
              >
                Ürünü Kaydet & Stoğa Al
              </button>
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
      {/* MODAL 4: ADD B2B CLIENT */}
      {/* ============================================================ */}
      {isAddB2BOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Yeni B2B Toptan Müşteri Kartı</h3>
              <button onClick={() => setIsAddB2BOpen(false)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddB2B} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Yetkili Adı Soyadı:</label>
                <input
                  type="text"
                  required
                  value={newB2B.name}
                  onChange={(e) => setNewB2B({ ...newB2B, name: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Firma Ticari Unvanı:</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Anadolu Konfeksiyon San. Ltd. Şti."
                  value={newB2B.companyName}
                  onChange={(e) => setNewB2B({ ...newB2B, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Telefon:</label>
                  <input
                    type="text"
                    required
                    value={newB2B.phone}
                    onChange={(e) => setNewB2B({ ...newB2B, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">E-Posta:</label>
                  <input
                    type="email"
                    value={newB2B.email}
                    onChange={(e) => setNewB2B({ ...newB2B, email: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Vergi Dairesi:</label>
                  <input
                    type="text"
                    value={newB2B.taxOffice}
                    onChange={(e) => setNewB2B({ ...newB2B, taxOffice: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">VKN (10 Haneli):</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="9990001122"
                    value={newB2B.taxNumber}
                    onChange={(e) => setNewB2B({ ...newB2B, taxNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Cari Kredi Limiti (TL):</label>
                  <input
                    type="number"
                    value={newB2B.creditLimit}
                    onChange={(e) => setNewB2B({ ...newB2B, creditLimit: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Toptan İskonto (%):</label>
                  <input
                    type="number"
                    value={newB2B.discountRate}
                    onChange={(e) => setNewB2B({ ...newB2B, discountRate: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-sky-800 hover:bg-sky-900 text-white font-bold rounded-xl text-xs transition"
              >
                B2B Cari Hesabı Aç & Onayla
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FAZ 4 / MODAL: İADE BAŞLAT */}
      {/* ============================================================ */}
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
                <div><label className="block font-bold mb-1">Vade</label><input value={newSupplier.paymentTerms} onChange={(e) => setNewSupplier({ ...newSupplier, paymentTerms: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" /></div>
                <div><label className="block font-bold mb-1">Puan</label><input type="number" step="0.1" min="1" max="5" value={newSupplier.rating} onChange={(e) => setNewSupplier({ ...newSupplier, rating: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" /></div>
              </div>
              <button type="submit" className="w-full py-3 bg-stone-900 text-white font-bold rounded-xl">Tedarikçiyi Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FAZ 6 / MODAL: SATIN ALMA TALEBİ */}
      {/* ============================================================ */}
      {isRequestOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Satın Alma Talebi</h3>
              <button onClick={() => setIsRequestOpen(false)} className="p-1 text-stone-400 hover:text-stone-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateRequest} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <select value={requestWizard.warehouseId} onChange={(e) => setRequestWizard({ ...requestWizard, warehouseId: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl">
                  {warehousesList.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <select value={requestWizard.priority} onChange={(e) => setRequestWizard({ ...requestWizard, priority: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl">
                  <option value="LOW">Düşük</option><option value="NORMAL">Normal</option><option value="HIGH">Yüksek</option><option value="URGENT">Acil</option>
                </select>
              </div>
              {requestWizard.lines.map((ln, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_32px] gap-1.5">
                  <select required value={ln.productId} onChange={(e) => { const lines = [...requestWizard.lines]; lines[i] = { ...lines[i], productId: e.target.value }; setRequestWizard({ ...requestWizard, lines }); }} className="px-3 py-2 border border-stone-300 rounded-xl">
                    <option value="">Ürün seç…</option>
                    {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min="1" value={ln.qty} onChange={(e) => { const lines = [...requestWizard.lines]; lines[i] = { ...lines[i], qty: e.target.value }; setRequestWizard({ ...requestWizard, lines }); }} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <button type="button" onClick={() => setRequestWizard({ ...requestWizard, lines: requestWizard.lines.filter((_, j) => j !== i) })} className="text-rose-600 font-bold">×</button>
                </div>
              ))}
              <button type="button" onClick={() => setRequestWizard({ ...requestWizard, lines: [...requestWizard.lines, { productId: "", qty: "50" }] })} className="text-[11px] font-bold text-amber-800">+ Kalem ekle</button>
              <input placeholder="Not (opsiyonel)" value={requestWizard.notes} onChange={(e) => setRequestWizard({ ...requestWizard, notes: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
              <button type="submit" className="w-full py-3 bg-amber-800 text-white font-bold rounded-xl">Talebi Gönder</button>
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
            <div className="space-y-2">
              {(receiveModalPO.items || []).map((it: any) => {
                const remaining = it.quantity - (it.receivedQty || 0);
                return (
                  <div key={it.id} className="flex items-center justify-between gap-2 p-2.5 border border-stone-200 rounded-xl text-xs">
                    <div className="min-w-0"><span className="font-bold block truncate">{it.productName}</span><span className="text-stone-400">Sipariş {it.quantity} · Alınan {it.receivedQty || 0} · Kalan {remaining}</span></div>
                    <input type="number" min="0" max={remaining} value={receiveLines[it.id] ?? remaining} onChange={(e) => setReceiveLines({ ...receiveLines, [it.id]: Math.min(Number(e.target.value), remaining) })} className="w-20 px-2 py-1.5 border border-stone-300 rounded-lg text-center" />
                  </div>
                );
              })}
            </div>
            <button onClick={() => void submitReceive()} className="w-full py-3 bg-emerald-700 text-white font-bold rounded-xl text-xs">Kabul Et & Stoğa İşle</button>
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
                  placeholder="ayse@ipektuhafiye.com"
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
                    <option value="B2B_MANAGER">B2B Satış Temsilcisi</option>
                  </select>
                </div>
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
