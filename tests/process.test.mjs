import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeProject, cleanup, radar, rulesOf } from './helpers.mjs';

function session(task) {
  return JSON.stringify({
    version: 1,
    task: {
      id: 't1',
      title: 'Task',
      startedAt: '2026-10-19T10:00:00.000Z',
      scope: [],
      decisions: [],
      claims: [],
      baselineChanged: [],
      ...task,
    },
    history: [],
  });
}

const base = {
  '.lwc/config.json': '{"version":1,"lang":"en"}',
  'src/a.js': 'export const a = 1;',
  'src/b.js': 'export const b = 1;',
  'tests/a.test.js': 'import "../src/a.js";',
};

// Changed content has a different length: git may miss a same-size change made within the
// same second as the commit (racy-clean) on Windows CI.
const CHANGED_A = 'export const a = 2; // changed after the commit';
const CHANGED_B = 'export const b = 2; // changed after the commit';

test('PROC-001: code changed at the design stage', async () => {
  const dir = makeProject(
    { ...base, '.lwc/session.json': session({ stage: 'design' }) },
    { git: true },
  );
  try {
    fs.writeFileSync(path.join(dir, 'src/a.js'), CHANGED_A);
    const r = await radar(dir, { categories: ['process'] });
    const f = r.findings.find((x) => x.rule === 'PROC-001');
    assert.ok(f);
    assert.equal(f.status, 'confirmed');
    assert.match(f.observation, /src\/a\.js/);
  } finally {
    cleanup(dir);
  }
});

test('PROC-003/004: a file outside the scope and changes without tests at the build stage', async () => {
  const dir = makeProject(
    { ...base, '.lwc/session.json': session({ stage: 'build', scope: ['src/a.js'] }) },
    { git: true },
  );
  try {
    fs.writeFileSync(path.join(dir, 'src/a.js'), CHANGED_A);
    fs.writeFileSync(path.join(dir, 'src/b.js'), CHANGED_B);
    const r = await radar(dir, { categories: ['process'] });
    const rules = rulesOf(r.findings);
    assert.ok(rules.has('PROC-003'));
    assert.ok(rules.has('PROC-004'));
    assert.ok(!rules.has('PROC-001'), 'code changes are allowed at the build stage');
    const out = r.findings.filter((f) => f.rule === 'PROC-003').map((f) => f.location.file);
    assert.deepEqual(out, ['src/b.js']);
  } finally {
    cleanup(dir);
  }
});

test('PROC-004 does not fire when tests changed too; baselineChanged excludes older changes', async () => {
  const dir = makeProject(
    { ...base, '.lwc/session.json': session({ stage: 'build', baselineChanged: ['src/b.js'] }) },
    { git: true },
  );
  try {
    fs.writeFileSync(path.join(dir, 'src/a.js'), CHANGED_A);
    fs.writeFileSync(path.join(dir, 'src/b.js'), CHANGED_B);
    fs.writeFileSync(path.join(dir, 'tests/a.test.js'), 'import "../src/a.js"; // updated');
    const r = await radar(dir, { categories: ['process'] });
    assert.ok(!rulesOf(r.findings).has('PROC-004'));
  } finally {
    cleanup(dir);
  }
});

test('PROC-002/005: a claim without evidence and a claim after a failed check', async () => {
  const evidence = {
    id: 'run-1',
    command: 'npm test',
    cwd: '.',
    startedAt: '2026-10-19T11:00:00.000Z',
    durationMs: 10,
    exitCode: 1,
    stdoutTail: '',
    stderrTail: 'fail',
    outputSha256: '0',
    kind: 'test',
  };
  const dir1 = makeProject({
    ...base,
    '.lwc/session.json': session({
      stage: 'review',
      claims: [{ id: 'C1', text: 'Done, tests pass', at: '2026-10-19T12:00:00.000Z' }],
    }),
  });
  const dir2 = makeProject({
    ...base,
    '.lwc/evidence/run-1.json': JSON.stringify(evidence),
    '.lwc/session.json': session({
      stage: 'review',
      claims: [{ id: 'C1', text: 'All tests pass', at: '2026-10-19T12:00:00.000Z' }],
    }),
  });
  const dir3 = makeProject({
    ...base,
    '.lwc/evidence/run-1.json': JSON.stringify({ ...evidence, exitCode: 0 }),
    '.lwc/session.json': session({
      stage: 'review',
      claims: [
        { id: 'C1', text: 'Проверено', at: '2026-10-19T12:00:00.000Z' },
        { id: 'C2', text: 'Added a button', at: '2026-10-19T12:01:00.000Z' },
      ],
    }),
  });
  try {
    const r1 = await radar(dir1, { categories: ['process'] });
    assert.ok(rulesOf(r1.findings).has('PROC-002'));
    const r2 = await radar(dir2, { categories: ['process'] });
    const f = r2.findings.find((x) => x.rule === 'PROC-005');
    assert.ok(f);
    assert.equal(f.severity, 'critical');
    assert.match(f.evidence, /run-1\.json/);
    const r3 = await radar(dir3, { categories: ['process'] });
    assert.deepEqual(
      r3.findings,
      [],
      'a passing run before the claim, and a plain claim — no findings',
    );
  } finally {
    cleanup(dir1);
    cleanup(dir2);
    cleanup(dir3);
  }
});

test('process: without an active task the analyzer stays silent', async () => {
  const dir = makeProject({ ...base });
  try {
    const r = await radar(dir, { categories: ['process'] });
    assert.deepEqual(r.findings, []);
  } finally {
    cleanup(dir);
  }
});
