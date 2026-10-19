/** Loyalty-card discount: 10 % on regular items. */
export function applyLoyaltyDiscount(order) {
  const items = order.items || [];
  let discounted = 0;
  for (const item of items) {
    if (item.special) continue;
    const base = item.priceTiyn * item.qty;
    const discount = Math.round(base * 0.1);
    item.discountTiyn = discount;
    discounted += discount;
  }
  order.discountTiyn = discounted;
  order.totalTiyn = (order.totalTiyn || 0) - discounted;
  return order;
}

/** Staff discount: 20 % (copied from applyLoyaltyDiscount — IMPL-007). */
export function applyStaffDiscount(order) {
  const items = order.items || [];
  let discounted = 0;
  for (const item of items) {
    if (item.special) continue;
    const base = item.priceTiyn * item.qty;
    const discount = Math.round(base * 0.2);
    item.discountTiyn = discount;
    discounted += discount;
  }
  order.discountTiyn = discounted;
  order.totalTiyn = (order.totalTiyn || 0) - discounted;
  return order;
}
