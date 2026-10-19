import { buildImportGraph, findCycles, parseExports } from '../core/graph.js';
import { isSourceFile } from '../core/scan.js';
import { matchesAny } from '../core/glob.js';
import { changedFilesForProject, getGitInfo, gitPrefix, gitShowHead } from '../core/git.js';
import { mk, ruleEnabled, shortList } from './base.js';
export const architectureAnalyzer = {
    id: 'architecture',
    category: 'architecture',
    run(ctx) {
        const out = [];
        const lang = ctx.lang;
        const g = buildImportGraph(ctx.files, ctx.read, isSourceFile);
        const fileSet = new Set(ctx.files);
        // ARCH-001: cycles (a confirmed structural fact).
        if (ruleEnabled(ctx.config.rules, 'ARCH-001')) {
            for (const cycle of findCycles(g)) {
                const first = cycle[0];
                const edge = g.edges.find((e) => e.from === first && cycle.includes(e.to));
                out.push(mk(lang, {
                    rule: 'ARCH-001',
                    category: 'architecture',
                    severity: cycle.length > 2 ? 'high' : 'medium',
                    status: 'confirmed',
                    source: 'static-analyzer',
                    location: { file: first, line: edge?.line },
                    vars: { cycle: [...cycle, first].join(' → ') },
                    idParts: ['ARCH-001', cycle.join('|')],
                    data: { cycle },
                }));
            }
        }
        // ARCH-002: module boundaries from the configuration.
        if (ruleEnabled(ctx.config.rules, 'ARCH-002')) {
            for (const b of ctx.config.boundaries) {
                for (const e of g.edges) {
                    if (e.to.startsWith('pkg:'))
                        continue;
                    if (!matchesAny(e.from, [b.from]))
                        continue;
                    if (!matchesAny(e.to, b.deny))
                        continue;
                    out.push(mk(lang, {
                        rule: 'ARCH-002',
                        category: 'architecture',
                        severity: 'high',
                        status: 'confirmed',
                        source: 'static-analyzer',
                        location: { file: e.from, line: e.line },
                        vars: {
                            from: e.from,
                            to: e.to,
                            boundary: b.note ?? `${b.from} ✗ ${b.deny.join(', ')}`,
                        },
                        idParts: ['ARCH-002', e.from, e.to],
                    }));
                }
            }
        }
        // ARCH-003: excessive fan-out.
        if (ruleEnabled(ctx.config.rules, 'ARCH-003')) {
            const max = ctx.config.thresholds.maxFanOut;
            for (const [file, targets] of g.out) {
                if (targets.size > max) {
                    out.push(mk(lang, {
                        rule: 'ARCH-003',
                        category: 'architecture',
                        severity: 'low',
                        status: 'warning',
                        source: 'static-analyzer',
                        location: { file },
                        vars: { file, n: targets.size, max },
                        idParts: ['ARCH-003', file],
                        data: { imports: [...targets] },
                    }));
                }
            }
        }
        // ARCH-004: paths mentioned in architecture docs that do not exist.
        if (ruleEnabled(ctx.config.rules, 'ARCH-004')) {
            const dirs = new Set();
            for (const f of ctx.files) {
                const parts = f.split('/');
                for (let i = 1; i < parts.length; i++)
                    dirs.add(parts.slice(0, i).join('/'));
            }
            for (const doc of ctx.config.architectureDocs) {
                const text = ctx.read(doc);
                if (text == null)
                    continue;
                const seen = new Set();
                // Back-quoted paths such as `src/foo/` or `src/foo/bar.ts`
                for (const m of text.matchAll(/`((?:[\w.-]+\/)+[\w.-]*)`/g)) {
                    let p = m[1].replace(/\/$/, '');
                    if (p.startsWith('./'))
                        p = p.slice(2);
                    if (seen.has(p) || p.includes('*') || p.includes('<') || p.startsWith('.'))
                        continue;
                    if (/^(https?|node_modules|\.\.)/.test(p))
                        continue;
                    seen.add(p);
                    if (fileSet.has(p) || dirs.has(p))
                        continue;
                    // Relative fragments such as `cli/` or `core/state.ts` (no root segment) are ambiguous — skip.
                    const first = p.split('/')[0];
                    if (!dirs.has(first) && !fileSet.has(first))
                        continue;
                    // Directories deliberately not scanned (dist, node_modules) are not a divergence.
                    if (matchesAny(p, ctx.config.ignore))
                        continue;
                    const line = text.slice(0, m.index).split('\n').length;
                    out.push(mk(lang, {
                        rule: 'ARCH-004',
                        category: 'architecture',
                        severity: 'low',
                        status: 'probable',
                        source: 'static-analyzer',
                        location: { file: doc, line },
                        vars: { doc, path: p },
                        idParts: ['ARCH-004', doc, p],
                    }));
                }
            }
        }
        // ARCH-005: removed exports while dependents are unchanged (via git HEAD).
        if (ruleEnabled(ctx.config.rules, 'ARCH-005')) {
            const gi = getGitInfo(ctx.root);
            if (gi.available && gi.root) {
                const prefix = gitPrefix(gi.root, ctx.root);
                const changed = new Set(changedFilesForProject(gi, ctx.root));
                for (const file of changed) {
                    if (!isSourceFile(file) || !fileSet.has(file))
                        continue;
                    const now = ctx.read(file);
                    const before = gitShowHead(gi.root, prefix ? `${prefix}/${file}` : file);
                    if (now == null || before == null)
                        continue;
                    const removed = parseExports(file, before).filter((n) => !parseExports(file, now).includes(n));
                    if (removed.length === 0)
                        continue;
                    const dependents = [...(g.in.get(file) ?? [])].filter((d) => !changed.has(d));
                    // Keep only dependents that actually use the removed names.
                    const using = dependents.filter((d) => {
                        const t = ctx.read(d) ?? '';
                        return removed.some((n) => new RegExp(`\\b${n}\\b`).test(t));
                    });
                    if (using.length === 0)
                        continue;
                    out.push(mk(lang, {
                        rule: 'ARCH-005',
                        category: 'architecture',
                        severity: 'high',
                        status: 'probable',
                        source: 'static-analyzer',
                        location: { file },
                        vars: { file, removed: removed.join(', '), dependents: shortList(using) },
                        idParts: ['ARCH-005', file, removed.join(',')],
                    }));
                }
            }
        }
        ctx.log(`architecture: ${g.nodes.size} nodes, ${g.edges.length} edges, ${out.length} findings`);
        return out;
    },
};
