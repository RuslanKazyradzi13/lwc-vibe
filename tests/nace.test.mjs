import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeProject, cleanup, lwc } from './helpers.mjs';

const { createNaceProvider, parseSystemOneResponse, buildQuestions, validateBaseUrl } =
  await import('../dist/providers/nace.js');
const { runGate } = await import('../dist/gate/gate.js');
const { redactText } = await import('../dist/gate/payload.js');
const { loadConfig } = await import('../dist/core/state.js');

// A syntactically valid but fake key, assembled at runtime so it never appears as a literal.
const KEY = ['nace', 'sk', 'T'.repeat(43)].join('_');
const ENV = { NACE_API_KEY: KEY };
const DEMO = path.resolve('examples/demo-buggy-app');

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** A mock Drex that answers every question with the given label. */
function drexAnswering(label, overall = 'not-ready') {
  const calls = [];
  const fetch = async (url, init) => {
    const req = JSON.parse(init.body);
    calls.push({ url, init, req });
    const answers = {};
    for (const qid of Object.keys(req.questions)) {
      const choice = qid === 'overall' ? overall : label;
      answers[qid] = {
        type: 'choice',
        choice,
        confidence: 0.91,
        probabilities: { [choice]: 0.93 },
      };
    }
    return json(200, {
      model: 'drex-v2.0',
      answers,
      usage: { input_tokens: 100, output_tokens: 10 },
      evaluation_time_ms: 120,
      request_id: 'req_' + '0'.repeat(32),
    });
  };
  return { fetch, calls };
}

function never() {
  return async () => {
    throw new Error('fetch must not be called');
  };
}

const config = () => loadConfig(DEMO);
const nace = () => createNaceProvider(config().ai.nace);

async function gateWith(provider, deps) {
  return runGate({ root: DEMO, config: config(), provider, deps });
}

/** The deterministic part of a report (everything except the advisory and timestamps). */
function deterministic(r) {
  return {
    verdict: r.verdict,
    checks: r.checks,
    claims: r.claims,
    findings: r.radar.findings.map((f) => [f.id, f.severity, f.status]),
    suppressed: r.radar.suppressed.map((f) => f.id),
  };
}

test('nace: no API key → not-configured, nothing sent, gate result unchanged', async () => {
  const base = await gateWith(null);
  const r = await gateWith(nace(), { env: {}, fetch: never() });
  assert.equal(r.advisory.status, 'not-configured');
  assert.match(r.advisory.message, /NACE_API_KEY is not set/);
  assert.equal(r.advisory.sentPayload, undefined, 'nothing was sent, nothing is shown as sent');
  assert.deepEqual(deterministic(r), deterministic(base));
});

test('nace: a value that is not a Nace key is never sent', async () => {
  const gh = ['ghp', 'A'.repeat(36)].join('_');
  const r = await gateWith(nace(), { env: { NACE_API_KEY: gh }, fetch: never() });
  assert.equal(r.advisory.status, 'not-configured');
  assert.ok(!JSON.stringify(r).includes(gh));
});

test('nace: answers are parsed, kept apart and cannot clear a confirmed Critical finding', async () => {
  const base = await gateWith(null);
  // The AI calls every finding noise and the change ready — the gate must not care.
  const mock = drexAnswering('likely-noise', 'ready-for-human-review');
  const r = await gateWith(nace(), { env: ENV, fetch: mock.fetch });
  assert.equal(r.advisory.status, 'ok', r.advisory.message);
  assert.equal(r.advisory.meta.model, 'drex-v2.0');
  assert.equal(r.advisory.meta.httpStatus, 200);
  assert.match(r.advisory.meta.requestSha256, /^[0-9a-f]{64}$/);
  assert.equal(r.verdict, 'fail');
  assert.deepEqual(deterministic(r), deterministic(base));
  const overall = r.advisory.items.find((i) => i.ref === 'overall');
  assert.equal(overall.label, 'ready-for-human-review');
  assert.equal(overall.confidence, 0.91);
  const proc = r.radar.findings.find((f) => f.rule === 'PROC-005');
  assert.equal(proc.status, 'confirmed', 'AI labels never rewrite a finding');
  assert.ok(r.advisory.items.some((i) => i.ref === proc.id && i.label === 'likely-noise'));
  // The text report labels the section as advisory.
  const { renderGateText } = await import('../dist/gate/report.js');
  const text = renderGateText(r);
  assert.match(text, /AI advisory \(not evidence\)/);
  assert.match(text, /FAIL/);
});

test('nace: the request follows the documented systemone shape and carries no code or secrets', async () => {
  const mock = drexAnswering('verify-manually');
  const r = await gateWith(nace(), { env: ENV, fetch: mock.fetch });
  assert.equal(mock.calls.length, 1);
  const { url, init, req } = mock.calls[0];
  assert.equal(url, 'https://console.nace.ai/v1/systemone');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(req.model, 'drex-latest');
  assert.ok(req.state && req.questions.overall.type === 'choice');
  assert.deepEqual(req.state, r.advisory.sentPayload, 'the report shows exactly what was sent');
  const body = init.body;
  // The demo project contains fake secrets and code; none of it may leave the machine.
  for (const rel of ['src/config.js', 'src/api/server.js']) {
    const src = fs.readFileSync(path.join(DEMO, rel), 'utf8');
    for (const line of src.split('\n').filter((l) => l.trim().length > 25))
      assert.ok(!body.includes(line.trim()), `source line leaked: ${line.trim()}`);
  }
  assert.ok(!/AKIA[0-9A-Z]{16}/.test(body), 'no AWS key');
  assert.ok(!body.includes('stderrTail') && !body.includes('observation'));
  assert.ok(!JSON.stringify(r).includes(KEY), 'the key never appears in the report');
});

test('nace: HTTP errors use the documented envelope and never echo the key', async () => {
  const fetch = async () =>
    json(401, {
      error: { type: 'authentication_error', message: 'Invalid API key' },
      request_id: 'req_' + '1'.repeat(32),
    });
  const r = await gateWith(nace(), { env: ENV, fetch });
  assert.equal(r.advisory.status, 'error');
  assert.match(r.advisory.message, /HTTP 401 · authentication_error · Invalid API key/);
  assert.ok(!JSON.stringify(r).includes(KEY));
  assert.equal(r.verdict, 'fail');
});

test('nace: 429 is retried once honouring retry-after-ms; 422 is not retried', async () => {
  let n = 0;
  const ok = drexAnswering('verify-manually');
  const flaky = async (url, init) => {
    n++;
    if (n === 1)
      return json(
        429,
        { error: { type: 'rate_limit_error', message: 'slow down' } },
        { 'retry-after-ms': '1' },
      );
    return ok.fetch(url, init);
  };
  let r = await gateWith(nace(), { env: ENV, fetch: flaky });
  assert.equal(n, 2);
  assert.equal(r.advisory.status, 'ok');

  n = 0;
  const invalid = async () => {
    n++;
    return json(422, {
      error: { type: 'invalid_request_error', message: 'questions.a.type: bad', issues: [] },
    });
  };
  r = await gateWith(nace(), { env: ENV, fetch: invalid });
  assert.equal(n, 1);
  assert.equal(r.advisory.status, 'error');
  assert.match(r.advisory.message, /422/);
});

test('nace: network errors, timeouts and throwing providers do not affect the gate', async () => {
  const base = deterministic(await gateWith(null));
  let r = await gateWith(nace(), {
    env: ENV,
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(r.advisory.status, 'error');
  assert.match(r.advisory.message, /Network error: fetch failed/);
  assert.deepEqual(deterministic(r), base);

  const hanging = (url, init) =>
    new Promise((_, reject) =>
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      }),
    );
  r = await gateWith(nace(), { env: ENV, fetch: hanging, timeoutMs: 30 });
  assert.equal(r.advisory.status, 'error');
  assert.match(r.advisory.message, /timed out after 30 ms/);
  assert.deepEqual(deterministic(r), base);

  const broken = {
    id: 'broken',
    run: async () => {
      throw new Error('boom');
    },
  };
  r = await gateWith(broken, { env: ENV, fetch: never() });
  assert.equal(r.advisory.status, 'error');
  assert.deepEqual(deterministic(r), base);
});

test('nace: unexpected or malformed responses are rejected as a whole', async () => {
  const payload = {
    findings: [{ ref: 'F1', rule: 'R', severity: 'high', status: 'probable', title: 't' }],
  };
  const q = buildQuestions(payload);
  const good = {
    overall: { type: 'choice', choice: 'not-ready', confidence: 0.8, probabilities: {} },
    'finding:F1': { type: 'choice', choice: 'verify-manually', confidence: 0.7, probabilities: {} },
  };
  assert.equal(parseSystemOneResponse({ answers: good }, q).ok, true);
  const cases = [
    null,
    'text',
    {},
    { answers: [] },
    { answers: { overall: good.overall } },
    { answers: { ...good, 'finding:F1': { ...good['finding:F1'], choice: 'delete-repo' } } },
    { answers: { ...good, overall: { ...good.overall, confidence: 1.7 } } },
    { answers: { ...good, overall: { type: 'noul', noul: 0.5 } } },
  ];
  for (const c of cases) assert.equal(parseSystemOneResponse(c, q).ok, false, JSON.stringify(c));

  const notJson = async () => new Response('<html>oops</html>', { status: 200 });
  let r = await gateWith(nace(), { env: ENV, fetch: notJson });
  assert.equal(r.advisory.status, 'invalid-response');
  assert.equal(r.advisory.items.length, 0);

  const partial = async () => json(200, { model: 'drex-v2.0', answers: { overall: good.overall } });
  r = await gateWith(nace(), { env: ENV, fetch: partial });
  assert.equal(r.advisory.status, 'invalid-response');
  assert.match(r.advisory.message, /missing/);
  assert.equal(r.verdict, 'fail');
});

test('nace: base URL must be https (http only for loopback)', async () => {
  assert.ok(validateBaseUrl('https://console.nace.ai'));
  assert.ok(validateBaseUrl('http://127.0.0.1:8787'));
  assert.equal(validateBaseUrl('http://example.com'), null);
  assert.equal(validateBaseUrl('not a url'), null);
  const p = createNaceProvider({ ...config().ai.nace, baseUrl: 'http://example.com' });
  const r = await gateWith(p, { env: ENV, fetch: never() });
  assert.equal(r.advisory.status, 'not-configured');
});

test('payload: redaction of secrets and personal data; limits are respected', async () => {
  const aws = 'AKIA' + 'B'.repeat(16);
  const t = redactText(`key ${aws}, mail a.b@example.kz, IIN 900101300123, +7 701 123 45 67`, 500);
  assert.ok(!t.includes(aws) && !t.includes('a.b@example.kz') && !t.includes('900101300123'));
  assert.ok(!t.includes('701 123 45 67'));
  assert.ok(redactText('x'.repeat(50), 10).endsWith('…[truncated]'));

  const cfg = config();
  cfg.ai.maxFindings = 3;
  const mock = drexAnswering('verify-manually');
  const r = await runGate({
    root: DEMO,
    config: cfg,
    provider: nace(),
    deps: { env: ENV, fetch: mock.fetch },
  });
  const sent = mock.calls[0].req.state;
  assert.equal(sent.findings.length, 3);
  assert.equal(sent.omittedFindings, r.radar.findings.length - 3);
  assert.equal(sent.findings[0].severity, 'critical', 'the most severe findings go first');
  assert.equal(sent.requirements, undefined, 'requirements are not sent by default');
  assert.equal(Object.keys(mock.calls[0].req.questions).length, 4);
});

test('CLI gate --ai nace without a key: exit code follows the deterministic verdict only', () => {
  const dir = makeProject({
    '.lwc/config.json': '{"version":1,"lang":"en"}',
    'src/a.js': 'export const a = 1;\n',
  });
  try {
    const r = lwc(['gate', '--ai', 'nace', '--format', 'json', '--no-journal'], dir);
    const j = JSON.parse(r.stdout);
    assert.equal(j.advisory.status, 'not-configured');
    assert.equal(r.code, j.verdict === 'fail' ? 1 : 0);
  } finally {
    cleanup(dir);
  }
});
