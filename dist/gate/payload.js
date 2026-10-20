/**
 * The advisory payload: the only data the Evidence Gate may send to an external provider.
 *
 * Built from the already computed gate report, so the provider sees metadata about checks and
 * findings — not the repository. Never included: source code, file contents, finding observations
 * (they may quote code or secrets), stdout/stderr of runs, environment variables, the journal.
 * Free text that is included (task title, claim texts, optional requirement excerpts) goes through
 * secret and personal-data redaction first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SEVERITY_ORDER } from '../core/findings.js';
import { redactSecrets } from '../analyzers/security.js';
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** 12-digit numbers (e.g. Kazakhstan IIN/BIN) and card-like digit runs. */
const LONG_NUMBER_RE = /(?<!\d)(?:\d[ -]?){12,19}(?!\d)/g;
const PHONE_RE = /\+?\d[\d ()-]{9,}\d/g;
/** Redacts secrets and obvious personal data from free text, then truncates it. */
export function redactText(text, max) {
    const clean = redactSecrets(text)
        .replace(EMAIL_RE, '[EMAIL]')
        .replace(LONG_NUMBER_RE, '[NUMBER]')
        .replace(PHONE_RE, '[PHONE]');
    return clean.length > max ? clean.slice(0, max) + ' …[truncated]' : clean;
}
function requirementExcerpt(root, config) {
    const parts = [];
    for (const rel of config.requirementFiles) {
        const abs = path.join(root, rel);
        try {
            if (!fs.existsSync(abs) || !fs.lstatSync(abs).isFile())
                continue;
            parts.push(`# ${rel}\n${fs.readFileSync(abs, 'utf8')}`);
        }
        catch (err) {
            // Say so instead of silently sending an incomplete picture.
            parts.push(`# ${rel}
[unreadable: ${err instanceof Error ? err.message : String(err)}]`);
        }
    }
    if (parts.length === 0)
        return undefined;
    return redactText(parts.join('\n\n'), config.ai.maxRequirementChars);
}
export function buildAdvisoryPayload(report, root, config) {
    const ai = config.ai;
    const ordered = [...report.radar.findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    const picked = ordered.slice(0, ai.maxFindings);
    const payload = {
        schema: 'lwc-gate-advisory/1',
        task: report.task
            ? { title: redactText(report.task.title, 200), stage: report.task.stage }
            : null,
        verdict: report.verdict,
        claims: report.claims.map((c) => ({
            id: c.id,
            text: redactText(c.text, 300),
            kinds: c.kinds,
            status: c.status,
        })),
        findings: picked.map((f) => {
            const item = {
                ref: f.id,
                rule: f.rule,
                category: f.category,
                severity: f.severity,
                status: f.status,
                title: f.title,
            };
            if (ai.includePaths && f.location?.file)
                item.file = f.location.file;
            if (ai.includeObservations)
                item.observation = redactText(f.observation, 300);
            return item;
        }),
        omittedFindings: ordered.length - picked.length,
    };
    if (ai.includeRequirements) {
        const req = requirementExcerpt(root, config);
        if (req)
            payload.requirements = req;
    }
    return payload;
}
