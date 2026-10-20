import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeProject, cleanup } from './helpers.mjs';

const { worktreeFingerprint, freshnessOf, relevantChangedFiles } =
  await import('../dist/core/fingerprint.js');

test('fingerprint: changes with content, ignores .lwc/ and ignored paths', () => {
  const dir = makeProject({ 'src/a.js': 'export const a = 1;\n' }, { git: true });
  try {
    const ignore = ['dist/**'];
    const clean = worktreeFingerprint(dir, ignore);
    assert.match(clean.head, /^[0-9a-f]{40}$/);
    assert.equal(clean.changedFiles, 0);

    fs.mkdirSync(path.join(dir, '.lwc'));
    fs.writeFileSync(path.join(dir, '.lwc/session.json'), '{}');
    fs.mkdirSync(path.join(dir, 'dist'));
    fs.writeFileSync(path.join(dir, 'dist/a.js'), 'built');
    assert.equal(
      worktreeFingerprint(dir, ignore).digest,
      clean.digest,
      'state and build output do not count',
    );

    fs.writeFileSync(path.join(dir, 'src/a.js'), 'export const a = 2; // edited\n');
    const edited = worktreeFingerprint(dir, ignore);
    assert.notEqual(edited.digest, clean.digest);
    assert.deepEqual(relevantChangedFiles(dir, ignore), ['src/a.js']);
    fs.writeFileSync(path.join(dir, 'src/a.js'), 'export const a = 3; // edited again\n');
    assert.notEqual(
      worktreeFingerprint(dir, ignore).digest,
      edited.digest,
      'content, not just names',
    );

    assert.equal(freshnessOf({ digest: edited.digest }, edited), 'fresh');
    assert.equal(freshnessOf({ digest: clean.digest }, edited), 'stale');
    assert.equal(freshnessOf(undefined, edited), 'unknown');
  } finally {
    cleanup(dir);
  }
});

test('fingerprint: unavailable without git', () => {
  const dir = makeProject({ 'a.js': 'x' });
  try {
    assert.equal(worktreeFingerprint(dir, []), null);
    assert.equal(freshnessOf({ digest: 'x' }, null), 'unknown');
  } finally {
    cleanup(dir);
  }
});
