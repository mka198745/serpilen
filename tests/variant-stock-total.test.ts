import test from 'node:test';
import assert from 'node:assert/strict';
import { variantStockTotal, variantStockTarget } from '../src/lib/variant-stock-total';

test('Toplam yalnızca bütün varyant stokları geçerli tam sayıysa hesaplanır', () => {
  assert.equal(variantStockTotal([{initialStock:'7'},{initialStock:'3'},{initialStock:'0'}]),10);
  assert.equal(variantStockTotal([]),0);
  for (const invalid of ['', '-1', '1.5', '1e3', ' 2', '100000001']) assert.equal(variantStockTotal([{initialStock:'2'},{initialStock:invalid}]),null,invalid);
  assert.equal(variantStockTotal(Array.from({length:50},()=>({initialStock:'100000000'}))),5_000_000_000);
  assert.equal(variantStockTotal(Array.from({length:51},()=>({initialStock:'0'}))),null);
});

test('Elle girilen hedef sıfır veya toplam kapasiteye kadar tam sayıdır', () => {
  assert.equal(variantStockTarget('0'),0);
  assert.equal(variantStockTarget('5000000000'),5_000_000_000);
  for (const invalid of ['', '-1', '2.1', '1e6', '5000000001', '9007199254740992']) assert.equal(variantStockTarget(invalid),null,invalid);
});
