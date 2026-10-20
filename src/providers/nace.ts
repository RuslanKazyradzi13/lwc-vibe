/**
 * Nace Drex advisory provider.
 *
 * Uses one documented endpoint of the Drex API: `POST /v1/systemone` (OpenAPI "Drex API" 1.0.0,
 * https://console.nace.ai/llms-full.txt). Drex takes a `state` (any JSON) and typed `questions`
 * and returns one calibrated answer per question. LWC sends the redacted advisory payload as the
 * state and asks:
 *
 *   - per finding (choice): fix-before-merge | verify-manually | likely-noise — triage help for
 *     the heuristic findings a human has to look at;
 *   - overall (choice): ready-for-human-review | needs-more-evidence | not-ready.
 *
 * Plain `fetch`, no SDK: one endpoint, zero runtime dependencies, every byte sent is auditable.
 * Errors never throw: they become an AdvisoryResult with status error / invalid-response /
 * not-configured, and the deterministic gate result stands unchanged.
 */
import { createHash } from 'node:crypto';
import type { NaceConfig } from '../core/findings.js';
import type {
  AdvisoryItem,
  AdvisoryPayload,
  AdvisoryProvider,
  AdvisoryResult,
  ProviderDeps,
} from './types.js';

/** Documented key format: `nace_sk_` followed by 43 URL-safe characters. */
export const NACE_KEY_RE = /^nace_sk_[A-Za-z0-9_-]{43}$/;

export const FINDING_LABELS = {
  'fix-before-merge': 'A real defect or risk that should be fixed before the change is merged',
  'verify-manually': 'Plausible but unclear from the metadata; a human should check the code',
  'likely-noise': 'Probably a false positive or harmless in this context',
} as const;

export const OVERALL_LABELS = {
  'ready-for-human-review':
    'The recorded checks cover the claims; a human can review and decide on the change',
  'needs-more-evidence': 'Important claims or risks are not covered by recorded checks yet',
  'not-ready': 'The checks show problems that must be fixed before review',
} as const;

const MAX_RETRY_WAIT_MS = 5_000;

type Question = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
};

export function buildQuestions(payload: AdvisoryPayload): Record<string, Question> {
  const q: Record<string, Question> = {
    overall: {
      type: 'choice',
      instructions:
        'The state is the result of deterministic checks of an AI agent task (tests, static rules, ' +
        'claims compared with recorded command runs). Given only this state, how ready is the change?',
      criteria: { ...OVERALL_LABELS },
    },
  };
  for (const f of payload.findings) {
    q[`finding:${f.ref}`] = {
      type: 'choice',
      instructions: `How should a reviewer treat finding ${f.ref} (${f.rule}, ${f.severity}, ${f.status}): "${f.title}"${f.file ? ` in ${f.file}` : ''}?`,
      criteria: { ...FINDING_LABELS },
    };
  }
  return q;
}

function isNum01(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
}

/**
 * Validates a systemone response against what was asked. Returns the items or a reason why the
 * response cannot be trusted. Partial or mistyped answers invalidate the whole response.
 */
export function parseSystemOneResponse(
  body: unknown,
  questions: Record<string, Question>,
): { ok: true; items: AdvisoryItem[]; model?: string } | { ok: false; reason: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'response is not an object' };
  const b = body as Record<string, unknown>;
  const answers = b.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    return { ok: false, reason: 'response has no "answers" object' };
  const items: AdvisoryItem[] = [];
  for (const [qid, q] of Object.entries(questions)) {
    const a = (answers as Record<string, unknown>)[qid];
    if (!a || typeof a !== 'object') return { ok: false, reason: `answer "${qid}" is missing` };
    const ans = a as Record<string, unknown>;
    if (ans.type !== 'choice') return { ok: false, reason: `answer "${qid}" is not a choice` };
    if (typeof ans.choice !== 'string' || !(ans.choice in q.criteria))
      return { ok: false, reason: `answer "${qid}" picked an unknown label` };
    if (!isNum01(ans.confidence))
      return { ok: false, reason: `answer "${qid}" has no confidence in [0, 1]` };
    const probs = ans.probabilities;
    let rationale: string | undefined;
    if (probs && typeof probs === 'object') {
      const parts = Object.entries(probs as Record<string, unknown>)
        .filter(([, v]) => isNum01(v))
        .sort((x, y) => (y[1] as number) - (x[1] as number))
        .map(([k, v]) => `${k} ${(v as number).toFixed(2)}`);
      if (parts.length) rationale = `probabilities: ${parts.join(', ')}`;
    }
    const item: AdvisoryItem = {
      ref: qid === 'overall' ? 'overall' : qid.slice('finding:'.length),
      label: ans.choice,
      confidence: ans.confidence,
    };
    if (rationale) item.rationale = rationale;
    items.push(item);
  }
  const out: { ok: true; items: AdvisoryItem[]; model?: string } = { ok: true, items };
  if (typeof b.model === 'string') out.model = b.model;
  return out;
}

/** Reads the documented Drex error envelope `{error: {type, message, issues?}}`. */
function errorMessage(status: number, body: unknown): string {
  const e = (body as { error?: { type?: unknown; message?: unknown } } | null)?.error;
  const type = typeof e?.type === 'string' ? e.type : undefined;
  const msg = typeof e?.message === 'string' ? e.message : undefined;
  const hint: Record<number, string> = {
    401: 'the API key was rejected',
    402: 'the account has no credit left',
    422: 'the request was rejected as invalid',
    429: 'rate limit reached',
    500: 'Nace internal error',
    529: 'Nace is overloaded',
  };
  return [`HTTP ${status}`, type, msg ?? hint[status]].filter(Boolean).join(' · ');
}

function retryDelay(headers: Headers): number {
  const ms = Number(headers.get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return Math.min(ms, MAX_RETRY_WAIT_MS);
  const s = Number(headers.get('retry-after'));
  if (Number.isFinite(s) && s > 0) return Math.min(s * 1000, MAX_RETRY_WAIT_MS);
  return 1_000;
}

/** Only https, or http to a loopback host (local mock servers). */
export function validateBaseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:') return u;
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
      return u;
    return null;
  } catch {
    return null;
  }
}

export function createNaceProvider(cfg: NaceConfig): AdvisoryProvider {
  return {
    id: 'nace-drex',
    async run(payload: AdvisoryPayload, deps: ProviderDeps): Promise<AdvisoryResult> {
      const base: AdvisoryResult = { provider: 'nace-drex', status: 'error', items: [], meta: {} };
      const key = deps.env[cfg.apiKeyEnv];
      if (!key)
        return {
          ...base,
          status: 'not-configured',
          message: `Environment variable ${cfg.apiKeyEnv} is not set; nothing was sent.`,
        };
      if (!NACE_KEY_RE.test(key))
        return {
          ...base,
          status: 'not-configured',
          message: `${cfg.apiKeyEnv} does not look like a Nace key (nace_sk_…); nothing was sent.`,
        };
      const baseUrl = validateBaseUrl(cfg.baseUrl);
      if (!baseUrl)
        return {
          ...base,
          status: 'not-configured',
          message: `ai.nace.baseUrl must be https (http only for localhost); nothing was sent.`,
        };
      const endpoint = new URL('/v1/systemone', baseUrl).toString();
      const questions = buildQuestions(payload);
      const body = JSON.stringify({ model: cfg.model, state: payload, questions });
      const meta: AdvisoryResult['meta'] = {
        endpoint,
        requestSha256: createHash('sha256').update(body).digest('hex'),
        requestBytes: Buffer.byteLength(body),
        startedAt: new Date().toISOString(),
      };
      const started = Date.now();
      // One deadline for the whole call: both attempts and reading the body.
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), deps.timeoutMs);
      const attempt = () =>
        deps.fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body,
          signal: ctl.signal,
        });
      let res: Response;
      let json: unknown;
      let jsonOk = true;
      try {
        res = await attempt();
        // One retry for the statuses the docs mark as retryable.
        if ([429, 500, 529].includes(res.status)) {
          await new Promise((r) => setTimeout(r, retryDelay(res.headers)));
          res = await attempt();
        }
        try {
          json = await res.json();
        } catch (err) {
          if (ctl.signal.aborted) throw err;
          jsonOk = false;
        }
      } catch (err) {
        const aborted = ctl.signal.aborted || (err instanceof Error && err.name === 'AbortError');
        return {
          ...base,
          message: aborted
            ? `Request timed out after ${deps.timeoutMs} ms.`
            : `Network error: ${err instanceof Error ? err.message : String(err)}`,
          meta: { ...meta, durationMs: Date.now() - started },
        };
      } finally {
        clearTimeout(timer);
      }
      meta.httpStatus = res.status;
      meta.durationMs = Date.now() - started;
      if (!jsonOk)
        return {
          ...base,
          status: res.ok ? 'invalid-response' : 'error',
          message: res.ok ? 'Response is not JSON.' : `HTTP ${res.status} (body is not JSON)`,
          meta,
        };
      if (!res.ok) return { ...base, message: errorMessage(res.status, json), meta };
      const parsed = parseSystemOneResponse(json, questions);
      if (!parsed.ok) return { ...base, status: 'invalid-response', message: parsed.reason, meta };
      if (parsed.model) meta.model = parsed.model;
      return { provider: 'nace-drex', status: 'ok', items: parsed.items, meta };
    },
  };
}
