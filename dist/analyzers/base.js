import { makeFindingId, } from '../core/findings.js';
import { describe } from '../i18n/index.js';
/** Creates a finding from the message catalog. */
export function mk(lang, o) {
    const d = describe(lang, o.rule, o.vars);
    const idParts = o.idParts ?? [o.location?.file, o.location?.line, JSON.stringify(o.vars)];
    const f = {
        id: makeFindingId(o.rule, idParts),
        rule: o.rule,
        category: o.category,
        severity: o.severity,
        status: o.status,
        source: o.source,
        title: d.title,
        observation: d.observation,
        explanation: d.explanation,
        consequence: d.consequence,
        howToVerify: d.verify,
        fix: d.fix,
    };
    if (o.location)
        f.location = o.location;
    if (o.evidence)
        f.evidence = o.evidence;
    if (o.data)
        f.data = o.data;
    return f;
}
export function ruleEnabled(rules, rule) {
    return rules[rule] !== false;
}
export function shortList(items, max = 5) {
    if (items.length <= max)
        return items.join(', ');
    return items.slice(0, max).join(', ') + ` … (+${items.length - max})`;
}
