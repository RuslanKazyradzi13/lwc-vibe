import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeProject, cleanup, lwc, gitRun } from './helpers.mjs';

const { classifyClaim, assessClaim } = await import('../dist/gate/claims.js');
const { runGate, decideVerdict } = await import('../dist/gate/gate.js');
const { loadConfig } = await import('../dist/core/state.js');

const PASS = ['run', '--kind', 'test', '--', 'node', '-e', '"process.exit(0)"'];
const FAIL = ['run', '--kind', 'test', '--', 'node', '-e', '"process.exit(1)"'];

/** A small initialised project with git and a task at the review stage. */
function project(extra = {}) {
  const dir = makeProject(
    {
      '.lwc/config.json': '{"version":1,"lang":"en"}',
      'src/sum.js': 'export function sum(a, b) {\n  return a + b;\n}\n',
      'tests/sum.test.js':
        'import { sum } from "../src/sum.js";\nif (sum(1, 2) !== 3) throw new Error("bad");\n',
      ...extra,
    },
    { git: true },
  );
  assert.equal(lwc(['task', 'start', 'Sum function'], dir).code, 0);
  assert.equal(lwc(['task', 'stage', 'build', '--yes'], dir).code, 0);
  return dir;
}

async function gate(dir, extra = {}) {
  return runGate({ root: dir, config: loadConfig(dir), ...extra });
}

const check = (r, id) => r.checks.find((c) => c.id === id);

test('claims: classification understands en/ru/kk wording', () => {
  assert.deepEqual(classifyClaim('All tests pass'), ['tests']);
  assert.deepEqual(classifyClaim('Implemented, tests pass'), ['tests', 'completion']);
  assert.deepEqual(classifyClaim('Тесты пройдены, безопасность проверена'), ['tests', 'security']);
  assert.deepEqual(classifyClaim('Барлық талаптар орындалды'), ['requirements', 'completion']);
  assert.deepEqual(classifyClaim('Build is green'), ['build']);
  assert.deepEqual(classifyClaim('Renamed the parser module'), []);
});

test('claims: unsupported, contradicted, stale, supported', () => {
  const claim = { id: 'C1', text: 'tests pass', at: '2026-10-20T10:00:00.000Z' };
  const run = (over) => ({
    id: 'run-1',
    command: 'npm test',
    cwd: '.',
    startedAt: '2026-10-20T09:59:00.000Z',
    durationMs: 1,
    exitCode: 0,
    stdoutTail: '',
    stderrTail: '',
    outputSha256: 'x',
    kind: 'test',
    worktree: { head: 'h', digest: 'd1' },
    ...over,
  });
  const fp = { head: 'h', changedFiles: 0, digest: 'd1' };
  assert.equal(assessClaim(claim, [], [], fp).status, 'unsupported');
  assert.equal(assessClaim(claim, [run({ exitCode: 1 })], [], fp).status, 'contradicted');
  const later = run({ id: 'run-2', startedAt: '2026-10-20T11:00:00.000Z', exitCode: 2 });
  const a = assessClaim(claim, [run(), later], [], fp);
  assert.equal(a.status, 'contradicted', 'a later failing run contradicts an earlier claim');
  assert.equal(a.evidence, 'run-2');
  assert.equal(assessClaim(claim, [run()], [], { ...fp, digest: 'd2' }).status, 'stale');
  const ok = assessClaim(claim, [run()], [], fp);
  assert.equal(ok.status, 'supported');
  assert.equal(ok.freshness, 'fresh');
  assert.equal(assessClaim(claim, [run({ worktree: undefined })], [], fp).freshness, 'unknown');
  const runAfterClaim = run({ startedAt: '2026-10-20T10:30:00.000Z' });
  assert.equal(
    assessClaim(claim, [runAfterClaim], [], fp).status,
    'unsupported',
    'a run recorded after the claim does not retroactively back it',
  );
});

test('claims: security is unverifiable, or contradicted by a confirmed finding', () => {
  const claim = { id: 'C1', text: 'security verified', at: '2026-10-20T10:00:00.000Z' };
  assert.equal(assessClaim(claim, [], [], null).status, 'unverifiable');
  const sec = { id: 'SEC-001-x', category: 'security', severity: 'critical', status: 'confirmed' };
  assert.equal(assessClaim(claim, [], [sec], null).status, 'contradicted');
  const probable = { ...sec, status: 'probable' };
  assert.equal(assessClaim(claim, [], [probable], null).status, 'unverifiable');
});

test('verdict: fail beats gap beats pass', () => {
  const c = (status) => ({ id: 'X', status, reason: '', vars: {}, refs: [] });
  assert.equal(decideVerdict([c('pass'), c('skip')]), 'pass');
  assert.equal(decideVerdict([c('pass'), c('gap')]), 'insufficient-evidence');
  assert.equal(decideVerdict([c('gap'), c('fail')]), 'fail');
});

test('gate: a fresh passing run backs the claim → pass; changing code makes it stale', async () => {
  const dir = project();
  try {
    fs.writeFileSync(
      path.join(dir, 'src/sum.js'),
      'export function sum(a, b) {\n  return b + a; // swapped\n}\n',
    );
    fs.writeFileSync(
      path.join(dir, 'tests/sum.test.js'),
      'import { sum } from "../src/sum.js";\nif (sum(2, 2) !== 4) throw new Error("bad");\n',
    );
    assert.equal(lwc(PASS, dir).code, 0);
    const ev = fs.readdirSync(path.join(dir, '.lwc/evidence'));
    const rec = JSON.parse(fs.readFileSync(path.join(dir, '.lwc/evidence', ev[0]), 'utf8'));
    assert.match(rec.worktree.digest, /^[0-9a-f]{64}$/, 'runs record the code state');
    assert.equal(lwc(['claim', 'add', 'Implemented, tests pass'], dir).code, 0);

    let r = await gate(dir);
    assert.equal(check(r, 'GATE-TESTS').status, 'pass');
    assert.equal(check(r, 'GATE-TESTS').reason, 'gate.tests.fresh');
    assert.equal(r.claims[0].status, 'supported');
    assert.equal(r.verdict, 'pass', JSON.stringify(r.checks, null, 1));
    assert.equal(r.advisory.status, 'disabled');
    assert.equal(r.reproducibility.worktreeDigest, rec.worktree.digest);

    // The agent edits code after the test run: the evidence no longer describes this code.
    fs.appendFileSync(path.join(dir, 'src/sum.js'), 'export const extra = 1;\n');
    r = await gate(dir);
    assert.equal(check(r, 'GATE-TESTS').status, 'gap');
    assert.equal(r.claims[0].status, 'stale');
    assert.equal(r.verdict, 'insufficient-evidence');
  } finally {
    cleanup(dir);
  }
});

test('gate: a failed run after the claim → fail; source changes without any run → gap', async () => {
  const dir = project();
  try {
    fs.appendFileSync(path.join(dir, 'src/sum.js'), '// edited\n');
    let r = await gate(dir);
    assert.equal(check(r, 'GATE-TESTS').status, 'gap');
    assert.equal(check(r, 'GATE-TESTS').reason, 'gate.tests.none');
    assert.equal(r.verdict, 'insufficient-evidence');

    assert.equal(lwc(PASS, dir).code, 0);
    assert.equal(lwc(['claim', 'add', 'tests pass'], dir).code, 0);
    assert.equal(lwc(FAIL, dir).code, 1);
    r = await gate(dir);
    assert.equal(check(r, 'GATE-TESTS').status, 'fail');
    assert.equal(r.claims[0].status, 'contradicted');
    assert.equal(r.verdict, 'fail');
  } finally {
    cleanup(dir);
  }
});

test('gate: unconfirmed decisions at the build stage are a gap', async () => {
  const dir = project();
  try {
    assert.equal(lwc(['decision', 'add', 'Use integers only'], dir).code, 0);
    const r = await gate(dir);
    assert.equal(check(r, 'GATE-DECISIONS').status, 'gap');
    assert.deepEqual(check(r, 'GATE-DECISIONS').refs, ['D1']);
  } finally {
    cleanup(dir);
  }
});

test('gate: without git, freshness is unknown and never reported as fresh', async () => {
  const dir = makeProject({
    '.lwc/config.json': '{"version":1,"lang":"en"}',
    'src/a.js': 'export const a = 1;\n',
  });
  try {
    assert.equal(lwc(PASS, dir).code, 0);
    const r = await gate(dir);
    assert.equal(r.changes.git, false);
    assert.equal(r.evidence[0].freshness, 'unknown');
    assert.equal(check(r, 'GATE-TESTS').reason, 'gate.tests.unknownFreshness');
    assert.equal(r.reproducibility.worktreeDigest, null);
  } finally {
    cleanup(dir);
  }
});

test('gate on the demo project: FAIL, the false "tests pass" claim is contradicted', async () => {
  const demo = path.resolve('examples/demo-buggy-app');
  const r = await gate(demo);
  assert.equal(r.verdict, 'fail');
  assert.equal(r.claims[0].status, 'contradicted');
  assert.equal(check(r, 'GATE-TESTS').status, 'fail');
  assert.ok(check(r, 'GATE-FINDINGS').refs.some((id) => id.startsWith('PROC-005')));
});

test('CLI gate: formats, exit codes, journal and report file', () => {
  const dir = project();
  try {
    fs.appendFileSync(path.join(dir, 'src/sum.js'), '// edited\n');
    let r = lwc(['gate'], dir);
    assert.equal(r.code, 0, 'insufficient evidence does not fail by default');
    assert.match(r.stdout, /INSUFFICIENT EVIDENCE/);
    assert.match(r.stdout, /AI advisory \(not evidence\)/);
    r = lwc(['gate', '--fail-on', 'insufficient'], dir);
    assert.equal(r.code, 1);
    r = lwc(['gate', '--fail-on', 'nope'], dir);
    assert.equal(r.code, 2);
    r = lwc(['gate', '--format', 'json', '--no-journal'], dir);
    const j = JSON.parse(r.stdout);
    assert.equal(j.kind, 'evidence-gate');
    assert.equal(j.schema, 'lwc-gate/1');
    assert.ok(j.reproducibility.rulesetDigest.startsWith('0.2.0:'));
    r = lwc(['gate', '--format', 'md', '--lang', 'ru'], dir);
    assert.match(r.stdout, /НЕДОСТАТОЧНО ДОКАЗАТЕЛЬСТВ/);
    assert.match(r.stdout, /Рекомендации ИИ \(не доказательство\)/);
    const reports = fs
      .readdirSync(path.join(dir, '.lwc/reports'))
      .filter((f) => f.startsWith('gate-'));
    assert.ok(reports.length >= 1, 'the gate report is stored in .lwc/reports');
    assert.match(fs.readFileSync(path.join(dir, '.lwc/journal.md'), 'utf8'), /Evidence Gate/);
  } finally {
    cleanup(dir);
  }
});

test('CLI gate refuses to run when a config file holds an API key, without echoing it', () => {
  const secret = ['nace', 'sk', 'Q'.repeat(43)].join('_');
  const dir = project({ 'lwc.config.json': JSON.stringify({ ai: { nace: { apiKey: secret } } }) });
  try {
    const r = lwc(['gate'], dir);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /lwc\.config\.json: ai\.nace\.apiKey/);
    assert.ok(!r.stderr.includes(secret) && !r.stdout.includes(secret));
  } finally {
    cleanup(dir);
  }
});

test('CLI gate --ai-preview shows the payload and sends nothing (no key needed)', () => {
  const dir = project();
  try {
    const r = lwc(['gate', '--ai-preview'], dir);
    assert.equal(r.code, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.schema, 'lwc-gate-advisory/1');
    assert.match(r.stderr, /nothing was sent/);
  } finally {
    cleanup(dir);
  }
});

test('gate: git paths are relative to the project inside a larger repository', async () => {
  const dir = makeProject({ 'README.md': '# repo\n' }, { git: true });
  try {
    const sub = path.join(dir, 'app');
    fs.mkdirSync(path.join(sub, '.lwc'), { recursive: true });
    fs.writeFileSync(path.join(sub, '.lwc/config.json'), '{"version":1,"lang":"en"}');
    fs.mkdirSync(path.join(sub, 'src'));
    fs.writeFileSync(path.join(sub, 'src/x.js'), 'export const x = 1;\n');
    gitRun(dir, ['add', '-A']);
    gitRun(dir, ['commit', '-q', '-m', 'app']);
    fs.appendFileSync(path.join(sub, 'src/x.js'), '// edit\n');
    const r = await gate(sub);
    assert.deepEqual(r.changes.files, ['src/x.js']);
  } finally {
    cleanup(dir);
  }
});
