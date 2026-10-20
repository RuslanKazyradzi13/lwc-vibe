/**
 * Local LWC state: the `.lwc/` directory in the project root.
 *
 *   .lwc/config.json        — settings (language, level, module boundaries, rules)
 *   .lwc/session.json       — current task: stage, scope, decisions, claims
 *   .lwc/journal.md         — human-readable journal of decisions and explanations
 *   .lwc/project-map.md     — project map
 *   .lwc/evidence/*.json    — records of commands that actually ran (tests etc.)
 *   .lwc/suppressions.json  — suppressed findings with reasons
 *   .lwc/reports/           — Anomaly Radar reports
 *
 * Everything is plain JSON/Markdown in UTF-8. No server, telemetry or cloud.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULT_CONFIG, type LwcConfig } from './findings.js';

export const STATE_DIR = '.lwc';

export type Stage = 'learn' | 'design' | 'build' | 'review' | 'done';

export interface Decision {
  id: string;
  text: string;
  proposedAt: string;
  confirmedAt?: string;
  /** Who confirmed: user — a human confirmed explicitly. */
  confirmedBy?: 'user';
}

export interface Claim {
  id: string;
  text: string;
  at: string;
  /** Evidence record the claim refers to, if any. */
  evidence?: string;
}

export interface TaskState {
  id: string;
  title: string;
  startedAt: string;
  stage: Stage;
  /** Agreed change scope: file globs. */
  scope: string[];
  decisions: Decision[];
  claims: Claim[];
  /** Snapshot of changed files when the task started / entered build (for PROC rules). */
  baselineChanged?: string[];
}

export interface SessionState {
  version: number;
  task?: TaskState;
  history: Array<Pick<TaskState, 'id' | 'title' | 'startedAt'> & { finishedAt: string }>;
}

export interface EvidenceRecord {
  id: string;
  command: string;
  cwd: string;
  startedAt: string;
  durationMs: number;
  exitCode: number | null;
  /** Last output lines, for humans; the full output is not stored. */
  stdoutTail: string;
  stderrTail: string;
  outputSha256: string;
  /** What the run proves (e.g. "npm test"). */
  kind: 'test' | 'lint' | 'build' | 'other';
  /**
   * Working-tree fingerprint taken right before the run (see core/fingerprint.ts). Lets the
   * Evidence Gate tell a run on the current code from a stale one. Absent in older records.
   */
  worktree?: { head: string | null; digest: string };
}

export interface Suppression {
  /** Exact finding id or rule id (e.g. SEC-002). */
  match: { id?: string; rule?: string; file?: string };
  reason: string;
  by?: string;
  date: string;
}

export interface Paths {
  root: string;
  dir: string;
  config: string;
  session: string;
  journal: string;
  map: string;
  evidenceDir: string;
  suppressions: string;
  reportsDir: string;
}

export function statePaths(root: string): Paths {
  const dir = path.join(root, STATE_DIR);
  return {
    root,
    dir,
    config: path.join(dir, 'config.json'),
    session: path.join(dir, 'session.json'),
    journal: path.join(dir, 'journal.md'),
    map: path.join(dir, 'project-map.md'),
    evidenceDir: path.join(dir, 'evidence'),
    suppressions: path.join(dir, 'suppressions.json'),
    reportsDir: path.join(dir, 'reports'),
  };
}

/** Finds the project root: the nearest directory containing .lwc/ or .git/, else cwd. */
export function findRoot(start: string): string {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, STATE_DIR)) || fs.existsSync(path.join(dir, '.git')))
      return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink()) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Shared (team) config in the project root: kept in Git, unlike the personal `.lwc/config.json`. */
export const SHARED_CONFIG_FILE = 'lwc.config.json';

/**
 * Layer order: DEFAULT_CONFIG ← lwc.config.json (in Git, shared by the team) ← .lwc/config.json (personal).
 * Arrays ignore/boundaries/requirementFiles/architectureDocs and the rules object are merged; scalars override.
 */
export function loadConfig(root: string): LwcConfig {
  const shared = readJson<Partial<LwcConfig>>(path.join(root, SHARED_CONFIG_FILE));
  const personal = readJson<Partial<LwcConfig>>(statePaths(root).config);
  return mergeConfig(personal, mergeConfig(shared));
}

export function mergeConfig(
  raw: Partial<LwcConfig> | null,
  base: LwcConfig = structuredClone(DEFAULT_CONFIG),
): LwcConfig {
  if (!raw) return base;
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    ...base,
    ...raw,
    ignore: Array.isArray(raw.ignore) ? uniq([...base.ignore, ...raw.ignore]) : base.ignore,
    boundaries: Array.isArray(raw.boundaries)
      ? [...base.boundaries, ...raw.boundaries]
      : base.boundaries,
    thresholds: { ...base.thresholds, ...(raw.thresholds ?? {}) },
    rules: { ...base.rules, ...(raw.rules ?? {}) },
    requirementFiles: Array.isArray(raw.requirementFiles)
      ? uniq([...raw.requirementFiles, ...base.requirementFiles])
      : base.requirementFiles,
    architectureDocs: Array.isArray(raw.architectureDocs)
      ? uniq([...raw.architectureDocs, ...base.architectureDocs])
      : base.architectureDocs,
    gate: { ...base.gate, ...(raw.gate ?? {}) },
    ai: {
      ...base.ai,
      ...(raw.ai ?? {}),
      nace: { ...base.ai.nace, ...(raw.ai?.nace ?? {}) },
    },
  };
}

/** Config keys that must never hold a secret value; LWC refuses to run when they are present. */
const SECRET_CONFIG_KEYS = /^(?:api[_-]?key|apikey|token|secret|password|authorization)$/i;

/**
 * Returns the paths of secret-looking keys in a config object (e.g. `ai.nace.apiKey`).
 * API keys belong in environment variables, never in a file that may end up in Git.
 */
export function findSecretConfigKeys(raw: unknown, prefix = ''): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (SECRET_CONFIG_KEYS.test(k) && typeof v === 'string' && v.length > 0) out.push(p);
    else out.push(...findSecretConfigKeys(v, p));
  }
  return out;
}

/** Secret-looking keys in both config layers, with the file they were found in. */
export function secretKeysInConfig(root: string): string[] {
  const files = [path.join(root, SHARED_CONFIG_FILE), statePaths(root).config];
  const out: string[] = [];
  for (const f of files) {
    for (const k of findSecretConfigKeys(readJson<unknown>(f)))
      out.push(`${path.relative(root, f).replace(/\\/g, '/')}: ${k}`);
  }
  return out;
}

export function saveConfig(root: string, config: LwcConfig): void {
  // Do not persist the default ignore list again — only user additions.
  const toSave = {
    ...config,
    ignore: config.ignore.filter((g) => !DEFAULT_CONFIG.ignore.includes(g)),
  };
  writeJson(statePaths(root).config, toSave);
}

export function hasState(root: string): boolean {
  return fs.existsSync(statePaths(root).config);
}

export function loadSession(root: string): SessionState {
  return readJson<SessionState>(statePaths(root).session) ?? { version: 1, history: [] };
}

export function saveSession(root: string, s: SessionState): void {
  writeJson(statePaths(root).session, s);
}

export function loadSuppressions(root: string): Suppression[] {
  const s = readJson<Suppression[]>(statePaths(root).suppressions);
  return Array.isArray(s) ? s : [];
}

export function saveSuppressions(root: string, list: Suppression[]): void {
  writeJson(statePaths(root).suppressions, list);
}

export function loadEvidence(root: string): EvidenceRecord[] {
  const dir = statePaths(root).evidenceDir;
  if (!fs.existsSync(dir)) return [];
  const out: EvidenceRecord[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const rec = readJson<EvidenceRecord>(path.join(dir, f));
    if (rec && typeof rec.command === 'string') out.push(rec);
  }
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function saveEvidence(root: string, rec: EvidenceRecord): string {
  const file = path.join(statePaths(root).evidenceDir, `${rec.id}.json`);
  writeJson(file, rec);
  return path.relative(root, file).replace(/\\/g, '/');
}

export function appendJournal(root: string, heading: string, body: string): void {
  const p = statePaths(root).journal;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const stamp = new Date().toISOString();
  const entry = `\n## ${heading}\n\n_${stamp}_\n\n${body.trim()}\n`;
  if (!fs.existsSync(p)) fs.writeFileSync(p, '# LWC — vibe journal\n', 'utf8');
  fs.appendFileSync(p, entry, 'utf8');
}

export function nowId(prefix: string): string {
  const t = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  const r = createHash('sha256')
    .update(String(Math.random()) + t)
    .digest('hex')
    .slice(0, 6);
  return `${prefix}-${t}-${r}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
