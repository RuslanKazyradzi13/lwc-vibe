/**
 * Anomaly Radar report rendering: text (terminal), md (Markdown), json.
 */
import type { Finding, Lang } from './findings.js';
import type { RadarReport } from './radar.js';
import { ui } from '../i18n/index.js';

const CATEGORY_ORDER = [
  'requirements',
  'architecture',
  'implementation',
  'security',
  'process',
  'ops',
];

/** Groups findings by category (fixed A–E order); within a category they are sorted by severity. */
function groupByCategory(findings: Finding[]): Array<[string, Finding[]]> {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!map.has(f.category)) map.set(f.category, []);
    map.get(f.category)!.push(f);
  }
  return [...map.entries()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
  );
}

const SEV_ICON: Record<string, string> = {
  critical: '■',
  high: '▲',
  medium: '●',
  low: '○',
  info: '·',
};

export function renderJson(report: RadarReport): string {
  return JSON.stringify(report, null, 2);
}

function loc(f: Finding): string {
  if (!f.location) return '';
  return f.location.line ? `${f.location.file}:${f.location.line}` : f.location.file;
}

export function renderText(report: RadarReport, opts: { verbose?: boolean } = {}): string {
  const L = report.lang;
  const t = (k: string) => ui(L, k);
  const lines: string[] = [];
  lines.push(`${t('report.title')} · lwc-vibe ${report.version}`);
  lines.push(`${t('report.project')}: ${report.root}`);
  lines.push(
    `${t('report.generated')}: ${report.generatedAt} · ${t('report.filesScanned')}: ${report.filesScanned} · ${t('report.analyzers')}: ${report.analyzers.join(', ')}`,
  );
  lines.push('');
  if (report.findings.length === 0) {
    lines.push(t('report.none'));
  } else {
    lines.push(`${t('report.summary')}: ${t('report.total')} ${report.summary.total}`);
    const sev = (['critical', 'high', 'medium', 'low', 'info'] as const)
      .map((s) => `${SEV_ICON[s]} ${t('severity.' + s)}: ${report.summary.bySeverity[s] ?? 0}`)
      .join('   ');
    lines.push('  ' + sev);
    lines.push('');
    for (const [cat, fs] of groupByCategory(report.findings)) {
      const head = `── ${t('category.' + cat)} (${fs.length}) `;
      lines.push(head + '─'.repeat(Math.max(4, 72 - head.length)));
      for (const f of fs) {
        lines.push(`${SEV_ICON[f.severity]} [${t('severity.' + f.severity)}] ${f.id}  ${f.title}`);
        if (loc(f)) lines.push(`    ${t('report.location')}: ${loc(f)}`);
        lines.push(`    ${t('report.observation')}: ${f.observation}`);
        lines.push(
          `    ${t('report.status')}: ${t('status.' + f.status)} · ${t('report.source')}: ${t('source.' + f.source)}${f.evidence ? ` · ${t('report.evidence')}: ${f.evidence}` : ''}`,
        );
        if (opts.verbose) {
          lines.push(`    ${t('report.explanation')}: ${f.explanation}`);
          lines.push(`    ${t('report.consequence')}: ${f.consequence}`);
          lines.push(`    ${t('report.verify')}: ${f.howToVerify}`);
        }
        lines.push(`    ${t('report.fix')}: ${f.fix}`);
        lines.push('');
      }
    }
  }
  if (report.suppressed.length > 0) {
    lines.push(`${t('report.suppressed')}: ${report.suppressed.length}`);
    if (report.summary.suppressedCriticalOrHigh > 0)
      lines.push(`!! ${t('report.suppressedCritical')}`);
    for (const f of report.suppressed) {
      lines.push(
        `  ${SEV_ICON[f.severity]} ${f.id} ${f.title} — ${t('report.suppressedReason')}: ${f.suppressed?.reason ?? '?'}`,
      );
    }
    lines.push('');
  }
  lines.push(t('report.disclaimer'));
  if (opts.verbose && report.log.length) {
    lines.push('', '— log —', ...report.log);
  }
  return lines.join('\n');
}

export function renderMarkdown(report: RadarReport): string {
  const L: Lang = report.lang;
  const t = (k: string) => ui(L, k);
  const out: string[] = [];
  out.push(`# ${t('report.title')}`);
  out.push('');
  out.push(`- **${t('report.project')}:** \`${report.root}\``);
  out.push(`- **${t('report.generated')}:** ${report.generatedAt} (lwc-vibe ${report.version})`);
  out.push(`- **${t('report.filesScanned')}:** ${report.filesScanned}`);
  out.push(`- **${t('report.analyzers')}:** ${report.analyzers.join(', ')}`);
  out.push('');
  out.push(`## ${t('report.summary')}`);
  out.push('');
  out.push(
    `| ${t('severity.critical')} | ${t('severity.high')} | ${t('severity.medium')} | ${t('severity.low')} | ${t('severity.info')} | ${t('report.total')} |`,
  );
  out.push('|---:|---:|---:|---:|---:|---:|');
  const s = report.summary.bySeverity;
  out.push(
    `| ${s.critical ?? 0} | ${s.high ?? 0} | ${s.medium ?? 0} | ${s.low ?? 0} | ${s.info ?? 0} | **${report.summary.total}** |`,
  );
  out.push('');
  if (report.findings.length === 0) {
    out.push(t('report.none'));
  } else {
    out.push(
      `| ID | ${t('report.severityCol')} | ${t('report.status')} | ${t('report.source')} | ${t('report.location')} | ${t('report.titleCol')} |`,
    );
    out.push('|---|---|---|---|---|---|');
    for (const f of report.findings) {
      out.push(
        `| ${f.id} | ${t('severity.' + f.severity)} | ${t('status.' + f.status)} | ${t('source.' + f.source)} | ${loc(f) ? '`' + loc(f) + '`' : ''} | ${f.title} |`,
      );
    }
    out.push('');
    for (const [cat, fs] of groupByCategory(report.findings)) {
      out.push(`## ${t('category.' + cat)} (${fs.length})`);
      out.push('');
      for (const f of fs) {
        out.push(`### ${f.id} · ${f.title}`);
        out.push('');
        out.push(
          `- **${t('report.status')}:** ${t('severity.' + f.severity)} · ${t('status.' + f.status)} · ${t('report.source')}: ${t('source.' + f.source)}`,
        );
        if (loc(f)) out.push(`- **${t('report.location')}:** \`${loc(f)}\``);
        out.push(`- **${t('report.observation')}:** ${f.observation}`);
        out.push(`- **${t('report.explanation')}:** ${f.explanation}`);
        out.push(`- **${t('report.consequence')}:** ${f.consequence}`);
        out.push(`- **${t('report.verify')}:** ${f.howToVerify}`);
        out.push(`- **${t('report.fix')}:** ${f.fix}`);
        if (f.evidence) out.push(`- **${t('report.evidence')}:** \`${f.evidence}\``);
        out.push('');
      }
    }
  }
  if (report.suppressed.length > 0) {
    out.push(`## ${t('report.suppressed')} (${report.suppressed.length})`);
    out.push('');
    if (report.summary.suppressedCriticalOrHigh > 0)
      out.push(`> ⚠️ ${t('report.suppressedCritical')}`);
    out.push('');
    for (const f of report.suppressed) {
      out.push(
        `- ${f.id} · ${f.title} (${t('severity.' + f.severity)}) — ${t('report.suppressedReason')}: ${f.suppressed?.reason ?? '?'}`,
      );
    }
    out.push('');
  }
  out.push(`> ${t('report.disclaimer')}`);
  return out.join('\n') + '\n';
}

export function render(
  report: RadarReport,
  format: 'text' | 'md' | 'json',
  verbose = false,
): string {
  if (format === 'json') return renderJson(report);
  if (format === 'md') return renderMarkdown(report);
  return renderText(report, { verbose });
}
