import { ru } from './ru.js';
import { en } from './en.js';
import { kk } from './kk.js';
const catalogs = { ru, en, kk };
export function isLang(x) {
    return x === 'ru' || x === 'en' || x === 'kk';
}
export function catalog(lang) {
    return catalogs[lang] ?? en;
}
/** Fills {placeholders}. Missing values become "?". */
export function fill(template, vars = {}) {
    return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] === undefined || vars[k] === null ? '?' : String(vars[k]));
}
export function ui(lang, key) {
    return catalog(lang).ui[key] ?? catalog('en').ui[key] ?? key;
}
export function ruleText(lang, rule) {
    const c = catalog(lang).rules[rule] ?? catalog('en').rules[rule];
    if (c)
        return c;
    return {
        title: rule,
        observation: '{snippet}',
        explanation: '',
        consequence: '',
        verify: '',
        fix: '',
    };
}
/** Builds the text fields of a finding from the catalog and variables. */
export function describe(lang, rule, vars) {
    const t = ruleText(lang, rule);
    return {
        title: fill(t.title, vars),
        observation: fill(t.observation, vars),
        explanation: fill(t.explanation, vars),
        consequence: fill(t.consequence, vars),
        verify: fill(t.verify, vars),
        fix: fill(t.fix, vars),
    };
}
