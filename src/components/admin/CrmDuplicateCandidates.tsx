"use client";

import React, { useState } from "react";
import { authFetch } from "@/lib/client-auth";

type Candidate = { id: number; name: string; email: string | null; phone: string; emailMatch: number; phoneMatch: number };
type Result = { data: Candidate[]; pagination: { page: number; hasMore: boolean }; criteria: { email: boolean; phone: boolean } };

export function CrmDuplicateCandidates({ customerId, onChoose, disabled = false }: { customerId: number; onChoose: (id: number) => void; disabled?: boolean }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load(page: number) {
    if (busy || disabled) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await authFetch(`/api/crm/customers/${customerId}/duplicate-candidates?page=${page}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "Adaylar yüklenemedi.");
      setResult(json);
    } catch (err) { setError(err instanceof Error ? err.message : "Adaylar yüklenemedi."); }
    finally { setBusy(false); }
  }
  const button = "rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold hover:bg-stone-50 disabled:opacity-40";
  return <div className="rounded-xl border border-stone-200 p-3 space-y-3">
    <div><h4 className="text-sm font-bold text-stone-900">Olası yinelenen kartlar</h4><p className="text-xs text-stone-500 mt-1">Aynı e-posta veya aynı rakamlardan oluşan telefon aranır. Paylaşılan iletişim bilgileri farklı kişilere ait olabilir; adaylar kimlik doğrulaması değildir. Farklı ülke kodları ve bazı eski biçimler eşleşmeyebilir.</p></div>
    <button type="button" className={button} disabled={busy || disabled} onClick={() => void load(1)}>{busy ? "Aranıyor…" : result ? "Adayları yeniden ara" : "Olası adayları bul"}</button>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {result && <><p className="text-xs text-stone-500">Aranan alanlar: {result.criteria.email ? "e-posta" : "geçerli e-posta yok"} · {result.criteria.phone ? "telefon" : "geçerli telefon yok"}. Sadece müşteri kartları aranır; misafir siparişleri ve bağımsız hesaplar taranmaz. İnceleme denetim kaydına yazılır.</p>
      {result.data.length ? <ul className="divide-y divide-stone-100">{result.data.map(row => <li key={row.id} className="py-3 flex flex-wrap justify-between gap-2 items-center"><div className="min-w-0"><p className="text-sm font-bold break-words">#{row.id} · {row.name}</p><p className="text-xs text-stone-500 break-words">{row.email || "E-posta yok"} · {row.phone || "Telefon yok"}</p><p className="text-xs text-amber-800">Eşleşme: {[row.emailMatch && "e-posta", row.phoneMatch && "telefon"].filter(Boolean).join(" ve ")}</p></div><button type="button" className={button} disabled={disabled} onClick={() => onChoose(row.id)}>Karşılaştırmaya seç</button></li>)}</ul> : <p className="text-xs text-stone-500">Bu sayfada aday bulunamadı. Eşleşme olmaması kayıtların farklı olduğunu kanıtlamaz.</p>}
      <div className="flex items-center gap-2"><button type="button" className={button} disabled={busy || disabled || result.pagination.page <= 1} onClick={() => void load(result.pagination.page - 1)}>Önceki</button><span className="text-xs text-stone-500">Sayfa {result.pagination.page}</span><button type="button" className={button} disabled={busy || disabled || !result.pagination.hasMore} onClick={() => void load(result.pagination.page + 1)}>Sonraki</button></div></>}
  </div>;
}
