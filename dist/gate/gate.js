/**
 * Evidence Gate: decides whether the evidence supports "this task is done".
 *
 *   radar findings + evidence runs + changed files + agent claims  →  checks  →  verdict
 *
 * The verdict is computed from deterministic data only. An optional AI advisory provider runs
 * after the verdict is fixed; its output is stored in a separate section and cannot change the
 * verdict, the checks or the findings.
 */
import path from 'node:path';
import os from 'node:os';
import { fnv1a } from '../core/findings.js';
import { freshnessOf, relevantChangedFiles, worktreeFingerprint } from '../core/fingerprint.js';
import { runRadar, VERSION } from '../core/radar.js';
import { isSourceFile, isTestFile } from '../core/scan.js';
import { loadEvidence, loadSession, sha256 } from '../core/state.js';
import { catalog } from '../i18n/index.js';
import { assessClaim } from './claims.js';
import { buildAdvisoryPayload } from './payload.js';
const CHECK_IDS = [
    'GATE-TESTS',
    'GATE-CLAIMS',
    'GATE-FINDINGS',
    'GATE-DECISIONS',
    'GATE-ANALYZERS',
];
function isBlocking(f) {
    return (f.severity === 'critical' || f.severity === 'high') && f.status === 'confirmed';
}
function needsReview(f) {
    return ((f.severity === 'critical' || f.severity === 'high') &&
        (f.status === 'probable' || f.status === 'evidence-gap' || f.status === 'warning'));
}
/** Digest of the rule set actually in force: version + enabled rule ids. */
export function rulesetDigest(config) {
    const enabled = Object.keys(catalog('en').rules)
        .filter((r) => config.rules[r] !== false)
        .sort();
    return `${VERSION}:${fnv1a(enabled.join(','))}`;
}
function stableStringify(v) {
    if (Array.isArray(v))
        return `[${v.map(stableStringify).join(',')}]`;
    if (v && typeof v === 'object')
        return `{${Object.keys(v)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
            .join(',')}}`;
    return JSON.stringify(v);
}
export function decideVerdict(checks) {
    if (checks.some((c) => c.status === 'fail'))
        return 'fail';
    if (checks.some((c) => c.status === 'gap'))
        return 'insufficient-evidence';
    return 'pass';
}
export async function runGate(opts) {
    const root = path.resolve(opts.root);
    const config = opts.config;
    const lang = opts.lang ?? config.lang;
    const now = opts.now ?? (() => new Date());
    // 1. Deterministic facts. The radar may run the tests (recorded as evidence) when allowed.
    const radar = await runRadar({ root, config, lang, allowRunCommands: opts.runTests ?? false });
    const session = loadSession(root);
    const task = session.task ?? null;
    const evidence = loadEvidence(root);
    const fp = worktreeFingerprint(root, config.ignore);
    const changedAll = relevantChangedFiles(root, config.ignore);
    const baseline = new Set(task?.baselineChanged ?? []);
    const changed = (changedAll ?? []).filter((f) => !baseline.has(f));
    const sources = changed.filter((f) => isSourceFile(f) && !isTestFile(f));
    const tests = changed.filter(isTestFile);
    const claims = (task?.claims ?? []).map((c) => assessClaim(c, evidence, radar.findings, fp));
    const checks = [];
    // GATE-TESTS: is there a passing test run on the current code?
    const testRuns = evidence.filter((e) => e.kind === 'test');
    const lastTest = testRuns[testRuns.length - 1];
    const claimsNeedTests = claims.some((c) => c.kinds.includes('tests') || c.kinds.includes('completion'));
    const mode = config.gate.requireTests;
    const required = mode === 'always' || (mode === 'auto' && (sources.length > 0 || claimsNeedTests));
    if (!lastTest) {
        checks.push({
            id: 'GATE-TESTS',
            status: required ? 'gap' : 'skip',
            reason: required ? 'gate.tests.none' : 'gate.tests.notRequired',
            vars: { sources: sources.length },
            refs: [],
        });
    }
    else {
        const fr = freshnessOf(lastTest.worktree, fp);
        const v = { command: lastTest.command, code: String(lastTest.exitCode ?? 'null') };
        if (lastTest.exitCode !== 0)
            checks.push({
                id: 'GATE-TESTS',
                status: 'fail',
                reason: 'gate.tests.failed',
                vars: v,
                refs: [lastTest.id],
            });
        else if (fr === 'stale')
            checks.push({
                id: 'GATE-TESTS',
                status: required ? 'gap' : 'skip',
                reason: 'gate.tests.stale',
                vars: v,
                refs: [lastTest.id],
            });
        else
            checks.push({
                id: 'GATE-TESTS',
                status: 'pass',
                reason: fr === 'fresh' ? 'gate.tests.fresh' : 'gate.tests.unknownFreshness',
                vars: v,
                refs: [lastTest.id],
            });
    }
    // GATE-CLAIMS: every verification claim backed by evidence.
    const judged = claims.filter((c) => c.status !== 'informational');
    if (judged.length === 0) {
        checks.push({
            id: 'GATE-CLAIMS',
            status: 'skip',
            reason: 'gate.claims.none',
            vars: {},
            refs: [],
        });
    }
    else {
        const bad = judged.filter((c) => c.status === 'contradicted');
        const weak = judged.filter((c) => c.status !== 'supported' && c.status !== 'contradicted');
        checks.push({
            id: 'GATE-CLAIMS',
            status: bad.length ? 'fail' : weak.length ? 'gap' : 'pass',
            reason: bad.length
                ? 'gate.claims.contradicted'
                : weak.length
                    ? 'gate.claims.weak'
                    : 'gate.claims.ok',
            vars: { bad: bad.length, weak: weak.length, total: judged.length },
            refs: [...bad, ...weak].map((c) => c.id),
        });
    }
    // GATE-FINDINGS: no confirmed Critical/High; probable ones need a human.
    const blocking = radar.findings.filter(isBlocking);
    const review = radar.findings.filter(needsReview);
    checks.push({
        id: 'GATE-FINDINGS',
        status: blocking.length ? 'fail' : review.length ? 'gap' : 'pass',
        reason: blocking.length
            ? 'gate.findings.blocking'
            : review.length
                ? 'gate.findings.review'
                : 'gate.findings.ok',
        vars: { blocking: blocking.length, review: review.length, total: radar.summary.total },
        refs: [...blocking, ...review].map((f) => f.id),
    });
    // GATE-DECISIONS: code-stage work rests on confirmed decisions.
    if (!task) {
        checks.push({
            id: 'GATE-DECISIONS',
            status: 'skip',
            reason: 'gate.decisions.noTask',
            vars: {},
            refs: [],
        });
    }
    else {
        const pending = task.decisions.filter((d) => !d.confirmedAt);
        const codeStage = task.stage === 'build' || task.stage === 'review' || task.stage === 'done';
        checks.push({
            id: 'GATE-DECISIONS',
            status: codeStage && pending.length ? 'gap' : 'pass',
            reason: codeStage && pending.length
                ? 'gate.decisions.pending'
                : task.decisions.length
                    ? 'gate.decisions.ok'
                    : 'gate.decisions.none',
            vars: { pending: pending.length, total: task.decisions.length },
            refs: pending.map((d) => d.id),
        });
    }
    // GATE-ANALYZERS: an analyzer that crashed means the picture is incomplete.
    const crashed = radar.findings.filter((f) => f.rule === 'RADAR-ERR');
    checks.push({
        id: 'GATE-ANALYZERS',
        status: crashed.length ? 'gap' : 'pass',
        reason: crashed.length ? 'gate.analyzers.crashed' : 'gate.analyzers.ok',
        vars: { count: crashed.length, analyzers: radar.analyzers.length },
        refs: crashed.map((f) => f.id),
    });
    const verdict = decideVerdict(checks);
    const evidenceSummaries = evidence.map((e) => ({
        id: e.id,
        command: e.command,
        kind: e.kind,
        exitCode: e.exitCode,
        startedAt: e.startedAt,
        outputSha256: e.outputSha256,
        freshness: freshnessOf(e.worktree, fp),
    }));
    const report = {
        tool: 'lwc-vibe',
        kind: 'evidence-gate',
        schema: 'lwc-gate/1',
        version: VERSION,
        generatedAt: now().toISOString(),
        root,
        lang,
        verdict,
        checks,
        claims,
        evidence: evidenceSummaries,
        changes: {
            git: changedAll !== null,
            files: changed,
            sources: sources.length,
            tests: tests.length,
        },
        task: task ? { id: task.id, title: task.title, stage: task.stage } : null,
        radar: {
            summary: radar.summary,
            analyzers: radar.analyzers,
            filesScanned: radar.filesScanned,
            findings: radar.findings,
            suppressed: radar.suppressed,
        },
        advisory: { provider: 'none', status: 'disabled', items: [], meta: {} },
        reproducibility: {
            lwcVersion: VERSION,
            rulesetDigest: rulesetDigest(config),
            configDigest: sha256(stableStringify(config)).slice(0, 16),
            checks: [...CHECK_IDS],
            gitHead: fp?.head ?? null,
            worktreeDigest: fp?.digest ?? null,
            evidenceIds: evidence.map((e) => e.id),
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
        },
    };
    // 2. Optional AI advisory — after the verdict is fixed, isolated from it.
    if (opts.provider) {
        const payload = buildAdvisoryPayload(report, root, config);
        if (opts.previewOnly) {
            report.advisory = {
                provider: opts.provider.id,
                status: 'preview',
                message: 'Payload built, nothing was sent (--ai-preview).',
                items: [],
                meta: { requestBytes: Buffer.byteLength(JSON.stringify(payload)) },
                sentPayload: payload,
            };
        }
        else {
            const deps = {
                env: opts.deps?.env ?? process.env,
                fetch: opts.deps?.fetch ?? globalThis.fetch,
                timeoutMs: opts.deps?.timeoutMs ?? config.ai.timeoutMs,
            };
            let res;
            try {
                res = await opts.provider.run(payload, deps);
            }
            catch (err) {
                // Providers should not throw; if one does, the gate still stands.
                res = {
                    provider: opts.provider.id,
                    status: 'error',
                    message: err instanceof Error ? err.message : String(err),
                    items: [],
                    meta: {},
                };
            }
            report.advisory = {
                ...res,
                ...(res.status === 'not-configured' ? {} : { sentPayload: payload }),
            };
        }
    }
    return report;
}
