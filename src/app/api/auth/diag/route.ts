import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/diag — Giriş sorunu tanısı: sunucunun gördüğü protokol/host/çerez
 * bilgisini döndürür (gizli değer YOK, yalnızca varlık bilgisi). Kullanıcı bu
 * adresi tarayıcıda açıp sonucu paylaşarak sorunun kaynağını belli eder.
 */
export async function GET(request: Request) {
  const h = request.headers;
  const cookieHeader = h.get("cookie") || "";
  const names = cookieHeader
    .split(";")
    .map((s) => s.split("=")[0]?.trim())
    .filter(Boolean);
  return NextResponse.json({
    success: true,
    data: {
      build: "diag-v4",
      proto: h.get("x-forwarded-proto"),
      host: h.get("host"),
      urlProtocol: (() => {
        try {
          return new URL(request.url).protocol;
        } catch {
          return null;
        }
      })(),
      hasSessionCookie: cookieHeader.includes(`${SESSION_COOKIE}=`),
      cookieNames: names,
      cookieHeaderLength: cookieHeader.length,
      hasAuthHeader: !!h.get("authorization"),
      forwardedFor: h.get("x-forwarded-for")?.slice(0, 60) || null,
      userAgent: h.get("user-agent")?.slice(0, 140) || null,
    },
  });
}
