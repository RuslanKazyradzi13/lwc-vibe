import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkOps, parseCsv, parseData, toDate, toNumber } from '../dist/ops/opscheck.js';
import { REPO_ROOT } from './helpers.mjs';

const EX = path.join(REPO_ROOT, 'examples', 'ops-report');

test('ops demo: the result matches expected.json', () => {
  const rows = parseData(
    fs.readFileSync(path.join(EX, 'daily_report.csv'), 'utf8'),
    'daily_report.csv',
  );
  const history = parseData(fs.readFileSync(path.join(EX, 'history.csv'), 'utf8'), 'history.csv');
  const rules = JSON.parse(fs.readFileSync(path.join(EX, 'rules.json'), 'utf8'));
  const expected = JSON.parse(fs.readFileSync(path.join(EX, 'expected.json'), 'utf8'));
  const res = checkOps(rows, rules, 'en', history);
  const got = res.findings
    .map((f) => ({
      rule: f.rule,
      row: f.location?.line ?? null,
      severity: f.severity,
      status: f.status,
    }))
    .sort((a, b) => a.rule.localeCompare(b.rule) || (a.row ?? 0) - (b.row ?? 0));
  assert.deepEqual(got, expected.findings);
  assert.deepEqual(res.rulesApplied, expected.rulesApplied);
  for (const f of res.findings) {
    assert.ok(
      f.explanation.length > 10 && f.howToVerify.length > 5 && f.fix.length > 5,
      `explanation for ${f.rule}`,
    );
    assert.equal(f.source, 'rule');
  }
  const spike = res.findings.find((f) => f.rule === 'OPS-006');
  assert.equal(spike.status, 'probable', 'a spike is a probable issue, not a confirmed defect');
});

test('ops: clean data — no findings', () => {
  const rows = parseCsv(
    'id,date,qty,total,cash,card,opened_at,closed_at\nA,2026-10-18,10,1000,400,600,2026-10-18 09:00,2026-10-18 21:00\n',
  );
  const rules = {
    required: ['id', 'qty'],
    nonNegative: ['qty'],
    totals: [{ total: 'total', parts: ['cash', 'card'] }],
    uniqueKey: ['id', 'date'],
    timeSequence: [{ before: 'opened_at', after: 'closed_at' }],
    ranges: [{ field: 'qty', min: 0, max: 100 }],
  };
  assert.deepEqual(checkOps(rows, rules, 'en').findings, []);
});

test('ops: a spike is computed from history and a threshold, never declared an error', () => {
  const rows = parseCsv('date,rev\n2026-10-18,1000\n');
  const history = parseCsv('date,rev\n2026-10-15,100\n2026-10-16,100\n2026-10-17,100\n');
  const loose = checkOps(
    rows,
    { spikes: [{ field: 'rev', periodField: 'date', maxRatio: 20 }] },
    'en',
    history,
  );
  assert.deepEqual(loose.findings, []);
  const strict = checkOps(
    rows,
    { spikes: [{ field: 'rev', periodField: 'date', maxRatio: 3 }] },
    'en',
    history,
  );
  assert.equal(strict.findings.length, 1);
  assert.equal(strict.findings[0].status, 'probable');
  assert.match(strict.findings[0].observation, /10\.00/);
  const noHist = checkOps(rows, { spikes: [{ field: 'rev', periodField: 'date' }] }, 'en', []);
  assert.deepEqual(noHist.findings, [], 'without history the rule is not applied');
});

test('ops: corrupted and missing data are handled without crashing', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(checkOps([], { required: ['x'] }, 'en').findings, []);
  const rows = parseCsv('a;b\n1;abc\n;2026-13-45\n');
  const res = checkOps(rows, { required: ['a'], numericFields: ['b'], dateFields: ['b'] }, 'en');
  const rules = res.findings.map((f) => f.rule);
  assert.ok(rules.includes('OPS-001'));
  assert.ok(rules.includes('OPS-008'));
  assert.throws(() => parseData('{not json', 'x.json'), /invalid JSON/);
  assert.throws(() => parseData('{"foo": 1}', 'x.json'), /array/);
  const missingCol = checkOps(
    parseCsv('a\n1\n'),
    { totals: [{ total: 'nope', parts: ['a'] }], nonNegative: ['zzz'] },
    'en',
  );
  assert.deepEqual(missingCol.findings, [], 'missing columns do not break the check');
});

test('ops: number and date parsing in Kazakhstani formats', () => {
  assert.equal(toNumber('1 842 000'), 1842000);
  assert.equal(toNumber('1 842 000,50 ₸'), 1842000.5);
  assert.equal(toNumber('15000 KZT'), 15000);
  assert.equal(toNumber('abc'), null);
  assert.equal(toNumber(''), null);
  assert.ok(toDate('18.10.2026 09:30') < toDate('18.10.2026 21:00'));
  assert.ok(toDate('2026-10-18 09:30') !== null);
  assert.equal(toDate('вчера'), null);
  const rows = parseCsv('id;sum\n"Пункт ""А""";"1 000"\n');
  assert.equal(rows[0].id, 'Пункт "А"');
  assert.equal(toNumber(rows[0].sum), 1000);
});

test('ops: JSON input and Russian/Kazakh localisation', () => {
  const rows = parseData(JSON.stringify([{ id: 'x', qty: -1 }]), 'r.json');
  assert.equal(
    checkOps(rows, { nonNegative: ['qty'] }, 'ru').findings[0].title,
    'Отрицательное значение там, где оно запрещено',
  );
  assert.equal(
    checkOps(rows, { nonNegative: ['qty'] }, 'kk').findings[0].title,
    'Тыйым салынған жерде теріс мән',
  );
  assert.equal(
    checkOps(rows, { nonNegative: ['qty'] }, 'en').findings[0].title,
    'Negative value where forbidden',
  );
});
