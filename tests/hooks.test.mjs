import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeProject, cleanup, REPO_ROOT } from './helpers.mjs';

function runHook(name, payload) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'hooks', name)], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    windowsHide: true,
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}

const session = (stage, extra = {}) =>
  JSON.stringify({
    version: 1,
    task: {
      id: 't',
      title: 'Task',
      startedAt: 'x',
      stage,
      scope: [],
      decisions: [{ id: 'D1', text: 'decision', proposedAt: 'x' }],
      claims: [],
      ...extra,
    },
    history: [],
  });

test('session-start: silent without .lwc, emits additionalContext with .lwc', () => {
  const empty = makeProject({ 'a.js': '' });
  const dir = makeProject({
    '.lwc/config.json': '{"lang":"kk","level":"advanced"}',
    '.lwc/session.json': session('design'),
  });
  try {
    assert.equal(
      runHook('session-start.mjs', { hook_event_name: 'SessionStart', cwd: empty }).out,
      '',
    );
    const r = runHook('session-start.mjs', { hook_event_name: 'SessionStart', cwd: dir });
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out);
    const ctx = j.hookSpecificOutput.additionalContext;
    assert.equal(j.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(ctx, /kk/);
    assert.match(ctx, /Unconfirmed decisions: D1/);
    assert.match(ctx, /is not a confirmation/);
  } finally {
    cleanup(empty);
    cleanup(dir);
  }
});

test('guard: ask at the design stage for a source file; silent for docs, build and guard off', () => {
  const dir = makeProject({ '.lwc/config.json': '{}', '.lwc/session.json': session('design') });
  const build = makeProject({ '.lwc/config.json': '{}', '.lwc/session.json': session('build') });
  const off = makeProject({
    '.lwc/config.json': '{"guard":"off"}',
    '.lwc/session.json': session('design'),
  });
  const deny = makeProject({
    '.lwc/config.json': '{"guard":"deny"}',
    '.lwc/session.json': session('learn'),
  });
  try {
    const ask = JSON.parse(
      runHook('guard.mjs', { tool_name: 'Edit', cwd: dir, tool_input: { file_path: 'src/a.ts' } })
        .out,
    );
    assert.equal(ask.hookSpecificOutput.permissionDecision, 'ask');
    assert.match(ask.hookSpecificOutput.permissionDecisionReason, /D1/);
    assert.equal(
      runHook('guard.mjs', {
        tool_name: 'Edit',
        cwd: dir,
        tool_input: { file_path: 'docs/notes.md' },
      }).out,
      '',
    );
    assert.equal(
      runHook('guard.mjs', {
        tool_name: 'Write',
        cwd: dir,
        tool_input: { file_path: '.lwc/task.md' },
      }).out,
      '',
    );
    assert.equal(
      runHook('guard.mjs', { tool_name: 'Edit', cwd: build, tool_input: { file_path: 'src/a.ts' } })
        .out,
      '',
    );
    assert.equal(
      runHook('guard.mjs', { tool_name: 'Edit', cwd: off, tool_input: { file_path: 'src/a.ts' } })
        .out,
      '',
    );
    const d = JSON.parse(
      runHook('guard.mjs', { tool_name: 'Edit', cwd: deny, tool_input: { file_path: 'app.py' } })
        .out,
    );
    assert.equal(d.hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    for (const d of [dir, build, off, deny]) cleanup(d);
  }
});

test('hooks: garbage input never breaks the session (exit 0, empty output)', () => {
  for (const name of ['session-start.mjs', 'guard.mjs']) {
    const r = runHook(name, 'not json at all');
    assert.equal(r.code, 0);
    assert.equal(r.out, '');
    const r2 = runHook(name, { cwd: 12345, tool_input: { file_path: null } });
    assert.equal(r2.code, 0);
  }
});
