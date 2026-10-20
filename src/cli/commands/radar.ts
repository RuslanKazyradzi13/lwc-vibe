/**
 * Commands: radar, suppress, explain, run, ops-check.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from '../args.js';
import { bool, str } from '../args.js';
import type { Category } from '../../core/findings.js';
import { SEVERITY_ORDER } from '../../core/findings.js';
import { runRadar } from '../../core/radar.js';
import { render } from '../../core/report.js';
import {
  appendJournal,
  findRoot,
  hasState,
  loadConfig,
  loadSuppressions,
  saveEvidence,
  saveSuppressions,
  statePaths,
  type EvidenceRecord,
} from '../../core/state.js';
import { runCommandRecorded } from '../../analyzers/tests-runner.js';
import { makeReader, scanFiles, isSourceFile } from '../../core/scan.js';
import { buildImportGraph } from '../../core/graph.js';
import { checkOps, parseData, type OpsRules } from '../../ops/opscheck.js';
import { ui } from '../../i18n/index.js';
import { langFromArgs, type Io } from './session.js';

const CATEGORY_ALIASES: Record<string, Category> = {
  requirements: 'requirements',
  req: 'requirements',
  a: 'requirements',
  architecture: 'architecture',
  arch: 'architecture',
  b: 'architecture',
  implementation: 'implementation',
  impl: 'implementation',
  c: 'implementation',
  security: 'security',
  sec: 'security',
  d: 'security',
  process: 'process',
  proc: 'process',
  e: 'process',
};

export function rootOf(args: ParsedArgs): { root: string; only: string[] } {
  // lwc radar [path...]: when the first positional is a directory containing .lwc or .git it becomes the root.
  const explicit = str(args.flags, 'root');
  if (explicit) return { root: findRoot(path.resolve(explicit)), only: args.positional };
  const first = args.positional[0];
  if (first && fs.existsSync(first) && fs.statSync(first).isDirectory()) {
    const abs = path.resolve(first);
    const r = findRoot(abs);
    const only = args.positional.slice(1);
    // If the given directory is not the root, restrict the analysis to it.
    if (r !== abs) only.unshift(path.relative(r, abs).replace(/\\/g, '/'));
    return { root: r, only };
  }
  return { root: findRoot(process.cwd()), only: args.positional };
}

export async function cmdRadar(args: ParsedArgs, io: Io): Promise<number> {
  const { root, only } = rootOf(args);
  const config = loadConfig(root);
  const lang = langFromArgs(args, config);
  const format = (str(args.flags, 'format') ?? 'text') as 'text' | 'md' | 'json';
  if (!['text', 'md', 'json'].includes(format)) {
    io.err(`Unknown format: ${format}. Allowed: text, md, json.`);
    return 2;
  }
  let categories: Category[] | undefined;
  const cat = str(args.flags, 'category') ?? str(args.flags, 'categories');
  if (cat) {
    categories = [];
    for (const c of cat.split(',')) {
      const k = CATEGORY_ALIASES[c.trim().toLowerCase()];
      if (!k) {
        io.err(
          `Unknown category: ${c}. Allowed: requirements, architecture, implementation, security, process.`,
        );
        return 2;
      }
      categories.push(k);
    }
  }
  const report = await runRadar({
    root,
    config,
    lang,
    categories,
    allowRunCommands: bool(args.flags, 'run-tests'),
    verbose: bool(args.flags, 'verbose'),
    only: only.length ? only : undefined,
  });
  const text = render(report, format, bool(args.flags, 'verbose'));
  const outFile = str(args.flags, 'out');
  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, text, 'utf8');
    io.out(`Report saved: ${outFile} (${report.summary.total} findings)`);
  } else io.out(text);
  if (hasState(root) && !bool(args.flags, 'no-journal')) {
    const p = statePaths(root);
    fs.mkdirSync(p.reportsDir, { recursive: true });
    const stamp = report.generatedAt.replace(/[:.]/g, '-');
    fs.writeFileSync(
      path.join(p.reportsDir, `radar-${stamp}.json`),
      render(report, 'json'),
      'utf8',
    );
    const s = report.summary.bySeverity;
    appendJournal(
      root,
      'Anomaly Radar',
      `Findings: ${report.summary.total} (critical ${s.critical ?? 0}, high ${s.high ?? 0}, medium ${s.medium ?? 0}, low ${s.low ?? 0}, info ${s.info ?? 0}), suppressed ${report.summary.suppressed}. Report: \`.lwc/reports/radar-${stamp}.json\`.`,
    );
  }
  const failOn = str(args.flags, 'fail-on');
  if (failOn) {
    const threshold = SEVERITY_ORDER[failOn as keyof typeof SEVERITY_ORDER];
    if (threshold === undefined) {
      io.err(`Unknown --fail-on threshold: ${failOn}`);
      return 2;
    }
    const bad = report.findings.some((f) => SEVERITY_ORDER[f.severity] <= threshold);
    return bad ? 1 : 0;
  }
  return 0;
}

export function cmdSuppress(args: ParsedArgs, io: Io): number {
  const root = findRoot(
    str(args.flags, 'root') ? path.resolve(str(args.flags, 'root')!) : process.cwd(),
  );
  const target = args.positional[0];
  const reason = str(args.flags, 'reason');
  if (args.positional[0] === 'list') {
    const list = loadSuppressions(root);
    if (bool(args.flags, 'json')) io.out(JSON.stringify(list, null, 2));
    else
      for (const s of list)
        io.out(`${JSON.stringify(s.match)} — ${s.reason} (${s.by ?? '?'}, ${s.date})`);
    return 0;
  }
  if (!target || !reason) {
    io.err(
      'Usage: lwc suppress <finding-id | RULE-ID> [--file path] --reason "why this is a false positive" [--by name]',
    );
    return 2;
  }
  if (reason.trim().length < 10) {
    io.err('The suppression reason must be meaningful (at least 10 characters).');
    return 2;
  }
  const list = loadSuppressions(root);
  const isRule = /^[A-Z]+-\d{3}$/.test(target);
  const file = str(args.flags, 'file');
  if (isRule && !file && !bool(args.flags, 'yes')) {
    io.err(
      `Suppressing the whole rule ${target} across the project hides all of its findings. Pass --file or confirm with --yes.`,
    );
    return 1;
  }
  const match = isRule ? { rule: target, ...(file ? { file } : {}) } : { id: target };
  list.push({
    match,
    reason,
    by: str(args.flags, 'by'),
    date: new Date().toISOString().slice(0, 10),
  });
  saveSuppressions(root, list);
  appendJournal(root, 'Finding suppressed', `${JSON.stringify(match)} — ${reason}`);
  io.out(
    `Suppressed: ${JSON.stringify(match)}. The reason is recorded in .lwc/suppressions.json. Critical findings keep showing in the report summary.`,
  );
  return 0;
}

export function cmdExplain(args: ParsedArgs, io: Io): number {
  const root = findRoot(
    str(args.flags, 'root') ? path.resolve(str(args.flags, 'root')!) : process.cwd(),
  );
  const config = loadConfig(root);
  const target = args.positional[0];
  if (!target) {
    io.err('Usage: lwc explain <file>');
    return 2;
  }
  const rel = path.relative(root, path.resolve(target)).replace(/\\/g, '/');
  const files = scanFiles(root, config.ignore);
  if (!files.includes(rel)) {
    io.err(`File not found in the project: ${rel}`);
    return 1;
  }
  const read = makeReader(root);
  const g = buildImportGraph(files, read, isSourceFile);
  const text = read(rel) ?? '';
  const lines = text.split('\n').length;
  const outs = [...(g.out.get(rel) ?? [])];
  const ins = [...(g.in.get(rel) ?? [])];
  const ext = g.edges
    .filter((e) => e.from === rel && e.to.startsWith('pkg:'))
    .map((e) => e.specifier);
  const data = {
    file: rel,
    lines,
    imports: outs,
    importedBy: ins,
    externalPackages: [...new Set(ext)],
  };
  if (bool(args.flags, 'json')) {
    io.out(JSON.stringify(data, null, 2));
    return 0;
  }
  io.out(`# ${rel} (${lines} lines)`);
  io.out('');
  io.out(`Imports (${outs.length}):`);
  for (const o of outs) io.out(`  → ${o}`);
  if (ext.length) io.out(`External packages: ${[...new Set(ext)].join(', ')}`);
  io.out(`Imported by (${ins.length}):`);
  for (const i of ins) io.out(`  ← ${i}`);
  if (ins.length === 0) io.out('  (nobody — an entry point, a test, or an unused module)');
  io.out('');
  io.out('Tip: ask the agent in Explain mode to describe this module based on these relations.');
  return 0;
}

export function cmdRun(args: ParsedArgs, io: Io): number {
  const root = findRoot(
    str(args.flags, 'root') ? path.resolve(str(args.flags, 'root')!) : process.cwd(),
  );
  const command = args.rest.join(' ');
  if (!command) {
    io.err('Usage: lwc run [--kind test|lint|build|other] -- <command>');
    return 2;
  }
  const kind = (str(args.flags, 'kind') ?? guessKind(command)) as EvidenceRecord['kind'];
  io.out(`▶ ${command}`);
  const rec = runCommandRecorded(root, command, kind);
  if (rec.stdoutTail) io.out(rec.stdoutTail);
  if (rec.stderrTail) io.err(rec.stderrTail);
  const file = saveEvidence(root, rec);
  io.out(`■ exit code ${rec.exitCode} · ${rec.durationMs} ms · evidence: ${file}`);
  appendJournal(
    root,
    `Run: ${command}`,
    `Exit code: ${rec.exitCode}. Kind: ${kind}. Record: \`${file}\`.`,
  );
  return rec.exitCode ?? 1;
}

function guessKind(cmd: string): EvidenceRecord['kind'] {
  if (/\b(test|pytest|jest|vitest|mocha|node --test)\b/.test(cmd)) return 'test';
  if (/\b(lint|eslint|prettier|ruff|flake8|mypy|tsc)\b/.test(cmd)) return 'lint';
  if (/\b(build|compile)\b/.test(cmd)) return 'build';
  return 'other';
}

export function cmdOpsCheck(args: ParsedArgs, io: Io): number {
  const file = args.positional[0];
  const rulesFile = str(args.flags, 'rules');
  if (!file || !rulesFile) {
    io.err(
      'Usage: lwc ops-check <data.csv|json> --rules <rules.json> [--history <history.csv|json>] [--format text|md|json] [--lang ru|kk|en] [--out file]',
    );
    return 2;
  }
  let rows,
    rules: OpsRules,
    history: ReturnType<typeof parseData> = [];
  try {
    rows = parseData(fs.readFileSync(file, 'utf8'), file);
    rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8')) as OpsRules;
    const h = str(args.flags, 'history');
    if (h) history = parseData(fs.readFileSync(h, 'utf8'), h);
  } catch (e) {
    io.err(`Could not read the data: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  const root = findRoot(process.cwd());
  const config = loadConfig(root);
  const lang = langFromArgs(args, config);
  const res = checkOps(rows, rules, lang, history);
  const format = str(args.flags, 'format') ?? 'text';
  const t = (k: string) => ui(lang, k);
  let text: string;
  if (format === 'json') {
    text = JSON.stringify(
      {
        tool: 'lwc-vibe',
        kind: 'ops-check',
        file,
        rules: rulesFile,
        ...res,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  } else if (format === 'md') {
    const L: string[] = [
      `# ${res.name}`,
      '',
      `- ${t('report.filesScanned')}: \`${file}\` (${res.rows} ${t('report.rows')})`,
      `- ${t('report.rules')}: \`${rulesFile}\` (${res.rulesApplied.join(', ')})`,
      `- ${t('report.total')}: ${res.findings.length}`,
      '',
    ];
    for (const f of res.findings) {
      L.push(
        `## ${f.id} · ${f.title}`,
        '',
        `- **${t('report.status')}:** ${t('severity.' + f.severity)} · ${t('status.' + f.status)} · ${t('source.' + f.source)}`,
        `- **${t('report.observation')}:** ${f.observation}`,
        `- **${t('report.explanation')}:** ${f.explanation}`,
        `- **${t('report.consequence')}:** ${f.consequence}`,
        `- **${t('report.verify')}:** ${f.howToVerify}`,
        `- **${t('report.fix')}:** ${f.fix}`,
        '',
      );
    }
    text = L.join('\n');
  } else {
    const L: string[] = [];
    L.push(
      `${res.name} · ${file} · ${res.rows} ${t('report.rows')} · ${t('report.rules')}: ${res.rulesApplied.join(', ')}`,
    );
    L.push(`${t('report.total')}: ${res.findings.length}`);
    L.push('');
    for (const f of res.findings) {
      L.push(`[${t('severity.' + f.severity)}] ${f.id} ${f.title}`);
      L.push(`    ${t('report.observation')}: ${f.observation}`);
      L.push(`    ${t('report.explanation')}: ${f.explanation}`);
      L.push(
        `    ${t('report.status')}: ${t('status.' + f.status)} · ${t('report.source')}: ${t('source.' + f.source)}`,
      );
      L.push(`    ${t('report.fix')}: ${f.fix}`);
      L.push('');
    }
    if (res.findings.length === 0) L.push(t('report.none'));
    text = L.join('\n');
  }
  const outFile = str(args.flags, 'out');
  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, text, 'utf8');
    io.out(`Report saved: ${outFile} (${res.findings.length} findings)`);
  } else io.out(text);
  const failOn = str(args.flags, 'fail-on');
  if (failOn) {
    const threshold = SEVERITY_ORDER[failOn as keyof typeof SEVERITY_ORDER] ?? 0;
    return res.findings.some((f) => SEVERITY_ORDER[f.severity] <= threshold) ? 1 : 0;
  }
  return 0;
}
