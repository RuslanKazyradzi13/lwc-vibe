/**
 * Core Anomaly Radar types: finding, severity, verification status, source.
 *
 * Every finding must state honestly where it came from (source) and how well it
 * is confirmed (status). The radar never presents model reasoning as the result
 * of static analysis or a test run.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Anomaly categories (A–E from the product spec plus `ops` for data reports). */
export type Category =
  | 'requirements' // A. requirement anomalies
  | 'architecture' // B. architecture anomalies
  | 'implementation' // C. implementation anomalies
  | 'security' // D. security anomalies
  | 'process' // E. AI-development process anomalies
  | 'ops'; // operational data checks

/**
 * Verification status. The radar distinguishes a confirmed defect from a suspicion.
 * - confirmed: reproducible (a test failed, a formal invariant is violated).
 * - probable: strong heuristic, manual verification needed.
 * - warning: weak heuristic / advisory.
 * - evidence-gap: no proof of correctness (a gap, not a bug).
 * - false-positive: established as false (suppressed with a reason).
 */
export type FindingStatus =
  'confirmed' | 'probable' | 'warning' | 'evidence-gap' | 'false-positive';

/** Where a finding came from. */
export type FindingSource =
  | 'rule' // deterministic rule (regex / data invariant)
  | 'static-analyzer' // code structure / import graph analysis
  | 'test' // a real test or command run
  | 'dependency-analysis' // dependency manifests
  | 'ai-reasoning'; // AI agent reasoning (must be labelled explicitly)

export interface Location {
  file: string;
  line?: number;
  column?: number;
}

export interface Finding {
  /** Unique stable identifier: <RULE>-<hash8>. */
  id: string;
  /** Rule identifier, e.g. SEC-001. */
  rule: string;
  category: Category;
  severity: Severity;
  status: FindingStatus;
  source: FindingSource;
  location?: Location;
  /** Short title. */
  title: string;
  /** The factual observation (quote / value). */
  observation: string;
  /** Plain-language explanation. */
  explanation: string;
  /** Possible consequence. */
  consequence: string;
  /** How to reproduce or verify. */
  howToVerify: string;
  /** Recommended fix. */
  fix: string;
  /** Link to a test / piece of evidence, if any. */
  evidence?: string;
  /** Whether the finding is suppressed and why. */
  suppressed?: { reason: string; by?: string; date?: string };
  /** Arbitrary machine-readable data. */
  data?: Record<string, unknown>;
}

export type Lang = 'ru' | 'kk' | 'en';

/** Short text localized in the three supported languages. */
export type L10n = Record<Lang, string>;

export interface BoundaryRule {
  /** Source glob, e.g. "src/ui/**". */
  from: string;
  /** Forbidden import targets. */
  deny: string[];
  /** Note shown in the report. */
  note?: string;
}

export interface LwcConfig {
  version: number;
  lang: Lang;
  level: 'beginner' | 'intermediate' | 'advanced';
  checkpoints: 'light' | 'normal' | 'frequent';
  /** Command that runs the project tests. */
  testCommand?: string;
  /** Ignored paths (globs). */
  ignore: string[];
  /** Declared module boundaries. */
  boundaries: BoundaryRule[];
  /** Rule thresholds. */
  thresholds: {
    maxFanOut: number;
    duplicateMinLines: number;
  };
  /** Enabled/disabled rules: { "IMPL-002": false }. */
  rules: Record<string, boolean>;
  /** Requirement files analysed by category A. */
  requirementFiles: string[];
  /** Architecture documents checked by ARCH-004. */
  architectureDocs: string[];
  /**
   * Claude Code guard hook (PreToolUse on Edit/Write): what to do when source code is
   * edited while the task is not at the build stage. ask — ask the user, deny — block, off — disabled.
   */
  guard: 'ask' | 'deny' | 'off';
}

export interface AnalyzerContext {
  /** Absolute project root. */
  root: string;
  /** Files to analyse (relative paths with '/'). */
  files: string[];
  /** Cached file reader. */
  read: (relPath: string) => string | null;
  /** Message language. */
  lang: Lang;
  /** LWC configuration. */
  config: LwcConfig;
  /** Whether running commands (tests) is allowed. */
  allowRunCommands: boolean;
  /** Diagnostic log. */
  log: (msg: string) => void;
}

export interface Analyzer {
  id: string;
  category: Category;
  /** Returns findings. Analyzer errors become an info-level finding. */
  run(ctx: AnalyzerContext): Promise<Finding[]> | Finding[];
}

export const DEFAULT_CONFIG: LwcConfig = {
  version: 1,
  lang: 'en',
  level: 'intermediate',
  checkpoints: 'normal',
  ignore: [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    'coverage/**',
    '**/*.min.js',
    '**/*.map',
    '.lwc/reports/**',
    'vendor/**',
    '__pycache__/**',
    '.venv/**',
    'venv/**',
  ],
  boundaries: [],
  thresholds: { maxFanOut: 12, duplicateMinLines: 8 },
  rules: {},
  requirementFiles: ['REQUIREMENTS.md', 'SPEC.md', 'docs/REQUIREMENTS.md', '.lwc/task.md'],
  architectureDocs: ['docs/ARCHITECTURE.md', 'ARCHITECTURE.md'],
  guard: 'ask',
};

/** Deterministic hash (FNV-1a, 32-bit) for stable identifiers. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function makeFindingId(rule: string, parts: Array<string | number | undefined>): string {
  return `${rule}-${fnv1a(parts.map((p) => String(p ?? '')).join('|'))}`;
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    const f = (a.location?.file ?? '').localeCompare(b.location?.file ?? '');
    if (f !== 0) return f;
    return (a.location?.line ?? 0) - (b.location?.line ?? 0);
  });
}
