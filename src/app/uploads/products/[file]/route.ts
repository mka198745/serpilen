import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Site deposundaki ürün görsellerini sunar.
 * (`next start` çalışma anında public/ altına eklenen dosyaları sunmadığı
 * için yüklemeler data/uploads altında tutulur ve bu route ile servis edilir.)
 */

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  if (!file || file.includes("/") || file.includes("\\") || file.includes("..")) {
    return NextResponse.json({ success: false, error: "Geçersiz dosya adı." }, { status: 400 });
  }
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) {
    return NextResponse.json({ success: false, error: "Bulunamadı." }, { status: 404 });
  }

  try {
    const buf = await readFile(path.join(process.cwd(), "data", "uploads", "products", file));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Bulunamadı." }, { status: 404 });
  }
}
