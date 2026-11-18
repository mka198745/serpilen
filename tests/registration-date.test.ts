import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRegistrationDate } from "../src/lib/registration-date";

test("Kayıt tarihi Türkçe olarak gösterilir", () => {
  const value = "2026-11-17T12:30:00.000Z";
  assert.equal(formatRegistrationDate(value), new Date(value).toLocaleDateString("tr-TR"));
});

test("Eksik veya geçersiz tarihler Invalid Date göstermez", () => {
  for (const value of [undefined, null, "", "not a date", {}, 0]) {
    assert.equal(formatRegistrationDate(value), "—");
  }
});
