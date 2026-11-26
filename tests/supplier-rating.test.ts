import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSupplierRating, parsePaymentTermDays, type SupplierRatingOrder } from '../src/lib/supplier-rating';

const order = (id: number, changes: Partial<SupplierRatingOrder> = {}): SupplierRatingOrder => ({
  id, completedAt: id, completedDate: '2026-02-01', expectedDate: '2026-02-01',
  receivedQty: 10, returnedQty: 0, returnsCovered: true, ...changes,
});

test('en az üç tamamlanmış sipariş ve tüm güvenilir veriler gerekir', () => {
  assert.equal(calculateSupplierRating([order(1), order(2)], '30 Gün Vade', ['15 gün']).score, null);
  assert.equal(calculateSupplierRating([order(1), order(2), order(3, { returnsCovered: false })], '30 Gün Vade', ['15 gün']).score, null);
  assert.equal(calculateSupplierRating([order(1), order(2), order(3, { completedAt: null })], '30 Gün Vade', ['15 gün']).score, null);
  assert.equal(calculateSupplierRating([order(1), order(2), order(3)], '30 Gün Vade', []).score, null);
});

test('son üç teslim, iade miktarı ve karşılaştırmalı vade ağırlıklandırılır', () => {
  const result = calculateSupplierRating([order(1, {returnedQty: 10}), order(2), order(3, {completedDate:'2026-02-02', returnedQty: 3}), order(4)], '30 Gün Vade', ['15 Gün Vade', '30 gün', '60 gün']);
  assert.deepEqual(result.orderIds, [4, 3, 2]);
  assert.equal(result.delivery, 2/3);
  assert.equal(result.returns, 0.9);
  assert.equal(result.terms, 0.5);
  assert.equal(result.score, 3.8);
  assert.deepEqual(result.missing, []);
});

test('belirsiz vade, tarih ve tutarsız iade miktarı puan üretmez', () => {
  assert.equal(parsePaymentTermDays('peşin'), 0);
  assert.equal(parsePaymentTermDays('30/60 gün'), null);
  assert.equal(parsePaymentTermDays('30 gün sonra'), null);
  assert.equal(parsePaymentTermDays('9999 gün'), null);
  assert.equal(calculateSupplierRating([order(1),order(2),order(3,{expectedDate:'2026-02-30'})], '30 gün', ['30 gün']).score, null);
  assert.equal(calculateSupplierRating([order(1),order(2),order(3,{returnedQty:11})], '30 gün', ['30 gün']).score, null);
});
