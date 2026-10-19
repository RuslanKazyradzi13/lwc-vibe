import { sortFindings } from '../core/findings.js';
import { mk } from '../analyzers/base.js';
export function parseCsv(text, delimiter) {
    const clean = text.replace(/^﻿/, '');
    const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0)
        return [];
    const d = delimiter ?? (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');
    const parseLine = (line) => {
        const cells = [];
        let cur = '';
        let q = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (q) {
                if (c === '"' && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                }
                else if (c === '"')
                    q = false;
                else
                    cur += c;
            }
            else if (c === '"')
                q = true;
            else if (c === d) {
                cells.push(cur);
                cur = '';
            }
            else
                cur += c;
        }
        cells.push(cur);
        return cells.map((x) => x.trim());
    };
    const header = parseLine(lines[0]);
    return lines.slice(1).map((l) => {
        const cells = parseLine(l);
        const row = {};
        header.forEach((h, i) => (row[h] = cells[i] ?? ''));
        return row;
    });
}
export function parseData(text, filename) {
    if (filename.toLowerCase().endsWith('.json')) {
        let j;
        try {
            j = JSON.parse(text);
        }
        catch (e) {
            throw new Error(`${filename}: invalid JSON (${e instanceof Error ? e.message : String(e)})`);
        }
        const arr = Array.isArray(j) ? j : j.rows;
        if (!Array.isArray(arr))
            throw new Error('JSON must be an array of objects or {rows: [...]}');
        return arr.map((r) => {
            const row = {};
            for (const [k, v] of Object.entries(r))
                row[k] = v == null ? '' : String(v);
            return row;
        });
    }
    return parseCsv(text);
}
export function toNumber(v) {
    if (v == null)
        return null;
    const s = v
        .replace(/\s| /g, '')
        .replace(',', '.')
        .replace(/[₸]|KZT|тг\.?/gi, '');
    if (s === '')
        return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}
export function toDate(v) {
    if (!v)
        return null;
    const s = v.trim().replace(' ', 'T');
    const t = Date.parse(s);
    if (Number.isFinite(t))
        return t;
    // DD.MM.YYYY [HH:mm]
    const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v.trim());
    if (m) {
        const t2 = Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
        return Number.isFinite(t2) ? t2 : null;
    }
    return null;
}
function median(xs) {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
export function fmtMoney(n, currency) {
    const s = n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    return currency ? `${s} ${currency}` : s;
}
export function checkOps(rows, rules, lang, history = []) {
    const out = [];
    const applied = [];
    const cur = rules.currency;
    const rowNo = (i) => i + 2; // +1 header row, +1 one-based numbering
    // OPS-008: number and date formats.
    const numericFields = new Set([
        ...(rules.numericFields ?? []),
        ...(rules.nonNegative ?? []),
        ...(rules.totals ?? []).flatMap((t) => [t.total, ...t.parts]),
        ...(rules.ranges ?? []).map((r) => r.field),
    ]);
    const dateFields = new Set([
        ...(rules.dateFields ?? []),
        ...(rules.timeSequence ?? []).flatMap((t) => [t.before, t.after]),
    ]);
    if (numericFields.size || dateFields.size)
        applied.push('OPS-008');
    const typeName = (kind) => kind === 'number'
        ? lang === 'en'
            ? 'number'
            : lang === 'kk'
                ? 'сан'
                : 'числом'
        : lang === 'en'
            ? 'date/time'
            : lang === 'kk'
                ? 'күн/уақыт'
                : 'датой/временем';
    const unparsable = (i, f, v, kind) => mk(lang, {
        rule: 'OPS-008',
        category: 'ops',
        severity: 'medium',
        status: 'confirmed',
        source: 'rule',
        location: { file: 'report', line: rowNo(i) },
        vars: { row: rowNo(i), field: f, value: v, type: typeName(kind) },
        idParts: ['OPS-008', i, f],
    });
    rows.forEach((row, i) => {
        for (const f of numericFields) {
            const v = row[f];
            if (v && toNumber(v) === null)
                out.push(unparsable(i, f, v, 'number'));
        }
        for (const f of dateFields) {
            const v = row[f];
            if (v && toDate(v) === null)
                out.push(unparsable(i, f, v, 'date'));
        }
    });
    // OPS-001: required fields.
    if (rules.required?.length) {
        applied.push('OPS-001');
        rows.forEach((row, i) => {
            for (const f of rules.required) {
                if ((row[f] ?? '').trim() === '') {
                    out.push(mk(lang, {
                        rule: 'OPS-001',
                        category: 'ops',
                        severity: 'high',
                        status: 'confirmed',
                        source: 'rule',
                        location: { file: 'report', line: rowNo(i) },
                        vars: { row: rowNo(i), field: f },
                        idParts: ['OPS-001', i, f],
                    }));
                }
            }
        });
    }
    // OPS-002: non-negative fields.
    if (rules.nonNegative?.length) {
        applied.push('OPS-002');
        rows.forEach((row, i) => {
            for (const f of rules.nonNegative) {
                const n = toNumber(row[f]);
                if (n !== null && n < 0) {
                    out.push(mk(lang, {
                        rule: 'OPS-002',
                        category: 'ops',
                        severity: 'high',
                        status: 'confirmed',
                        source: 'rule',
                        location: { file: 'report', line: rowNo(i) },
                        vars: { row: rowNo(i), field: f, value: fmtMoney(n, cur) },
                        idParts: ['OPS-002', i, f],
                    }));
                }
            }
        });
    }
    // OPS-003: totals.
    if (rules.totals?.length) {
        applied.push('OPS-003');
        rows.forEach((row, i) => {
            for (const t of rules.totals) {
                const declared = toNumber(row[t.total]);
                const parts = t.parts.map((p) => toNumber(row[p]));
                if (declared === null || parts.some((p) => p === null))
                    continue;
                const computed = parts.reduce((a, b) => a + b, 0);
                const tol = t.tolerance ?? 0.01;
                const diff = declared - computed;
                if (Math.abs(diff) > tol) {
                    out.push(mk(lang, {
                        rule: 'OPS-003',
                        category: 'ops',
                        severity: 'high',
                        status: 'confirmed',
                        source: 'rule',
                        location: { file: 'report', line: rowNo(i) },
                        vars: {
                            row: rowNo(i),
                            total: t.total,
                            declared: fmtMoney(declared, cur),
                            parts: t.parts.join(' + '),
                            computed: fmtMoney(computed, cur),
                            diff: fmtMoney(diff, cur),
                        },
                        idParts: ['OPS-003', i, t.total],
                    }));
                }
            }
        });
    }
    // OPS-004: duplicates.
    if (rules.uniqueKey?.length) {
        applied.push('OPS-004');
        const seen = new Map();
        rows.forEach((row, i) => {
            const key = rules.uniqueKey.map((k) => (row[k] ?? '').trim()).join('|');
            if (!seen.has(key))
                seen.set(key, []);
            seen.get(key).push(i);
        });
        for (const [key, idxs] of seen) {
            if (idxs.length < 2)
                continue;
            const rowsStr = idxs.map(rowNo).join(', ');
            out.push(mk(lang, {
                rule: 'OPS-004',
                category: 'ops',
                severity: 'high',
                status: 'confirmed',
                source: 'rule',
                location: { file: 'report', line: rowNo(idxs[0]) },
                vars: { rows: rowsStr, key: `${rules.uniqueKey.join('+')} = ${key}` },
                idParts: ['OPS-004', key],
            }));
        }
    }
    // OPS-005: time sequence.
    if (rules.timeSequence?.length) {
        applied.push('OPS-005');
        rows.forEach((row, i) => {
            for (const s of rules.timeSequence) {
                const a = toDate(row[s.before]);
                const b = toDate(row[s.after]);
                if (a === null || b === null)
                    continue;
                if (b < a) {
                    out.push(mk(lang, {
                        rule: 'OPS-005',
                        category: 'ops',
                        severity: 'high',
                        status: 'confirmed',
                        source: 'rule',
                        location: { file: 'report', line: rowNo(i) },
                        vars: {
                            row: rowNo(i),
                            before: s.before,
                            after: s.after,
                            beforeValue: row[s.before],
                            afterValue: row[s.after],
                        },
                        idParts: ['OPS-005', i, s.before, s.after],
                    }));
                }
            }
        });
    }
    // OPS-007: ranges.
    if (rules.ranges?.length) {
        applied.push('OPS-007');
        rows.forEach((row, i) => {
            for (const r of rules.ranges) {
                const n = toNumber(row[r.field]);
                if (n === null)
                    continue;
                const min = r.min ?? -Infinity;
                const max = r.max ?? Infinity;
                if (n < min || n > max) {
                    out.push(mk(lang, {
                        rule: 'OPS-007',
                        category: 'ops',
                        severity: r.severity ?? 'medium',
                        status: 'confirmed',
                        source: 'rule',
                        location: { file: 'report', line: rowNo(i) },
                        vars: {
                            row: rowNo(i),
                            field: r.field,
                            value: n,
                            min: r.min ?? '−∞',
                            max: r.max ?? '+∞',
                        },
                        idParts: ['OPS-007', i, r.field],
                    }));
                }
            }
        });
    }
    // OPS-006: spike vs history (probable — needs human confirmation).
    if (rules.spikes?.length && history.length > 0) {
        applied.push('OPS-006');
        for (const sp of rules.spikes) {
            const agg = sp.aggregate ?? 'sum';
            const window = sp.window ?? 7;
            const maxRatio = sp.maxRatio ?? 3;
            const aggregate = (rs) => {
                const nums = rs.map((r) => toNumber(r[sp.field])).filter((x) => x !== null);
                if (agg === 'count')
                    return rs.length;
                if (nums.length === 0)
                    return null;
                const sum = nums.reduce((a, b) => a + b, 0);
                return agg === 'mean' ? sum / nums.length : sum;
            };
            // History: group by period and take the last `window` periods.
            const groups = new Map();
            const pf = sp.periodField;
            for (const h of history) {
                const key = pf ? (h[pf] ?? '') : 'all';
                if (!groups.has(key))
                    groups.set(key, []);
                groups.get(key).push(h);
            }
            const periods = [...groups.keys()].sort().slice(-window);
            const histVals = periods
                .map((p) => aggregate(groups.get(p)))
                .filter((x) => x !== null);
            const current = aggregate(rows);
            if (histVals.length === 0 || current === null)
                continue;
            const med = median(histVals);
            if (med === 0)
                continue;
            const ratio = current / med;
            if (ratio > maxRatio || ratio < 1 / maxRatio) {
                out.push(mk(lang, {
                    rule: 'OPS-006',
                    category: 'ops',
                    severity: sp.severity ?? 'medium',
                    status: 'probable',
                    source: 'rule',
                    location: { file: 'report' },
                    vars: {
                        field: `${sp.field} (${agg})`,
                        value: fmtMoney(current, agg === 'count' ? undefined : cur),
                        window: histVals.length,
                        median: fmtMoney(med, agg === 'count' ? undefined : cur),
                        ratio: ratio.toFixed(2),
                        threshold: `×${maxRatio}`,
                    },
                    idParts: ['OPS-006', sp.field, agg],
                }));
            }
        }
    }
    return {
        name: rules.name ?? 'report',
        rows: rows.length,
        findings: sortFindings(out),
        rulesApplied: applied,
    };
}
