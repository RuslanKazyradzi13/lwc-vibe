/**
 * Anomaly Radar orchestrator: scans files, runs analyzers, applies suppressions.
 */
import path from 'node:path';
import { makeFindingId, sortFindings, SEVERITY_ORDER } from './findings.js';
import { makeReader, scanFiles } from './scan.js';
import { loadSuppressions } from './state.js';
import { describe } from '../i18n/index.js';
import { requirementsAnalyzer } from '../analyzers/requirements.js';
import { architectureAnalyzer } from '../analyzers/architecture.js';
import { implementationAnalyzer } from '../analyzers/implementation.js';
import { securityAnalyzer } from '../analyzers/security.js';
import { processAnalyzer } from '../analyzers/process.js';
import { testsRunnerAnalyzer } from '../analyzers/tests-runner.js';
export const ANALYZERS = [
    requirementsAnalyzer,
    architectureAnalyzer,
    implementationAnalyzer,
    securityAnalyzer,
    processAnalyzer,
    testsRunnerAnalyzer,
];
export const VERSION = '0.1.0';
export function applySuppressions(findings, sups) {
    const kept = [];
    const suppressed = [];
    for (const f of findings) {
        const s = sups.find((x) => {
            if (x.match.id && x.match.id !== f.id)
                return false;
            if (x.match.rule && x.match.rule !== f.rule)
                return false;
            if (x.match.file && x.match.file !== f.location?.file)
                return false;
            return Boolean(x.match.id || x.match.rule || x.match.file);
        });
        if (s) {
            suppressed.push({
                ...f,
                status: 'false-positive',
                suppressed: { reason: s.reason, by: s.by, date: s.date },
            });
        }
        else
            kept.push(f);
    }
    return { kept, suppressed };
}
export async function runRadar(opts) {
    const root = path.resolve(opts.root);
    const lang = opts.lang ?? opts.config.lang;
    const log = [];
    let files = scanFiles(root, opts.config.ignore);
    if (opts.only && opts.only.length > 0) {
        const only = opts.only.map((p) => p.replace(/\\/g, '/').replace(/\/$/, ''));
        files = files.filter((f) => only.some((o) => f === o || f.startsWith(o + '/')));
    }
    const ctx = {
        root,
        files,
        read: makeReader(root),
        lang,
        config: opts.config,
        allowRunCommands: opts.allowRunCommands ?? false,
        log: (m) => log.push(m),
    };
    const analyzers = [...ANALYZERS, ...(opts.extraAnalyzers ?? [])].filter((a) => !opts.categories || opts.categories.includes(a.category));
    const all = [];
    for (const a of analyzers) {
        try {
            const res = await a.run(ctx);
            all.push(...res);
        }
        catch (err) {
            const e = err instanceof Error ? err.message : String(err);
            const d = describe(lang, 'RADAR-ERR', { analyzer: a.id, error: e });
            all.push({
                id: makeFindingId('RADAR-ERR', [a.id, e]),
                rule: 'RADAR-ERR',
                category: a.category,
                severity: 'info',
                status: 'warning',
                source: 'rule',
                title: d.title,
                observation: d.observation,
                explanation: d.explanation,
                consequence: d.consequence,
                howToVerify: d.verify,
                fix: d.fix,
            });
            if (opts.verbose && err instanceof Error)
                log.push(err.stack ?? e);
        }
    }
    // De-duplicate by id.
    const uniq = new Map();
    for (const f of all)
        if (!uniq.has(f.id))
            uniq.set(f.id, f);
    const { kept, suppressed } = applySuppressions([...uniq.values()], loadSuppressions(root));
    const findings = sortFindings(kept);
    const count = (xs, key) => {
        const r = {};
        for (const f of xs)
            r[key(f)] = (r[key(f)] ?? 0) + 1;
        return r;
    };
    return {
        tool: 'lwc-vibe',
        version: VERSION,
        generatedAt: new Date().toISOString(),
        root,
        lang,
        filesScanned: files.length,
        analyzers: analyzers.map((a) => a.id),
        findings,
        suppressed: sortFindings(suppressed),
        summary: {
            total: findings.length,
            bySeverity: count(findings, (f) => f.severity),
            byCategory: count(findings, (f) => f.category),
            byStatus: count(findings, (f) => f.status),
            suppressed: suppressed.length,
            suppressedCriticalOrHigh: suppressed.filter((f) => SEVERITY_ORDER[f.severity] <= 1).length,
        },
        log,
    };
}
