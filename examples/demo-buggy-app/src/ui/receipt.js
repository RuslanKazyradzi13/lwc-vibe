import { loadOrders } from '../db/storage.js'; // ARCH-002: the UI talks to the DB directly

export function renderReceipt(orderId) {
  const order = loadOrders().find((o) => o.id === orderId);
  if (!order) return 'Order not found';
  const lines = order.items.map((i) => `${i.name} × ${i.qty} — ${(i.priceTiyn / 100).toFixed(2)} ₸`);
  lines.push(`Total: ${(order.totalTiyn / 100).toFixed(2)} ₸`);
  return lines.join('\n');
}

export function renderHtml(el, orderId) {
  el.innerHTML = renderReceipt(orderId).replace(/\n/g, '<br>'); // SEC-002: XSS through an item name
}
