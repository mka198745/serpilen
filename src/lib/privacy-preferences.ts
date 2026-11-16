"use client";

import { useSyncExternalStore } from "react";

export const PRIVACY_STORAGE_KEY = "serpilen_privacy_preferences_v2";
export const OPEN_PRIVACY_PREFERENCES = "serpilen-open-privacy-preferences";
export type PrivacyChoice = "unset" | "necessary" | "all";

const listeners = new Set<() => void>();
let fallbackChoice: PrivacyChoice = "unset";
let storageUnavailable = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readChoice(): PrivacyChoice {
  if (storageUnavailable) return fallbackChoice;
  try {
    const value = window.localStorage.getItem(PRIVACY_STORAGE_KEY);
    return value === "necessary" || value === "all" ? value : "unset";
  } catch {
    return fallbackChoice;
  }
}

export function usePrivacyChoice(): PrivacyChoice {
  return useSyncExternalStore(subscribe, readChoice, () => "unset");
}

export function savePrivacyChoice(choice: Exclude<PrivacyChoice, "unset">) {
  fallbackChoice = choice;
  try {
    window.localStorage.setItem(PRIVACY_STORAGE_KEY, choice);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
  listeners.forEach((listener) => listener());
}

export function openPrivacyPreferences() {
  window.dispatchEvent(new Event(OPEN_PRIVACY_PREFERENCES));
}
