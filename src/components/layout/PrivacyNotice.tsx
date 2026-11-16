"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { OPEN_PRIVACY_PREFERENCES, savePrivacyChoice, usePrivacyChoice } from "@/lib/privacy-preferences";

const buttonClass = "rounded-xl px-4 py-2.5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800";

function PreferenceOptions({ initialExternalMedia, onSave, onBack }: { initialExternalMedia: boolean; onSave: (externalMedia: boolean) => void; onBack: () => void }) {
  const [externalMedia, setExternalMedia] = useState(initialExternalMedia);
  return (
    <div className="mt-4 space-y-3 border-t border-stone-200 pt-4">
      <h3 className="text-sm font-bold text-stone-900">Çerez tercihleri</h3>
      <div className="flex items-start justify-between gap-4 rounded-xl bg-stone-50 p-3">
        <div><p className="text-sm font-semibold">Zorunlu</p><p className="mt-1 text-xs leading-relaxed text-stone-600">Güvenli oturum, sepet ve tercihlerinizi hatırlamak için gereklidir.</p></div>
        <span className="shrink-0 text-xs font-semibold text-stone-500">Her zaman açık</span>
      </div>
      <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl bg-stone-50 p-3">
        <span><span className="block text-sm font-semibold">Üçüncü taraf medya</span><span className="mt-1 block text-xs leading-relaxed text-stone-600">YouTube ve diğer sağlayıcıların gömülü videolarını açar. Bu sağlayıcılar çerez veya benzeri teknolojiler kullanabilir.</span></span>
        <input type="checkbox" checked={externalMedia} onChange={(event) => setExternalMedia(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-amber-800" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onSave(externalMedia)} className={`${buttonClass} bg-amber-800 text-white hover:bg-amber-900`}>Tercihleri Kaydet</button>
        <button type="button" onClick={onBack} className={`${buttonClass} border border-stone-300 text-stone-700 hover:bg-stone-100`}>Geri</button>
      </div>
    </div>
  );
}

export function PrivacyNotice() {
  const pathname = usePathname();
  const choice = usePrivacyChoice();
  const [opened, setOpened] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    const open = () => { setOpened(true); setShowPreferences(true); };
    window.addEventListener(OPEN_PRIVACY_PREFERENCES, open);
    return () => window.removeEventListener(OPEN_PRIVACY_PREFERENCES, open);
  }, []);

  const staffPage = pathname === "/admin" || pathname?.startsWith("/admin/") || pathname === "/pos" || pathname?.startsWith("/pos/");
  if (!opened && (choice !== "unset" || staffPage)) return null;
  const save = (allowMedia: boolean) => {
    savePrivacyChoice(allowMedia ? "all" : "necessary");
    setOpened(false);
    setShowPreferences(false);
  };

  return (
    <section aria-labelledby="privacy-notice-title" aria-describedby="privacy-notice-description" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[calc(100dvh-1.5rem)] max-w-4xl overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl sm:bottom-5 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="hidden shrink-0 rounded-xl bg-amber-100 p-2 text-amber-800 sm:block" aria-hidden="true"><ShieldCheck className="h-5 w-5" /></span>
        <div>
          <h2 id="privacy-notice-title" className="text-sm font-bold text-stone-900">Çerez ve KVKK Bilgilendirmesi</h2>
          <p id="privacy-notice-description" className="mt-1 text-xs leading-relaxed text-stone-600 sm:text-sm">
            Güvenli oturum ve sepet için zorunlu çerezler ve tarayıcı depolaması kullanıyoruz. Üçüncü taraf videolar tercihlerinize bağlıdır. Ayrıntılar için{" "}
            <Link href="/kvkk" className="font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950">KVKK Aydınlatma Metni</Link>{" "}ve{" "}
            <Link href="/kvkk#cerez" className="font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950">Çerez Politikası</Link> sayfalarını inceleyebilirsiniz.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowPreferences(!showPreferences)} aria-expanded={showPreferences} className={`${buttonClass} border border-stone-300 text-stone-700 hover:bg-stone-100`}>Tercihler</button>
        <button type="button" onClick={() => save(false)} className={`${buttonClass} border border-amber-800 text-amber-900 hover:bg-amber-50`}>Sadece Zorunlu</button>
        <button type="button" onClick={() => save(true)} className={`${buttonClass} bg-amber-800 text-white hover:bg-amber-900`}>Tümünü Kabul Et</button>
        {opened && choice !== "unset" && <button type="button" onClick={() => { setOpened(false); setShowPreferences(false); }} className={`${buttonClass} text-stone-600 hover:bg-stone-100`}>Kapat</button>}
      </div>
      {showPreferences && <PreferenceOptions initialExternalMedia={choice === "all"} onSave={save} onBack={() => setShowPreferences(false)} />}
    </section>
  );
}
