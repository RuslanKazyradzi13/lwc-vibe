/**
 * IMPL-005: a real run of the project tests. Executed only with explicit permission
 * (`lwc radar --run-tests`) because it runs a command from the configuration.
 */
import { spawnSync } from 'node:child_process';
import type { Analyzer, AnalyzerContext, Finding } from '../core/findings.js';
import { nowId, saveEvidence, sha256, type EvidenceRecord } from '../core/state.js';
import { mk, ruleEnabled } from './base.js';

export function detectTestCommand(read: (rel: string) => string | null): string | undefined {
  const pkg = read('package.json');
  if (pkg) {
    try {
      const j = JSON.parse(pkg) as { scripts?: Record<string, string> };
      const t = j.scripts?.test;
      if (t && !/no test specified/.test(t)) return 'npm test';
    } catch {
      /* ignore */
    }
  }
  if (
    read('pytest.ini') != null ||
    read('pyproject.toml')?.includes('[tool.pytest') ||
    read('tests/__init__.py') != null
  ) {
    return 'python -m pytest -q';
  }
  return undefined;
}

export function runCommandRecorded(
  root: string,
  command: string,
  kind: EvidenceRecord['kind'],
): EvidenceRecord {
  const started = Date.now();
  const r = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10 * 60 * 1000,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  const rec: EvidenceRecord = {
    id: nowId('run'),
    command,
    cwd: root,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    exitCode: r.status,
    stdoutTail: stdout.split('\n').slice(-30).join('\n'),
    stderrTail: stderr.split('\n').slice(-30).join('\n'),
    outputSha256: sha256(stdout + stderr),
    kind,
  };
  return rec;
}

export const testsRunnerAnalyzer: Analyzer = {
  id: 'tests-runner',
  category: 'implementation',
  run(ctx: AnalyzerContext): Finding[] {
    const out: Finding[] = [];
    if (!ctx.allowRunCommands || !ruleEnabled(ctx.config.rules, 'IMPL-005')) {
      ctx.log('tests-runner: running commands is not allowed (use --run-tests)');
      return out;
    }
    const command = ctx.config.testCommand ?? detectTestCommand(ctx.read);
    if (!command) {
      ctx.log('tests-runner: test command not detected');
      return out;
    }
    const rec = runCommandRecorded(ctx.root, command, 'test');
    const evidencePath = saveEvidence(ctx.root, rec);
    ctx.log(`tests-runner: ${command} → exit code ${rec.exitCode} in ${rec.durationMs} ms`);
    if (rec.exitCode !== 0) {
      out.push(
        mk(ctx.lang, {
          rule: 'IMPL-005',
          category: 'implementation',
          severity: 'critical',
          status: 'confirmed',
          source: 'test',
          vars: { command, code: rec.exitCode ?? 'null' },
          idParts: ['IMPL-005', command],
          evidence: evidencePath,
          data: { stderrTail: rec.stderrTail, stdoutTail: rec.stdoutTail },
        }),
      );
    }
    return out;
  },
};
