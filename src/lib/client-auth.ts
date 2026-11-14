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

/**
 * Kimlik doğrulamalı dosya indirme: authFetch ile çeker → blob → geçici <a download>.
 * Önizleme/iframe gibi çerezin engellendiği ortamlarda düz <a href> 401 alır; bu yardımcı
 * localStorage token'ını isteğe başlık olarak ekleyerek indirir.
 */
export async function downloadAuthenticated(url: string, fallbackFilename: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await authFetch(url);
    if (!res.ok) {
      let message = "Dosya indirilemedi.";
      try {
        const d = await res.json();
        message = d?.error?.message || message;
      } catch {
        /* hata gövdesi JSON değilse varsayılan mesaj */
      }
      return { ok: false, message };
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    let filename = fallbackFilename;
    const m = /filename\*?=(?:UTF-8'')?"?([^";\s]+)"?/i.exec(disposition);
    if (m?.[1]) {
      try {
        filename = decodeURIComponent(m[1]);
      } catch {
        filename = m[1];
      }
    }
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Hemen iptal indirmeyi yarıştırabilir — elden bırakıldıktan sonra temizle
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return { ok: true };
  } catch {
    return { ok: false, message: "Sunucuya ulaşılamadı." };
  }
}
