import { NextResponse } from "next/server";
import { publicBaseUrl } from "@/lib/auth";

/** CRM yazma istekleri yalnız aynı kaynaktan veya Bearer API istemcisinden. */
export function validateCrmWrite(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if ((origin && origin !== publicBaseUrl(request)) || request.headers.get("sec-fetch-site") === "cross-site" || (!origin && !request.headers.get("authorization")?.startsWith("Bearer "))) {
    return NextResponse.json({ success: false, error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
  }
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") || "")) return NextResponse.json({ success: false, error: "Geçersiz istek türü." }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 16384) return NextResponse.json({ success: false, error: "İstek çok büyük." }, { status: 413 });
  return null;
}

/** Content-Length bulunmasa veya yanlış olsa bile ham gövde sınırını uygular. */
export async function readCrmJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: NextResponse.json({ success: false, error: "İstek gövdesi bulunamadı." }, { status: 400 }) };
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16384) {
        await reader.cancel();
        return { ok: false, response: NextResponse.json({ success: false, error: "İstek çok büyük." }, { status: 413 }) };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: NextResponse.json({ success: false, error: "Geçersiz istek gövdesi." }, { status: 400 }) };
  } finally {
    reader.releaseLock();
  }
}
