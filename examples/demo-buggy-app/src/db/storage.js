import fs from 'node:fs';
import { config } from '../config.js';
import { recalcTotals } from '../services/orders.js'; // cyclic import (ARCH-001)

export function loadOrders() {
  if (!fs.existsSync(config.dbPath)) return [];
  const raw = fs.readFileSync(config.dbPath, 'utf8');
  return JSON.parse(raw); // IMPL-001: no try/catch
}

export function saveOrder(order) {
  const orders = loadOrders();
  orders.push(recalcTotals(order));
  fs.writeFileSync(config.dbPath, JSON.stringify(orders, null, 2));
}

export function query(sql) {
  // SQL access stub for the demo
  return [];
}
