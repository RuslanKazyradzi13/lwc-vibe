import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, radar, rulesOf } from './helpers.mjs';
import { render } from '../dist/core/report.js';
import { applySuppressions } from '../dist/core/radar.js';

const DEMO = path.join(REPO_ROOT, 'examples', 'demo-buggy-app');

test('demo-buggy-app: every expected rule fires (EXPECTED_FINDINGS.md)', async () => {
  const r = await radar(DEMO);
  const rules = rulesOf(r.findings);
  const expected = fs
    .readFileSync(path.join(DEMO, 'EXPECTED_FINDINGS.md'), 'utf8')
    .match(/^\| `([A-Z]+-\d{3})`/gm)
    .map((m) => m.replace(/^\| `|`$/g, ''));
  assert.ok(expected.length >= 20, 'the expected rule list is not empty');
  const missing = expected.filter(
    (id) => !rules.has(id) && !r.suppressed.some((f) => f.rule === id),
  );
  assert.deepEqual(missing, [], `rules did not fire: ${missing.join(', ')}`);
  // Suppression with a reason: the finding does not disappear silently.
  assert.ok(r.suppressed.length >= 1);
  assert.ok(
    r.suppressed.every((f) => f.status === 'false-positive' && f.suppressed.reason.length > 10),
  );
  // Every finding has all mandatory fields.
  for (const f of r.findings) {
    for (const k of [
      'id',
      'rule',
      'category',
      'severity',
      'status',
      'source',
      'title',
      'observation',
      'explanation',
      'consequence',
      'howToVerify',
      'fix',
    ]) {
      assert.ok(f[k] && String(f[k]).length > 0, `${f.id}: field ${k}`);
    }
    assert.match(f.id, /^[A-Z]+-\d{3}-[0-9a-f]{8}$/);
  }
  // Identifiers are stable between runs.
  const r2 = await radar(DEMO);
  assert.deepEqual(r2.findings.map((f) => f.id).sort(), r.findings.map((f) => f.id).sort());
});

test('demo-buggy-app: the report renders as text/md/json in three languages', async () => {
  for (const lang of ['ru', 'kk', 'en']) {
    const r = await radar(DEMO, { lang });
    const text = render(r, 'text');
    const md = render(r, 'md');
    const json = JSON.parse(render(r, 'json'));
    assert.ok(text.includes(r.findings[0].id));
    assert.ok(md.includes('| ID |'));
    assert.equal(json.findings.length, r.findings.length);
    assert.equal(json.lang, lang);
    assert.ok(/критич|critical|критикалық/i.test(text), lang);
  }
});

test('applySuppressions: by id, by rule, by file; critical ones are counted in the summary', () => {
  const f = (id, rule, file, severity = 'low') => ({
    id,
    rule,
    category: 'security',
    severity,
    status: 'probable',
    source: 'rule',
    location: { file },
    title: '',
    observation: '',
    explanation: '',
    consequence: '',
    howToVerify: '',
    fix: '',
  });
  const list = [
    f('SEC-001-aaaaaaaa', 'SEC-001', 'a.js', 'critical'),
    f('SEC-002-bbbbbbbb', 'SEC-002', 'b.js'),
    f('SEC-002-cccccccc', 'SEC-002', 'c.js'),
  ];
  const { kept, suppressed } = applySuppressions(list, [
    {
      match: { id: 'SEC-001-aaaaaaaa' },
      reason: 'example key in documentation',
      date: '2026-10-19',
    },
    {
      match: { rule: 'SEC-002', file: 'b.js' },
      reason: 'parameterised at the driver level',
      date: '2026-10-19',
    },
    { match: {}, reason: 'an empty match must not suppress anything', date: '2026-10-19' },
  ]);
  assert.deepEqual(
    kept.map((x) => x.id),
    ['SEC-002-cccccccc'],
  );
  assert.equal(suppressed.length, 2);
  assert.ok(suppressed.every((x) => x.status === 'false-positive'));
});

test('radar: category filter and only-paths', async () => {
  const r = await radar(DEMO, { categories: ['security'], only: ['src/config.js'] });
  assert.ok(r.findings.length > 0);
  assert.ok(
    r.findings.every((f) => f.category === 'security' && f.location.file === 'src/config.js'),
  );
});
