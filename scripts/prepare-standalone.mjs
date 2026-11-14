/**
 * `.next/standalone` çıktısını çalıştırılabilir hale getirir.
 *
 * Next.js, standalone sunucusuna statik asset'leri KENDİLİĞİNDEN kopyalamaz;
 * `.next/static` (JS/CSS chunk'ları) ve varsa `public/` klasörünün
 * standalone içine kopyalanması gerekir. Bu betik `postbuild` olarak
 * `npm run build` sonrasında otomatik çalışır.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  // output: "standalone" kapalıysa sessizce çık
  process.exit(0);
}

const copies = [
  [path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static")],
  [path.join(root, "public"), path.join(standaloneDir, "public")],
];

for (const [src, dest] of copies) {
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[postbuild] kopyalandı: ${path.relative(root, src)} -> ${path.relative(root, dest)}`);
}

// Çalışma-zamanı SQLite dosyaları standalone çıktısına ASLA girmemeli.
// (Turbopack NFT izlemesi projeyi geniş kapsadığı için yerel geliştirme
// veritabanı kopyalanabiliyor; imaja/dağıtıma taşınmamalı.)
const runtimeArtifacts = [path.join(standaloneDir, "data")];
for (const artifact of runtimeArtifacts) {
  if (fs.existsSync(artifact)) {
    fs.rmSync(artifact, { recursive: true, force: true });
    console.log(`[postbuild] temizlendi: ${path.relative(root, artifact)} (çalışma-zamanı veritabanı dağıtıma dahil edilmez)`);
  }
}

console.log("[postbuild] standalone çıktısı hazır (yalnız .env vb. gizli dosyalar KOPYALANMAZ).");
