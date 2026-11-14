/** Intelligence API'leri için ortak yanıt yardımcıları. */
import { NextResponse } from "next/server";

export function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

export function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

/** Sayısal query parametre: yoksa fallback, geçersizse hata. */
export function numParam(url: URL, key: string, fallback: number, min: number, max: number): { value: number } | { error: string } {
  const raw = url.searchParams.get(key);
  if (raw == null || raw === "") return { value: fallback };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return { error: `${key} ${min}-${max} arasında sayı olmalı.` };
  return { value: n };
}
