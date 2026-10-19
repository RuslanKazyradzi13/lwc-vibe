/**
 * State commands: init, status, task, decision, claim, resume, map.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from '../args.js';
import { bool, str } from '../args.js';
import { isLang } from '../../i18n/index.js';
import type { Lang, LwcConfig } from '../../core/findings.js';
import {
  appendJournal,
  findRoot,
  hasState,
  loadConfig,
  loadEvidence,
  loadSession,
  nowId,
  saveConfig,
  saveSession,
  statePaths,
  type Stage,
  type TaskState,
} from '../../core/state.js';
import { getGitInfo } from '../../core/git.js';
import { makeReader, scanFiles, isSourceFile } from '../../core/scan.js';
import { buildImportGraph } from '../../core/graph.js';
import { detectTestCommand } from '../../analyzers/tests-runner.js';

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

const STAGES: Stage[] = ['learn', 'design', 'build', 'review', 'done'];

function root(args: ParsedArgs): string {
  const r = str(args.flags, 'root');
  return findRoot(r ? path.resolve(r) : process.cwd());
}

export function cmdInit(args: ParsedArgs, io: Io): number {
  const cwd = str(args.flags, 'root') ? path.resolve(str(args.flags, 'root')!) : process.cwd();
  const r = findRoot(cwd);
  const lang = str(args.flags, 'lang');
  if (lang && !isLang(lang)) {
    io.err(`Unknown language: ${lang}. Allowed: ru, kk, en.`);
    return 2;
  }
  const level = str(args.flags, 'level');
  if (level && !['beginner', 'intermediate', 'advanced'].includes(level)) {
    io.err(`Unknown level: ${level}. Allowed: beginner, intermediate, advanced.`);
    return 2;
  }
  const cp = str(args.flags, 'checkpoints');
  if (cp && !['light', 'normal', 'frequent'].includes(cp)) {
    io.err(`Unknown checkpoint frequency: ${cp}. Allowed: light, normal, frequent.`);
    return 2;
  }
  if (hasState(r) && !bool(args.flags, 'yes')) {
    io.out(
      `LWC is already initialised in ${r} (${statePaths(r).config}). Use --yes to overwrite the settings.`,
    );
    return 0;
  }
  const config = loadConfig(r);
  if (lang && isLang(lang)) config.lang = lang;
  if (level) config.level = level as LwcConfig['level'];
  if (cp) config.checkpoints = cp as LwcConfig['checkpoints'];
  const test = str(args.flags, 'test-command') ?? detectTestCommand(makeReader(r));
  if (test) config.testCommand = test;
  saveConfig(r, config);
  const p = statePaths(r);
  fs.mkdirSync(p.evidenceDir, { recursive: true });
  fs.mkdirSync(p.reportsDir, { recursive: true });
  if (!fs.existsSync(p.session)) saveSession(r, { version: 1, history: [] });
  if (!fs.existsSync(p.map)) fs.writeFileSync(p.map, buildMapInternal(r, config), 'utf8');
  if (!fs.existsSync(p.suppressions)) fs.writeFileSync(p.suppressions, '[]\n', 'utf8');
  appendJournal(
    r,
    'Initialised',
    `Language: ${config.lang}, level: ${config.level}, checkpoints: ${config.checkpoints}${config.testCommand ? `, tests: \`${config.testCommand}\`` : ''}.`,
  );
  io.out(`LWC — vibe initialised: ${p.dir}`);
  io.out(
    `  language: ${config.lang} · level: ${config.level} · checkpoints: ${config.checkpoints}`,
  );
  io.out(`  tests: ${config.testCommand ?? 'not detected (set --test-command)'}`);
  io.out(`Tip: add .lwc/ to .gitignore if you do not want to keep the coaching context in Git.`);
  return 0;
}

function buildMapInternal(r: string, config: LwcConfig): string {
  const files = scanFiles(r, config.ignore);
  const read = makeReader(r);
  const g = buildImportGraph(files, read, isSourceFile);
  const dirs = new Map<string, number>();
  for (const f of files) {
    const d = f.includes('/') ? f.split('/')[0]! : '.';
    dirs.set(d, (dirs.get(d) ?? 0) + 1);
  }
  const fanIn = [...g.in.entries()]
    .map(([f, s]) => [f, s.size] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const name = path.basename(r);
  const lines: string[] = [];
  lines.push(`# Project map: ${name}`);
  lines.push('');
  lines.push(
    `_Generated automatically on ${new Date().toISOString()} by \`lwc map\`. Edit the "Purpose" and "Boundaries" sections by hand._`,
  );
  lines.push('');
  lines.push('## Purpose');
  lines.push('');
  lines.push('(describe what the system does, in your own words)');
  lines.push('');
  lines.push('## Directory structure');
  lines.push('');
  for (const [d, n] of [...dirs.entries()].sort()) lines.push(`- \`${d}/\` — ${n} file(s)`);
  lines.push('');
  lines.push('## Most depended-on modules (by number of importers)');
  lines.push('');
  if (fanIn.length === 0) lines.push('(no internal imports found)');
  for (const [f, n] of fanIn) lines.push(`- \`${f}\` ← ${n}`);
  lines.push('');
  lines.push('## Module boundaries and data');
  lines.push('');
  lines.push('(storage, external services, trust zones — filled in together with the user)');
  lines.push('');
  lines.push('## Unknowns');
  lines.push('');
  lines.push('(what still needs to be found out)');
  lines.push('');
  return lines.join('\n');
}

export function cmdMap(args: ParsedArgs, io: Io): number {
  const r = root(args);
  const config = loadConfig(r);
  const text = buildMapInternal(r, config);
  if (bool(args.flags, 'json')) {
    io.out(JSON.stringify({ root: r, map: text }, null, 2));
    return 0;
  }
  if (hasState(r) && !str(args.flags, 'stdout')) {
    const p = statePaths(r).map;
    fs.writeFileSync(p, text, 'utf8');
    io.out(`Project map updated: ${p}`);
  } else io.out(text);
  return 0;
}

export function cmdStatus(args: ParsedArgs, io: Io): number {
  const r = root(args);
  const config = loadConfig(r);
  const session = loadSession(r);
  const gi = getGitInfo(r);
  const evidence = loadEvidence(r);
  const data = {
    root: r,
    initialized: hasState(r),
    lang: config.lang,
    level: config.level,
    checkpoints: config.checkpoints,
    testCommand: config.testCommand ?? null,
    git: gi.available ? { branch: gi.branch, changedFiles: gi.changedFiles.length } : null,
    task: session.task ?? null,
    evidenceRuns: evidence.length,
    lastRun: evidence[evidence.length - 1] ?? null,
  };
  if (bool(args.flags, 'json')) {
    io.out(JSON.stringify(data, null, 2));
    return 0;
  }
  io.out(`LWC — vibe · ${r}`);
  io.out(`  state: ${data.initialized ? 'initialised' : 'not initialised (run lwc init)'}`);
  io.out(
    `  language: ${config.lang} · level: ${config.level} · checkpoints: ${config.checkpoints}`,
  );
  io.out(`  tests: ${config.testCommand ?? '—'}`);
  if (gi.available)
    io.out(`  git: branch ${gi.branch ?? '?'} · changed files: ${gi.changedFiles.length}`);
  if (session.task) {
    const t = session.task;
    const confirmed = t.decisions.filter((d) => d.confirmedAt).length;
    io.out(
      `  task: "${t.title}" · stage: ${t.stage} · decisions: ${confirmed}/${t.decisions.length} confirmed · scope: ${t.scope.join(', ') || 'not set'}`,
    );
    for (const d of t.decisions) io.out(`    ${d.confirmedAt ? '✔' : '…'} ${d.id}: ${d.text}`);
    for (const c of t.claims) io.out(`    ◇ claim ${c.id}: ${c.text}`);
  } else io.out('  task: none active (lwc task start "title")');
  if (evidence.length) {
    const last = evidence[evidence.length - 1]!;
    io.out(`  last run: \`${last.command}\` → exit code ${last.exitCode} (${last.startedAt})`);
  }
  return 0;
}

export function cmdTask(args: ParsedArgs, io: Io): number {
  const r = root(args);
  const session = loadSession(r);
  const sub = args.positional[0];
  const now = new Date().toISOString();
  switch (sub) {
    case 'start': {
      const title = args.positional.slice(1).join(' ');
      if (!title) {
        io.err('Provide a title: lwc task start "Task title"');
        return 2;
      }
      if (session.task && session.task.stage !== 'done') {
        io.err(
          `There is already an active task "${session.task.title}" (${session.task.stage}). Finish it first: lwc task finish`,
        );
        return 1;
      }
      const gi = getGitInfo(r);
      const task: TaskState = {
        id: nowId('task'),
        title,
        startedAt: now,
        stage: 'learn',
        scope: [],
        decisions: [],
        claims: [],
        baselineChanged: gi.changedFiles,
      };
      const scope = str(args.flags, 'scope');
      if (scope)
        task.scope = scope
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      session.task = task;
      saveSession(r, session);
      appendJournal(
        r,
        `Task started: ${title}`,
        `Stage: learn. Scope: ${task.scope.join(', ') || 'not set'}.`,
      );
      io.out(`Task "${title}" started (${task.id}), stage: learn.`);
      return 0;
    }
    case 'scope': {
      const t = requireTask(session, io);
      if (!t) return 1;
      const op = args.positional[1];
      const globs = args.positional.slice(2);
      if (op === 'add' && globs.length) {
        t.scope.push(...globs);
      } else if (op === 'set') {
        t.scope = globs;
      } else if (op === 'clear') {
        t.scope = [];
      } else {
        io.err('Usage: lwc task scope add|set|clear <glob...>');
        return 2;
      }
      saveSession(r, session);
      appendJournal(
        r,
        'Task scope updated',
        t.scope.map((g) => `- \`${g}\``).join('\n') || '(empty)',
      );
      io.out(`Task scope: ${t.scope.join(', ') || '(empty)'}`);
      return 0;
    }
    case 'stage': {
      const t = requireTask(session, io);
      if (!t) return 1;
      const stage = args.positional[1] as Stage | undefined;
      if (!stage || !STAGES.includes(stage)) {
        io.err(`Provide a stage: ${STAGES.join(' | ')}`);
        return 2;
      }
      if (stage === 'build') {
        const pending = t.decisions.filter((d) => !d.confirmedAt);
        if (pending.length > 0 && !bool(args.flags, 'yes')) {
          io.err(
            `Cannot move to build: decisions ${pending.map((d) => d.id).join(', ')} are not confirmed. Confirm them (lwc decision confirm <id>) or pass --yes to skip deliberately.`,
          );
          return 1;
        }
        if (t.decisions.length === 0 && !bool(args.flags, 'yes')) {
          io.err(
            'Cannot move to build without a single recorded decision. Add one (lwc decision add "...") and confirm it, or pass --yes.',
          );
          return 1;
        }
      }
      const prev = t.stage;
      t.stage = stage;
      if (stage === 'build') {
        const gi = getGitInfo(r);
        t.baselineChanged = gi.changedFiles;
      }
      saveSession(r, session);
      appendJournal(r, `Stage: ${prev} → ${stage}`, `Task "${t.title}".`);
      io.out(`Task "${t.title}" stage: ${prev} → ${stage}`);
      return 0;
    }
    case 'finish': {
      const t = requireTask(session, io);
      if (!t) return 1;
      session.history.push({ id: t.id, title: t.title, startedAt: t.startedAt, finishedAt: now });
      delete session.task;
      saveSession(r, session);
      appendJournal(
        r,
        `Task finished: ${t.title}`,
        `Decisions: ${t.decisions.length}, claims: ${t.claims.length}.`,
      );
      io.out(`Task "${t.title}" finished.`);
      return 0;
    }
    default:
      io.err(
        'Usage: lwc task start "title" [--scope "src/**,tests/**"] | scope add|set|clear <glob...> | stage <learn|design|build|review|done> | finish',
      );
      return 2;
  }
}

function requireTask(session: ReturnType<typeof loadSession>, io: Io): TaskState | null {
  if (!session.task) {
    io.err('No active task. Start one: lwc task start "title"');
    return null;
  }
  return session.task;
}

export function cmdDecision(args: ParsedArgs, io: Io): number {
  const r = root(args);
  const session = loadSession(r);
  const t = requireTask(session, io);
  if (!t) return 1;
  const sub = args.positional[0];
  const now = new Date().toISOString();
  if (sub === 'add') {
    const text = args.positional.slice(1).join(' ');
    if (!text) {
      io.err('Provide the decision text.');
      return 2;
    }
    const id = `D${t.decisions.length + 1}`;
    t.decisions.push({ id, text, proposedAt: now });
    saveSession(r, session);
    appendJournal(r, `Decision ${id} proposed`, text);
    io.out(`${id}: ${text} (awaiting confirmation)`);
    return 0;
  }
  if (sub === 'confirm') {
    const id = args.positional[1];
    const d = t.decisions.find((x) => x.id === id);
    if (!d) {
      io.err(
        `Decision ${id ?? '?'} not found. Available: ${t.decisions.map((x) => x.id).join(', ') || 'none'}`,
      );
      return 1;
    }
    d.confirmedAt = now;
    d.confirmedBy = 'user';
    saveSession(r, session);
    appendJournal(r, `Decision ${id} confirmed by the user`, d.text);
    io.out(`✔ ${id} confirmed: ${d.text}`);
    return 0;
  }
  if (sub === 'list' || !sub) {
    if (bool(args.flags, 'json')) io.out(JSON.stringify(t.decisions, null, 2));
    else for (const d of t.decisions) io.out(`${d.confirmedAt ? '✔' : '…'} ${d.id}: ${d.text}`);
    return 0;
  }
  io.err('Usage: lwc decision add "text" | confirm <id> | list');
  return 2;
}

export function cmdClaim(args: ParsedArgs, io: Io): number {
  const r = root(args);
  const session = loadSession(r);
  const t = requireTask(session, io);
  if (!t) return 1;
  const sub = args.positional[0];
  if (sub === 'add') {
    const text = args.positional.slice(1).join(' ');
    if (!text) {
      io.err('Provide the claim text.');
      return 2;
    }
    const evidence = loadEvidence(r);
    const last = evidence[evidence.length - 1];
    const id = `C${t.claims.length + 1}`;
    t.claims.push({
      id,
      text,
      at: new Date().toISOString(),
      evidence: last ? `.lwc/evidence/${last.id}.json` : undefined,
    });
    saveSession(r, session);
    appendJournal(
      r,
      `Claim ${id}`,
      `${text}${last ? `\n\nLast run: \`${last.command}\` → exit code ${last.exitCode}` : '\n\n(no recorded runs)'}`,
    );
    io.out(
      `${id}: ${text}${last ? ` · last evidence: ${last.command} → exit code ${last.exitCode}` : ' · ⚠ no recorded runs'}`,
    );
    return 0;
  }
  if (sub === 'list' || !sub) {
    for (const c of t.claims)
      io.out(`${c.id} [${c.at}] ${c.text}${c.evidence ? ` → ${c.evidence}` : ''}`);
    return 0;
  }
  io.err('Usage: lwc claim add "text" | list');
  return 2;
}

/** Context for restoring a session (printed for the agent). */
export function cmdResume(args: ParsedArgs, io: Io): number {
  const r = root(args);
  if (!hasState(r)) {
    if (bool(args.flags, 'json')) io.out(JSON.stringify({ initialized: false, root: r }));
    else io.out(`LWC is not initialised in ${r}. Run: lwc init`);
    return 0;
  }
  const config = loadConfig(r);
  const session = loadSession(r);
  const p = statePaths(r);
  const evidence = loadEvidence(r);
  const journal = fs.existsSync(p.journal) ? fs.readFileSync(p.journal, 'utf8') : '';
  const lastEntries = journal
    .split(/\n(?=## )/)
    .slice(-5)
    .join('\n');
  const data = {
    initialized: true,
    root: r,
    lang: config.lang,
    level: config.level,
    checkpoints: config.checkpoints,
    task: session.task ?? null,
    pendingDecisions: session.task?.decisions.filter((d) => !d.confirmedAt) ?? [],
    lastRuns: evidence.slice(-3),
    files: { config: p.config, session: p.session, journal: p.journal, map: p.map },
    journalTail: lastEntries,
  };
  if (bool(args.flags, 'json')) {
    io.out(JSON.stringify(data, null, 2));
    return 0;
  }
  io.out(`# LWC — vibe context (${path.basename(r)})`);
  io.out('');
  io.out(
    `- Language: ${config.lang} · explanation level: ${config.level} · checkpoints: ${config.checkpoints}`,
  );
  if (session.task) {
    const t = session.task;
    io.out(
      `- Active task: "${t.title}" · stage **${t.stage}** · scope: ${t.scope.join(', ') || 'not set'}`,
    );
    for (const d of t.decisions)
      io.out(
        `  - ${d.confirmedAt ? '✔ confirmed' : '⏳ awaiting confirmation'} ${d.id}: ${d.text}`,
      );
    if (data.pendingDecisions.length)
      io.out(
        `- ⚠ There are unconfirmed decisions: no code until the user confirms them explicitly.`,
      );
    if (t.stage !== 'build')
      io.out(
        `- ⚠ Stage is not build: source changes outside the agreed plan will be flagged by the radar (PROC-001).`,
      );
  } else io.out('- No active task.');
  if (evidence.length) {
    const last = evidence[evidence.length - 1]!;
    io.out(
      `- Last recorded run: \`${last.command}\` → exit code ${last.exitCode} (${last.startedAt})`,
    );
  } else io.out('- No recorded check runs (use `lwc run -- <command>`).');
  io.out(`- Project map: ${p.map}`);
  io.out('');
  if (lastEntries.trim()) {
    io.out('## Latest journal entries');
    io.out('');
    io.out(lastEntries.trim());
  }
  return 0;
}

export function langFromArgs(args: ParsedArgs, config: LwcConfig): Lang {
  const l = str(args.flags, 'lang');
  return isLang(l) ? l : config.lang;
}
