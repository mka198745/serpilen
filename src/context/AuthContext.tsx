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

/** Giriş adımlarının pencerede gösterilebilen sonucu */
export interface LoginStage {
  id: "storage" | "api" | "cookie" | "token";
  ok: boolean;
  detail: string;
}

export type StageCallback = (s: LoginStage) => void;

type AuthTab = "login" | "register";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /** true ise çerez çalışmıyor, oturum yalnızca token ile sürüyor */
  cookieless: boolean;
  modalOpen: boolean;
  modalTab: AuthTab;
  postLoginNext: string | null;
  openAuth: (tab?: AuthTab, next?: string | null) => void;
  closeAuth: () => void;
  setModalTab: (tab: AuthTab) => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string, onStage?: StageCallback) => Promise<{ success: boolean; message?: string }>;
  register: (
    input: { name: string; email: string; phone: string; password: string; city?: string },
    onStage?: StageCallback
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  /** Token başlıklı istekler için yardımcı (çerez engelliyse token kullanır) */
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "ipek_auth_token";

/** Token iki başlıkla birden gönderilir (proxy Authorization'ı düşürürse X-Auth-Token kalır). */
function tokenHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "X-Auth-Token": token };
}

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

function testStorage(): boolean {
  try {
    window.localStorage.setItem("ipek_t", "1");
    const ok = window.localStorage.getItem("ipek_t") === "1";
    window.localStorage.removeItem("ipek_t");
    return ok;
  } catch {
    return false;
  }
}

interface MeResult {
  user: AuthUser | null;
  status: number;
  /** token hangi yolla kabul edildi (tanı için) */
  via: "header" | "body" | null;
}

async function fetchMeVerbose(token?: string | null): Promise<MeResult> {
  try {
    const res = await fetch("/api/auth/me", {
      cache: "no-store",
      headers: token ? tokenHeaders(token) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    const user: AuthUser | null = res.ok && data?.success ? data.data.user : null;
    if (user || !token || res.status !== 401) return { user, status: res.status, via: "header" };
    // Sunucuya ulaşıldı ama başlıklar düşmüş olabilir → token'ı gövdede gönder.
    try {
      const res2 = await fetch("/api/auth/me", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data2 = await res2.json().catch(() => ({}));
      const user2: AuthUser | null = res2.ok && data2?.success ? data2.data.user : null;
      return { user: user2, status: res2.status, via: "body" };
    } catch {
      return { user: null, status: res.status, via: "body" };
    }
  } catch {
    return { user: null, status: 0, via: null };
  }
}

async function fetchMe(token?: string | null): Promise<AuthUser | null> {
  return (await fetchMeVerbose(token)).user;
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
      if (t) {
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${t}`);
        if (!headers.has("X-Auth-Token")) headers.set("X-Auth-Token", t);
      }
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
  const establishSession = useCallback(
    async (newToken: string | null, onStage?: StageCallback): Promise<boolean> => {
      if (newToken) {
        setToken(newToken);
        writeStoredToken(newToken);
      }
      const c = await fetchMeVerbose();
      if (c.user) {
        onStage?.({ id: "cookie", ok: true, detail: `HTTP ${c.status} ✓ (${c.user.email})` });
        setUser(c.user);
        setCookieless(false);
        return true;
      }
      onStage?.({ id: "cookie", ok: false, detail: c.status === 0 ? "ağ hatası" : `HTTP ${c.status} (çerez gelmedi)` });
      if (newToken) {
        const t = await fetchMeVerbose(newToken);
        if (t.user) {
          onStage?.({ id: "token", ok: true, detail: `HTTP ${t.status} ✓ via=${t.via} çerezsiz kip (${t.user.email})` });
          setUser(t.user);
          setCookieless(true); // çerez engelli ama token ile giriş tamam
          return true;
        }
        onStage?.({ id: "token", ok: false, detail: t.status === 0 ? "ağ hatası" : `HTTP ${t.status} (via=${t.via || "?"})` });
      } else {
        onStage?.({ id: "token", ok: false, detail: "atlandı (token yok)" });
      }
      return false;
    },
    []
  );

  const doAuthRequest = useCallback(
    async (
      path: "/api/auth/login" | "/api/auth/register",
      body: unknown,
      onStage?: StageCallback
    ): Promise<{ success: boolean; message?: string }> => {
      const storageOk = testStorage();
      onStage?.({ id: "storage", ok: storageOk, detail: storageOk ? "yazılabiliyor ✓" : "engelli (localStorage kapalı)" });
      let res: Response;
      try {
        res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        onStage?.({ id: "api", ok: false, detail: `ağ hatası: ${msg}` });
        return {
          success: false,
          message: `Sunucuya ulaşılamadı (ağ hatası: ${msg}). Önizleme bağlantınızı kontrol edip tekrar deneyin.`,
        };
      }
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        onStage?.({ id: "api", ok: true, detail: `HTTP ${res.status} ✓` });
        const ok = await establishSession(data.data.token || null, onStage);
        if (ok) return { success: true };
        return {
          success: false,
          message:
            "Giriş doğrulandı ancak oturum sürdürülemedi. Tarayıcınız çerezleri ve site verilerini engelliyor olabilir — izin verip tekrar deneyin veya önizlemeyi yeni sekmede açın.",
        };
      }
      const errMsg: string = data?.error?.message || "İşlem yapılamadı.";
      const errCode: string = data?.error?.code ? ` [${data.error.code}]` : "";
      onStage?.({ id: "api", ok: false, detail: `HTTP ${res.status}${errCode}: ${errMsg}` });
      return { success: false, message: errMsg };
    },
    [establishSession]
  );

  const login = useCallback(
    (email: string, password: string, onStage?: StageCallback) =>
      doAuthRequest("/api/auth/login", { email, password }, onStage),
    [doAuthRequest]
  );

  const register = useCallback(
    (
      input: { name: string; email: string; phone: string; password: string; city?: string },
      onStage?: StageCallback
    ) => doAuthRequest("/api/auth/register", input, onStage),
    [doAuthRequest]
  );

  const logout = useCallback(async () => {
    const t = token || readStoredToken();
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(t ? tokenHeaders(t) : {}) },
      body: JSON.stringify(t ? { token: t } : {}),
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
