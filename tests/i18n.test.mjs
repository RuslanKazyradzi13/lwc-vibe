import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, describe, fill, ui } from '../dist/i18n/index.js';

const LANGS = ['ru', 'kk', 'en'];

test('i18n: the ru/kk/en catalogs have the same rule and UI keys', () => {
  const base = catalog('en');
  for (const lang of LANGS) {
    const c = catalog(lang);
    assert.deepEqual(Object.keys(c.rules).sort(), Object.keys(base.rules).sort(), `rules ${lang}`);
    assert.deepEqual(Object.keys(c.ui).sort(), Object.keys(base.ui).sort(), `ui ${lang}`);
    for (const [rule, t] of Object.entries(c.rules)) {
      for (const k of ['title', 'observation', 'explanation', 'consequence', 'verify', 'fix']) {
        assert.ok(t[k] && t[k].trim().length > 0, `${lang} ${rule}.${k} is empty`);
      }
    }
  }
});

test('i18n: observation placeholders match across languages', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort();
  const base = catalog('en');
  for (const lang of ['ru', 'kk']) {
    for (const [rule, t] of Object.entries(catalog(lang).rules)) {
      assert.deepEqual(ph(t.observation), ph(base.rules[rule].observation), `${lang} ${rule}`);
    }
  }
});

test('i18n: substitution and fallback', () => {
  assert.equal(fill('a {x} b {y}', { x: 1 }), 'a 1 b ?');
  assert.equal(ui('kk', 'severity.critical'), 'Критикалық');
  assert.equal(ui('en', 'no.such.key'), 'no.such.key');
  const d = describe('en', 'SEC-001', { kind: 'AWS', snippet: 'x' });
  assert.equal(d.title, 'Secret in source code');
  assert.equal(describe('ru', 'UNKNOWN-999', { snippet: 'q' }).observation, 'q');
});

test('i18n: Kazakh letters survive (UTF-8)', () => {
  const kk = catalog('kk');
  assert.match(kk.ui['category.requirements'], /Талаптар/);
  assert.match(JSON.stringify(kk), /[әғқңөұүһі]/);
});
