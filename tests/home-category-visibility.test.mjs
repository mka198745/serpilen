import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function sections(html) {
  return Array.from(html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g), match => match[0]);
}
function headingSection(html, heading) {
  return sections(html).find(section => section.includes(`>${heading}</h2>`));
}

test("Anasayfada boş veya pasif kategori gizlenir, aktif ürün eklenince görünür", { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serpilen-home-cats-"));
  const dbPath = path.join(dir, "categories.db");
  let server;
  let db;
  try {
    const migration = spawnSync(process.execPath, ["scripts/db-apply.mjs"], {
      env: { ...process.env, DATABASE_URL: `sqlite:${dbPath}` }, encoding: "utf8", timeout: 15000,
    });
    assert.equal(migration.status, 0, migration.stderr);
    db = new Database(dbPath);
    db.exec(`
      INSERT INTO categories(id, name, slug, is_active) VALUES
        (1,'El İşi Ürünler','el-isi-urunler',1),
        (2,'Hobi Kitleri','hobi-kitleri',1),
        (3,'Fermuar Çeşitleri','fermuar',0),
        (4,'Dikiş & Nakış','dikis-nakis',1);
      INSERT INTO products(id, name, slug, sku, category_id, is_active) VALUES
        (1,'Aktif El İşi','aktif-el-isi','AKTIF-EL-ISI',1,1),
        (2,'Pasif El İşi','pasif-el-isi','PASIF-EL-ISI',1,0),
        (3,'Pasif Kategoride Ürün','pasif-kategori-urunu','PASIF-KAT',3,1),
        (4,'Pasif Hobi','pasif-hobi','PASIF-HOBI',2,0);
    `);
    const port = await availablePort();
    server = spawn(process.execPath, ["scripts/start-standalone.mjs"], {
      env: { ...process.env, DATABASE_URL: `sqlite:${dbPath}`, PORT: String(port), NODE_ENV: "production" }, stdio: "ignore",
    });
    const url = `http://127.0.0.1:${port}/`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(`Test sunucusu durdu: ${server.exitCode}`);
      try { const r = await fetch(url); if (r.ok) { ready = true; break; } } catch { /* sunucu açılıyor */ }
      await delay(100);
    }
    assert.ok(ready, "Test sunucusu başlatılamadı");
    const page = async () => {
      const response = await fetch(url, { cache: "no-store" });
      assert.equal(response.status, 200);
      return response.text();
    };
    let html = await page();
    let grid = headingSection(html, "Öne Çıkan Tuhafiye Kategorileri");
    assert.ok(grid);
    assert.match(grid, /category=el-isi-urunler/);
    assert.match(grid, />1(?:<!-- -->)? Ürün<\/span>/);
    for (const slug of ["hobi-kitleri", "fermuar", "dikis-nakis"]) assert.doesNotMatch(grid, new RegExp(`category=${slug}`));
    assert.ok(headingSection(html, "El İşi Ürünler"));
    assert.equal(headingSection(html, "Hobi Kitleri"), undefined);
    assert.equal(headingSection(html, "Fermuar Çeşitleri"), undefined);
    assert.doesNotMatch(html, /kategorisinde henüz ürün yok/);

    db.prepare("INSERT INTO products(name,slug,sku,category_id,is_active) VALUES(?,?,?,?,1)")
      .run("Yeni Hobi", "yeni-hobi", "YENI-HOBI", 2);
    html = await page();
    grid = headingSection(html, "Öne Çıkan Tuhafiye Kategorileri");
    assert.match(grid, /category=hobi-kitleri/);
    const hobbySection = headingSection(html, "Hobi Kitleri");
    assert.ok(hobbySection);
    assert.match(hobbySection, /Yeni Hobi/);
    assert.doesNotMatch(hobbySection, /Pasif Hobi/);

    const insert = db.prepare("INSERT INTO products(name,slug,sku,category_id,is_active,is_featured) VALUES(?,?,?,?,1,?)");
    for (let i = 1; i <= 4; i++) insert.run(`Hobi ${i}`, `hobi-${i}`, `HOBI-${i}`, 2, i === 4 ? 1 : 0);
    html = await page();
    grid = headingSection(html, "Öne Çıkan Tuhafiye Kategorileri");
    assert.match(grid, />5(?:<!-- -->)? Ürün<\/span>/);
    const fourProducts = headingSection(html, "Hobi Kitleri");
    assert.match(fourProducts, /Hobi 4/); // Öne çıkan ürün ilk dörtte kalır.
    assert.doesNotMatch(fourProducts, /Hobi 3/);
    assert.equal((fourProducts.match(/title="Favoriye Ekle"/g) || []).length, 4);

    db.prepare("UPDATE products SET is_active = 0 WHERE id = 1").run();
    html = await page();
    grid = headingSection(html, "Öne Çıkan Tuhafiye Kategorileri");
    assert.doesNotMatch(grid, /category=el-isi-urunler/);
    assert.equal(headingSection(html, "El İşi Ürünler"), undefined);
    assert.ok(headingSection(html, "Hobi Kitleri"));

    db.prepare("UPDATE products SET is_active = 0 WHERE category_id = 2").run();
    html = await page();
    assert.equal(headingSection(html, "Öne Çıkan Tuhafiye Kategorileri"), undefined);
    assert.equal(headingSection(html, "Hobi Kitleri"), undefined);
    assert.equal(headingSection(html, "El İşi Ürünler"), undefined);
  } finally {
    db?.close();
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise(resolve => server.once("exit", resolve));
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
