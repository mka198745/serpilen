"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SITE_SETTINGS } from "./site-settings-shared";

/** Vitrin bileşenleri için ortak ayar hook'u — /api/site-settings'i okur, admin kaydedince "site-settings-updated" ile tazelenir. */
export function useSiteSettings(): Record<string, string> {
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULT_SITE_SETTINGS);
  useEffect(() => {
    const load = () =>
      fetch("/api/site-settings", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (d?.success && d.data) setSettings({ ...DEFAULT_SITE_SETTINGS, ...d.data });
        })
        .catch(() => {});
    load();
    window.addEventListener("site-settings-updated", load);
    return () => window.removeEventListener("site-settings-updated", load);
  }, []);
  return settings;
}
