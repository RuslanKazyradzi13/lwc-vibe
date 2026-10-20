import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BIN = path.join(REPO_ROOT, 'bin', 'lwc.js');

/** Temporary project directory with files {relative path: content}. */
export function makeProject(files, { git = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwc-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  if (git) {
    gitRun(dir, ['init', '-q', '-b', 'main']);
    gitRun(dir, ['add', '-A']);
    gitRun(dir, ['commit', '-q', '-m', 'init']);
  }
  return dir;
}

export function gitRun(dir, args) {
  const r = spawnSync(
    'git',
    [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd: dir, encoding: 'utf8', windowsHide: true },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

export function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true }); // lwc-ignore: temporary directory from mkdtemp
  } catch {
    /* Windows may keep files locked — not critical for tests */
  }
}

/**
 * Runs the CLI as a separate process. NACE_API_KEY is always removed from the child environment:
 * tests must never reach the real Nace API, even on a machine where a key is configured.
 */
export function lwc(args, cwd) {
  const env = { ...process.env };
  delete env.NACE_API_KEY;
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export function rulesOf(findings) {
  return new Set(findings.map((f) => f.rule));
}

export async function radar(root, extra = {}) {
  const { runRadar } = await import('../dist/core/radar.js');
  const { loadConfig } = await import('../dist/core/state.js');
  return runRadar({ root, config: loadConfig(root), ...extra });
}
