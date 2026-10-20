import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeProject, cleanup, lwc, REPO_ROOT } from './helpers.mjs';

test('cli: help and version', () => {
  assert.equal(lwc(['--version'], REPO_ROOT).stdout.trim(), '0.2.0');
  const h = lwc(['--help'], REPO_ROOT);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /Anomaly Radar/);
  assert.equal(lwc(['nope'], REPO_ROOT).code, 2);
});

test('cli: full workflow — init → task → decision → build gate → run → claim → radar', () => {
  const dir = makeProject(
    {
      'src/a.js': 'export const a = 1;',
      'package.json': '{"name":"x","scripts":{"test":"node -e \\"process.exit(0)\\""}}',
    },
    { git: true },
  );
  try {
    assert.equal(lwc(['init', '--lang', 'xx'], dir).code, 2, 'an unknown language is rejected');
    let r = lwc(['init', '--lang', 'ru', '--level', 'beginner'], dir);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(dir, '.lwc', 'config.json')));
    assert.ok(fs.existsSync(path.join(dir, '.lwc', 'project-map.md')));
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.lwc', 'config.json'), 'utf8'));
    assert.equal(cfg.level, 'beginner');
    assert.equal(cfg.lang, 'ru');
    assert.equal(cfg.testCommand, 'npm test', 'the test command is detected from package.json');

    r = lwc(['task', 'start', 'Add a discount', '--scope', 'src/**,tests/**'], dir);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(lwc(['task', 'start', 'Second'], dir).code, 1, 'a second active task is refused');

    r = lwc(['task', 'stage', 'build'], dir);
    assert.equal(r.code, 1, 'build without decisions is blocked');
    assert.match(r.stderr, /decision/);

    r = lwc(['decision', 'add', 'The discount is computed in services/discount.js'], dir);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /^D1:/);
    r = lwc(['task', 'stage', 'build'], dir);
    assert.equal(r.code, 1, 'build with an unconfirmed decision is blocked');
    assert.equal(lwc(['decision', 'confirm', 'D9'], dir).code, 1);
    assert.equal(lwc(['decision', 'confirm', 'D1'], dir).code, 0);
    r = lwc(['task', 'stage', 'build'], dir);
    assert.equal(r.code, 0, r.stderr);

    r = lwc(['run', '--kind', 'test', '--', 'node', '-e', '"process.exit(3)"'], dir);
    assert.equal(r.code, 3, 'the command exit code is propagated');
    const ev = fs.readdirSync(path.join(dir, '.lwc', 'evidence'));
    assert.equal(ev.length, 1);
    const rec = JSON.parse(fs.readFileSync(path.join(dir, '.lwc', 'evidence', ev[0]), 'utf8'));
    assert.equal(rec.exitCode, 3);

    r = lwc(['claim', 'add', 'Done, tests pass'], dir);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /exit code 3/);

    r = lwc(['radar', '--format', 'json', '--category', 'e', '--no-journal'], dir);
    assert.equal(r.code, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.ok(
      report.findings.some((f) => f.rule === 'PROC-005'),
      'a claim after a failure is caught',
    );
    assert.equal(report.lang, 'ru', 'the report language follows the project config');

    r = lwc(['run', '--kind', 'test', '--', 'node', '-e', '"process.exit(0)"'], dir);
    assert.equal(r.code, 0);
    r = lwc(['claim', 'add', 'Now the tests pass'], dir);
    r = lwc(['radar', '--format', 'json', '--category', 'e', '--no-journal', '--lang', 'en'], dir);
    const report2 = JSON.parse(r.stdout);
    assert.equal(
      report2.findings.filter((f) => f.rule === 'PROC-005').length,
      1,
      'only the first claim remains problematic',
    );
    assert.equal(report2.lang, 'en');

    r = lwc(['status', '--json'], dir);
    const st = JSON.parse(r.stdout);
    assert.equal(st.task.stage, 'build');
    assert.equal(st.evidenceRuns, 2);

    r = lwc(['resume'], dir);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Active task/);
    assert.match(r.stdout, /build/);

    r = lwc(['task', 'finish'], dir);
    assert.equal(r.code, 0);
    assert.equal(JSON.parse(lwc(['status', '--json'], dir).stdout).task, null);
    const journal = fs.readFileSync(path.join(dir, '.lwc', 'journal.md'), 'utf8');
    assert.match(journal, /Decision D1 confirmed by the user/);
  } finally {
    cleanup(dir);
  }
});

test('cli: suppress requires a reason and refuses a whole rule without --file/--yes', () => {
  const dir = makeProject({ 'src/a.js': 'const x = JSON.parse(s);' });
  try {
    lwc(['init'], dir);
    assert.equal(lwc(['suppress', 'IMPL-001'], dir).code, 2);
    assert.equal(lwc(['suppress', 'IMPL-001', '--reason', 'short'], dir).code, 2);
    assert.equal(
      lwc(['suppress', 'IMPL-001', '--reason', 'a deliberate team decision'], dir).code,
      1,
    );
    assert.equal(
      lwc(
        ['suppress', 'IMPL-001', '--file', 'src/a.js', '--reason', 'input is validated upstream'],
        dir,
      ).code,
      0,
    );
    const before = JSON.parse(
      lwc(['radar', '--format', 'json', '--category', 'c', '--no-journal'], dir).stdout,
    );
    assert.ok(!before.findings.some((f) => f.rule === 'IMPL-001'));
    assert.equal(before.suppressed.filter((f) => f.rule === 'IMPL-001').length, 1);
    assert.match(lwc(['suppress', 'list'], dir).stdout, /validated upstream/);
  } finally {
    cleanup(dir);
  }
});

test('cli: radar --out, --fail-on, explicit path and lwc.config.json', () => {
  const dir = makeProject({
    'lwc.config.json': '{"rules":{"IMPL-004":false}}',
    'src/a.js': "const k = 'AKIAQX7LMN3P9ZT2K8VW';", // lwc-ignore: fake key fixture
  });
  try {
    const out = path.join(dir, 'report.md');
    let r = lwc(['radar', dir, '--format', 'md', '--out', out, '--no-journal'], REPO_ROOT);
    assert.equal(r.code, 0, r.stderr);
    assert.match(fs.readFileSync(out, 'utf8'), /SEC-001/);
    r = lwc(['radar', '--fail-on', 'high', '--no-journal'], dir);
    assert.equal(r.code, 1, 'a critical finding → exit code 1');
    r = lwc(
      ['radar', '--category', 'c', '--fail-on', 'high', '--format', 'json', '--no-journal'],
      dir,
    );
    assert.equal(r.code, 0);
    assert.ok(
      !JSON.parse(r.stdout).findings.some((f) => f.rule === 'IMPL-004'),
      'the rule is disabled via lwc.config.json',
    );
    assert.equal(lwc(['radar', '--format', 'xml'], dir).code, 2);
    assert.equal(lwc(['radar', '--category', 'zzz'], dir).code, 2);
  } finally {
    cleanup(dir);
  }
});

test('cli: ops-check as a process, --fail-on, --out and a corrupted file', () => {
  const ex = path.join(REPO_ROOT, 'examples', 'ops-report');
  const args = [
    path.join(ex, 'daily_report.csv'),
    '--rules',
    path.join(ex, 'rules.json'),
    '--history',
    path.join(ex, 'history.csv'),
  ];
  let r = lwc(['ops-check', ...args, '--format', 'json'], REPO_ROOT);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).findings.length, 7);
  r = lwc(['ops-check', ...args, '--fail-on', 'high'], REPO_ROOT);
  assert.equal(r.code, 1);
  assert.equal(lwc(['ops-check'], REPO_ROOT).code, 2);
  const dir = makeProject({ 'bad.json': '{oops', 'rules.json': '{}' });
  try {
    r = lwc(
      ['ops-check', path.join(dir, 'bad.json'), '--rules', path.join(dir, 'rules.json')],
      dir,
    );
    assert.equal(r.code, 1);
    assert.match(r.stderr, /invalid JSON/);
    const out = path.join(dir, 'ops.md');
    r = lwc(['ops-check', ...args, '--format', 'md', '--lang', 'kk', '--out', out], REPO_ROOT);
    assert.equal(r.code, 0, r.stderr);
    assert.match(fs.readFileSync(out, 'utf8'), /OPS-003/);
  } finally {
    cleanup(dir);
  }
});

test('cli: explain shows module relations', () => {
  const dir = makeProject({ 'src/a.js': "import './b.js';", 'src/b.js': 'export const b = 1;' });
  try {
    const r = lwc(['explain', 'src/b.js'], dir);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /← src\/a\.js/);
    const j = JSON.parse(lwc(['explain', 'src/a.js', '--json'], dir).stdout);
    assert.deepEqual(j.imports, ['src/b.js']);
    assert.equal(lwc(['explain', 'src/none.js'], dir).code, 1);
  } finally {
    cleanup(dir);
  }
});
