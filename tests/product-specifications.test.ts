import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProductSpecifications, productSpecificationsFromPairs, validateProductSpecifications } from "../src/lib/product-specifications";

test("Teknik özellikleri Türkçe ve İngilizce kaynak etiketlerinden ayırır", () => {
  assert.deepEqual(productSpecificationsFromPairs([
    ["Artikel No", "260"], ["Karışım", "%10 Bambu - %90 Akrilik"], ["Lenght", "100 gr - 240 m"],
    ["Yarn Type", "Klasik"], ["Ambalaj", "5 x 100 gr"], ["Şiş No", "4-5"], ["Crochet Needle", "2-4"],
    ["Sezon", "Sonbahar / Kış"], ["Başka", "atlanır"],
  ]), { articleNo: "260", composition: "%10 Bambu - %90 Akrilik", length: "100 gr - 240 m", yarnType: "Klasik", packaging: "5 x 100 gr", knittingNeedle: "4-5", crochetNeedle: "2-4", season: "Sonbahar / Kış" });
});

test("Teknik özellik doğrulaması boş, bozuk ve bilinmeyen alanları güvenli işler", () => {
  assert.deepEqual(validateProductSpecifications({ articleNo: " 260 ", composition: " " }), { articleNo: "260" });
  assert.deepEqual(validateProductSpecifications({ size: " 20 mm " }), { size: "20 mm" });
  assert.equal(validateProductSpecifications({}), null);
  assert.equal(validateProductSpecifications(null), null);
  assert.throws(() => validateProductSpecifications({ arbitrary: "x" }));
  assert.throws(() => validateProductSpecifications({ length: "x".repeat(301) }));
  assert.throws(() => validateProductSpecifications({ length: 100 }));
  assert.deepEqual(parseProductSpecifications('{"articleNo":"260"}'), { articleNo: "260" });
  assert.deepEqual(parseProductSpecifications('not json'), {});
  assert.deepEqual(productSpecificationsFromPairs([["Ölçü", "20 mm"]]), { size: "20 mm" });
  assert.deepEqual(productSpecificationsFromPairs([["Size", "50 cm"]]), { size: "50 cm" });
});
