import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLoyaltyDiscount } from '../src/services/discount.js';

test('10 % discount on regular items', () => {
  const order = { items: [{ name: 'Latte', priceTiyn: 150000, qty: 2 }], totalTiyn: 300000 };
  const r = applyLoyaltyDiscount(order);
  assert.equal(r.discountTiyn, 30000);
  assert.equal(r.totalTiyn, 270000);
});
