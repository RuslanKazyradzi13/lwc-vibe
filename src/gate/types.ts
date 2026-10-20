/**
 * Evidence Gate report types (schema `lwc-gate/1`). Kept apart from gate.ts so that the payload
 * builder and renderers depend on the data shape, not on the orchestrator.
 */
import type { Finding, Lang } from '../core/findings.js';
import type { Freshness } from '../core/fingerprint.js';
import type { RadarReport } from '../core/radar.js';
import type { EvidenceRecord } from '../core/state.js';
import type { AdvisoryResult } from '../providers/types.js';
import type { ClaimAssessment } from './claims.js';

export type CheckStatus = 'pass' | 'fail' | 'gap' | 'skip';
export type Verdict = 'pass' | 'fail' | 'insufficient-evidence';

export interface GateCheck {
  /** Stable check id, e.g. GATE-TESTS. */
  id: string;
  status: CheckStatus;
  /** i18n key of the explanation (gate.* in the UI catalog). */
  reason: string;
  vars: Record<string, string | number>;
  /** Evidence record ids / finding ids this check rests on. */
  refs: string[];
}

export interface EvidenceSummary {
  id: string;
  command: string;
  kind: EvidenceRecord['kind'];
  exitCode: number | null;
  startedAt: string;
  outputSha256: string;
  freshness: Freshness;
}

export interface GateReport {
  tool: 'lwc-vibe';
  kind: 'evidence-gate';
  schema: 'lwc-gate/1';
  version: string;
  generatedAt: string;
  root: string;
  lang: Lang;
  verdict: Verdict;
  checks: GateCheck[];
  claims: ClaimAssessment[];
  evidence: EvidenceSummary[];
  changes: { git: boolean; files: string[]; sources: number; tests: number };
  task: { id: string; title: string; stage: string } | null;
  radar: {
    summary: RadarReport['summary'];
    analyzers: string[];
    filesScanned: number;
    findings: Finding[];
    suppressed: Finding[];
  };
  /** AI output. Advisory only: never evidence, never part of the verdict. */
  advisory: AdvisoryResult & { sentPayload?: unknown };
  reproducibility: {
    lwcVersion: string;
    rulesetDigest: string;
    configDigest: string;
    checks: string[];
    gitHead: string | null;
    worktreeDigest: string | null;
    evidenceIds: string[];
    node: string;
    platform: string;
  };
}
