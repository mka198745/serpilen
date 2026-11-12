"use client";

/**
 * Personel istemcileri için fetch sarmalayıcı.
 *
 * AuthContext, çerezler üçüncü-taraf bağlamında engellendiğinde (ör. önizleme
 * iframe'i) oturumu localStorage'daki token ile sürdürür. Bu yardımcı, her
 * isteğe `Authorization: Bearer` + `X-Auth-Token` başlıklarını ekler; sunucu
 * tarafında `requireStaff` / `getSessionUserFromRequest` token'ı kabul eder.
 * Çerez çalışan ortamlarda başlıklar zararsızdır, sunucu önce çereze bakar.
 */
const TOKEN_KEY = "ipek_auth_token";

export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let token: string | null = null;
  try {
    token = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
  } catch {
    token = null;
  }
  const headers = new Headers(init?.headers);
  if (token) {
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("X-Auth-Token")) headers.set("X-Auth-Token", token);
  }
  return fetch(input, { ...init, headers });
}
