"use client";
import { variantLabel } from "@/lib/variant-label";

import React, { useState, useRef, useEffect } from "react";
import { Product, Category, PosShift, ProductVariant } from "@/lib/types";
import {
  Scan,
  Search,
  Trash2,
  Printer,
  CreditCard,
  Banknote,
  Pause,
  Play,
  RotateCcw,
  CheckCircle2,
  X,
  Clock,
  Sparkles,
  Scissors,
  Check,
  Percent,
  ShieldCheck,
  Plus,
  ArrowRightLeft,
  FileText,
  DollarSign,
  AlertTriangle,
  Receipt,
  Coins,
} from "lucide-react";

import { authFetch } from "@/lib/client-auth";
import { PosCustomerPicker, type PosCustomer } from "./PosCustomerPicker";
interface PosCartItem {
  productId: number;
  variantId: number | null;
  name: string;
  variantName: string | null;
  sku: string;
  barcode: string | null;
  unitPrice: number;
  quantity: number;
  unit: string;
  discountPercent?: number;
}

interface PosTerminalClientProps {
  initialProducts: (Product & { variants: ProductVariant[] })[];
  categories: Category[];
  initialShift: PosShift | null;
}

export function PosTerminalClient({
  initialProducts,
  categories,
  initialShift,
}: PosTerminalClientProps) {
  const [shift, setShift] = useState<PosShift | null>(initialShift);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [overallDiscount, setOverallDiscount] = useState<number>(0);
  const [heldCarts, setHeldCarts] = useState<{ id: string; time: string; items: PosCartItem[]; customer: PosCustomer | null }[]>([]);
  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [zReportData, setZReportData] = useState<any | null>(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(!initialShift);
  const [openingCashInput, setOpeningCashInput] = useState("500.00");
  const [closingCashInput, setClosingCashInput] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const paymentInFlight = useRef(false);
  const [pendingSale, setPendingSale] = useState<{payload:Record<string, any>;prepared:boolean;confirmed:boolean} | null>(null);
  const [posQuoteData, setPosQuoteData] = useState<{signature:string;grandTotal:number;promotionDiscount:number;promotions:{id:number;name:string}[]}|null>(null);
  const [posQuoteError, setPosQuoteError] = useState("");
  const [recoverableSales, setRecoverableSales] = useState<any[] | null>(null);
  const loadRecoverableSales = async () => {
    try{const res=await authFetch("/api/pos/sale",{cache:"no-store"});const data=await res.json();if(!data.success)throw new Error(data.error);setRecoverableSales(data.data);}
    catch{alert("Açık satış hazırlıkları yüklenemedi.");}
  };
  const resolveRecoverableSale = async (sale:any, action:"COMPLETE"|"CANCEL") => {
    if(paymentInFlight.current)return;
    const breakdown=sale.payload.paymentMethod==='SPLIT' ? `${Number(sale.payload.splitCash).toFixed(2)} TL nakit + ${Number(sale.payload.splitCard).toFixed(2)} TL kart` : sale.payload.paymentMethod==='CASH' ? 'nakit' : 'harici kart POS';
    const message=action==='COMPLETE'?`${Number(sale.payload.grandTotal).toFixed(2)} TL (${breakdown}) tahsilatının tamamının gerçekten yapıldığını doğruluyor musunuz? Tekrar ödeme almayın.`:"Bu satış için hiç ödeme alınmadığını doğruluyor musunuz? Ödeme alındıysa iptal etmeyin.";
    if(!window.confirm(message))return;
    paymentInFlight.current=true;setIsProcessingPayment(true);
    try{const res=await authFetch("/api/pos/sale",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,key:sale.requestKey,confirmPayment:action==='COMPLETE',confirmNoPayment:action==='CANCEL'})});const data=await res.json();if(!data.success){alert(data.error||"İşlem kaydedilemedi.");return;}if(pendingSale?.payload.posRequestKey===sale.requestKey){localStorage.removeItem("serpilen_pos_pending_sale");setPendingSale(null);}await loadRecoverableSales();alert(action==='COMPLETE'?`Satış kaydedildi: ${data.data.order.orderNumber}`:"Ödeme alınmayan satış iptal edildi.");}
    catch{alert("Sonuç belirsiz; tekrar tahsilat yapmayın ve aynı kaydı inceleyin.");}
    finally{paymentInFlight.current=false;setIsProcessingPayment(false);}
  };
  const [posStorageReady, setPosStorageReady] = useState(false);
  useEffect(() => {
    const timer=setTimeout(()=>{
      try {
        const saved=localStorage.getItem("serpilen_pos_pending_sale");
        if(saved){const value=JSON.parse(saved);if(!value || typeof value.payload?.posRequestKey!=="string" || typeof value.confirmed!=="boolean" || typeof value.prepared!=="boolean")throw new Error("bad pending sale");setPendingSale(value);}
        setPosStorageReady(true);
      } catch {setPosQuoteError("Kaydedilmemiş POS işlemi okunamadı; yöneticiye danışın.");}
    },0);
    return ()=>clearTimeout(timer);
  }, []);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // FAZ 7 Modals
  const [isCashTransModalOpen, setIsCashTransModalOpen] = useState(false);
  const [cashTransType, setCashTransType] = useState<"CASH_IN" | "CASH_OUT" | "EXPENSE" | "FLOAT_ADD">("EXPENSE");
  const [cashTransAmount, setCashTransAmount] = useState("");
  const [cashTransReason, setCashTransReason] = useState("");

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnSearchQuery, setReturnSearchQuery] = useState("");
  const [returnOrderData, setReturnOrderData] = useState<any | null>(null);
  const [returnSelectedItems, setReturnSelectedItems] = useState<Record<number, number>>({});
  const [returnPrepared, setReturnPrepared] = useState<{id:number;returnNumber:string;refundAmount:string}|null>(null);
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnRefundMethod, setReturnRefundMethod] = useState<"CASH" | "CREDIT_CARD">("CASH");
  const [returnReason, setReturnReason] = useState("Müşteri İadesi");
  const [isSearchingReturn, setIsSearchingReturn] = useState(false);

  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "", email: "" });
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const creatingCustomerRef = useRef(false);

  // Denomination Cash Calculator for Shift Close
  const [denominations, setDenominations] = useState<Record<string, number>>({
    "200": 0,
    "100": 0,
    "50": 0,
    "20": 0,
    "10": 0,
    "5": 0,
    "1": 0,
    "0.5": 0,
  });

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Calculate counted cash from denominations
  const totalCalculatedCash = Object.entries(denominations).reduce(
    (sum, [denom, count]) => sum + Number(denom) * (Number(count) || 0),
    0
  );

  useEffect(() => {
    if (totalCalculatedCash > 0) {
      setClosingCashInput(totalCalculatedCash.toFixed(2));
    }
  }, [totalCalculatedCash]);

  // Focus barcode input on mount
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Filter products for POS
  const filteredProducts = initialProducts.filter((p) => {
    if (selectedCat && p.categoryId !== selectedCat) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchSku = p.sku.toLowerCase().includes(q);
      const matchBarcode = p.barcode?.includes(q);
      const matchVar = p.variants?.some((v) => v.sku.toLowerCase().includes(q) || v.barcode?.includes(q) || v.colorName?.toLowerCase().includes(q));
      if (!matchName && !matchSku && !matchBarcode && !matchVar) return false;
    }
    return true;
  });

  const showFeedback = (text: string, isError = false) => {
    setFeedbackMsg({ text, isError });
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  // Handle adding product or specific variant
  const handleAddToCart = (product: Product, variant: ProductVariant | null = null) => {
    const vId = variant ? variant.id : null;
    const price = variant ? Number(variant.retailPrice) : Number(product.retailPrice);
    const sku = variant ? variant.sku : product.sku;
    const barcode = variant ? variant.barcode : product.barcode;
    const variantName = variant ? variantLabel(variant) : null;

    setCart((prev) => {
      const idx = prev.findIndex((item) => item.productId === product.id && item.variantId === vId);
      if (idx > -1) {
        const next = [...prev];
        next[idx].quantity += 1;
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          variantId: vId,
          name: product.name,
          variantName,
          sku,
          barcode,
          unitPrice: price,
          quantity: 1,
          unit: product.unit || "Adet",
        },
      ];
    });

    showFeedback(`✓ ${product.name} sepete eklendi`);
  };

  // Handle barcode scanning via gun
  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    // Check variants first
    for (const prod of initialProducts) {
      const matchVar = prod.variants?.find((v) => v.barcode === code || v.sku.toUpperCase() === code.toUpperCase());
      if (matchVar) {
        handleAddToCart(prod, matchVar);
        setBarcodeInput("");
        return;
      }
      if (prod.barcode === code || prod.sku.toUpperCase() === code.toUpperCase()) {
        handleAddToCart(prod, null);
        setBarcodeInput("");
        return;
      }
    }

    showFeedback(`❌ '${code}' barkodlu ürün bulunamadı`, true);
    setBarcodeInput("");
  };

  const updateQuantity = (idx: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const newQty = next[idx].quantity + delta;
      if (newQty <= 0) {
        return next.filter((_, i) => i !== idx);
      }
      next[idx].quantity = newQty;
      return next;
    });
  };

  const removeItem = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  // Hold Sale
  const handleHoldSale = () => {
    if (cart.length === 0) return;
    setHeldCarts((prev) => [
      ...prev,
      {
        id: `ASKI-${Date.now().toString().slice(-4)}`,
        time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        items: [...cart],
        customer: selectedCustomer,
      },
    ]);
    setCart([]);
    showFeedback("Satış askıya alındı.");
  };

  // Recall Sale
  const handleRecallSale = (heldId: string) => {
    const held = heldCarts.find((h) => h.id === heldId);
    if (!held) return;
    setCart(held.items);
    setSelectedCustomer(held.customer);
    setHeldCarts((prev) => prev.filter((h) => h.id !== heldId));
  };

  // A preview is recalculated on the server and checked again when recording.
  const rawSubtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountAmount = Math.round(rawSubtotal * overallDiscount) / 100;
  const quoteItems = cart.map(it => ({productId:it.productId,variantId:it.variantId,quantity:it.quantity,unitPrice:it.unitPrice}));
  const quoteSignature = JSON.stringify({items:quoteItems,discountTotal:discountAmount});
  useEffect(() => {
    if (!cart.length) return;
    let cancelled=false;
    const timer=setTimeout(async()=>{
      try {
        const res=await authFetch("/api/pos/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:quoteSignature});
        const data=await res.json();if(cancelled)return;
        if(!data.success){setPosQuoteData(null);setPosQuoteError(data.error||"Tutar hesaplanamadı.");return;}
        setPosQuoteError("");setPosQuoteData({...data.data,signature:quoteSignature});
      } catch {if(!cancelled){setPosQuoteData(null);setPosQuoteError("Fiyat ve stok kontrolü yapılamadı.");}}
    },150);
    return ()=>{cancelled=true;clearTimeout(timer);};
  }, [quoteSignature,cart.length]);
  const quoteReady=!!posQuoteData && posQuoteData.signature===quoteSignature;
  const grandTotal=quoteReady ? posQuoteData!.grandTotal : Math.max(0,rawSubtotal-discountAmount);

  const submitPendingSale = async (payload:Record<string, any>) => {
    if(paymentInFlight.current)return;
    paymentInFlight.current=true;setIsProcessingPayment(true);
    try {
      const res=await authFetch("/api/pos/sale",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"COMPLETE",key:payload.posRequestKey,confirmPayment:true})});
      const data=await res.json();
      if (!data.success) { alert("Satış kaydedilemedi: " + (data.error||"Hata") + ". Tahsilat yapıldıysa tekrar tahsil etmeyin; kaydı yöneticiyle inceleyin.");return; }
      localStorage.removeItem("serpilen_pos_pending_sale");setPendingSale(null);
      setReceiptData({orderNumber:data.data.order.orderNumber,date:new Date().toLocaleString("tr-TR"),customerName:payload.customerName,cashierName:shift?.cashierName||"Kasiyer",paymentMethod:payload.paymentMethod==='CASH'?'NAKİT':payload.paymentMethod==='CREDIT_CARD'?'KREDİ KARTI':'PARÇALI',items:payload.items.map((it:any)=>({...it,name:it.productName})),rawSubtotal:payload.subtotal,discountAmount:Number(data.data.order.discountTotal),grandTotal:Number(data.data.order.grandTotal)});
      setCart([]);setOverallDiscount(0);
      if(shift){const sr=await authFetch("/api/pos/shift?warehouseId=2");const sd=await sr.json();if(sd.success&&sd.currentShift)setShift(sd.currentShift);}
    } catch {alert("Satışın kaydedilip kaydedilmediği bilinmiyor. Yeniden tahsilat yapmayın; aynı kaydı tekrar sorgulayın.");}
    finally {paymentInFlight.current=false;setIsProcessingPayment(false);}
  };

  const preparePendingSale = async (sale:{payload:Record<string, any>;prepared:boolean;confirmed:boolean}) => {
    if(paymentInFlight.current)return false;
    paymentInFlight.current=true;setIsProcessingPayment(true);
    try {
      const res=await authFetch("/api/pos/sale",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"PREPARE",payload:sale.payload})});
      const data=await res.json();if(!data.success){alert("Satış hazırlanamadı: "+(data.error||"Hata")+". Tahsilat yapmayın; hazırlığı iptal edin veya tekrar deneyin.");return false;}
      if(data.data.status!=="PREPARED"){alert("Satış durumu değişmiş; yöneticinizle inceleyin.");return false;}
      const next={...sale,prepared:true};localStorage.setItem("serpilen_pos_pending_sale",JSON.stringify(next));setPendingSale(next);return true;
    } catch {alert("Hazırlık sonucu belirsiz. Tahsilat yapmayın; aynı hazırlığı tekrar deneyin veya tahsilat yapılmadıysa iptal edin.");return false;}
    finally{paymentInFlight.current=false;setIsProcessingPayment(false);}
  };
  const cancelPendingSale = async (sale:{payload:Record<string, any>;prepared:boolean;confirmed:boolean}) => {
    if(paymentInFlight.current || !window.confirm("Müşteriden HİÇBİR ödeme alınmadığını doğruluyor musunuz? Alınmışsa iptal etmeyin; yöneticinize danışın."))return;
    paymentInFlight.current=true;setIsProcessingPayment(true);
    try{const res=await authFetch("/api/pos/sale",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"CANCEL",key:sale.payload.posRequestKey,payload:sale.payload,confirmNoPayment:true})});const data=await res.json();if(!data.success){alert(data.error||"İptal edilemedi.");return;}localStorage.removeItem("serpilen_pos_pending_sale");setPendingSale(null);}
    catch{alert("İptal sonucu belirsiz; tahsilat yapmayın ve aynı iptali tekrar deneyin.");}finally{paymentInFlight.current=false;setIsProcessingPayment(false);}
  };
  const confirmPendingSale = async (sale:{payload:Record<string, any>;prepared:boolean;confirmed:boolean}) => {
    if(!sale.prepared){alert("Önce stok ve fiyatın sunucuda ayrılması gerekir; tahsilat yapmayın.");return;}
    const breakdown=sale.payload.paymentMethod==='SPLIT' ? `${Number(sale.payload.splitCash).toFixed(2)} TL nakit + ${Number(sale.payload.splitCard).toFixed(2)} TL kart` : sale.payload.paymentMethod==='CASH' ? 'nakit' : 'harici kart POS';
    if(!sale.confirmed && !window.confirm(`${Number(sale.payload.grandTotal).toFixed(2)} TL (${breakdown}) tahsilatının tamamının gerçekten yapıldığını doğruluyor musunuz? Bu düğme ödeme almaz.`))return;
    const confirmed={...sale,confirmed:true};try{localStorage.setItem("serpilen_pos_pending_sale",JSON.stringify(confirmed));setPendingSale(confirmed);}catch{alert("Onay kaydedilemedi; tekrar tahsilat yapmayın ve yöneticiye danışın.");return;}
    await submitPendingSale(confirmed.payload);
  };
  const handlePayment = async (method:"CASH"|"CREDIT_CARD"|"SPLIT") => {
    if (!cart.length || !quoteReady || !shift || pendingSale || !posStorageReady || paymentInFlight.current) return;
    let splitCash:number|null=null,splitCard:number|null=null;
    if(method==='SPLIT') {
      const entered=window.prompt(`Toplam ${grandTotal.toFixed(2)} TL. Nakit ödenecek tutarı girin; kalan tutar karttır.`);if(entered===null)return;
      const cash=Math.round(Number(entered.replace(',','.'))*100),total=Math.round(grandTotal*100);
      if(!Number.isSafeInteger(cash)||cash<=0||cash>=total){alert("Nakit ve kart tutarları sıfırdan büyük olmalı ve toplamla eşleşmelidir.");return;}
      splitCash=cash/100;splitCard=(total-cash)/100;
    }
    const payload={orderType:"POS",posRequestKey:crypto.randomUUID(),customerId:selectedCustomer?.id||null,customerName:selectedCustomer?.name||"Kasa Misafiri",customerPhone:selectedCustomer?.phone||null,paymentMethod:method,splitCash,splitCard,warehouseId:2,posShiftId:shift.id,subtotal:rawSubtotal,discountTotal:discountAmount,taxTotal:(grandTotal*0.2).toFixed(2),grandTotal,items:cart.map(it=>({productId:it.productId,variantId:it.variantId,productName:it.name,variantName:it.variantName,sku:it.sku,barcode:it.barcode,unitPrice:it.unitPrice,quantity:it.quantity,taxRate:20,totalPrice:it.unitPrice*it.quantity}))};
    const sale={payload,prepared:false,confirmed:false};
    try {localStorage.setItem("serpilen_pos_pending_sale",JSON.stringify(sale));}catch{alert("Tekrar deneme kaydı oluşturulamadı; tahsilata devam etmeyin.");return;}
    setPendingSale(sale);
    if(await preparePendingSale(sale)) alert(`Stok ve ${grandTotal.toFixed(2)} TL tutar ayrıldı. Tahsilatı dışarıda yapın, ardından onaylayın. İşlem sonuçlanmadan vardiya kapatılamaz.`);
  };

  // Shift Management: Open & Close
  const handleStartShift = async () => {
    try {
      const res = await authFetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "OPEN",
          cashierName: "Elif Demir (Kasiyer)",
          warehouseId: 2,
          openingAmount: openingCashInput,
          terminalCode: "KASA-01",
          notes: "Sabah kasası açıldı.",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShift(data.data);
        setIsShiftModalOpen(false);
        showFeedback("Kasa vardiyası başarıyla açıldı.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCloseShift = async () => {
    if (!shift) return;
    try {
      const res = await authFetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLOSE",
          shiftId: shift.id,
          closingAmount: closingCashInput || shift.expectedAmount || "500",
          notes: "Gün sonu kapatma",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setZReportData(data.zReport);
        setShift(null);
        setIsShiftModalOpen(false);
        showFeedback("Gün sonu Z Raporu oluşturuldu.");
      } else alert(data.error || "Vardiya kapatılamadı.");
    } catch (err) {
      console.error(err); alert("Vardiya kapatılamadı; bağlantıyı kontrol edin.");
    }
  };

  // Cash Transaction (In / Out / Expense)
  const handleCashTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift || !cashTransAmount) return;

    try {
      const res = await authFetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CASH_TRANSACTION",
          shiftId: shift.id,
          type: cashTransType,
          amount: cashTransAmount,
          reason: cashTransReason,
          cashierName: shift.cashierName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsCashTransModalOpen(false);
        setCashTransAmount("");
        setCashTransReason("");
        showFeedback(data.message);

        // Refresh shift totals
        const sRes = await authFetch("/api/pos/shift?warehouseId=2");
        const sData = await sRes.json();
        if (sData.success && sData.currentShift) {
          setShift(sData.currentShift);
        }
      } else {
        alert("İşlem kaydedilemedi: " + data.error);
      }
    } catch (err: any) {
      alert("Hata: " + err.message);
    }
  };

  // Search Order for Return
  const handleSearchReturnOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnSearchQuery.trim()) return;

    setIsSearchingReturn(true);
    setReturnOrderData(null);
    try {
      const res = await authFetch(`/api/orders?orderNumber=${encodeURIComponent(returnSearchQuery.trim())}`);
      const data = await res.json();
      setIsSearchingReturn(false);
      if (data.success && data.data && !data.data.detailsRestricted && Array.isArray(data.data.items)) {
        setReturnOrderData(data.data);
        const init: Record<number, number> = {};
        (data.data.items || []).forEach((it: any) => {
          init[it.id] = 0;
        });
        setReturnSelectedItems(init);
      } else {
        alert("Sipariş/Fiş bulunamadı.");
      }
    } catch {
      setIsSearchingReturn(false);
      alert("Sunucuya ulaşılamadı.");
    }
  };

  // Submit In-Store POS Return
  const handleSubmitPosReturn = async () => {
    if (!returnOrderData) return;

    const returnItems = Object.entries(returnSelectedItems)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([orderItemId, qty]) => {
        const item = returnOrderData.items.find((x: any) => x.id === Number(orderItemId));
        return {
          orderItemId: Number(orderItemId),
          productId: item?.productId,
          variantId: item?.variantId,
          quantity: Number(qty),
          unitPrice: item?.unitPrice,
          productName: item?.productName,
        };
      });

    if (returnItems.length === 0) {
      alert("İade edilecek en az 1 ürün ve adet seçiniz.");
      return;
    }

    if (returnBusy) return;
    setReturnBusy(true);
    try {
      if (!returnPrepared) {
        const res = await authFetch("/api/pos/return", { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"PREPARE",orderNumber:returnOrderData.orderNumber,items:returnItems,reason:returnReason,posShiftId:shift?.id,refundMethod:returnRefundMethod}) });
        const data = await res.json();
        if (!data.success) { alert("İade hazırlanamadı: " + data.error); return; }
        setReturnPrepared(data.data);
        return;
      }
      if (!window.confirm(`${returnPrepared.refundAmount} TL iade tutarını müşteriye dışarıdan ödediğinizi doğruluyor musunuz? Bu işlem para transferi yapmaz.`)) return;
      const res = await authFetch("/api/pos/return", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"COMPLETE",returnId:returnPrepared.id,confirmedAmount:returnPrepared.refundAmount,confirmRefund:true,refundMethod:returnRefundMethod,posShiftId:shift?.id})});
      const data = await res.json();
      if (!data.success) { alert("İade kaydedilemedi: " + data.error + " Para iadesi yapıldıysa tekrar ödeme yapmayın; aynı kaydı inceleyin."); return; }
      setReturnPrepared(null);setIsReturnModalOpen(false);setReturnOrderData(null);
      showFeedback(`İade kaydedildi (${data.data.refundTotal} TL).`);
      if (shift) { const sr=await authFetch("/api/pos/shift?warehouseId=2");const sd=await sr.json();if(sd.success&&sd.currentShift)setShift(sd.currentShift); }
    } catch { alert("Sunucuya ulaşılamadı. Para iadesi yaptıysanız tekrar ödeme yapmayın; aynı kaydı kontrol edin."); }
    finally { setReturnBusy(false); }
  };

  const cancelPreparedReturn = async () => {
    if (!returnPrepared || returnBusy || !window.confirm("Müşteriye para iadesi yapılmadıysa bu talebi iptal edin. İptal edilsin mi?")) return;
    setReturnBusy(true);
    try { const res=await authFetch("/api/pos/return",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"CANCEL",returnId:returnPrepared.id})});const data=await res.json();if(data.success)setReturnPrepared(null);else alert(data.error||"İptal edilemedi."); }
    catch { alert("Sunucuya ulaşılamadı."); } finally { setReturnBusy(false); }
  };

  // Fast Customer Creation
  const handleCreateFastCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingCustomerRef.current) return;
    creatingCustomerRef.current = true;
    setCreatingCustomer(true);
    setNewCustomerError(null);
    try {
      const res = await authFetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCustomerForm.name, phone: newCustomerForm.phone, email: newCustomerForm.email || null }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data.data && Number.isSafeInteger(data.data.id)) {
        setSelectedCustomer(data.data);
        setIsNewCustomerModalOpen(false);
        setNewCustomerForm({ name: "", phone: "", email: "" });
        showFeedback(`✓ ${data.data.name} müşteri olarak seçildi.`);
      } else {
        setNewCustomerError(res.status >= 500 || res.ok ? "İşlem sonucu doğrulanamadı. Yeni kayıt açmadan önce müşteri listesini kontrol edin." : typeof data?.error === "string" ? data.error : data?.error?.message || "Müşteri kaydedilemedi.");
      }
    } catch {
      setNewCustomerError("Bağlantı hatası: işlem sonucu bilinmiyor. Yeni kayıt açmadan önce müşteri listesini kontrol edin.");
    } finally {
      creatingCustomerRef.current = false;
      setCreatingCustomer(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-stone-100 flex flex-col text-stone-900 font-sans">
      {/* 1. Top POS Control Bar */}
      <header className="bg-stone-900 text-white px-4 py-2.5 flex items-center justify-between gap-4 border-b border-stone-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center font-black text-white text-sm shadow-md">
            POS
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight leading-none text-white flex items-center gap-1.5">
              <span>Kadıköy Mağazası • {shift?.terminalCode || "KASA-01"}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </h1>
            <p className="text-[11px] text-stone-400 mt-0.5">
              Kasiyer: <strong>{shift?.cashierName || "Vardiya Kapalı"}</strong>
              {shift?.shiftNumber && <span className="font-mono text-stone-500 ml-1.5">({shift.shiftNumber})</span>}
            </p>
          </div>
        </div>

        {/* Feedback message banner */}
        {feedbackMsg && (
          <div
            className={`font-bold text-xs px-3.5 py-1 rounded-full shadow-md animate-bounce ${
              feedbackMsg.isError ? "bg-rose-600 text-white" : "bg-amber-400 text-stone-950"
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2 text-xs">
          {heldCarts.length > 0 && (
            <div className="flex items-center gap-1 bg-amber-950/90 border border-amber-700/80 px-2 py-1 rounded-lg">
              <span className="text-amber-300 font-bold">{heldCarts.length} Askıda:</span>
              {heldCarts.map((h) => (
                <button
                  key={h.id}
                  onClick={() => handleRecallSale(h.id)}
                  className="bg-amber-600 hover:bg-amber-500 text-white px-2 py-0.5 rounded text-[10px] font-bold transition"
                >
                  {h.id} ({h.items.length})
                </button>
              ))}
            </div>
          )}

          {/* Return & Exchange Button */}
          <button
            onClick={() => setIsReturnModalOpen(true)}
            className="px-2.5 py-1.5 bg-rose-900/80 hover:bg-rose-800 text-rose-100 font-bold rounded-lg border border-rose-700/60 flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
            <span>İade & Değişim</span>
          </button>

          {/* Cash Transactions Button */}
          <button
            onClick={() => setIsCashTransModalOpen(true)}
            disabled={!shift}
            className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-200 font-bold rounded-lg border border-stone-700 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
            <span>Kasa Hareketi</span>
          </button>

          {/* Expected Cash in drawer */}
          <div className="bg-stone-800/90 px-3 py-1.5 rounded-lg border border-stone-700 text-stone-300 flex items-center gap-2">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Kasada Nakit: <strong className="text-white font-mono">{Number(shift?.expectedAmount || 0).toFixed(2)} TL</strong></span>
          </div>

          {/* Shift Button */}
          <button
            onClick={() => setIsShiftModalOpen(true)}
            className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 text-white font-bold rounded-lg transition shadow-xs"
          >
            {shift ? "Gün Sonu & Z-Raporu" : "Vardiya Başlat"}
          </button>
        </div>
      </header>

      {/* 2. Main Terminal Grid */}
      <div className="flex-1 grid grid-cols-12 gap-0">
        {/* Left Side: Product Browser & Barcode Search (7-8 cols) */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col bg-white border-r border-stone-200">
          {/* Top Barcode and Search Inputs */}
          <div className="p-3 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center gap-3 shrink-0">
            {/* Barcode scanner gun input */}
            <form onSubmit={handleBarcodeScan} className="flex-1 min-w-[220px] relative">
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Barkod Okutun (Tabanca veya Manuel Enter)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border-2 border-amber-600/60 focus:border-amber-700 rounded-xl text-xs font-mono font-bold tracking-wider placeholder:font-sans focus:outline-none shadow-xs"
              />
              <Scan className="w-4 h-4 text-amber-700 absolute left-3 top-2.5" />
            </form>

            {/* Catalog search */}
            <div className="relative w-48 sm:w-64">
              <input
                type="text"
                placeholder="Ürün adı, SKU veya renk ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-white border border-stone-300 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="px-3 py-2 border-b border-stone-100 flex items-center gap-1.5 overflow-x-auto bg-white shrink-0">
            <button
              onClick={() => setSelectedCat(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                selectedCat === null
                  ? "bg-amber-800 text-white"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              Tümü ({initialProducts.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCat(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  selectedCat === c.id
                    ? "bg-amber-800 text-white"
                    : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Product Cards Grid */}
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-stone-200 hover:border-amber-600 shadow-xs hover:shadow-md transition flex flex-col justify-between overflow-hidden"
              >
                <div className="p-2.5">
                  <div className="aspect-4/3 bg-stone-100 rounded-lg overflow-hidden mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imageUrl || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=200"}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h4 className="text-xs font-bold text-stone-900 line-clamp-2 leading-tight">
                    {p.name}
                  </h4>
                  <p className="text-[10px] text-stone-400 mt-0.5">SKU: {p.sku}</p>
                </div>

                <div className="p-2.5 pt-0">
                  <div className="text-sm font-black text-amber-900">
                    {Number(p.retailPrice).toFixed(2)} TL
                  </div>

                  {/* If product has variants, show quick buttons */}
                  {p.variants && p.variants.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.variants.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => handleAddToCart(p, v)}
                          className="px-1.5 py-1 text-[9px] font-bold rounded bg-amber-50 hover:bg-amber-700 hover:text-white border border-amber-200 text-amber-900 transition"
                          title={variantLabel(v) || v.sku}
                        >
                          {variantLabel(v) || v.sku}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAddToCart(p, null)}
                      className="mt-1.5 w-full py-1.5 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-lg transition"
                    >
                      Sepete Ekle
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Active POS Cart & Billing Panel (4-5 cols) */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 bg-stone-50 flex flex-col justify-between overflow-hidden border-l border-stone-200">
          {/* Cart Header & Customer Selector */}
          <div className="p-3 bg-white border-b border-stone-200 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-stone-800 tracking-wider">
                Aktif Kasa Satışı ({cart.reduce((s, i) => s + i.quantity, 0)} Kalem)
              </span>
              <button
                onClick={() => setCart([])}
                className="text-[11px] text-rose-600 hover:underline font-semibold"
              >
                Temizle
              </button>
            </div>

            {/* Customer Switcher + Add Customer Button */}
            <div className="flex items-center gap-1.5">
              <PosCustomerPicker selected={selectedCustomer} onSelect={setSelectedCustomer} />

              <button
                onClick={() => { setNewCustomerError(null); setIsNewCustomerModalOpen(true); }}
                className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0"
                title="Hızlı Müşteri Ekle"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Cart Line Items */}
          <div className="p-3 divide-y divide-stone-200/80">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-stone-400 text-center py-12">
                <Scan className="w-12 h-12 stroke-[1.2] mb-2 text-stone-300" />
                <p className="text-xs font-semibold">Sepet boş</p>
                <p className="text-[11px] text-stone-400">Ürün seçin veya barkod okutun</p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-bold text-stone-900 truncate">{item.name}</h5>
                    {item.variantName && (
                      <p className="text-[10px] text-amber-800 font-semibold">{item.variantName}</p>
                    )}
                    <span className="text-[10px] text-stone-400">
                      {item.unitPrice.toFixed(2)} TL x {item.quantity}
                    </span>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-stone-300 rounded-lg bg-white shrink-0">
                    <button
                      onClick={() => updateQuantity(idx, -1)}
                      className="px-2 py-0.5 text-stone-600 font-bold hover:text-black text-xs"
                    >
                      -
                    </button>
                    <span className="px-2 font-bold text-xs">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(idx, 1)}
                      className="px-2 py-0.5 text-stone-600 font-bold hover:text-black text-xs"
                    >
                      +
                    </button>
                  </div>

                  {/* Total price & delete */}
                  <div className="text-right shrink-0 min-w-[70px]">
                    <div className="text-xs font-bold text-stone-900">
                      {(item.unitPrice * item.quantity).toFixed(2)} TL
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(idx)}
                    className="p-1 text-stone-300 hover:text-rose-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary & Payment Keypad */}
          <div className="p-4 bg-white border-t border-stone-200 shrink-0 space-y-3">
            {/* Quick Discount chips */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 font-medium">Kasiyer İskontosu:</span>
              <div className="flex items-center gap-1">
                {[0, 5, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setOverallDiscount(pct)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                      overallDiscount === pct
                        ? "bg-amber-800 text-white"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    %{pct}
                  </button>
                ))}
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-1 text-xs text-stone-600 pt-1 border-t border-stone-100">
              <div className="flex justify-between">
                <span>Ara Toplam (KDV Dahil)</span>
                <span className="font-semibold text-stone-900">{rawSubtotal.toFixed(2)} TL</span>
              </div>
              {overallDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>İskonto (%{overallDiscount})</span>
                  <span>-{discountAmount.toFixed(2)} TL</span>
                </div>
              )}
              {quoteReady && posQuoteData!.promotionDiscount > 0 && <div className="flex justify-between text-emerald-700"><span>Kampanya ({posQuoteData!.promotions.map(p=>p.name).join(", ")})</span><span>-{posQuoteData!.promotionDiscount.toFixed(2)} TL</span></div>}
              {!posStorageReady && <p role="status" className="text-rose-700">{posQuoteError || "Önceki POS kaydı kontrol ediliyor…"}</p>}
              {cart.length > 0 && !quoteReady && <p role="status" className="text-rose-700">{posQuoteError || "Fiyat, stok ve kampanyalar hesaplanıyor…"}</p>}
              <div className="text-xs"><button type="button" className="underline font-bold" onClick={loadRecoverableSales}>Sunucudaki açık satışları kontrol et</button>{recoverableSales && <div className="bg-stone-50 p-2 rounded-lg"><p>Yalnız ödeme durumunu doğruladıktan sonra işlem yapın. Yöneticiler diğer kasiyerlerin hazırlıklarını da görür.</p>{recoverableSales.map(sale=><div key={sale.requestKey} className="border-t py-2"><p>{sale.actorName} · Vardiya {sale.shiftId} · {Number(sale.payload.grandTotal).toFixed(2)} TL · {sale.requestKey}</p><button type="button" className="underline mr-3" disabled={isProcessingPayment} onClick={()=>resolveRecoverableSale(sale,"COMPLETE")}>Tahsilat yapıldı — kaydet</button><button type="button" className="underline" disabled={isProcessingPayment} onClick={()=>resolveRecoverableSale(sale,"CANCEL")}>Tahsilat yok — iptal</button></div>)}{recoverableSales.length===0&&<p>Açık hazırlık bulunmuyor.</p>}</div>}</div>
              {pendingSale && <div role="alert" className="bg-amber-50 text-amber-950 p-3 rounded-lg space-y-1"><p>İşlem {pendingSale.payload.posRequestKey} · {Number(pendingSale.payload.grandTotal).toFixed(2)} TL · {pendingSale.payload.paymentMethod === "SPLIT" ? `${Number(pendingSale.payload.splitCash).toFixed(2)} TL nakit + ${Number(pendingSale.payload.splitCard).toFixed(2)} TL kart` : pendingSale.payload.paymentMethod === "CASH" ? "nakit" : "harici kart POS"} · {pendingSale.prepared ? "Stok ve tutar ayrıldı" : "Hazırlık sonucu bekleniyor; tahsilat yapmayın"}. Yeniden tahsilat yapmayın.</p><div className="flex flex-wrap gap-3">{!pendingSale.prepared && <button type="button" disabled={isProcessingPayment} onClick={()=>preparePendingSale(pendingSale)} className="underline font-bold">Hazırlığı tekrar dene</button>}{pendingSale.prepared && <button type="button" disabled={isProcessingPayment} onClick={()=>confirmPendingSale(pendingSale)} className="underline font-bold">{pendingSale.confirmed?"Aynı satış kaydını tekrar dene":"Tahsilat yapıldı — satışı kaydet"}</button>}{!pendingSale.confirmed && <button type="button" disabled={isProcessingPayment} onClick={()=>cancelPendingSale(pendingSale)} className="underline font-bold">Tahsilat yapılmadı — iptal</button>}</div></div>}
              <div className="flex justify-between text-lg font-black text-stone-900 pt-1 border-t border-stone-200">
                <span>TOPLAM</span>
                <span className="text-amber-800">{grandTotal.toFixed(2)} TL</span>
              </div>
            </div>

            {/* Action Buttons: Hold, Cash, Card, Split */}
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={cart.length === 0 || isProcessingPayment || !quoteReady || !!pendingSale || !shift || !posStorageReady}
                  onClick={() => handlePayment("CASH")}
                  className="py-3 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
                >
                  <Banknote className="w-4 h-4" />
                  <span>NAKİT (F1)</span>
                </button>

                <button
                  disabled={cart.length === 0 || isProcessingPayment || !quoteReady || !!pendingSale || !shift || !posStorageReady}
                  onClick={() => handlePayment("CREDIT_CARD")}
                  className="py-3 px-3 bg-sky-700 hover:bg-sky-800 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>KREDİ KARTI (F2)</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={cart.length === 0}
                  onClick={handleHoldSale}
                  className="py-2 px-3 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Askıya Al</span>
                </button>

                <button
                  disabled={cart.length === 0 || isProcessingPayment || !quoteReady || !!pendingSale || !shift || !posStorageReady}
                  onClick={() => handlePayment("SPLIT")}
                  className="py-2 px-3 bg-stone-900 hover:bg-black text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Parçalı Ödeme</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Modal: Shift Status & Z-Report Close with Denomination Counter */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-black text-stone-900">
                {shift ? "Kasa Vardiyası & Gün Sonu Z Raporu" : "Yeni POS Kasa Vardiyası Başlat"}
              </h3>
              {shift && (
                <button
                  onClick={() => setIsShiftModalOpen(false)}
                  className="p-1 text-stone-400 hover:text-stone-700"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {shift ? (
              <div className="space-y-4 text-xs">
                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Açılış Saati:</span>
                    <span className="font-semibold">{new Date(shift.openedAt).toLocaleString("tr-TR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Açılış Kasası (Devir):</span>
                    <span className="font-semibold">{Number(shift.openingAmount).toFixed(2)} TL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Nakit Satışlar:</span>
                    <span className="font-semibold text-emerald-700">+{Number(shift.totalSalesCash || 0).toFixed(2)} TL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Kredi Kartı Satışlar:</span>
                    <span className="font-semibold text-sky-700">{Number(shift.totalSalesCard || 0).toFixed(2)} TL</span>
                  </div>
                  {Number(shift.totalReturnsCash || 0) > 0 && (
                    <div className="flex justify-between text-rose-700">
                      <span>Nakit İadeler:</span>
                      <span>-{Number(shift.totalReturnsCash).toFixed(2)} TL</span>
                    </div>
                  )}
                  {Number(shift.cashInTotal || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Nakit Girişler:</span>
                      <span>+{Number(shift.cashInTotal).toFixed(2)} TL</span>
                    </div>
                  )}
                  {Number(shift.cashOutTotal || 0) > 0 && (
                    <div className="flex justify-between text-rose-700">
                      <span>Nakit Çıkışlar (Masraf):</span>
                      <span>-{Number(shift.cashOutTotal).toFixed(2)} TL</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm text-stone-900 border-t border-stone-200 pt-2">
                    <span>Kasada Olması Gereken Nakit:</span>
                    <span className="text-amber-900">{Number(shift.expectedAmount || shift.openingAmount).toFixed(2)} TL</span>
                  </div>
                </div>

                {/* Kupür Bazlı Fiili Kasa Sayıcı */}
                <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-2">
                  <span className="font-bold text-xs text-amber-950 block">Fiili Kasa Sayımı (Kupür / Bozuk Para):</span>
                  <div className="grid grid-cols-4 gap-2">
                    {["200", "100", "50", "20", "10", "5", "1", "0.5"].map((denom) => (
                      <div key={denom} className="space-y-0.5">
                        <label className="text-[10px] font-bold text-stone-600 block text-center">{denom} TL</label>
                        <input
                          type="number"
                          min="0"
                          value={denominations[denom] || ""}
                          onChange={(e) => setDenominations({ ...denominations, [denom]: Number(e.target.value) || 0 })}
                          placeholder="Adet"
                          className="w-full px-2 py-1 bg-white border border-stone-300 rounded-lg text-center text-xs font-mono font-bold"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-amber-200 pt-2 font-bold text-xs text-stone-900">
                    <span>Sayılan Toplam Nakit:</span>
                    <span className="font-mono text-sm text-amber-900">{closingCashInput || "0.00"} TL</span>
                  </div>
                </div>

                {/* Diff Calculation Live */}
                {closingCashInput && (
                  <div className="p-2.5 rounded-xl border text-xs font-bold text-center">
                    {(() => {
                      const diff = Number(closingCashInput) - Number(shift.expectedAmount || shift.openingAmount);
                      if (diff === 0) {
                        return <span className="text-emerald-700">✓ Kasa Tam Mutabık (0.00 TL Fark)</span>;
                      }
                      if (diff > 0) {
                        return <span className="text-amber-800">+{diff.toFixed(2)} TL Kasa Fazlası</span>;
                      }
                      return <span className="text-rose-700">{diff.toFixed(2)} TL Kasa Açığı!</span>;
                    })()}
                  </div>
                )}

                <button
                  onClick={handleCloseShift}
                  className="w-full py-3 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center justify-center gap-2"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Vardiyayı Kapat & Gün Sonu Z Raporu Al</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-stone-500">
                  Kadıköy Mağaza Kasasını açmak için başlangıç devir bozuk para tutarını giriniz.
                </p>
                <div>
                  <label className="block text-stone-700 font-bold mb-1">
                    Açılış Devir Tutarı (TL):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono font-bold text-sm"
                  />
                </div>
                <button
                  onClick={handleStartShift}
                  className="w-full py-3 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl transition shadow-md"
                >
                  Kasayı Aç & Satışa Başla
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Modal: Cash In / Cash Out / Expense */}
      {isCashTransModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-black text-stone-900">Kasa Nakit Hareketi</h3>
              <button onClick={() => setIsCashTransModalOpen(false)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCashTransaction} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">İşlem Tipi:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "EXPENSE", label: "Masraf / Gider Çıkışı" },
                    { id: "CASH_OUT", label: "Kasadan Para Çıkışı" },
                    { id: "CASH_IN", label: "Kasaya Nakit Girişi" },
                    { id: "FLOAT_ADD", label: "Devir Bozuk Para Takviyesi" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCashTransType(t.id as any)}
                      className={`p-2.5 rounded-xl border text-left font-bold transition text-[11px] ${
                        cashTransType === t.id
                          ? "border-amber-800 bg-amber-50 text-amber-950 ring-2 ring-amber-800/20"
                          : "border-stone-200 hover:bg-stone-50 text-stone-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Tutar (TL):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={cashTransAmount}
                  onChange={(e) => setCashTransAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Açıklama / Sebep:</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Kırtasiye fişi, yemek avansı, banka bozuk para"
                  value={cashTransReason}
                  onChange={(e) => setCashTransReason(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              {newCustomerError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-800">{newCustomerError}</p>}
              <p className="text-stone-500">Benzer bir kayıt bulunması aynı kişi olduğunu kanıtlamaz; otomatik eşleştirme yapılmaz.</p>
              <button
                type="submit"
                disabled={creatingCustomer}
                className="w-full py-3 disabled:opacity-50 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs transition shadow-md"
              >
                Kasa Hareketini Kaydet
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: In-Store Return & Exchange */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-black text-stone-900">Mağaza İçi İade & Değişim</h3>
              <button onClick={() => setIsReturnModalOpen(false)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Order Form */}
            <form onSubmit={handleSearchReturnOrder} className="flex gap-2">
              <input
                type="text"
                required
                disabled={!!returnPrepared}
                placeholder="Fiş / Sipariş No Okutun veya Girin (Örn: POS-2026-XXXX)..."
                value={returnSearchQuery}
                onChange={(e) => setReturnSearchQuery(e.target.value)}
                className="flex-1 px-3 py-2 border border-stone-300 rounded-xl text-xs font-mono font-bold"
              />
              <button
                type="submit"
                disabled={isSearchingReturn || !!returnPrepared}
                className="px-4 py-2 bg-stone-900 text-white font-bold rounded-xl text-xs"
              >
                {isSearchingReturn ? "Aranıyor..." : "Fişi Getir"}
              </button>
            </form>

            {returnOrderData && (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>Fiş No: {returnOrderData.orderNumber}</span>
                    <span>Tutar: {Number(returnOrderData.grandTotal).toFixed(2)} TL</span>
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Müşteri: {returnOrderData.customerName} · Tarih: {new Date(returnOrderData.createdAt).toLocaleDateString("tr-TR")}
                  </div>
                </div>

                {/* Items to return */}
                <div className="space-y-2">
                  <span className="font-bold text-stone-700 block">İade Edilecek Ürünleri Seçin:</span>
                  {(returnOrderData.items || []).map((it: any) => (
                    <div key={it.id} className="p-3 rounded-xl border border-stone-200 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-bold text-stone-900 block truncate">{it.productName}</span>
                        <span className="text-[10px] text-stone-400">Satın Alınan: {it.quantity} Adet x {Number(it.unitPrice).toFixed(2)} TL</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] text-stone-500 font-semibold">İade Adet:</label>
                        <input
                          type="number"
                          min="0"
                          disabled={!!returnPrepared}
                          max={it.quantity}
                          value={returnSelectedItems[it.id] ?? 0}
                          onChange={(e) => setReturnSelectedItems({ ...returnSelectedItems, [it.id]: Math.min(Number(e.target.value), it.quantity) })}
                          className="w-16 px-2 py-1 border border-stone-300 rounded-lg text-center font-bold"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-stone-700 mb-1">İade Ödeme Yolu:</label>
                    <select
                      value={returnRefundMethod}
                      disabled={!!returnPrepared}
                      onChange={(e) => setReturnRefundMethod(e.target.value as any)}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                    >
                      <option value="CASH">Nakit İade (Kasadan)</option>
                      <option value="CREDIT_CARD">Karta İade</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-stone-700 mb-1">İade Nedeni:</label>
                    <input
                      type="text"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                    />
                  </div>
                </div>

                {returnPrepared && <div role="status" className="p-3 rounded-xl bg-amber-50 text-amber-900">İade #{returnPrepared.returnNumber} · Sunucuda hesaplanan tutar: <strong>{returnPrepared.refundAmount} TL</strong>. Para iadesini dışarıdan yapın, ardından kaydedin. Başarısızlıkta tekrar ödeme yapmayın.</div>}
                {returnPrepared && <button type="button" disabled={returnBusy} onClick={cancelPreparedReturn} className="px-3 py-2 border rounded-lg">Para iade edilmedi; talebi iptal et</button>}
                <button
                  type="button"
                  onClick={handleSubmitPosReturn}
                  disabled={returnBusy}
                  className="w-full py-3 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{returnBusy ? "İşleniyor…" : returnPrepared ? "Para iadesi yapıldı — Kaydet" : "İade Tutarını Hesapla"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Modal: Quick Fast Customer Creation */}
      {isNewCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">Hızlı Müşteri Kaydı (POS CRM)</h3>
              <button type="button" aria-label="Müşteri kaydını kapat" disabled={creatingCustomer} onClick={() => setIsNewCustomerModalOpen(false)} className="p-1 text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFastCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Adı Soyadı:</label>
                <input
                  type="text"
                  required
                  disabled={creatingCustomer}
                  placeholder="Örn: Gülizar Aydın"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Telefon:</label>
                <input
                  type="text"
                  required
                  disabled={creatingCustomer}
                  placeholder="0532 000 00 00"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">E-Posta (opsiyonel):</label>
                <input
                  type="email"
                  disabled={creatingCustomer}
                  placeholder="gulizar@gmail.com"
                  value={newCustomerForm.email}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              {newCustomerError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-800">{newCustomerError}</p>}
              <p className="text-stone-500">Benzer bir kayıt bulunması aynı kişi olduğunu kanıtlamaz; otomatik eşleştirme yapılmaz.</p>
              <button
                type="submit"
                disabled={creatingCustomer}
                className="w-full py-3 disabled:opacity-50 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs transition shadow-md"
              >
                {creatingCustomer ? "Kaydediliyor…" : "Müşteriyi Kaydet & Seç"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 7. Thermal Receipt Modal (Fiş Önizleme & Yazdır) */}
      {receiptData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 border border-stone-200">
            {/* Thermal Slip Content */}
            <div className="font-mono text-[11px] text-stone-800 border-2 border-dashed border-stone-300 p-4 rounded-xl bg-stone-50 space-y-2">
              <div className="text-center border-b border-stone-300 pb-2">
                <h4 className="font-bold text-sm uppercase">SERPİLEN COLLECTION SAN. TİC. LTD.</h4>
                <p>Moda Cad. No:18 Kadıköy / İstanbul</p>
                <p>VKN: 4810294821 • Kadıköy V.D.</p>
                <p className="font-bold mt-1">PERAKENDE SATIŞ FİŞİ</p>
              </div>

              <div className="space-y-0.5 text-[10px]">
                <p>Fiş No: <strong>{receiptData.orderNumber}</strong></p>
                <p>Tarih: {receiptData.date}</p>
                <p>Kasiyer: {receiptData.cashierName}</p>
                <p>Ödeme: <strong>{receiptData.paymentMethod}</strong></p>
              </div>

              <div className="border-t border-stone-300 pt-1 space-y-1">
                {receiptData.items.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate max-w-[170px]">{it.name} {it.variantName ? `(${it.variantName})` : ""}</span>
                    <span>{it.quantity}x {it.unitPrice.toFixed(2)} = {(it.quantity * it.unitPrice).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-stone-300 pt-1 text-right space-y-0.5">
                <p>Ara Toplam: {receiptData.rawSubtotal.toFixed(2)} TL</p>
                {receiptData.discountAmount > 0 && (
                  <p>İndirim: -{receiptData.discountAmount.toFixed(2)} TL</p>
                )}
                <p className="font-bold text-xs">GENEL TOPLAM: {receiptData.grandTotal.toFixed(2)} TL</p>
                <p className="text-[9px] text-stone-500">KDV (%20 Dahil): {(receiptData.grandTotal * 0.2).toFixed(2)} TL</p>
              </div>

              <div className="text-center border-t border-stone-300 pt-2 text-[9px] text-stone-500">
                <p>Mali değeri yoktur / Bilgi fişidir.</p>
                <p>Bizi tercih ettiğiniz için teşekkür ederiz.</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-stone-900 hover:bg-black text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Yazdır (ESC)</span>
              </button>
              <button
                onClick={() => setReceiptData(null)}
                className="py-2.5 px-4 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold text-xs rounded-xl transition"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: Official Z-Report Printout */}
      {zReportData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-stone-200 max-h-[90vh] overflow-y-auto">
            {/* Z-Report Slip */}
            <div className="font-mono text-[11px] text-stone-900 border-2 border-stone-900 p-4 rounded-xl bg-stone-50 space-y-2">
              <div className="text-center border-b border-stone-400 pb-2">
                <h3 className="font-black text-base uppercase">GÜN SONU Z RAPORU</h3>
                <p className="font-bold text-sm text-amber-900">{zReportData.zReportNumber}</p>
                <p className="text-[10px]">SERPİLEN COLLECTION SAN. TİC. LTD. ŞTİ.</p>
                <p className="text-[10px]">Kasa: {zReportData.terminalCode} · Kadıköy Mağaza</p>
              </div>

              <div className="space-y-0.5 text-[10px]">
                <p>Kasiyer: <strong>{zReportData.cashierName}</strong></p>
                <p>Açılış: {new Date(zReportData.openedAt).toLocaleString("tr-TR")}</p>
                <p>Kapanış: {new Date(zReportData.closedAt).toLocaleString("tr-TR")}</p>
              </div>

              <div className="border-t border-stone-400 pt-1 space-y-1">
                <div className="flex justify-between"><span>Açılış Kasası:</span><span>{zReportData.openingAmount.toFixed(2)} TL</span></div>
                <div className="flex justify-between font-bold text-emerald-800"><span>Toplam Nakit Satış:</span><span>+{zReportData.totalSalesCash.toFixed(2)} TL</span></div>
                <div className="flex justify-between font-bold text-sky-800"><span>Toplam Kredi Kartı:</span><span>+{zReportData.totalSalesCard.toFixed(2)} TL</span></div>
                {zReportData.totalReturnsCash > 0 && <div className="flex justify-between text-rose-700"><span>Nakit İadeler:</span><span>-{zReportData.totalReturnsCash.toFixed(2)} TL</span></div>}
                {zReportData.cashInTotal > 0 && <div className="flex justify-between text-emerald-700"><span>Nakit Girişler:</span><span>+{zReportData.cashInTotal.toFixed(2)} TL</span></div>}
                {zReportData.cashOutTotal > 0 && <div className="flex justify-between text-rose-700"><span>Nakit Çıkışlar (Gider):</span><span>-{zReportData.cashOutTotal.toFixed(2)} TL</span></div>}
              </div>

              <div className="border-t border-stone-400 pt-1 space-y-1 font-bold">
                <div className="flex justify-between"><span>Olması Gereken Nakit:</span><span>{zReportData.expectedAmount.toFixed(2)} TL</span></div>
                <div className="flex justify-between"><span>Sayılan Fiili Nakit:</span><span>{zReportData.closingAmount.toFixed(2)} TL</span></div>
                <div className={`flex justify-between text-xs font-black ${zReportData.diff === 0 ? "text-emerald-700" : zReportData.diff > 0 ? "text-amber-800" : "text-rose-700"}`}>
                  <span>KASA FARKI:</span>
                  <span>{zReportData.diff === 0 ? "TAM (0.00 TL)" : `${zReportData.diff > 0 ? "+" : ""}${zReportData.diff.toFixed(2)} TL`}</span>
                </div>
              </div>

              <div className="border-t border-stone-400 pt-1 text-right text-[10px] space-y-0.5">
                <p>Toplam Fiş / Satış Sayısı: <strong>{zReportData.orderCount}</strong></p>
                <p>Toplam Günlük Ciro: <strong>{zReportData.totalRevenue.toFixed(2)} TL</strong></p>
                <p>Toplam KDV (%20): <strong>{zReportData.totalTax.toFixed(2)} TL</strong></p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-3 bg-stone-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Z Raporunu Yazdır</span>
              </button>
              <button
                onClick={() => setZReportData(null)}
                className="py-3 px-5 bg-stone-200 text-stone-800 font-bold rounded-xl text-xs"
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
