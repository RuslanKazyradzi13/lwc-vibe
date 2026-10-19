/**
 * E. AI-development process anomalies. Works on `.lwc/` state and git status.
 * Without `.lwc/session.json` the analyzer stays silent (nothing to check).
 */
import type { Analyzer, AnalyzerContext, Finding } from '../core/findings.js';
import { changedFilesForProject, getGitInfo } from '../core/git.js';
import { matchesAny } from '../core/glob.js';
import { isSourceFile, isTestFile } from '../core/scan.js';
import { loadEvidence, loadSession, STATE_DIR } from '../core/state.js';
import { words } from '../core/text.js';
import { mk, ruleEnabled, shortList } from './base.js';

/** Claims such as "tests pass", "verified", «тесты пройдены» — require evidence. */
const CLAIM_VERIFIED_RE = words(
  'тест\\p{L}*\\s+(?:пройден\\p{L}*|прош\\p{L}*|зел[её]н\\p{L}*)|проверен\\p{L}*|провер\\p{L}+\\s+пройден\\p{L}*|all\\s+tests?\\s+pass\\p{L}*|tests?\\s+(?:pass|passed|green)|verified|checked|тексерілді|тесттер\\s+өтті',
);

export const processAnalyzer: Analyzer = {
  id: 'process',
  category: 'process',
  run(ctx: AnalyzerContext): Finding[] {
    const out: Finding[] = [];
    const lang = ctx.lang;
    const session = loadSession(ctx.root);
    const task = session.task;
    if (!task) {
      ctx.log('process: no active task, skipping');
      return out;
    }
    const gi = getGitInfo(ctx.root);
    const changed = changedFilesForProject(gi, ctx.root).filter(
      (p) => !p.startsWith(STATE_DIR + '/'),
    );
    const baseline = new Set(task.baselineChanged ?? []);
    const newChanges = changed.filter((f) => !baseline.has(f));
    const changedSources = newChanges.filter((f) => isSourceFile(f) && !isTestFile(f));
    const changedTests = newChanges.filter(isTestFile);

    // PROC-001: code changed before the build stage.
    if (
      ruleEnabled(ctx.config.rules, 'PROC-001') &&
      (task.stage === 'learn' || task.stage === 'design')
    ) {
      if (changedSources.length > 0) {
        out.push(
          mk(lang, {
            rule: 'PROC-001',
            category: 'process',
            severity: 'high',
            status: 'confirmed',
            source: 'rule',
            vars: { task: task.title, stage: task.stage, files: shortList(changedSources) },
            idParts: ['PROC-001', task.id, changedSources.join(',')],
            evidence: `${STATE_DIR}/session.json`,
          }),
        );
      }
    }

    // PROC-003: files outside the agreed scope.
    if (ruleEnabled(ctx.config.rules, 'PROC-003') && task.scope.length > 0) {
      for (const f of newChanges) {
        if (matchesAny(f, task.scope)) continue;
        out.push(
          mk(lang, {
            rule: 'PROC-003',
            category: 'process',
            severity: 'medium',
            status: 'confirmed',
            source: 'rule',
            location: { file: f },
            vars: { file: f, scope: task.scope.join(', ') },
            idParts: ['PROC-003', task.id, f],
            evidence: `${STATE_DIR}/session.json`,
          }),
        );
      }
    }

    // PROC-004: changes without tests (build/review stage).
    if (
      ruleEnabled(ctx.config.rules, 'PROC-004') &&
      (task.stage === 'build' || task.stage === 'review') &&
      changedSources.length > 0 &&
      changedTests.length === 0
    ) {
      out.push(
        mk(lang, {
          rule: 'PROC-004',
          category: 'process',
          severity: 'medium',
          status: 'evidence-gap',
          source: 'rule',
          vars: { files: shortList(changedSources) },
          idParts: ['PROC-004', task.id, changedSources.join(',')],
        }),
      );
    }

    // PROC-002 / PROC-005: claims vs evidence.
    const evidence = loadEvidence(ctx.root);
    for (const claim of task.claims) {
      if (!CLAIM_VERIFIED_RE.test(claim.text)) continue;
      const runsBefore = evidence.filter(
        (e) =>
          e.startedAt <= claim.at && (e.kind === 'test' || e.kind === 'lint' || e.kind === 'build'),
      );
      const last = runsBefore[runsBefore.length - 1];
      if (!last) {
        if (ruleEnabled(ctx.config.rules, 'PROC-002')) {
          out.push(
            mk(lang, {
              rule: 'PROC-002',
              category: 'process',
              severity: 'high',
              status: 'confirmed',
              source: 'rule',
              vars: { claim: claim.text },
              idParts: ['PROC-002', task.id, claim.id],
              evidence: `${STATE_DIR}/evidence/`,
            }),
          );
        }
        continue;
      }
      if (last.exitCode !== 0 && ruleEnabled(ctx.config.rules, 'PROC-005')) {
        out.push(
          mk(lang, {
            rule: 'PROC-005',
            category: 'process',
            severity: 'critical',
            status: 'confirmed',
            source: 'rule',
            vars: { command: last.command, code: last.exitCode ?? 'null', claim: claim.text },
            idParts: ['PROC-005', task.id, claim.id],
            evidence: `${STATE_DIR}/evidence/${last.id}.json`,
          }),
        );
      }
    }

    ctx.log(
      `process: task "${task.title}" (${task.stage}), ${newChanges.length} changes, ${out.length} findings`,
    );
    return out;
  },
};
