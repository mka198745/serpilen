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

// Turbopack external (hash'li) paket stubları: Next, native paketleri
// `.next/standalone/.next/node_modules/<pkg>-<hash16>` olarak "external module"
// çıkarır; dizin boş kalabiliyor ve runtime'da require("<pkg>-<hash16>") patlıyor.
// Boş kalan her hash'li dizine, gerçek pakete yönlendiren stub yazılır.
const hashedRoot = path.join(standaloneDir, ".next", "node_modules");
if (fs.existsSync(hashedRoot)) {
  for (const entry of fs.readdirSync(hashedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = entry.name.match(/^([^/@][^/]*)-([0-9a-f]{16})$/);
    if (!m) continue;
    const realName = m[1];
    const dir = path.join(hashedRoot, entry.name);
    if (fs.readdirSync(dir).length > 0) continue;
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: entry.name, version: "0.0.0", main: "index.js" })
    );
    fs.writeFileSync(
      path.join(dir, "index.js"),
      `module.exports = require(${JSON.stringify(realName)});\n`
    );
    console.log(`[postbuild] stub yazıldı: ${entry.name} -> ${realName}`);
  }
}

console.log("[postbuild] standalone çıktısı hazır (yalnız .env vb. gizli dosyalar KOPYALANMAZ).");
