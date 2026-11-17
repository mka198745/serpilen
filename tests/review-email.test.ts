import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidReviewEmail, REVIEW_EMAIL_ERROR } from "../src/lib/review-email";

test("Yorum için normal ve etiketli e-posta adresleri kabul edilir", () => {
  for (const email of ["isim@example.com", "isim.soyisim+magaza@sub.example.co.uk", "  Deniz@EXAMPLE.COM  ", "kullanici@xn--r8jz45g.xn--zckzah"]) {
    assert.equal(isValidReviewEmail(email), true, email);
  }
});

test("Boş ve biçimi geçersiz e-postalar reddedilir", () => {
  for (const email of [undefined, null, 123, "", " ", "abc", "a@b", "@example.com", "a@", "a@@example.com", "a..b@example.com", ".a@example.com", "a.@example.com", "a@-example.com", "a@example-.com", "a@example..com", "a@example.c", "a@exa mple.com", `${"a".repeat(65)}@example.com`, `a@${"x".repeat(64)}.com`]) {
    assert.equal(isValidReviewEmail(email), false, String(email));
  }
  assert.equal(REVIEW_EMAIL_ERROR, "Doğru e-posta adresi giriniz.");
});
