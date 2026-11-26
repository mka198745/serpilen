import test from "node:test";
import assert from "node:assert/strict";
import { validateNewProductVariants, variantSkuBase, VariantValidationError } from "../src/lib/new-product-variants";
import { variantLabel } from "../src/lib/variant-label";

const base = { colorName: "Siyah", colorHex: "#112233", size: "20 mm", length: "100m", sku: "", barcode: "", retailPrice: "0.00", buyPrice: "", initialStock: "7" };

test("varyant taslaklarını doğrular ve okunur SKU kökü üretir", () => {
  const [v] = validateNewProductVariants([base]);
  assert.equal(v.initialStock, 7); assert.equal(v.retailPrice, "0.00");
  assert.equal(variantSkuBase("İPLİK", v), "IPLIK-SIYAH-20-MM");
  assert.equal(variantLabel(v), "Siyah · 20 mm · 100m");
  assert.deepEqual(validateNewProductVariants(undefined), []);
});

test("geçersiz stok, fiyat, renk, özellik, tekrar ve aşırı sayıyı reddeder", () => {
  for (const bad of [
    { ...base, initialStock: "-1" }, { ...base, initialStock: "1.5" }, { ...base, initialStock: "" },
    { ...base, retailPrice: "NaN" }, { ...base, buyPrice: "-4" }, { ...base, retailPrice: "3.999" },
    { ...base, colorHex: "blue" }, { ...base, colorName: "", size: "", length: "" },
    { ...base, barcode: "1".repeat(81) },
  ]) assert.throws(() => validateNewProductVariants([bad]), VariantValidationError);
  assert.throws(() => validateNewProductVariants([base, { ...base, colorName: "siyah" }]), /zaten eklenmiş/);
  assert.throws(() => validateNewProductVariants(Array(51).fill(base)), /50/);
  assert.throws(() => validateNewProductVariants({}), VariantValidationError);
});
