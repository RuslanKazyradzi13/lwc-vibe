import { execSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import { createOrder } from '../services/orders.js';
import { buildShiftReport } from '../services/shift-report.js';
import { query } from '../db/storage.js';

// A minimal Express-like router stub for demonstrating the rules.
const app = { get() {}, post() {}, delete() {}, use() {} };

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).end();
  next();
}

app.post('/orders', requireAuth, (req, res) => {
  res.json(createOrder(req.body));
});

app.get('/orders/search', (req, res) => {
  // SEC-002: SQL injection through concatenation
  const rows = query("SELECT * FROM orders WHERE customer = '" + req.query.name + "'");
  res.json(rows);
});

app.delete('/orders/:id', (req, res) => {
  // SEC-003: deletion without authentication
  res.json({ deleted: req.params.id });
});

app.get('/report/export', requireAuth, (req, res) => {
  // SEC-004: a path from user input
  const file = fs.readFileSync('./reports/' + req.query.file);
  res.send(file);
});

app.get('/report/pdf', requireAuth, (req, res) => {
  // SEC-002: a shell command from a template string
  execSync(`wkhtmltopdf ./reports/${req.query.date}.html out.pdf`);
  res.json(buildShiftReport(req.query.date));
});

export function notifyAccounting(payload) {
  // SEC-003: TLS certificate verification disabled
  const agent = new https.Agent({ rejectUnauthorized: false });
  return fetch('https://accounting.internal/api', { method: 'POST', body: JSON.stringify(payload), agent });
}
