import { fill, ui } from '../i18n/index.js';
const CHECK_ICON = {
    pass: '✔',
    fail: '✖',
    gap: '?',
    skip: '–',
};
const MAX_LISTED = 10;
function tr(r) {
    return (k, vars = {}) => fill(ui(r.lang, k), vars);
}
function claimLine(r, c) {
    const t = tr(r);
    const kinds = c.kinds.length ? c.kinds.join(', ') : '—';
    const ev = c.evidence ? ` · ${t('report.evidence')}: ${c.evidence}` : '';
    return `${c.id} "${c.text}" [${kinds}] → ${t('claim.status.' + c.status)}: ${t(c.reason, c.vars)}${ev}`;
}
function checkLine(r, c) {
    const t = tr(r);
    const refs = c.refs.length
        ? ` [${c.refs.slice(0, 5).join(', ')}${c.refs.length > 5 ? ', …' : ''}]`
        : '';
    return `${CHECK_ICON[c.status]} ${c.id} · ${t('gate.check.' + c.id)} — ${t(c.reason, c.vars)}${refs}`;
}
function findingLine(r, f) {
    const t = tr(r);
    const loc = f.location
        ? ` (${f.location.file}${f.location.line ? ':' + f.location.line : ''})`
        : '';
    return `[${t('severity.' + f.severity)} · ${t('status.' + f.status)}] ${f.id} ${f.title}${loc}`;
}
function sections(r) {
    const t = tr(r);
    const confirmed = [];
    const unconfirmed = [];
    const blocking = [];
    for (const c of r.checks) {
        if (c.status === 'pass')
            confirmed.push(checkLine(r, c));
        else if (c.status === 'gap')
            unconfirmed.push(checkLine(r, c));
        else if (c.status === 'fail')
            blocking.push(checkLine(r, c));
    }
    for (const c of r.claims) {
        if (c.status === 'supported')
            confirmed.push(claimLine(r, c));
        else if (c.status === 'contradicted')
            blocking.push(claimLine(r, c));
        else if (c.status !== 'informational')
            unconfirmed.push(claimLine(r, c));
    }
    const crit = r.radar.findings.filter((f) => (f.severity === 'critical' || f.severity === 'high') && f.status === 'confirmed');
    for (const f of crit.slice(0, MAX_LISTED))
        blocking.push(findingLine(r, f));
    if (crit.length > MAX_LISTED)
        blocking.push(t('gate.more', { count: crit.length - MAX_LISTED }));
    return { confirmed, unconfirmed, blocking };
}
function advisoryLines(r) {
    const t = tr(r);
    const a = r.advisory;
    const out = [];
    out.push(t('ai.disclaimer'));
    out.push(`${t('ai.provider')}: ${a.provider} · ${t('report.status')}: ${t('ai.status.' + a.status)}${a.message ? ` — ${a.message}` : ''}`);
    if (a.meta.model || a.meta.endpoint)
        out.push(`${t('ai.meta')}: ${[a.meta.endpoint, a.meta.model, a.meta.httpStatus ? 'HTTP ' + a.meta.httpStatus : '', a.meta.durationMs !== undefined ? a.meta.durationMs + ' ms' : '', a.meta.requestBytes !== undefined ? a.meta.requestBytes + ' B' : '', a.meta.requestSha256 ? 'sha256 ' + a.meta.requestSha256.slice(0, 12) : ''].filter(Boolean).join(' · ')}`);
    else if (a.meta.requestBytes !== undefined)
        out.push(`${t('ai.meta')}: ${a.meta.requestBytes} B`);
    for (const it of a.items) {
        const conf = it.confidence !== undefined ? ` (${t('ai.confidence')} ${it.confidence.toFixed(2)})` : '';
        out.push(`◇ ${it.ref}: ${it.label}${conf}${it.rationale ? ' · ' + it.rationale : ''}`);
    }
    return out;
}
function reproLine(r) {
    const p = r.reproducibility;
    return [
        `lwc-vibe ${p.lwcVersion}`,
        `ruleset ${p.rulesetDigest}`,
        `config ${p.configDigest}`,
        `git HEAD ${p.gitHead ? p.gitHead.slice(0, 12) : '—'}`,
        `worktree ${p.worktreeDigest ? p.worktreeDigest.slice(0, 12) : '—'}`,
        `evidence ${p.evidenceIds.length}`,
        `node ${p.node}`,
        p.platform,
    ].join(' · ');
}
function header(r) {
    const t = tr(r);
    const out = [`${t('gate.title')} · lwc-vibe ${r.version}`];
    out.push(`${t('report.project')}: ${r.root}`);
    out.push(r.task
        ? `${t('gate.task')}: "${r.task.title}" (${r.task.stage})`
        : `${t('gate.task')}: ${t('gate.noTask')}`);
    out.push(`${t('report.generated')}: ${r.generatedAt}`);
    return out;
}
function changesLine(r) {
    const t = tr(r);
    if (!r.changes.git)
        return t('gate.changes.noGit');
    return t('gate.changes.summary', {
        files: r.changes.files.length,
        sources: r.changes.sources,
        tests: r.changes.tests,
    });
}
function radarLine(r) {
    const t = tr(r);
    const s = r.radar.summary;
    const b = s.bySeverity;
    return `${t('report.total')}: ${s.total} (${t('severity.critical')} ${b.critical ?? 0}, ${t('severity.high')} ${b.high ?? 0}, ${t('severity.medium')} ${b.medium ?? 0}, ${t('severity.low')} ${b.low ?? 0}, ${t('severity.info')} ${b.info ?? 0}) · ${t('report.suppressed')}: ${s.suppressed}${s.suppressedCriticalOrHigh ? ` · !! ${t('report.suppressedCritical')}` : ''}`;
}
export function renderGateText(r) {
    const t = tr(r);
    const L = [...header(r), ''];
    L.push(`${t('gate.verdict')}: ${t('gate.verdict.' + r.verdict)}`);
    L.push(`  ${t('gate.notProof')}`);
    L.push('');
    const s = sections(r);
    const block = (title, lines) => {
        L.push(`── ${title} (${lines.length}) ${'─'.repeat(Math.max(4, 60 - title.length))}`);
        if (lines.length === 0)
            L.push(`  ${t('gate.empty')}`);
        for (const l of lines)
            L.push(`  ${l}`);
        L.push('');
    };
    block(t('gate.section.blocking'), s.blocking);
    block(t('gate.section.unconfirmed'), s.unconfirmed);
    block(t('gate.section.confirmed'), s.confirmed);
    L.push(`── ${t('gate.section.facts')} ${'─'.repeat(40)}`);
    L.push(`  ${t('gate.section.changes')}: ${changesLine(r)}`);
    L.push(`  Anomaly Radar: ${radarLine(r)}`);
    L.push(`  ${t('gate.section.evidence')}: ${r.evidence.length}`);
    for (const e of r.evidence.slice(-5))
        L.push(`    ${e.id} \`${e.command}\` · ${e.kind} · exit ${e.exitCode ?? 'null'} · ${t('freshness.' + e.freshness)}`);
    for (const c of r.claims.filter((x) => x.status === 'informational'))
        L.push(`  ◇ ${claimLine(r, c)}`);
    L.push('');
    L.push(`── ${t('gate.section.ai')} ${'─'.repeat(40)}`);
    for (const l of advisoryLines(r))
        L.push(`  ${l}`);
    L.push('');
    L.push(`${t('gate.section.repro')}: ${reproLine(r)}`);
    return L.join('\n');
}
export function renderGateMarkdown(r) {
    const t = tr(r);
    const esc = (x) => x.replace(/\|/g, '\\|');
    const out = [`# ${t('gate.title')}`, ''];
    out.push(`**${t('gate.verdict')}: ${t('gate.verdict.' + r.verdict)}**`, '');
    out.push(`> ${t('gate.notProof')}`, '');
    for (const l of header(r).slice(1))
        out.push(`- ${l}`);
    out.push('');
    out.push(`## ${t('gate.section.checks')}`, '');
    out.push(`| ${t('gate.col.check')} | ${t('report.status')} | ${t('gate.col.detail')} |`);
    out.push('|---|---|---|');
    for (const c of r.checks)
        out.push(`| ${c.id} · ${t('gate.check.' + c.id)} | ${CHECK_ICON[c.status]} ${t('gate.status.' + c.status)} | ${esc(t(c.reason, c.vars))} |`);
    out.push('');
    const s = sections(r);
    const list = (title, lines) => {
        out.push(`## ${title} (${lines.length})`, '');
        if (lines.length === 0)
            out.push(`_${t('gate.empty')}_`);
        for (const l of lines)
            out.push(`- ${l}`);
        out.push('');
    };
    list(t('gate.section.blocking'), s.blocking);
    list(t('gate.section.unconfirmed'), s.unconfirmed);
    list(t('gate.section.confirmed'), s.confirmed);
    if (r.claims.length) {
        out.push(`## ${t('gate.section.claims')}`, '');
        out.push(`| ID | ${t('gate.col.claim')} | ${t('gate.col.kinds')} | ${t('report.status')} | ${t('report.evidence')} |`);
        out.push('|---|---|---|---|---|');
        for (const c of r.claims)
            out.push(`| ${c.id} | ${esc(c.text)} | ${c.kinds.join(', ') || '—'} | ${t('claim.status.' + c.status)} | ${c.evidence ?? '—'} |`);
        out.push('');
    }
    out.push(`## ${t('gate.section.facts')}`, '');
    out.push(`- ${t('gate.section.changes')}: ${changesLine(r)}`);
    out.push(`- Anomaly Radar: ${radarLine(r)}`);
    out.push(`- ${t('gate.section.evidence')}: ${r.evidence.length}`);
    for (const e of r.evidence.slice(-5))
        out.push(`  - \`${e.id}\` \`${e.command}\` · ${e.kind} · exit ${e.exitCode ?? 'null'} · ${t('freshness.' + e.freshness)}`);
    out.push('');
    out.push(`## ${t('gate.section.ai')}`, '');
    for (const l of advisoryLines(r))
        out.push(`- ${l}`);
    out.push('');
    out.push(`<sub>${t('gate.section.repro')}: ${reproLine(r)}</sub>`);
    return out.join('\n') + '\n';
}
export function renderGate(r, format) {
    if (format === 'json')
        return JSON.stringify(r, null, 2);
    if (format === 'md')
        return renderGateMarkdown(r);
    return renderGateText(r);
}
