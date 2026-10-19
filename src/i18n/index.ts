import type { Lang } from '../core/findings.js';
import type { Catalog, RuleText } from './types.js';
import { ru } from './ru.js';
import { en } from './en.js';
import { kk } from './kk.js';

const catalogs: Record<Lang, Catalog> = { ru, en, kk };

export function isLang(x: unknown): x is Lang {
  return x === 'ru' || x === 'en' || x === 'kk';
}

export function catalog(lang: Lang): Catalog {
  return catalogs[lang] ?? en;
}

/** Fills {placeholders}. Missing values become "?". */
export function fill(template: string, vars: Record<string, unknown> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] === undefined || vars[k] === null ? '?' : String(vars[k]),
  );
}

export function ui(lang: Lang, key: string): string {
  return catalog(lang).ui[key] ?? catalog('en').ui[key] ?? key;
}

export function ruleText(lang: Lang, rule: string): RuleText {
  const c = catalog(lang).rules[rule] ?? catalog('en').rules[rule];
  if (c) return c;
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
export function describe(
  lang: Lang,
  rule: string,
  vars: Record<string, unknown>,
): Pick<RuleText, 'title' | 'observation' | 'explanation' | 'consequence' | 'verify' | 'fix'> {
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
