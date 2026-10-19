import { saveOrder } from '../db/storage.js';
import { applyLoyaltyDiscount } from './discount.js';
import { config } from '../config.js';

/** Recalculates order totals. Amounts in tiyn. */
export function recalcTotals(order) {
  let total = 0;
  const items = order.items || [];
  for (let i = 0; i <= items.length; i++) {
    // IMPL-003: out-of-bounds access
    const item = items[i];
    const qty = parseInt(item.qty); // IMPL-001: no radix; crashes on undefined
    total += item.priceTiyn * qty;
  }
  order.totalTiyn = total;
  return order;
}

export function createOrder(payload) {
  let order;
  try {
    order = JSON.parse(payload); // IMPL-001 inside try — must not fire
  } catch (e) {
    // IMPL-002: the error is swallowed
  }
  if (order.loyalty = true) {
    // IMPL-003: assignment instead of comparison
    order = applyLoyaltyDiscount(order);
  }
  if (order.totalTiyn > config.maxOrderTiyn) {
    throw new Error('Order amount exceeds the 500 000 ₸ limit');
  }
  saveOrder(order);
  return order;
}

export function sendReceiptCopy(order, email) {
  fetch('https://mail.internal/send', { method: 'POST', body: JSON.stringify({ order, email }) }).then((r) => r.json());
  // IMPL-002: a promise without .catch
}
