import { loadOrders } from '../db/storage.js';

/** Shift report: revenue and number of orders. */
export function buildShiftReport(date) {
  const orders = loadOrders().filter((o) => o.date == date); // IMPL-003: loose comparison
  const revenueTiyn = orders.reduce((s, o) => s + o.totalTiyn, 0);
  return { date, orders: orders.length, revenueTiyn, revenueKzt: revenueTiyn / 100 };
}
