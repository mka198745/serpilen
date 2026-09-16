import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Site deposuna ürün görseli yükleme.
 * POST multipart/form-data, alan adı: "file".
 * Yanıt: { success, data: { url } } — url, /uploads/products/... göreli yoludur.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "Yüklenecek dosya bulunamadı (alan adı: file)." },
        { status: 422 }
      );
    }

    const mime = file.type || "";
    const ext = ALLOWED[mime];
    if (!ext) {
      return NextResponse.json(
        { success: false, error: "Yalnızca JPG, PNG, WEBP veya GIF yükleyebilirsiniz." },
        { status: 422 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json(
        { success: false, error: "Boş dosya yüklenemez." },
        { status: 422 }
      );
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "Dosya en fazla 5 MB olabilir." },
        { status: 422 }
      );
    }

    const dir = path.join(process.cwd(), "data", "uploads", "products");
    await mkdir(dir, { recursive: true });

    const name = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    await writeFile(path.join(dir, name), buf);

    return NextResponse.json({
      success: true,
      data: { url: `/uploads/products/${name}`, size: buf.length, mime },
    });
  } catch (err: any) {
    console.error("Upload API error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Yükleme başarısız." },
      { status: 500 }
    );
  }
}
