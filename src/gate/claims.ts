/**
 * Claim assessment: what an AI agent said versus what the evidence log can prove.
 *
 * Deterministic and local. A claim is split into the kinds of verification it asserts (tests,
 * build, lint, security, requirements, completion); each kind needs a specific kind of evidence.
 * Security and requirement claims cannot be proven by a command exit code: LWC marks them as
 * unverifiable instead of guessing.
 */
import type { Finding } from '../core/findings.js';
import { freshnessOf, type Freshness, type WorktreeFingerprint } from '../core/fingerprint.js';
import type { Claim, EvidenceRecord } from '../core/state.js';
import { words } from '../core/text.js';

export type ClaimKind = 'tests' | 'build' | 'lint' | 'security' | 'requirements' | 'completion';

export type ClaimStatus =
  /** A passing run of the right kind backs the claim and nothing later contradicts it. */
  | 'supported'
  /** The backing run passed on a different code state; it proves nothing about the current code. */
  | 'stale'
  /** The relevant run failed, or a confirmed finding contradicts the claim. */
  | 'contradicted'
  /** No run of the right kind was recorded before the claim. */
  | 'unsupported'
  /** The claim cannot be proven by recorded commands (security, requirements). Needs a human. */
  | 'unverifiable'
  /** The claim asserts no verification (e.g. "refactored the parser"). Reported, not judged. */
  | 'informational';

export interface ClaimAssessment {
  id: string;
  text: string;
  at: string;
  kinds: ClaimKind[];
  status: ClaimStatus;
  /** Evidence record id the assessment rests on, if any. */
  evidence?: string;
  freshness?: Freshness;
  /** Machine-readable reason code (localized in the report). */
  reason: string;
  /** Values for the reason text. */
  vars: Record<string, string | number>;
}

const KIND_PATTERNS: Array<[ClaimKind, RegExp]> = [
  [
    'tests',
    words(
      'tests?|tested|testing|test\\s+suite|тест\\p{L}*|протестирован\\p{L}*|тексер\\p{L}*\\s+тест\\p{L}*|тесттер\\p{L}*',
    ),
  ],
  [
    'build',
    words(
      'build\\p{L}*|built|compil\\p{L}+|сборк\\p{L}*|собира\\p{L}*|собран\\p{L}*|құрастыр\\p{L}*',
    ),
  ],
  ['lint', words('lint\\p{L}*|typecheck\\p{L}*|type-?check\\p{L}*|линт\\p{L}*|типизац\\p{L}*')],
  [
    'security',
    words(
      'secur\\p{L}*|safe|vulnerab\\p{L}*|xss|injection|безопасн\\p{L}*|уязвим\\p{L}*|инъекц\\p{L}*|қауіпсіз\\p{L}*',
    ),
  ],
  [
    'requirements',
    words(
      'requirements?|acceptance\\s+criteria|spec\\s+(?:met|satisfied)|требовани\\p{L}*|критери\\p{L}*\\s+приёмк\\p{L}*|критери\\p{L}*\\s+приемк\\p{L}*|талап\\p{L}*',
    ),
  ],
  [
    'completion',
    words(
      'done|implemented|complete[d]?|finished|fixed|works|ready|готов\\p{L}*|реализова\\p{L}*|сделан\\p{L}*|исправлен\\p{L}*|работает|выполнен\\p{L}*|дайын|орындалд\\p{L}*|түзетілд\\p{L}*',
    ),
  ],
];

/** Which verification kinds a claim asserts. Pure function of the text. */
export function classifyClaim(text: string): ClaimKind[] {
  return KIND_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);
}

const EVIDENCE_KIND: Partial<Record<ClaimKind, EvidenceRecord['kind']>> = {
  tests: 'test',
  build: 'build',
  lint: 'lint',
  completion: 'test', // "done" is only as good as the latest test run
};

const STATUS_RANK: Record<ClaimStatus, number> = {
  contradicted: 0,
  unsupported: 1,
  stale: 2,
  unverifiable: 3,
  supported: 4,
  informational: 5,
};

interface PartAssessment {
  status: ClaimStatus;
  reason: string;
  vars: Record<string, string | number>;
  evidence?: string;
  freshness?: Freshness;
}

function assessCommandKind(
  kind: ClaimKind,
  claim: Claim,
  evidence: EvidenceRecord[],
  current: WorktreeFingerprint | null,
): PartAssessment {
  const evKind = EVIDENCE_KIND[kind]!;
  const runs = evidence.filter((e) => e.kind === evKind);
  const before = runs.filter((e) => e.startedAt <= claim.at);
  const backing = before[before.length - 1];
  if (!backing) return { status: 'unsupported', reason: 'claim.noRun', vars: { kind: evKind } };
  if (backing.exitCode !== 0)
    return {
      status: 'contradicted',
      reason: 'claim.failedBefore',
      vars: { command: backing.command, code: String(backing.exitCode ?? 'null') },
      evidence: backing.id,
    };
  // The latest run of this kind overrides the backing one if it came later and failed.
  const latest = runs[runs.length - 1]!;
  if (latest.exitCode !== 0)
    return {
      status: 'contradicted',
      reason: 'claim.failedAfter',
      vars: { command: latest.command, code: String(latest.exitCode ?? 'null') },
      evidence: latest.id,
    };
  const freshness = freshnessOf(latest.worktree, current);
  if (freshness === 'stale')
    return {
      status: 'stale',
      reason: 'claim.stale',
      vars: { command: latest.command },
      evidence: latest.id,
      freshness,
    };
  return {
    status: 'supported',
    reason: freshness === 'fresh' ? 'claim.supportedFresh' : 'claim.supportedUnknown',
    vars: { command: latest.command },
    evidence: latest.id,
    freshness,
  };
}

function blocking(f: Finding): boolean {
  return (f.severity === 'critical' || f.severity === 'high') && f.status === 'confirmed';
}

/**
 * Assesses one claim. The worst assessment of its kinds wins: a claim "tests pass and it is secure"
 * is no better than its weakest part.
 */
export function assessClaim(
  claim: Claim,
  evidence: EvidenceRecord[],
  findings: Finding[],
  current: WorktreeFingerprint | null,
): ClaimAssessment {
  const kinds = classifyClaim(claim.text);
  const parts: PartAssessment[] = [];
  for (const kind of kinds) {
    if (EVIDENCE_KIND[kind]) {
      parts.push(assessCommandKind(kind, claim, evidence, current));
    } else if (kind === 'security') {
      const sec = findings.filter((f) => f.category === 'security' && blocking(f));
      parts.push(
        sec.length > 0
          ? {
              status: 'contradicted',
              reason: 'claim.securityFindings',
              vars: { count: sec.length, ids: sec.map((f) => f.id).join(', ') },
            }
          : { status: 'unverifiable', reason: 'claim.securityUnverifiable', vars: {} },
      );
    } else if (kind === 'requirements') {
      const req = findings.filter((f) => f.category === 'requirements');
      parts.push({
        status: 'unverifiable',
        reason: 'claim.requirementsUnverifiable',
        vars: { count: req.length },
      });
    }
  }
  const base = { id: claim.id, text: claim.text, at: claim.at, kinds };
  if (parts.length === 0)
    return { ...base, status: 'informational', reason: 'claim.informational', vars: {} };
  parts.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const worst = parts[0]!;
  const out: ClaimAssessment = {
    ...base,
    status: worst.status,
    reason: worst.reason,
    vars: worst.vars,
  };
  if (worst.evidence) out.evidence = worst.evidence;
  if (worst.freshness) out.freshness = worst.freshness;
  return out;
}
