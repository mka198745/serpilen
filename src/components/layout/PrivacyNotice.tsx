"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronRight, LockKeyhole, Settings2, ShieldCheck } from "lucide-react";
import {
  ACCEPT_ALL,
  NECESSARY_ONLY,
  OPEN_PRIVACY_PREFERENCES,
  savePrivacyPreferences,
  usePrivacyPreferences,
  type PrivacyPreferences,
} from "@/lib/privacy-preferences";

const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 sm:text-sm";

function PreferenceOptions({ initial, onSave, onBack }: { initial: PrivacyPreferences; onSave: (preferences: PrivacyPreferences) => void; onBack: () => void }) {
  const [draft, setDraft] = useState(initial);
  const optionalCategories: { key: keyof PrivacyPreferences; title: string; description: string }[] = [
    { key: "performance", title: "Performans ve Analiz Çerezleri", description: "Ziyaret ve kullanım ölçümüyle site performansının iyileştirilmesine yardımcı olabilir. Şu anda sitede bu amaçla etkin bir analiz aracı bulunmuyor." },
    { key: "marketing", title: "Pazarlama ve Kişiselleştirme Çerezleri", description: "İlgi alanlarına uygun reklam veya kişiselleştirilmiş içerik sunulmasında kullanılabilir. Şu anda sitede bu amaçla etkin bir pazarlama aracı bulunmuyor." },
    { key: "externalMedia", title: "Üçüncü Taraf Medya", description: "YouTube ve diğer sağlayıcıların gömülü videolarını açar. Bu sağlayıcılar çerez veya benzeri teknolojiler kullanabilir." },
  ];
  return (
    <div id="privacy-preferences-panel" className="mt-5 space-y-3 border-t border-stone-200 pt-4">
      <h3 className="text-sm font-bold text-stone-900">Çerez tercihleri</h3>
      <div className="flex items-start justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50 p-3 sm:p-4">
        <div><p className="text-sm font-bold text-stone-900">Zorunlu Çerezler</p><p className="mt-1 text-xs leading-relaxed text-stone-600">Sepet ve tercihlerinizi hatırlamak gibi temel site işlevleri için gereklidir.</p></div>
        <span className="shrink-0 rounded-full bg-stone-200 px-2.5 py-1 text-[10px] font-bold text-stone-600">Her zaman açık</span>
      </div>
      <div className="flex items-start justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50 p-3 sm:p-4">
        <div><p className="text-sm font-bold text-stone-900">Güvenlik Çerezleri</p><p className="mt-1 text-xs leading-relaxed text-stone-600">Güvenli oturumun sürdürülmesi ve yetkisiz erişimin önlenmesi için kullanılır; zorunlu güvenlik işlevlerinin parçasıdır.</p></div>
        <span className="shrink-0 rounded-full bg-stone-200 px-2.5 py-1 text-[10px] font-bold text-stone-600">Her zaman açık</span>
      </div>
      {optionalCategories.map(({ key, title, description }) => (
        <label key={key} className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-stone-100 bg-stone-50 p-3 transition hover:border-amber-200 sm:p-4">
          <span><span className="block text-sm font-bold text-stone-900">{title}</span><span className="mt-1 block text-xs leading-relaxed text-stone-600">{description}</span></span>
          <span className="relative mt-0.5 shrink-0">
            <input type="checkbox" checked={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} className="peer sr-only" />
            <span aria-hidden="true" className="block h-6 w-11 rounded-full bg-stone-300 transition peer-checked:bg-amber-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-800 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
          </span>
        </label>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => onSave(draft)} className={`${actionClass} border-amber-800 bg-amber-800 text-white hover:bg-amber-900`}>Tercihleri Kaydet</button>
        <button type="button" onClick={onBack} className={`${actionClass} border-stone-200 bg-white text-stone-700 hover:bg-stone-50`}>Geri</button>
      </div>
    </div>
  );
}

export function PrivacyNotice() {
  const pathname = usePathname();
  const preferences = usePrivacyPreferences();
  const [opened, setOpened] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    const open = () => { setOpened(true); setShowPreferences(true); };
    window.addEventListener(OPEN_PRIVACY_PREFERENCES, open);
    return () => window.removeEventListener(OPEN_PRIVACY_PREFERENCES, open);
  }, []);

  const staffPage = pathname === "/admin" || pathname?.startsWith("/admin/") || pathname === "/pos" || pathname?.startsWith("/pos/");
  if (!opened && (preferences !== null || staffPage)) return null;
  const save = (values: PrivacyPreferences) => {
    savePrivacyPreferences(values);
    setOpened(false);
    setShowPreferences(false);
  };

  return (
    <section aria-labelledby="privacy-notice-title" aria-describedby="privacy-notice-description" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[calc(100dvh-1.5rem)] max-w-4xl overflow-y-auto rounded-3xl border border-amber-100 bg-white p-5 shadow-[0_20px_60px_rgba(28,25,23,0.2)] sm:bottom-5 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800" aria-hidden="true"><ShieldCheck className="h-5 w-5" /></span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Gizliliğiniz bizim için önemli</p>
          <h2 id="privacy-notice-title" className="mt-0.5 text-base font-black tracking-tight text-stone-900">Çerez ve KVKK Bilgilendirmesi</h2>
          <p id="privacy-notice-description" className="mt-1.5 text-xs leading-relaxed text-stone-600 sm:text-sm">
            Güvenli oturum ve sepet için zorunlu çerezler ve tarayıcı depolaması kullanıyoruz. İsteğe bağlı kategorileri siz belirlersiniz. Ayrıntılar için{" "}
            <Link href="/kvkk" className="font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950">KVKK Aydınlatma Metni</Link>{" "}ve{" "}
            <Link href="/kvkk#cerez" className="font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950">Çerez Politikası</Link> sayfalarını inceleyebilirsiniz.
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <button type="button" onClick={() => setShowPreferences(!showPreferences)} aria-expanded={showPreferences} aria-controls="privacy-preferences-panel" className={`${actionClass} border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-stone-100`}><Settings2 className="h-4 w-4" aria-hidden="true" />Tercihler<ChevronRight className={`h-3.5 w-3.5 transition-transform ${showPreferences ? "rotate-90" : ""}`} aria-hidden="true" /></button>
        <button type="button" onClick={() => save(NECESSARY_ONLY)} className={`${actionClass} border-amber-800 bg-white text-amber-900 shadow-sm hover:bg-amber-50`}><LockKeyhole className="h-4 w-4" aria-hidden="true" />Sadece Zorunlu</button>
        <button type="button" onClick={() => save(ACCEPT_ALL)} className={`${actionClass} border-amber-800 bg-amber-800 text-white shadow-sm hover:border-amber-900 hover:bg-amber-900`}><Check className="h-4 w-4" aria-hidden="true" />Tümünü Kabul Et</button>
        {opened && preferences !== null && <button type="button" onClick={() => { setOpened(false); setShowPreferences(false); }} className={`${actionClass} border-transparent text-stone-600 hover:bg-stone-100`}>Kapat</button>}
      </div>
      {showPreferences && <PreferenceOptions initial={preferences ?? NECESSARY_ONLY} onSave={save} onBack={() => setShowPreferences(false)} />}
    </section>
  );
}
