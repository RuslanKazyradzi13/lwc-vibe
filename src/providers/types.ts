/**
 * Optional AI advisory providers for the Evidence Gate.
 *
 * A provider receives a small, explicitly built payload (never the repository) and returns
 * advisory items. Advisory items are kept apart from deterministic results: they never change
 * the gate verdict, never remove a finding and are always labelled as AI output.
 */

/** Exactly what may leave the machine. Built by `buildAdvisoryPayload` in gate/payload.ts. */
export interface AdvisoryPayload {
  schema: 'lwc-gate-advisory/1';
  task: { title: string; stage: string } | null;
  verdict: string;
  claims: Array<{ id: string; text: string; kinds: string[]; status: string }>;
  findings: Array<{
    ref: string;
    rule: string;
    category: string;
    severity: string;
    status: string;
    title: string;
    file?: string;
    /** Only with `ai.includeObservations`; redacted. */
    observation?: string;
  }>;
  /** Requirement excerpts, only when `ai.includeRequirements` is true; secrets redacted. */
  requirements?: string;
  /** How many findings were left out by `ai.maxFindings`. */
  omittedFindings: number;
}

export interface AdvisoryItem {
  /** Finding id, claim id or "overall". */
  ref: string;
  /** Provider label, e.g. a risk class. Free text from the provider, shown verbatim. */
  label: string;
  /** Provider-reported confidence 0..1 when the API returns one; never invented by LWC. */
  confidence?: number;
  rationale?: string;
}

export type AdvisoryStatus =
  'ok' | 'disabled' | 'not-configured' | 'preview' | 'error' | 'invalid-response';

export interface AdvisoryResult {
  provider: string;
  status: AdvisoryStatus;
  /** Human-readable reason for any status other than ok. Never contains the API key. */
  message?: string;
  items: AdvisoryItem[];
  meta: {
    endpoint?: string;
    model?: string;
    startedAt?: string;
    durationMs?: number;
    httpStatus?: number;
    /** sha256 of the exact JSON body sent, so the request can be audited later. */
    requestSha256?: string;
    requestBytes?: number;
  };
}

export interface ProviderDeps {
  env: Record<string, string | undefined>;
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
}

export interface AdvisoryProvider {
  id: string;
  run(payload: AdvisoryPayload, deps: ProviderDeps): Promise<AdvisoryResult>;
}
