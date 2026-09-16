"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Activity,
  Server,
  Layers,
  ArrowRight,
  Database,
  Building2,
  CreditCard,
  Boxes,
  Receipt,
  FileCheck2,
  Info,
  Clock,
  ExternalLink,
} from "lucide-react";

export function ErpIntegrationConsole() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/erp?entityType=${entityFilter}&status=${statusFilter}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch {
      setFeedback({ text: "ERP servis verileri alınamadı.", isError: true });
    } finally {
      setLoading(false);
    }
  }, [entityFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const showMsg = (text: string, isError = false) => {
    setFeedback({ text, isError });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleSetProvider = async (providerId: string) => {
    try {
      const res = await fetch("/api/erp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_PROVIDER", provider: providerId }),
      });
      const json = await res.json();
      if (json.success) {
        showMsg(json.message);
        void loadData();
      } else {
        showMsg(json.error || "Sağlayıcı değiştirilemedi.", true);
      }
    } catch {
      showMsg("Sunucuya ulaşılamadı.", true);
    }
  };

  const handleAction = async (action: string, payload: any = {}) => {
    setLoading(true);
    try {
      const res = await fetch("/api/erp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      setLoading(false);
      if (json.success) {
        showMsg(json.message || "İşlem başarıyla tamamlandı.");
        void loadData();
      } else {
        showMsg(json.error || "İşlem başarısız oldu.", true);
      }
    } catch {
      setLoading(false);
      showMsg("Sunucuya ulaşılamadı.", true);
    }
  };

  const handleRetry = async (logId: number) => {
    await handleAction("RETRY_LOG", { logId });
  };

  const currentProvider = data?.currentProvider;
  const health = data?.health;
  const stats = data?.stats;
  const logs = data?.logs || [];

  return (
    <div className="space-y-6">
      {/* 1. Başlık & Hızlı Aksiyonlar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
            FAZ 10 — ERP / ÖN MUHASEBE ENTEGRASYONU
          </span>
          <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
            <span>ERP & GİB e-Fatura / e-Arşiv Entegrasyon Merkezi</span>
          </h2>
          <p className="text-xs text-stone-500">
            Cari kartlar, e-Fatura, alış faturaları, tahsilat ve ambar stoklarının kurumsal ERP sistemleriyle çift yönlü senkronizasyonu.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadData()}
            className="px-3.5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Yenile</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-2xl text-xs font-bold border transition-all ${
            feedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* 2. Aktif ERP Sağlayıcısı & Sağlık Durumu Kartı */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Sağlayıcı Kartı */}
        <div className="lg:col-span-8 bg-gradient-to-br from-stone-900 to-stone-950 text-white p-6 rounded-3xl border border-stone-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Aktif Entegratör Adaptörü
                </span>
                <h3 className="text-lg font-black tracking-tight">{currentProvider?.name || "Logo Go3 / Tiger"}</h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Çevrimiçi ({health?.latencyMs || 20} ms)</span>
              </span>
            </div>
          </div>

          <p className="text-xs text-stone-300 leading-relaxed max-w-xl">
            {currentProvider?.description || "Logo Go3/Tiger REST API Entegrasyonu ile cari ve fatura senkronizasyonu."}
          </p>

          <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-bold">
            <span className="bg-white/10 px-2.5 py-1 rounded-lg text-stone-200 border border-white/10">
              API Sürümü: {currentProvider?.version}
            </span>
            <span className="bg-white/10 px-2.5 py-1 rounded-lg text-emerald-300 border border-white/10">
              ✓ e-Fatura / e-Arşiv Mühürleme
            </span>
            <span className="bg-white/10 px-2.5 py-1 rounded-lg text-sky-300 border border-white/10">
              ✓ UBL-TR 1.2 Formatı
            </span>
            <span className="bg-white/10 px-2.5 py-1 rounded-lg text-amber-300 border border-white/10">
              ✓ GİB Entegratör Gateway
            </span>
          </div>

          {/* Sağlayıcı Değiştirici Butonları */}
          <div className="pt-2 border-t border-stone-800 space-y-1.5">
            <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">
              Entegratör Sağlayıcısını Değiştir (Adapter Pattern):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(data?.availableProviders || []).map((prov: any) => (
                <button
                  key={prov.id}
                  onClick={() => handleSetProvider(prov.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                    currentProvider?.id === prov.id
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-stone-800 text-stone-400 hover:text-white hover:bg-stone-700"
                  }`}
                >
                  {prov.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Canlı Senkron İstatistikleri */}
        <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase">Senkronizasyon Başarısı</span>
            <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              %{stats?.successRate || 100}
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-stone-500">Toplam İşlem:</span>
              <span className="font-bold text-stone-900">{stats?.total || 0}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-semibold">
              <span>Başarılı Senkron:</span>
              <span>{stats?.success || 0}</span>
            </div>
            <div className="flex justify-between text-rose-700 font-semibold">
              <span>Hatalı / Bekleyen:</span>
              <span>{(stats?.failed || 0) + (stats?.pending || 0)}</span>
            </div>
          </div>

          <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${stats?.successRate || 100}%` }}
            />
          </div>

          <div className="pt-2 border-t border-stone-100 text-[10px] text-stone-400 flex items-center justify-between">
            <span>Uç Nokta:</span>
            <span className="font-mono text-stone-600 truncate max-w-[180px]">{currentProvider?.endpoint}</span>
          </div>
        </div>
      </div>

      {/* 3. Toplu Tetikleme & Entegrasyon İşlemleri */}
      <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-3">
        <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-700" />
          <span>Toplu ERP Senkronizasyon Aksiyonları</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => handleAction("SYNC_ALL_CUSTOMERS")}
            disabled={loading}
            className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-emerald-50 hover:border-emerald-300 text-left transition flex flex-col justify-between group disabled:opacity-50"
          >
            <div>
              <Building2 className="w-5 h-5 text-emerald-800 mb-1 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-xs text-stone-900">Tüm Carileri Aktar</h4>
              <p className="text-[10px] text-stone-500 mt-0.5">B2C ve B2B müşteri kartlarını ERP'ye eşitler.</p>
            </div>
            <span className="text-[10px] text-emerald-800 font-bold mt-2">Çalıştır →</span>
          </button>

          <button
            onClick={() => handleAction("SYNC_ALL_INVOICES")}
            disabled={loading}
            className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-sky-50 hover:border-sky-300 text-left transition flex flex-col justify-between group disabled:opacity-50"
          >
            <div>
              <FileCheck2 className="w-5 h-5 text-sky-800 mb-1 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-xs text-stone-900">Faturaları Toplu Aktar</h4>
              <p className="text-[10px] text-stone-500 mt-0.5">Siparişleri e-Fatura/e-Arşiv olarak mühürler.</p>
            </div>
            <span className="text-[10px] text-sky-800 font-bold mt-2">Çalıştır →</span>
          </button>

          <button
            onClick={() => handleAction("SYNC_STOCK_LEVELS")}
            disabled={loading}
            className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-amber-50 hover:border-amber-300 text-left transition flex flex-col justify-between group disabled:opacity-50"
          >
            <div>
              <Boxes className="w-5 h-5 text-amber-800 mb-1 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-xs text-stone-900">Ambar Stoklarını Eşitle</h4>
              <p className="text-[10px] text-stone-500 mt-0.5">Tüm depo mevcudunu ERP ambarına yazar.</p>
            </div>
            <span className="text-[10px] text-amber-800 font-bold mt-2">Çalıştır →</span>
          </button>

          <button
            onClick={() => handleAction("SIMULATE_FAILURE")}
            disabled={loading}
            className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-rose-50 hover:border-rose-300 text-left transition flex flex-col justify-between group disabled:opacity-50"
            title="Hata ve retry mekanizmasını test etmek için simülasyon üretir"
          >
            <div>
              <AlertTriangle className="w-5 h-5 text-rose-700 mb-1 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-xs text-stone-900">Test: Hata Üret</h4>
              <p className="text-[10px] text-stone-500 mt-0.5">504 Gateway Timeout simüle eder (Retry testi).</p>
            </div>
            <span className="text-[10px] text-rose-700 font-bold mt-2">Test Et →</span>
          </button>
        </div>
      </div>

      {/* 4. Senkronizasyon Logları & Retry Paneli */}
      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs space-y-3 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-stone-900">ERP Senkronizasyon Defteri & Loglar</h3>
            <p className="text-[11px] text-stone-500">GİB ve muhasebe servisine giden tüm JSON paketleri ve yanıt kodları.</p>
          </div>

          {/* Filtreler */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-stone-200 rounded-xl bg-stone-50 font-semibold"
            >
              <option value="ALL">Tüm Varlıklar</option>
              <option value="CUSTOMER">Cari Kartlar</option>
              <option value="INVOICE">Satış Faturaları</option>
              <option value="PURCHASE_INVOICE">Alış Faturaları</option>
              <option value="PAYMENT">Tahsilatlar</option>
              <option value="STOCK">Stok Seviyeleri</option>
              <option value="RECEIPT">POS Fişleri</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-stone-200 rounded-xl bg-stone-50 font-semibold"
            >
              <option value="ALL">Tüm Durumlar</option>
              <option value="SUCCESS">Başarılı</option>
              <option value="FAILED">Hatalı (Failed)</option>
              <option value="PENDING">Bekleyen</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
              <tr>
                <th className="py-2.5 px-3">Tarih</th>
                <th className="py-2.5 px-3">Entegratör</th>
                <th className="py-2.5 px-3">Varlık Tipi</th>
                <th className="py-2.5 px-3">Referans ID</th>
                <th className="py-2.5 px-3">Eylem</th>
                <th className="py-2.5 px-3">Durum</th>
                <th className="py-2.5 px-3">Hata / Yanıt</th>
                <th className="py-2.5 px-3">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {logs.map((log: any) => {
                let parsedResponse: any = null;
                try {
                  parsedResponse = log.response ? JSON.parse(log.response) : null;
                } catch {}

                return (
                  <tr key={log.id} className="hover:bg-stone-50/50">
                    <td className="py-2.5 px-3 text-stone-500 whitespace-nowrap font-mono text-[11px]">
                      {new Date(log.createdAt).toLocaleString("tr-TR")}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-stone-700">
                      {log.provider || "LOGO_GO3"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="bg-stone-100 text-stone-800 px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                        {log.entityType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-stone-900">
                      {log.entityId}
                    </td>
                    <td className="py-2.5 px-3 text-stone-600 font-mono text-[11px]">
                      {log.action}
                      {log.retryCount > 0 && <span className="text-amber-800 text-[10px] ml-1">({log.retryCount}x)</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === "SUCCESS"
                            ? "bg-emerald-100 text-emerald-800"
                            : log.status === "FAILED"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {log.status === "SUCCESS" ? "BAŞARILI" : log.status === "FAILED" ? "HATALI" : "BEKLİYOR"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 max-w-xs truncate text-[11px]">
                      {log.status === "FAILED" ? (
                        <span className="text-rose-700 font-bold">{log.errorMessage || "Zaman aşımı"}</span>
                      ) : (
                        <span className="text-stone-600">{parsedResponse?.message || parsedResponse?.invoiceNumber || log.response}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedLogForDetails(log)}
                          className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-[10px] font-bold transition"
                        >
                          İncele
                        </button>
                        {log.status === "FAILED" && (
                          <button
                            onClick={() => handleRetry(log.id)}
                            className="px-2 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-xs"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Yeniden Dene</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400">
                    Filtrelere uygun ERP senkronizasyon kaydı bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. JSON Payload & Response İnceleme Modalı */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div>
                <h3 className="font-black text-base text-stone-900">
                  ERP Senkronizasyon Detayı #{selectedLogForDetails.id}
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  {selectedLogForDetails.entityType} · Ref: {selectedLogForDetails.entityId} · Sağlayıcı: {selectedLogForDetails.provider}
                </p>
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Giden JSON Payload (ERP İstek Paketi):</label>
                <pre className="p-3 bg-stone-950 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48 border border-stone-800">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedLogForDetails.payload || "{}"), null, 2);
                    } catch {
                      return selectedLogForDetails.payload || "Boş";
                    }
                  })()}
                </pre>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Dönen JSON Response (GİB / ERP Yanıtı):</label>
                <pre className="p-3 bg-stone-950 text-sky-400 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48 border border-stone-800">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedLogForDetails.response || "{}"), null, 2);
                    } catch {
                      return selectedLogForDetails.response || "Boş";
                    }
                  })()}
                </pre>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              {selectedLogForDetails.status === "FAILED" && (
                <button
                  onClick={async () => {
                    const id = selectedLogForDetails.id;
                    setSelectedLogForDetails(null);
                    await handleRetry(id);
                  }}
                  className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Şimdi Yeniden Dene (Retry)</span>
                </button>
              )}
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl text-xs transition"
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
