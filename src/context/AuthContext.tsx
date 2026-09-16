"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  isStaff: boolean;
}

type AuthTab = "login" | "register";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  modalOpen: boolean;
  modalTab: AuthTab;
  postLoginNext: string | null;
  openAuth: (tab?: AuthTab, next?: string | null) => void;
  closeAuth: () => void;
  setModalTab: (tab: AuthTab) => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (input: { name: string; email: string; phone: string; password: string; city?: string }) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<AuthTab>("login");
  const [postLoginNext, setPostLoginNext] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setUser(res.ok && data?.success ? data.data.user : null);
    } catch {
      setUser(null);
    }
  }, []);

  const openAuth = useCallback((tab: AuthTab = "login", next: string | null = null) => {
    setModalTab(tab);
    setPostLoginNext(next);
    setModalOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setModalOpen(false);
    setPostLoginNext(null);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
      // Korumalı sayfadan yönlendirme: ?giris=1&next=/admin → pencereyi otomatik aç
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("giris") === "1") {
          const next = params.get("next");
          setModalTab("login");
          setPostLoginNext(next && next.startsWith("/") ? next : null);
          setModalOpen(true);
          params.delete("giris");
          const qs = params.toString();
          window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
        }
      } catch {
        /* yoksay */
      }
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.success) {
      setUser(data.data.user);
      return { success: true };
    }
    return { success: false, message: data?.error?.message || "Giriş yapılamadı." };
  }, []);

  const register = useCallback(async (input: { name: string; email: string; phone: string; password: string; city?: string }) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.success) {
      setUser(data.data.user);
      return { success: true };
    }
    return { success: false, message: data?.error?.message || "Kayıt oluşturulamadı." };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, modalOpen, modalTab, postLoginNext, openAuth, closeAuth, setModalTab, refresh, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
