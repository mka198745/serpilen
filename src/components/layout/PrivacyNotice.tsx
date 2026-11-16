"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

const STORAGE_KEY = "serpilen_privacy_notice_v1";
const listeners = new Set<() => void>();
let acknowledgedInMemory = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function shouldShowNotice() {
  if (acknowledgedInMemory) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "acknowledged";
  } catch {
    // Storage engelliyse ziyaretçi yine bilgilendirilir; kapatma bu sekmede geçerlidir.
    return true;
  }
}

function acknowledge() {
  acknowledgedInMemory = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "acknowledged");
  } catch {
    // Depolama kullanılamadığında sayfa açık kaldığı sürece gizli kalır.
  }
  listeners.forEach((listener) => listener());
}

export function PrivacyNotice() {
  const pathname = usePathname();
  const visible = useSyncExternalStore(subscribe, shouldShowNotice, () => false);
  if (!visible || pathname === "/admin" || pathname?.startsWith("/admin/") || pathname === "/pos" || pathname?.startsWith("/pos/")) return null;

  return (
    <section
      aria-labelledby="privacy-notice-title"
      aria-describedby="privacy-notice-description"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[calc(100dvh-1.5rem)] max-w-4xl overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl sm:bottom-5 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-start gap-3">
          <span className="hidden shrink-0 rounded-xl bg-amber-100 p-2 text-amber-800 sm:block" aria-hidden="true">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 id="privacy-notice-title" className="text-sm font-bold text-stone-900">Çerez ve KVKK Bilgilendirmesi</h2>
            <p id="privacy-notice-description" className="mt-1 text-xs leading-relaxed text-stone-600 sm:text-sm">
              Sitemizde güvenli oturum ve sepet gibi hizmetler için çerezler ve tarayıcı depolaması kullanılır. Kişisel verilerinizin işlenmesi hakkında{" "}
              <Link href="/kvkk" className="font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950">KVKK Aydınlatma Metni</Link>
              {" "}ve{" "}
              <Link href="/kvkk#cerez" className="font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950">Çerez Politikası</Link>
              {" "}sayfalarını inceleyebilirsiniz.
            </p>
          </div>
        </div>
        <button type="button" onClick={acknowledge} className="shrink-0 rounded-xl bg-amber-800 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800">
          Anladım
        </button>
      </div>
    </section>
  );
}
