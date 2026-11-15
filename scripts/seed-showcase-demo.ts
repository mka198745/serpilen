/**
 * Kategori vitrini demo verisi.
 *
 * Anasayfadaki kategori vitrinlerinin (Hobi Kitleri, Örgü & Hobi, Dikiş & Nakış,
 * Çanta Aksesuarları, Fermuar, Kurdele, Düğme, Tekstil Yardımcı) her birinde
 * 4 ürün görünmesi için eksik ürünleri ekler.
 *
 * Davranış:
 * - IDEMPOTENT: SKU zaten varsa atlanır; mevcut ürünlere dokunulmaz.
 * - Kategoride 4'ten az ürün varsa yalnızca eksik adet kadar demo ürün eklenir.
 * - Her ürün için ilk 3 depoda stok kaydı oluşturulur.
 *
 * Kullanım:
 *   npm run db:seed-showcase                      # .env içindeki DATABASE_URL
 *   DATABASE_URL="sqlite:/yol/tuhafiye.db" npm run db:seed-showcase
 *
 * NOT: Canlı mağazada gerçek ürünler varsa bu betiği ÇALIŞTIRMAYIN;
 * yalnızca demo vitrin görünümü için tasarlanmıştır.
 */
import "dotenv/config";
import { db } from "../src/db/index";
import { brands, categories, inventory, products, warehouses } from "../src/db/schema";
import { eq } from "drizzle-orm";

const TARGET_PER_CATEGORY = 4;

const IMAGES = [
  "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1615886753866-79396abc446e?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1528458876861-544fd1761a91?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&auto=format&fit=crop&q=80",
];

interface DemoProduct {
  name: string;
  slug: string;
  sku: string;
  buyPrice: string;
  retailPrice: string;
  unit: string;
  packageQty: number;
  shortDescription: string;
  description: string;
  brandSlug?: string;
  tags?: string;
}

/** Kategori slug → demo ürünler (her kategoride en çok 4 ürün hedeflenir). */
const DEMO: Record<string, DemoProduct[]> = {
  "el-isi-urunler": [
    {
      name: "El Örgüsü Pamuklu Bebek Battaniyesi (100 x 100 cm)",
      slug: "el-orgusu-pamuklu-bebek-battaniyesi-100x100",
      sku: "ELI-BAT-100", buyPrice: "780.00", retailPrice: "1290.00", unit: "Adet", packageQty: 1,
      shortDescription: "El emeği, %100 pamuklu, yumuşak bebek battaniyesi.",
      description: "Elde tığ ile örülmüş, %100 pamuklu ip kullanılmış 100 x 100 cm bebek battaniyesi. Antialerjik, nefes alan dokusu ve sık iğne kenar bordürü ile hediye paketli gönderilir.",
      tags: "el işi,bebek,battaniye,hediye",
    },
    {
      name: "Nakış İşlemeli Keten Kırlent Kılıfı (45 x 45 cm)",
      slug: "nakis-islemeli-keten-kirlent-kilifi-45x45",
      sku: "ELI-KRL-45", buyPrice: "320.00", retailPrice: "549.00", unit: "Adet", packageQty: 1,
      shortDescription: "Keten kumaş üzerine el nakışı kırlent kılıfı.",
      description: "Doğal keten kumaş üzerine bitkisel motifli el nakışı işlenmiş 45 x 45 cm kırlent kılıfı. Gizli fermuarlı, iç yastık dahil değildir; elde yıkama önerilir.",
      tags: "el işi,nakış,kırlent,ev tekstili",
    },
    {
      name: "Makrome Duvar Süsü (Doğal Pamuk, 60 x 90 cm)",
      slug: "makrome-duvar-susu-dogal-pamuk-60x90",
      sku: "ELI-MKR-60", buyPrice: "260.00", retailPrice: "449.00", unit: "Adet", packageQty: 1,
      shortDescription: "El yapımı makrome duvar panosu, ahşap çıta dahil.",
      description: "3 mm doğal pamuk kordonla elde düğümlenmiş 60 x 90 cm makrome duvar süsü. Ceviz görünümlü ahşap çıta ve asma ipi dahildir; her ürün el yapımı olduğu için desen detayları hafif farklılık gösterir.",
      tags: "el işi,makrome,dekorasyon,hediye",
    },
    {
      name: "Punch Nakışlı Astarlı Çanta (El Yapımı)",
      slug: "punch-nakisli-astarli-canta-el-yapimi",
      sku: "ELI-CNT-01", buyPrice: "410.00", retailPrice: "699.00", unit: "Adet", packageQty: 1,
      shortDescription: "Punch nakış tekniğiyle işlenmiş, astarlı omuz çantası.",
      description: "Punch iğnesiyle işlenmiş yumuşak dokulu yüzey, iç astar ve cepler, ayarlanabilir saplı el yapımı çanta. 28 x 22 cm ölçülerinde, fermuarlı kapama.",
      tags: "el işi,çanta,punch,hediye",
    },
  ],
  "hobi-kitleri": [
    {
      name: "Nakış Başlangıç Seti (Ahşap Kasnak + 12 İplik + İğne)",
      slug: "nakis-baslangic-seti-ahsap-kasnak-12-iplik",
      sku: "KIT-NAK-01", buyPrice: "210.00", retailPrice: "369.00", unit: "Set", packageQty: 1,
      shortDescription: "Yeni başlayanlar için tam donanımlı nakış kiti.",
      description: "20 cm ahşap kasnak, 12 renk DMC uyumlu nakış ipliği, 5 paslanmaz nakış iğnesi, desen şablonu ve anlatım kartı içerir. Hediye paketli gönderilir.",
      brandSlug: "dmc", tags: "nakış,hobi,set",
    },
    {
      name: "Punch Nakış Başlangıç Kiti (Kalem + 3 Uç + Şablon)",
      slug: "punch-nakis-baslangic-kiti-kalem-3-uc",
      sku: "KIT-PUN-01", buyPrice: "265.00", retailPrice: "449.00", unit: "Set", packageQty: 1,
      shortDescription: "Punch iğnesi ve 3 farklı uçla hızlı öğrenme seti.",
      description: "Ayarlanabilir punch kalemi, 3 uç boyu (ince/orta/kalın), 6 desen şablonu ve kullanım kılavuzu. Kumaş üzerine 3D nakış efektleri için idealdir.",
      tags: "punch,nakış,set",
    },
    {
      name: "Makrome Başlangıç Kiti (3mm Kordon + Halka + Tarak)",
      slug: "makrome-baslangic-kiti-3mm-kordon-halka",
      sku: "KIT-MAK-01", buyPrice: "175.00", retailPrice: "299.00", unit: "Set", packageQty: 1,
      shortDescription: "Saksı askısı ve duvar süsü yapmak için komple set.",
      description: "100 metre 3 mm pamuk makrome kordonu, 2 adet 4 cm ahşap halka, metal tarak ve 8 adet adım adım proje kartı içerir.",
      tags: "makrome,hobi,set",
    },
    {
      name: "Amigurumi Bebek Kit'i (İplik + Tığ + Elyaf + Göz)",
      slug: "amigurumi-bebek-kiti-iplik-tig-elyaf",
      sku: "KIT-AMI-01", buyPrice: "195.00", retailPrice: "329.00", unit: "Set", packageQty: 1,
      shortDescription: "Tığ işi oyuncak için iplik, tığ ve elyaf bir arada.",
      description: "3 adet 50 gr amigurumi ipi, 2.5 mm ergonomik tığ, 50 gr silikon elyaf, 10 adet güvenlik gözü ve Türkçe tarif kitapçığı içerir.",
      brandSlug: "alize", tags: "amigurumi,tığ,hobi",
    },
  ],
  "orgu-hobi": [
    {
      name: "Nako Elite Şiş Örgü İpi 100g (Karışık Renk)",
      slug: "nako-elite-sis-orgu-ipi-100g",
      sku: "IPL-NKO-ELT", buyPrice: "48.00", retailPrice: "89.00", unit: "Adet", packageQty: 5,
      shortDescription: "Yumuşak dokulu, tüylenmeyen akrilik örgü ipi.",
      description: "100 gr / 250 m, 4 mm şişe uygun, yıkanabilir akrilik. Kazak, bere ve atkı projelerinde homojen doku sağlar.",
      brandSlug: "nako", tags: "örgü,ip,akrilik",
    },
    {
      name: "Alize Sekerim Bebek İpi 100g (Antialerjik)",
      slug: "alize-sekerim-bebek-ipi-100g",
      sku: "IPL-ALZ-SKR", buyPrice: "56.00", retailPrice: "99.00", unit: "Adet", packageQty: 5,
      shortDescription: "Bebek projeleri için antialerjik, ekstra yumuşak ip.",
      description: "100 gr / 245 m, cilt dostu mikro elyaf. Bebek battaniyesi ve tulum gibi hassas projelerde tercih edilir.",
      brandSlug: "alize", tags: "örgü,ip,bebek",
    },
    {
      name: "Bambu Örgü Şişi Seti (18 Parça, 2.0–8.0 mm)",
      slug: "bambu-orgu-sisi-seti-18-parca",
      sku: "ORG-SIS-SET", buyPrice: "185.00", retailPrice: "319.00", unit: "Set", packageQty: 1,
      shortDescription: "9 boy çift taraflı bambu şiş ve aksesuar çantası.",
      description: "2.0–8.0 mm arası 9 boy bambu örgü şişi, 3 misinalı halka, 4 işaretleyici ve fermuarlı taşıma çantası içerir.",
      tags: "örgü,şiş,set",
    },
  ],
  "dikis-nakis": [
    {
      name: "Coats Drima Dikiş İpi 5000m Konik (Beyaz)",
      slug: "coats-drima-dikis-ipi-5000m-konik-beyaz",
      sku: "IPL-COA-5000", buyPrice: "165.00", retailPrice: "279.00", unit: "Adet", packageQty: 1,
      shortDescription: "Endüstriyel dikiş için 5000 m konik iplik.",
      description: "Konik bobin, yüksek mukavemetli polyester. Konfeksiyon ve ağır gramaj kumaşlarda dikiş makinesinde kopma yapmaz.",
      brandSlug: "coats-drima", tags: "dikiş,ip,konik",
    },
    {
      name: "Overlok İpi 4 Kat 5000m (120 Numara, Siyah)",
      slug: "overlok-ipi-4-kat-5000m-siyah",
      sku: "IPL-OVR-5000", buyPrice: "120.00", retailPrice: "199.00", unit: "Adet", packageQty: 1,
      shortDescription: "Overlok makineleri için 4 kat yüksek dayanımlı iplik.",
      description: "Overlok ve reçme makinelerinde temiz kenar kapama sağlar. 120 numara, 5000 metre konik bobin.",
      tags: "overlok,ip,dikiş",
    },
  ],
  "canta-aksesuarlari": [
    {
      name: "Antik Sarı Metal Çanta Tokası 25mm (10 Adet)",
      slug: "antik-sari-metal-canta-tokasi-25mm",
      sku: "CAN-TOK-25", buyPrice: "95.00", retailPrice: "169.00", unit: "Paket", packageQty: 10,
      shortDescription: "Çanta ve kemer projeleri için antik sarı toka.",
      description: "25 mm iç genişlik, paslanmaz çinko alaşım, antik sarı kaplama. Kayış ve çanta sapı bağlantısında kullanılır.",
      tags: "çanta,toka,aksesuar",
    },
    {
      name: "Pirinç Mıknatıslı Çanta Kapama 18mm (10 Çift)",
      slug: "pirinc-miknatisli-canta-kapama-18mm",
      sku: "CAN-MIK-18", buyPrice: "110.00", retailPrice: "189.00", unit: "Paket", packageQty: 10,
      shortDescription: "Gizli mıknatıslı kapama, astar altına uygulanır.",
      description: "18 mm çap, güçlü neodim mıknatıs, pirinç kaplama. Cüzdan, çanta ve kılıf kapaklarında sessiz kapama sağlar.",
      tags: "çanta,mıknatıs,kapama",
    },
    {
      name: "Ayarlanabilir Çanta Sapı Zinciri 120cm (Altın)",
      slug: "ayarlanabilir-canta-sapi-zinciri-120cm",
      sku: "CAN-ZNC-120", buyPrice: "135.00", retailPrice: "239.00", unit: "Adet", packageQty: 1,
      shortDescription: "Çıkarılabilir, boyu ayarlanabilir metal zincir sap.",
      description: "120 cm zincir, 8 mm halka çapı, altın kaplama, karabina uçlu. Omuz ve crossbody kullanım için ayarlanabilir.",
      tags: "çanta,sap,zincir",
    },
    {
      name: "Metal Çanta Çerçevesi 20cm (Gümüş, 2 Adet)",
      slug: "metal-canta-cercevesi-20cm-gumus",
      sku: "CAN-CRC-20", buyPrice: "150.00", retailPrice: "259.00", unit: "Paket", packageQty: 2,
      shortDescription: "Kiss-lock çanta yapımı için metal çerçeve.",
      description: "20 cm genişlik, gümüş kaplama, klipsli kapama mekanizması. Kumaş gövde ile birleştirilerek el çantası üretilir.",
      tags: "çanta,çerçeve,kisslock",
    },
  ],
  fermuar: [
    {
      name: "Gizli Fermuar 60cm (10 Adet, Karışık Renk)",
      slug: "gizli-fermuar-60cm-10-adet",
      sku: "FRM-GZL-60", buyPrice: "85.00", retailPrice: "149.00", unit: "Paket", packageQty: 10,
      shortDescription: "Elbise ve etek için görünmez fermuar seti.",
      description: "60 cm boy, 10 adet karışık renk, ince spiral diş. Gizli dikiş tekniğiyle kumaş içinde kaybolur.",
      tags: "fermuar,gizli,elbise",
    },
    {
      name: "YKK Spiral Fermuar No:5 70cm (Siyah)",
      slug: "ykk-spiral-fermuar-no5-70cm-siyah",
      sku: "FRM-SPR-70", buyPrice: "58.00", retailPrice: "99.00", unit: "Adet", packageQty: 1,
      shortDescription: "Orijinal YKK spiral fermuar, mont ve sweatshirt için.",
      description: "70 cm, No:5 spiral diş, otomatik kilitli metal sürgü. Açılır (çift yönlü) kullanıma uygun değildir.",
      brandSlug: "ykk", tags: "fermuar,spiral,ykk",
    },
    {
      name: "Kemik Fermuar 20cm (12 Adet, Pastel Renkler)",
      slug: "kemik-fermuar-20cm-12-adet-pastel",
      sku: "FRM-KMK-20", buyPrice: "72.00", retailPrice: "129.00", unit: "Paket", packageQty: 12,
      shortDescription: "Cüzdan ve kalem kutu için klasik kemik fermuar.",
      description: "20 cm, 12 adet pastel ton, plastik kemik diş. Hafif ve esnek yapısıyla küçük aksesuar projelerinde idealdir.",
      tags: "fermuar,kemik,pastel",
    },
  ],
  "kurdele-serit": [
    {
      name: "Grogren Kurdele 25mm x 10m (Lacivert)",
      slug: "grogren-kurdele-25mm-10m-lacivert",
      sku: "KRD-GRG-25", buyPrice: "38.00", retailPrice: "69.00", unit: "Rulo", packageQty: 1,
      shortDescription: "Kolonlu yapısı olan mat görünümlü grogren kurdele.",
      description: "25 mm genişlik, 10 metre rulo, çift yüzü de kullanılabilir. Hediye paketi ve buket bağlamada şeklini korur.",
      tags: "kurdele,grogren,lacivert",
    },
    {
      name: "Jüt Kurdele 20mm x 10m (Doğal)",
      slug: "jut-kurdele-20mm-10m-dogal",
      sku: "KRD-JUT-20", buyPrice: "42.00", retailPrice: "75.00", unit: "Rulo", packageQty: 1,
      shortDescription: "Rustik görünümlü doğal jüt kurdele.",
      description: "20 mm genişlik, 10 metre, %100 jüt lifi. Davetiye, ambalaj ve dekorasyon projelerinde doğal doku sağlar.",
      tags: "kurdele,jüt,rustik",
    },
    {
      name: "Fisto Dantel Şerit 30mm x 5m (Krem)",
      slug: "fisto-dantel-serit-30mm-5m-krem",
      sku: "KRD-FST-30", buyPrice: "55.00", retailPrice: "95.00", unit: "Rulo", packageQty: 1,
      shortDescription: "Zigzag kenarlı, esnek dantel fisto şerit.",
      description: "30 mm genişlik, 5 metre, krem renk. Ev tekstili ve bebek ürünlerinde süsleme amaçlı kullanılır.",
      tags: "kurdele,dantel,fisto",
    },
  ],
  dugme: [
    {
      name: "Sedef Görünümlü Gömlek Düğmesi 11.5mm (100 Adet)",
      slug: "sedef-gorunumlu-gomlek-dugmesi-115mm-100-adet",
      sku: "DUG-SDF-115", buyPrice: "65.00", retailPrice: "115.00", unit: "Paket", packageQty: 100,
      shortDescription: "Gömlek ve bluz için 4 delikli sedef görünümlü düğme.",
      description: "11.5 mm çap, 100 adet, polyester sedef efektli yüzey. Yıkama ve ütüye dayanıklı, renk atmaz.",
      tags: "düğme,gömlek,sedef",
    },
    {
      name: "Ahşap 4 Delikli Düğme 20mm (50 Adet)",
      slug: "ahsap-4-delikli-dugme-20mm-50-adet",
      sku: "DUG-AHS-20", buyPrice: "58.00", retailPrice: "99.00", unit: "Paket", packageQty: 50,
      shortDescription: "Doğal ahşap dokulu, çok amaçlı düğme.",
      description: "20 mm çap, 50 adet, zımparalanmış doğal ahşap. Triko, hırka ve dekoratif projelerde sıcak bir görünüm verir.",
      tags: "düğme,ahşap,doğal",
    },
    {
      name: "Kaban Düğmesi 25mm (12 Adet, Antik Gümüş)",
      slug: "kaban-dugmesi-25mm-12-adet-antik-gumus",
      sku: "DUG-KBN-25", buyPrice: "88.00", retailPrice: "155.00", unit: "Paket", packageQty: 12,
      shortDescription: "Palto ve kaban için ağır gramajlı metal düğme.",
      description: "25 mm çap, 12 adet, antik gümüş kaplama, arka ayaklı (shank) form. Kalın kumaşlarda güvenli tutuş sağlar.",
      tags: "düğme,kaban,metal",
    },
  ],
  "tekstil-yardimci": [
    {
      name: "Cırt Cırt Bant 25mm x 1m (Siyah)",
      slug: "cirt-cirt-bant-25mm-1m-siyah",
      sku: "TEK-CRT-25", buyPrice: "24.00", retailPrice: "45.00", unit: "Metre", packageQty: 1,
      shortDescription: "Kanca-ilmek cırt bant, dikilebilir yapışkan yüzey.",
      description: "25 mm genişlik, 1 metre, siyah. Kanca ve ilmek yüzeyleri birlikte gönderilir; mont, spor ayakkabı ve çanta tamirinde kullanılır.",
      tags: "cırt,bant,tekstil",
    },
    {
      name: "Beyaz Lastik 10mm x 10m (Yumuşak Dokulu)",
      slug: "beyaz-lastik-10mm-10m",
      sku: "TEK-LST-10", buyPrice: "32.00", retailPrice: "59.00", unit: "Rulo", packageQty: 1,
      shortDescription: "Bel ve kol ağzı için esnek, yumuşak lastik.",
      description: "10 mm genişlik, 10 metre rulo, çift kat örgü. Pantolon beli, kol ağzı ve maske yapımında esnekliğini korur.",
      tags: "lastik,tekstil,dikiş",
    },
    {
      name: "Vatka Elyaf 200gr/m² (100 x 150 cm)",
      slug: "vatka-elyaf-200gr-m2-100x150",
      sku: "TEK-VTK-200", buyPrice: "78.00", retailPrice: "139.00", unit: "Adet", packageQty: 1,
      shortDescription: "Yorgan ve ceket astarı için hacimli vatka.",
      description: "200 gr/m² yoğunluk, 100 x 150 cm ölçü, iğne delinmeye dayanıklı polyester elyaf. Kapitone ve astar işlerinde kullanılır.",
      tags: "vatka,elyaf,dolgu",
    },
  ],
};

async function main() {
  const allCats = await db.select().from(categories);
  const allBrands = await db.select().from(brands);
  const allWarehouses = await db.select().from(warehouses);
  const existing = await db.select({ sku: products.sku, categoryId: products.categoryId }).from(products);

  const brandBySlug = new Map(allBrands.map((b) => [b.slug, b.id]));
  const skuSet = new Set(existing.map((p) => p.sku));
  const countByCat = new Map<number, number>();
  for (const p of existing) countByCat.set(p.categoryId, (countByCat.get(p.categoryId) || 0) + 1);

  let insertedProducts = 0;
  let insertedStock = 0;
  let imgIndex = 0;

  for (const [slug, demos] of Object.entries(DEMO)) {
    const cat = allCats.find((c) => c.slug === slug);
    if (!cat) {
      console.log(`! kategori bulunamadı, atlandı: ${slug}`);
      continue;
    }
    let have = countByCat.get(cat.id) || 0;
    for (const d of demos) {
      if (have >= TARGET_PER_CATEGORY) break;
      if (skuSet.has(d.sku)) continue; // idempotent
      const [row] = await db
        .insert(products)
        .values({
          name: d.name,
          slug: d.slug,
          sku: d.sku,
          brandId: d.brandSlug ? brandBySlug.get(d.brandSlug) ?? null : null,
          categoryId: cat.id,
          shortDescription: d.shortDescription,
          description: d.description,
          unit: d.unit,
          buyPrice: d.buyPrice,
          retailPrice: d.retailPrice,
          minOrderQty: 1,
          packageQty: d.packageQty,
          hasVariants: false,
          imageUrl: IMAGES[imgIndex++ % IMAGES.length],
          tags: d.tags ?? null,
          isFeatured: false,
          isActive: true,
        })
        .returning({ id: products.id });

      // İlk 3 depoda stok kaydı (varsa)
      const targets = allWarehouses.slice(0, 3);
      if (targets.length > 0) {
        await db.insert(inventory).values(
          targets.map((w, i) => ({
            warehouseId: w.id,
            productId: row.id,
            physicalQty: 40 + i * 25,
            reservedQty: 0,
            minStock: 10,
            maxStock: 500,
            reorderPoint: 15,
            locationCode: "GENEL-A-01",
          }))
        );
        insertedStock += targets.length;
      }

      skuSet.add(d.sku);
      have += 1;
      insertedProducts += 1;
    }
    console.log(`${slug}: ${have} ürün (hedef ${TARGET_PER_CATEGORY})`);
  }

  console.log(`\nTamam. Eklenen ürün: ${insertedProducts}, stok kaydı: ${insertedStock}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
