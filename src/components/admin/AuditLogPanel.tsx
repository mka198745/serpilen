"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/client-auth";

type AuditRow = { id: number; createdAt: string; action: string; userName: string | null; entity: string; entityId: string | null; details: string | null; ipAddress: string | null };

export function AuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const current = ++epoch.current;
    setBusy(true); setError(null); setRows([]);
    try {
      const res = await authFetch("/api/audit", { cache: "no-store" });
      const json = await res.json();
      if (current !== epoch.current) return;
      if (!res.ok || !json.success || !Array.isArray(json.data)) {
        setError(typeof json?.error?.message === "string" ? json.error.message : "Denetim kayıtları yüklenemedi.");
        return;
      }
      setRows(json.data);
    } catch {
      if (current === epoch.current) setError("Denetim kayıtları yüklenemedi.");
    } finally {
      if (current === epoch.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const requestEpoch = epoch;
    void Promise.resolve().then(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; requestEpoch.current++; };
  }, [load]);

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><h2 className="text-xl font-black text-stone-900">Denetim Kaydı (Audit Log)</h2>
        <p className="text-xs text-stone-500">Son 40 kayıt gösterilir. Kayıtlar kişisel veya hassas bilgiler içerebilir; audit yetkisi tüm ayrıntıları açar. Eski kayıtların doğruluğu ve değiştirilemezliği garanti edilmez.</p></div>
      <button onClick={() => void load()} disabled={busy} className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition disabled:opacity-60"><RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /><span>Yenile</span></button>
    </div>
    {error && <p role="alert" className="text-xs text-rose-800 font-bold">{error}</p>}
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs"><div className="overflow-x-auto"><table className="w-full text-xs text-left">
      <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200"><tr><th className="py-3 px-3">Tarih</th><th className="py-3 px-3">İşlem</th><th className="py-3 px-3">Kayıt</th><th className="py-3 px-3">Detay</th><th className="py-3 px-3">IP</th></tr></thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map(row => <tr key={row.id} className="hover:bg-stone-50/50"><td className="py-3 px-3 text-stone-500 whitespace-nowrap">{new Date(row.createdAt).toLocaleString("tr-TR")}</td><td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700">{row.action}</span></td><td className="py-3 px-3"><span className="font-semibold text-stone-800">{row.userName}</span><span className="block text-[10px] text-stone-400 font-mono">{row.entity} #{row.entityId}</span></td><td className="py-3 px-3 text-stone-500 max-w-md truncate">{row.details}</td><td className="py-3 px-3 font-mono text-[10px] text-stone-400">{row.ipAddress}</td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="py-8 text-center text-stone-400">{busy ? "Yükleniyor…" : error ? "Kayıtlar gösterilemiyor." : "Henüz denetim kaydı yok."}</td></tr>}
      </tbody>
    </table></div></div>
  </div>;
}
