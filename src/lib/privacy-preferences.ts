"use client";

import { useSyncExternalStore } from "react";

export const PRIVACY_STORAGE_KEY = "serpilen_privacy_preferences_v3";
const PREVIOUS_STORAGE_KEY = "serpilen_privacy_preferences_v2";
export const OPEN_PRIVACY_PREFERENCES = "serpilen-open-privacy-preferences";

export type PrivacyPreferences = {
  performance: boolean;
  marketing: boolean;
  externalMedia: boolean;
};

export const NECESSARY_ONLY: PrivacyPreferences = { performance: false, marketing: false, externalMedia: false };
export const ACCEPT_ALL: PrivacyPreferences = { performance: true, marketing: true, externalMedia: true };

const listeners = new Set<() => void>();
let fallbackSnapshot = "unset";
let storageUnavailable = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function parsePreferences(value: string): PrivacyPreferences | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.version === 3 && typeof parsed.performance === "boolean" && typeof parsed.marketing === "boolean" && typeof parsed.externalMedia === "boolean") {
      return { performance: parsed.performance, marketing: parsed.marketing, externalMedia: parsed.externalMedia };
    }
  } catch {
    // Eski veya bozuk kayıt izin olarak yorumlanmaz.
  }
  return null;
}

function serialize(preferences: PrivacyPreferences): string {
  return JSON.stringify({ version: 3, performance: preferences.performance, marketing: preferences.marketing, externalMedia: preferences.externalMedia });
}

function readSnapshot(): string {
  if (storageUnavailable) return fallbackSnapshot;
  try {
    const stored = window.localStorage.getItem(PRIVACY_STORAGE_KEY);
    if (stored !== null) return parsePreferences(stored) ? stored : "unset";
    // Önceki sürüm yalnızca medya iznini soruyordu; diğer kategoriler için onay varsaymayız.
    const previous = window.localStorage.getItem(PREVIOUS_STORAGE_KEY);
    if (previous === "necessary") return serialize(NECESSARY_ONLY);
    if (previous === "all") return serialize({ ...NECESSARY_ONLY, externalMedia: true });
    return "unset";
  } catch {
    return fallbackSnapshot;
  }
}

export function usePrivacyPreferences(): PrivacyPreferences | null {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => "unset");
  return snapshot === "unset" ? null : parsePreferences(snapshot);
}

export function savePrivacyPreferences(preferences: PrivacyPreferences) {
  const snapshot = serialize(preferences);
  fallbackSnapshot = snapshot;
  try {
    window.localStorage.setItem(PRIVACY_STORAGE_KEY, snapshot);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
  listeners.forEach((listener) => listener());
}

export function openPrivacyPreferences() {
  window.dispatchEvent(new Event(OPEN_PRIVACY_PREFERENCES));
}
