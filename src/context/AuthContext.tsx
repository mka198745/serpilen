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
  /** true ise çerez çalışmıyor, oturum yalnızca Bearer token ile sürüyor */
  cookieless: boolean;
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
  /** Token başlıklı istekler için yardımcı (çerez engelliyse Authorization kullanır) */
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "ipek_auth_token";

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* depolama kapalıysa sessiz geç */
  }
}

async function fetchMe(token?: string | null): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data?.success ? (data.data.user as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cookieless, setCookieless] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<AuthTab>("login");
  const [postLoginNext, setPostLoginNext] = useState<string | null>(null);

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const t = token || readStoredToken();
      const headers = new Headers(init?.headers);
      if (t && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${t}`);
      return fetch(input, { ...init, headers });
    },
    [token]
  );

  const refresh = useCallback(async () => {
    // Önce çerez, olmazsa kayıtlı token ile dene.
    const viaCookie = await fetchMe();
    if (viaCookie) {
      setUser(viaCookie);
      setCookieless(false);
      return;
    }
    const stored = readStoredToken();
    if (stored) {
      const viaToken = await fetchMe(stored);
      if (viaToken) {
        setToken(stored);
        setUser(viaToken);
        setCookieless(true);
        return;
      }
      writeStoredToken(null);
    }
    setToken(null);
    setUser(null);
    setCookieless(false);
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

  /** Giriş/kayıt sonrası oturumu doğrula: çerez → token sırasıyla. */
  const establishSession = useCallback(async (newToken: string | null, apiUser: AuthUser | null) => {
    if (newToken) {
      setToken(newToken);
      writeStoredToken(newToken);
    }
    const viaCookie = await fetchMe();
    if (viaCookie) {
      setUser(viaCookie);
      setCookieless(false);
      return true;
    }
    if (newToken) {
      const viaToken = await fetchMe(newToken);
      if (viaToken) {
        setUser(viaToken);
        setCookieless(true); // çerez engelli ama token ile giriş tamam
        return true;
      }
    }
    if (apiUser && !newToken) {
      // Teorik yedek: token yok ama API kullanıcı döndüyse (eski davranış)
      setUser(apiUser);
      setCookieless(false);
      return true;
    }
    return false;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        const ok = await establishSession(data.data.token || null, data.data.user || null);
        if (ok) return { success: true };
        return {
          success: false,
          message: "Giriş doğrulandı ancak oturum sürdürülemedi. Tarayıcınız çerezleri ve site verilerini engelliyor olabilir — izin verip tekrar deneyin veya önizlemeyi yeni sekmede açın.",
        };
      }
      return { success: false, message: data?.error?.message || "Giriş yapılamadı." };
    },
    [establishSession]
  );

  const register = useCallback(
    async (input: { name: string; email: string; phone: string; password: string; city?: string }) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        const ok = await establishSession(data.data.token || null, data.data.user || null);
        if (ok) return { success: true };
        return {
          success: false,
          message: "Kaydınız oluştu ancak oturum sürdürülemedi. Tarayıcı çerez/site verisi engelini kaldırıp giriş yapmayı deneyin.",
        };
      }
      return { success: false, message: data?.error?.message || "Kayıt oluşturulamadı." };
    },
    [establishSession]
  );

  const logout = useCallback(async () => {
    const t = token || readStoredToken();
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: t ? { Authorization: `Bearer ${t}` } : undefined,
    }).catch(() => undefined);
    writeStoredToken(null);
    setToken(null);
    setUser(null);
    setCookieless(false);
  }, [token]);

  return (
    <AuthContext.Provider
      value={{ user, loading, cookieless, modalOpen, modalTab, postLoginNext, openAuth, closeAuth, setModalTab, refresh, login, register, logout, authFetch }}
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
