// lwc-ignore-file: this module contains the rule patterns themselves (strings with eval, <= length, etc.), not their use.
/**
 * C. Implementation anomalies. Text heuristics for JS/TS/Python plus graph analysis.
 * Statuses: probable / warning / evidence-gap. IMPL-005 (a real test run) lives in tests-runner.ts.
 */
import path from 'node:path';
import type {
  Analyzer,
  AnalyzerContext,
  Finding,
  FindingStatus,
  L10n,
  Severity,
} from '../core/findings.js';
import {
  fileIgnored,
  isInComment,
  isInStringOrRegex,
  isSourceFile,
  isTestFile,
  lineIgnored,
  lineOf,
  snippet,
} from '../core/scan.js';
import { buildImportGraph, parseExports } from '../core/graph.js';
import { mk, ruleEnabled } from './base.js';

interface Pattern {
  rule: string;
  what: L10n;
  re: RegExp;
  severity: Severity;
  status: FindingStatus;
  langs: Array<'js' | 'py'>;
  /** Extra context check; false — skip the match. */
  guard?: (text: string, index: number) => boolean;
  /** Skip test files (throwing on bad data is desired behaviour in tests). */
  skipTests?: boolean;
}

/** Inside a try { ... } block? (rough: nearest unclosed `try` above). */
function insideTry(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const tryIdx = before.lastIndexOf('try');
  if (tryIdx === -1) return false;
  const between = before.slice(tryIdx);
  const opens = (between.match(/\{/g) ?? []).length;
  const closes = (between.match(/\}/g) ?? []).length;
  if (/\bexcept\b/.test(between)) return false;
  return opens > closes;
}

const PATTERNS: Pattern[] = [
  // IMPL-001 — data handling
  {
    rule: 'IMPL-001',
    what: {
      en: 'JSON.parse without try/catch',
      ru: 'JSON.parse без try/catch',
      kk: 'JSON.parse try/catch-сыз',
    },
    re: /\bJSON\.parse\s*\(/g,
    severity: 'medium',
    status: 'probable',
    langs: ['js'],
    guard: (t, i) => !insideTry(t, i),
    skipTests: true,
  },
  {
    rule: 'IMPL-001',
    what: {
      en: 'parseInt without a radix',
      ru: 'parseInt без основания системы счисления',
      kk: 'parseInt санау жүйесінің негізінсіз',
    },
    re: /\bparseInt\s*\(\s*[^,()]+\)/g,
    severity: 'low',
    status: 'warning',
    langs: ['js'],
  },
  {
    rule: 'IMPL-001',
    what: {
      en: 'json.loads without error handling',
      ru: 'json.loads без обработки ошибок',
      kk: 'json.loads қателерді өңдеусіз',
    },
    re: /\bjson\.loads\s*\(/g,
    severity: 'medium',
    status: 'probable',
    langs: ['py'],
    guard: (t, i) => !insideTry(t, i),
    skipTests: true,
  },
  // IMPL-002 — exception handling
  {
    rule: 'IMPL-002',
    what: {
      en: 'Empty catch block (error is swallowed)',
      ru: 'Пустой блок catch (ошибка проглатывается)',
      kk: 'Бос catch блогы (қате жұтылады)',
    },
    re: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*\}/g,
    severity: 'medium',
    status: 'probable',
    langs: ['js'],
  },
  {
    rule: 'IMPL-002',
    what: {
      en: 'Promise.then without .catch',
      ru: 'Promise.then без .catch',
      kk: 'Promise.then .catch-сыз',
    },
    re: /\.then\s*\([^;\n]*\)\s*;?\s*$/gm,
    severity: 'low',
    status: 'warning',
    langs: ['js'],
    guard: (t, i) => {
      const lineStart = t.lastIndexOf('\n', i) + 1;
      const lineEnd = t.indexOf('\n', i) === -1 ? t.length : t.indexOf('\n', i);
      const line = t.slice(lineStart, lineEnd);
      return !/\.catch\s*\(/.test(line) && !/\bawait\b/.test(line) && !/\breturn\b/.test(line);
    },
  },
  {
    rule: 'IMPL-002',
    what: {
      en: 'Bare except: (catches everything, including KeyboardInterrupt)',
      ru: 'Голый except: (перехватывает всё, включая KeyboardInterrupt)',
      kk: 'Жалаң except: (бәрін ұстайды, KeyboardInterrupt қоса)',
    },
    re: /^\s*except\s*:\s*$/gm,
    severity: 'medium',
    status: 'probable',
    langs: ['py'],
  },
  {
    rule: 'IMPL-002',
    what: {
      en: 'except … : pass (error is swallowed)',
      ru: 'except … : pass (ошибка проглатывается)',
      kk: 'except … : pass (қате жұтылады)',
    },
    re: /^\s*except\b[^\n]*:\s*\n\s*pass\b/gm,
    severity: 'medium',
    status: 'probable',
    langs: ['py'],
  },
  // IMPL-003 — conditions and boundaries
  {
    rule: 'IMPL-003',
    what: {
      en: 'Loop up to <= length (possible out-of-bounds access)',
      ru: 'Цикл до <= length (возможный выход за границу массива)',
      kk: '<= length дейінгі цикл (массив шекарасынан шығу мүмкін)',
    },
    re: /\b(?:i|j|k|n|idx|index|pos)\s*<=\s*[\w.$]+\.length\b/g,
    severity: 'high',
    status: 'probable',
    langs: ['js'],
  },
  {
    rule: 'IMPL-003',
    what: {
      en: 'Loose equality == / != (type coercion)',
      ru: 'Нестрогое сравнение == / != (приведение типов)',
      kk: 'Қатаң емес салыстыру == / != (түр келтіру)',
    },
    re: /[^=!<>]==[^=]|!=[^=]/g,
    severity: 'low',
    status: 'warning',
    langs: ['js'],
    guard: (t, i) => !/\b(null|undefined)\b/.test(snippet(t, i)),
  },
  {
    rule: 'IMPL-003',
    what: {
      en: 'Assignment in a condition (= instead of ===)',
      ru: 'Присваивание в условии (= вместо ===)',
      kk: 'Шарттағы меншіктеу (=== орнына =)',
    },
    re: /\bif\s*\(\s*[\w.$\[\]]+\s*=\s*[^=][^)]*\)/g,
    severity: 'high',
    status: 'probable',
    langs: ['js'],
  },
  {
    rule: 'IMPL-003',
    what: {
      en: 'range(1, len(x)) — first element skipped?',
      ru: 'Диапазон range(1, len(x)) — пропуск первого элемента?',
      kk: 'range(1, len(x)) — бірінші элемент өткізіліп кетті ме?',
    },
    re: /\brange\s*\(\s*1\s*,\s*len\s*\(/g,
    severity: 'low',
    status: 'warning',
    langs: ['py'],
  },
];

function kindOf(rel: string): 'js' | 'py' | null {
  const ext = path.extname(rel);
  if (ext === '.py') return 'py';
  if (isSourceFile(rel)) return 'js';
  return null;
}

/** Line normalisation for duplicate detection. */
function norm(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

export const implementationAnalyzer: Analyzer = {
  id: 'implementation',
  category: 'implementation',
  run(ctx: AnalyzerContext): Finding[] {
    const out: Finding[] = [];
    const lang = ctx.lang;
    const sources = ctx.files.filter((f) => isSourceFile(f));

    // IMPL-001..003: patterns.
    for (const file of sources) {
      const kind = kindOf(file);
      if (!kind) continue;
      const text = ctx.read(file);
      if (text == null || fileIgnored(text)) continue;
      const testFile = isTestFile(file);
      for (const p of PATTERNS) {
        if (!p.langs.includes(kind) || !ruleEnabled(ctx.config.rules, p.rule)) continue;
        if (p.skipTests && testFile) continue;
        p.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = p.re.exec(text))) {
          const idx = m.index;
          if (isInComment(text, idx) || lineIgnored(text, idx) || isInStringOrRegex(text, idx + 1))
            continue;
          if (p.guard && !p.guard(text, idx)) continue;
          out.push(
            mk(lang, {
              rule: p.rule,
              category: 'implementation',
              severity: p.severity,
              status: p.status,
              source: 'rule',
              location: { file, line: lineOf(text, idx) },
              vars: { what: p.what[lang], snippet: snippet(text, idx) },
              idParts: [p.rule, file, lineOf(text, idx), p.what.en],
            }),
          );
          if (m[0].length === 0) p.re.lastIndex++;
        }
      }
    }

    // IMPL-004: modules without tests (evidence gap, not a defect).
    if (ruleEnabled(ctx.config.rules, 'IMPL-004')) {
      const tests = sources.filter(isTestFile);
      const testText = tests.map((t) => ctx.read(t) ?? '').join('\n');
      const hasAnyTests = tests.length > 0;
      for (const file of sources) {
        if (isTestFile(file)) continue;
        const base = path.basename(file).replace(/\.[^.]+$/, '');
        if (/^(index|main|__init__|setup|conf|config|types?)$/i.test(base)) continue;
        const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const mentioned =
          new RegExp(`(^|[^\\w])${esc}([^\\w]|$)`).test(testText) || testText.includes(file);
        if (mentioned) continue;
        out.push(
          mk(lang, {
            rule: 'IMPL-004',
            category: 'implementation',
            severity: hasAnyTests ? 'low' : 'medium',
            status: 'evidence-gap',
            source: 'static-analyzer',
            location: { file },
            vars: { file },
            idParts: ['IMPL-004', file],
          }),
        );
      }
    }

    // IMPL-006: unused exports.
    if (ruleEnabled(ctx.config.rules, 'IMPL-006')) {
      const g = buildImportGraph(ctx.files, ctx.read, isSourceFile);
      const allText = new Map<string, string>();
      for (const f of sources) allText.set(f, ctx.read(f) ?? '');
      for (const file of sources) {
        if (isTestFile(file)) continue;
        const base = path.basename(file);
        // Entry points and index files are public by nature.
        if (/^(index|main|cli|app|server|__init__|__main__)\./.test(base)) continue;
        const text = allText.get(file) ?? '';
        const exports = parseExports(file, text);
        if (exports.length === 0) continue;
        const importers = [...(g.in.get(file) ?? [])];
        for (const name of exports) {
          if (name === 'default') continue;
          const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
          // Is the name used anywhere outside its own file (tests and dynamic use included)?
          const usedElsewhere = [...allText.entries()].some(([f, t]) => f !== file && re.test(t));
          if (usedElsewhere) continue;
          out.push(
            mk(lang, {
              rule: 'IMPL-006',
              category: 'implementation',
              severity: 'low',
              status: importers.length === 0 ? 'warning' : 'probable',
              source: 'static-analyzer',
              location: { file },
              vars: { name, file },
              idParts: ['IMPL-006', file, name],
            }),
          );
        }
      }
    }

    // IMPL-007: duplicates (windows of normalised lines).
    if (ruleEnabled(ctx.config.rules, 'IMPL-007')) {
      const minLines = ctx.config.thresholds.duplicateMinLines;
      const windows = new Map<string, { file: string; line: number }>();
      const reported = new Set<string>();
      for (const file of sources) {
        if (isTestFile(file)) continue;
        const lines = (ctx.read(file) ?? '').split('\n').map(norm);
        for (let i = 0; i + minLines <= lines.length; i++) {
          const win = lines.slice(i, i + minLines);
          // Skip windows made of short/boilerplate lines (braces, imports).
          const meaningful = win.filter(
            (l) => l.length > 12 && !/^(import|from|export|\}|\{|\)|\]|\/\/|#)/.test(l),
          );
          if (meaningful.length < Math.ceil(minLines * 0.6)) continue;
          const key = win.join('\u0001');
          const prev = windows.get(key);
          // Duplicate in another file, or in the same file further than one window away.
          if (prev && (prev.file !== file || i + 1 - prev.line >= minLines)) {
            const pairKey = `${prev.file}|${file}`;
            if (reported.has(pairKey)) continue;
            reported.add(pairKey);
            out.push(
              mk(lang, {
                rule: 'IMPL-007',
                category: 'implementation',
                severity: 'low',
                status: 'probable',
                source: 'static-analyzer',
                location: { file, line: i + 1 },
                vars: { n: minLines, a: `${prev.file}:${prev.line}`, b: `${file}:${i + 1}` },
                idParts: ['IMPL-007', prev.file, file],
              }),
            );
          } else if (!prev) {
            windows.set(key, { file, line: i + 1 });
          }
        }
      }
    }

    ctx.log(`implementation: ${sources.length} source files, ${out.length} findings`);
    return out;
  },
};
