"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { openPrivacyPreferences, usePrivacyChoice } from "@/lib/privacy-preferences";

/** Third-party embeds are not mounted (or requested) before consent. */
export function ExternalMediaGate({ children }: { children: ReactNode }) {
  const choice = usePrivacyChoice();
  const pathname = usePathname();
  if (choice === "all" || pathname === "/admin" || pathname?.startsWith("/admin/")) return <>{children}</>;
  return (
    <div className="flex h-full min-h-36 flex-col items-center justify-center gap-3 rounded-xl bg-stone-100 p-4 text-center text-stone-700">
      <p className="text-xs leading-relaxed">Bu içerik üçüncü taraf medya izni gerektirir.</p>
      <button type="button" onClick={openPrivacyPreferences} className="rounded-lg bg-amber-800 px-4 py-2 text-xs font-bold text-white hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800">Çerez Tercihleri</button>
    </div>
  );
}
