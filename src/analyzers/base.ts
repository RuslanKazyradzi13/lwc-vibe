import {
  makeFindingId,
  type Category,
  type Finding,
  type FindingSource,
  type FindingStatus,
  type Lang,
  type Location,
  type Severity,
} from '../core/findings.js';
import { describe } from '../i18n/index.js';

export interface MkOptions {
  rule: string;
  category: Category;
  severity: Severity;
  status: FindingStatus;
  source: FindingSource;
  location?: Location;
  vars: Record<string, unknown>;
  /** Parts of the stable id (default: file + line + key variables). */
  idParts?: Array<string | number | undefined>;
  evidence?: string;
  data?: Record<string, unknown>;
}

/** Creates a finding from the message catalog. */
export function mk(lang: Lang, o: MkOptions): Finding {
  const d = describe(lang, o.rule, o.vars);
  const idParts = o.idParts ?? [o.location?.file, o.location?.line, JSON.stringify(o.vars)];
  const f: Finding = {
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
  if (o.location) f.location = o.location;
  if (o.evidence) f.evidence = o.evidence;
  if (o.data) f.data = o.data;
  return f;
}

export function ruleEnabled(rules: Record<string, boolean>, rule: string): boolean {
  return rules[rule] !== false;
}

export function shortList(items: string[], max = 5): string {
  if (items.length <= max) return items.join(', ');
  return items.slice(0, max).join(', ') + ` … (+${items.length - max})`;
}
