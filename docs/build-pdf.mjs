// Builds docs/LWC - vibe.pdf: HTML with inline SVGs and real CLI output → headless Chromium → PDF.
// Run: node docs/build-pdf.mjs  (needs Chrome or Edge; override the path with BROWSER_PATH)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'pdf-build');
const PDF = path.join(ROOT, 'docs', 'LWC - vibe.pdf');
const DATE = '20 October 2026';
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; // lwc-ignore: build script, package.json is trusted

function svg(name) {
  return fs.readFileSync(path.join(ROOT, 'assets', name), 'utf8').replace(/^<\?xml[^>]*>\s*/, '');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function run(args, cwd = ROOT) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'lwc.js'), ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  return (r.stdout ?? '') + (r.stderr ?? '');
}

// Real product output (not a mock-up). The repository path is replaced with <repo>.
const radarDemo = run(['radar', 'examples/demo-buggy-app', '--no-journal']).split(ROOT).join('<repo>');
const radarLines = radarDemo.split('\n');
const radarHead = radarLines.slice(0, 7).join('\n');
const pick = (id) => {
  const i = radarLines.findIndex((l) => l.includes(id));
  return i === -1 ? '' : radarLines.slice(i, i + 6).join('\n');
};
const radarExcerpt = [
  radarHead,
  pick('REQ-001-'),
  pick('ARCH-002-'),
  pick('SEC-002-1e2575ac'),
  pick('PROC-005-'),
]
  .filter(Boolean)
  .join('\n\n');
const opsArgs = [
  'ops-check',
  'examples/ops-report/daily_report.csv',
  '--rules',
  'examples/ops-report/rules.json',
  '--history',
  'examples/ops-report/history.csv',
];
const opsDemo = run(opsArgs);
const opsRu = run([...opsArgs, '--lang', 'ru']).split('\n').slice(0, 14).join('\n');
const opsKk = run([...opsArgs, '--lang', 'kk']).split('\n').slice(0, 14).join('\n');
const help = run(['--help']);
const gateDemo = run(['gate', 'examples/demo-buggy-app', '--no-journal'])
  .split(ROOT)
  .join('<repo>')
  .split('\n')
  .filter((l) => !/^(Generated|Reproducibility):/.test(l))
  .slice(0, 21)
  .join('\n');
const gatePreview = run(['gate', 'examples/demo-buggy-app', '--ai-preview'])
  .split('\n')
  .slice(0, 34)
  .join('\n');

const css = `
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Segoe UI", "Inter", "Roboto", "Arial", "Noto Sans", sans-serif; color: #0F172A; font-size: 10.5pt; line-height: 1.45; margin: 0; }
h1 { font-size: 22pt; margin: 0 0 6pt; color: #0B1220; letter-spacing: -0.3px; }
h2 { font-size: 15pt; margin: 18pt 0 6pt; color: #0F766E; border-bottom: 1.5px solid #CCFBF1; padding-bottom: 3pt; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt; page-break-after: avoid; }
p { margin: 0 0 7pt; }
ul, ol { margin: 0 0 8pt 18pt; padding: 0; }
li { margin-bottom: 3pt; }
code, pre { font-family: Consolas, "Cascadia Mono", "Courier New", monospace; }
code { background: #F1F5F9; padding: 0 3px; border-radius: 3px; font-size: 9.5pt; }
pre { background: #0F172A; color: #E2E8F0; padding: 9pt 11pt; border-radius: 8px; font-size: 8.4pt; line-height: 1.38; white-space: pre-wrap; word-break: break-word; orphans: 4; widows: 4; }
pre.light { background: #F8FAFC; color: #0F172A; border: 1px solid #E2E8F0; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9.2pt; page-break-inside: auto; }
th, td { border: 1px solid #CBD5E1; padding: 4pt 6pt; vertical-align: top; text-align: left; }
th { background: #F1F5F9; }
tr { page-break-inside: avoid; }
figure { margin: 8pt 0 12pt; page-break-inside: avoid; }
figure svg { width: 100%; height: auto; border-radius: 8px; }
figcaption { font-size: 8.8pt; color: #475569; margin-top: 3pt; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
.cover .hero svg { width: 100%; height: auto; border-radius: 12px; }
.cover .meta { color: #475569; font-size: 10pt; }
.cover .big { font-size: 34pt; font-weight: 700; margin: 24pt 0 4pt; color: #0B1220; }
.cover .slogan { font-size: 16pt; color: #0F766E; margin-bottom: 14pt; }
.note { background: #FFFBEB; border: 1px solid #F59E0B; border-radius: 6px; padding: 6pt 9pt; margin: 8pt 0; font-size: 9.5pt; }
.sev { display: inline-block; padding: 1px 7px; border-radius: 4px; color: #fff; font-weight: 600; font-size: 8.8pt; }
.toc li { margin-bottom: 2pt; }
.pb { page-break-before: always; }
.small { font-size: 9pt; color: #475569; }
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>LWC — vibe</title><style>${css}</style></head>
<body>

<section class="cover">
  <div>
    <div class="hero">${svg('lwc-vibe-hero.svg')}</div>
    <div class="big">LWC — vibe</div>
    <div class="slogan">AI writes. You decide. LWC verifies.</div>
    <p>Local Workflow Coach — a local AI-development coach with Anomaly Radar: an open-source tool for developers and teams who use AI to write software and want to keep their understanding of the system and control over the result.</p>
    <p class="meta">Technical documentation · version ${VERSION} · ${DATE}<br>Repository: github.com/RuslanKazyradzi13/lwc-vibe · Licence: MIT · Author: Ruslan Kazyradzi</p>
  </div>
  <div class="meta">
    <p><b>Contents</b></p>
    <ol class="toc">
      <li>Purpose</li><li>Differences from the reference (VibeWise)</li><li>Architecture</li><li>Workflow</li>
      <li>Anomaly Radar</li><li>Anomaly examples</li><li>Severity scale</li><li>Report example with explanations</li>
      <li>Evidence Gate and the optional Nace advisory</li><li>Operational report check (Kazakhstan)</li><li>Installation</li><li>Run example</li><li>Security and limitations</li><li>Licensing</li><li>Roadmap</li>
    </ol>
    <p class="small">Reports are available in English, Russian and Kazakh. Қазақ тілі толық қолдау табады (ә, ғ, қ, ң, ө, ұ, ү, һ, і). Русский и казахский — полные каталоги сообщений.</p>
  </div>
</section>

<h2>1. Purpose</h2>
<p>An AI agent can write an application in an evening that its author cannot explain, let alone verify. LWC — vibe helps you use AI to write software without losing understanding of the system and control over the result. The agent clarifies requirements first, shows a plan, discusses risks, gets explicit confirmation for significant decisions, implements small changes and verifies the result. Anomaly Radar checks the agent's words against facts: the import graph, the Git state, records of real command runs.</p>
<p>The product has two parts: a <b>dependency-free CLI</b> (Node.js ≥ 20, works in a terminal and in CI) and a <b>Claude Code plugin</b> with seven modes (Learn, Design, Build, Review, Explain, Anomaly Radar, Resume) and two hooks — context restoration at session start and a guard against writing code before the plan is confirmed.</p>
<p>Three explanation levels — beginner, intermediate, advanced — change the depth of explanations and the step size, but not the degree of control: important architectural decisions and potentially dangerous changes are always confirmed by the user.</p>

<h2>2. Differences from the reference (VibeWise)</h2>
<p>The project is inspired by the VibeWise approach (Noah Kim, MIT, 2026) — "learn while AI writes the code" — but it is an independent implementation: the reference's code, texts, illustrations and structure were not used.</p>
<table>
<tr><th></th><th>VibeWise</th><th>LWC — vibe</th></tr>
<tr><td>Control over code before agreement</td><td>an instruction in a Markdown skill</td><td>a task stage in .lwc/session.json, the CLI gate <code>lwc task stage build</code>, a PreToolUse hook (ask/deny), rule PROC-001</td></tr>
<tr><td>"Tests pass"</td><td>the agent's words</td><td><code>lwc run</code> records the real run; claims are checked against evidence (PROC-002, PROC-005)</td></tr>
<tr><td>Checking requirements, architecture, code, security</td><td>none</td><td>Anomaly Radar: 5 categories, 29 rules, a status and a source on every finding</td></tr>
<tr><td>Operational data</td><td>none</td><td><code>lwc ops-check</code> with configurable rules, an example in KZT</td></tr>
<tr><td>Languages</td><td>English</td><td>English, Russian, Kazakh</td></tr>
<tr><td>Works without an agent</td><td>no</td><td>yes: a CLI for the terminal and CI</td></tr>
</table>

<h2 class="pb">3. Architecture</h2>
<figure>${svg('architecture.svg')}<figcaption>Figure 1. A local CLI (bin/lwc.js → dist/) and a Claude Code plugin on top of it; state is JSON and Markdown in the .lwc/ directory.</figcaption></figure>
<p>The core (<code>src/core</code>) handles file scanning, the JS/TS/Python import graph, Git access, configuration layers (<code>DEFAULT ← lwc.config.json ← .lwc/config.json</code>) and report rendering. Analyzers (<code>src/analyzers</code>) are pure functions from a context to a list of findings; one analyzer's error becomes a <code>RADAR-ERR</code> finding and the others keep running. Project commands are executed only on explicit request (<code>lwc run</code>, <code>--run-tests</code>).</p>

<h2 class="pb">4. Workflow</h2>
<figure>${svg('workflow.svg')}<figcaption>Figure 2. The stages Learn → Design → Build → Review, checkpoints and evidence.</figcaption></figure>
<table>
<tr><th>Mode</th><th>Code written?</th><th>What happens</th></tr>
<tr><td>Learn</td><td>no</td><td>clarifying requirements, inspecting the project, the map (<code>lwc map</code>)</td></tr>
<tr><td>Design</td><td>no</td><td>options, risks, scope, decisions → user confirmation (<code>lwc decision confirm</code>)</td></tr>
<tr><td>Build</td><td>yes, within the task scope</td><td>small steps, tests, runs through <code>lwc run</code>, claims through <code>lwc claim</code></td></tr>
<tr><td>Review</td><td>no</td><td>diff against the plan, <code>lwc radar --run-tests</code>, walking through findings, acceptance</td></tr>
<tr><td>Explain / Radar / Resume</td><td>no</td><td>explanations based on real module relations; anomaly search; context restoration</td></tr>
</table>

<h2 class="pb">5. Anomaly Radar</h2>
<figure>${svg('anomaly-radar.svg')}<figcaption>Figure 3. The path of a finding: source → status → fields → severity → suppression with a reason.</figcaption></figure>
<p>Every finding carries a <b>source</b> (rule, static analysis, test run, dependency analysis, AI agent reasoning) and a <b>status</b> (confirmed defect, probable issue, warning, evidence gap, false positive). The radar never presents model reasoning as a static-analysis or test result. False positives are suppressed only with a reason and stay in the report; suppressed Critical/High findings are highlighted in the summary.</p>

<h2>6. Anomaly examples</h2>
<table>
<tr><th>Category</th><th>Rules</th><th>Examples</th></tr>
<tr><td>A. Requirements</td><td>REQ-000…005</td><td>two requirements contradict each other; error behaviour is undefined; edge cases are missing; a requirement cannot be verified ("fast and intuitive"); a business rule is missing from the acceptance criteria</td></tr>
<tr><td>B. Architecture</td><td>ARCH-001…005</td><td>cyclic dependencies; a declared module boundary is violated; excessive coupling; documentation diverges from the structure; an interface changed without updating dependents</td></tr>
<tr><td>C. Implementation</td><td>IMPL-001…007</td><td>JSON.parse without try; an empty catch; <code>i &lt;= arr.length</code>; assignment in if; missing tests; a regression in a real test run; an unused export; duplication</td></tr>
<tr><td>D. Security</td><td>SEC-001…006</td><td>secrets in code; SQL/shell injection, eval, XSS; a route without authorisation, disabled TLS; a path from user input; suspicious dependencies; excessive permissions</td></tr>
<tr><td>E. AI-development process</td><td>PROC-001…005</td><td>code before agreement; "verified" without a run; a file outside the scope; changes without tests; success claimed after a failed check</td></tr>
</table>

<h2>7. Severity scale</h2>
<table>
<tr><th>Level</th><th>Meaning</th><th>Example</th></tr>
<tr><td><span class="sev" style="background:#DC2626">Critical</span></td><td>exploitable vulnerability, data loss, a false "success" after a failure</td><td>an AWS key in code, SQL injection, PROC-005</td></tr>
<tr><td><span class="sev" style="background:#EA580C">High</span></td><td>the bug will almost certainly show, or an agreement is broken</td><td>a three-module cycle, <code>i &lt;= length</code>, code before agreement</td></tr>
<tr><td><span class="sev" style="background:#D97706">Medium</span></td><td>a probable bug or a gap that needs a decision</td><td>JSON.parse without try, total ≠ sum of parts</td></tr>
<tr><td><span class="sev" style="background:#0891B2">Low</span></td><td>quality and maintenance, weak heuristics</td><td>loose ==, an unused export</td></tr>
<tr><td><span class="sev" style="background:#64748B">Info</span></td><td>information needing no action</td><td>requirements file not found, analyzer error</td></tr>
</table>

<h2 class="pb">8. Report example with explanations</h2>
<p>Below is a fragment of the <b>real output</b> of <code>lwc radar examples/demo-buggy-app</code> on the demo project "coffee-shop checkout" with deliberately planted defects (synthetic data, fictional keys; the requirements file is in Russian to demonstrate Cyrillic analysis). The full list of expected findings is recorded in <code>examples/demo-buggy-app/EXPECTED_FINDINGS.md</code> and verified by a test.</p>
<pre>${esc(radarExcerpt)}</pre>
<p><b>How to read it:</b> the first line is the severity, identifier and title; <i>Where</i> — file and line; <i>Observation</i> — the fact (a quote); <i>Status</i> and <i>Source</i> — how well the finding is confirmed and where it came from; <i>Evidence</i> — a link to the run record; <i>Recommended fix</i> — what to do. The Markdown and JSON formats additionally include the plain-language explanation, the possible consequence and how to verify.</p>
<figure>${svg('anomaly-report.svg')}<figcaption>Figure 4. A styled fragment of the same report (in the text above the repository path is replaced with &lt;repo&gt;).</figcaption></figure>

<h2 class="pb">9. Evidence Gate and the optional Nace advisory</h2>
<p>An agent's "done, tests pass" is a claim, not a fact. <code>lwc gate</code> checks whether the recorded facts support it <b>for the code as it is now</b>. Every <code>lwc run</code> stores a fingerprint of the working tree, so a test run made before the latest edit is <i>stale</i> and proves nothing. Claims are matched to the evidence they need. Security and requirement claims are marked as not verifiable automatically. Five checks give the verdict <b>PASS</b>, <b>INSUFFICIENT EVIDENCE</b> or <b>FAIL</b>, with exit codes for CI.</p>
<table><tr><th>Check</th><th>fail</th><th>gap</th></tr>
<tr><td>GATE-TESTS</td><td>the latest test run failed</td><td>no run or a stale run while tests are required</td></tr>
<tr><td>GATE-CLAIMS</td><td>a claim is contradicted</td><td>a claim is unsupported, stale or unverifiable</td></tr>
<tr><td>GATE-FINDINGS</td><td>a confirmed Critical/High finding</td><td>a Critical/High finding that needs manual verification</td></tr>
<tr><td>GATE-DECISIONS</td><td>—</td><td>unconfirmed decisions at the build/review stage</td></tr>
<tr><td>GATE-ANALYZERS</td><td>—</td><td>an analyzer crashed</td></tr></table>
<p>Real output on the demo project (the claim "Implemented, tests pass" was recorded after a failing run):</p>
<pre>${esc(gateDemo.trim())}</pre>
<p><b>Nace Drex (optional).</b> With <code>--ai nace</code> and the <code>NACE_API_KEY</code> environment variable, LWC asks Nace's decision model to triage the findings and rate overall readiness. It uses one documented endpoint, <code>POST /v1/systemone</code>, over plain <code>fetch</code>. The answer is shown in a separate "AI advisory (not evidence)" section. It is computed after the verdict and cannot change it. Only redacted metadata is sent, never source code or command output. <code>--ai-preview</code> prints the payload without sending it:</p>
<pre class="light">${esc(gatePreview.trim())}</pre>
<div class="note">The Nace integration follows the official API reference and is covered by tests against mocked responses. As of ${DATE} no call to the real Nace API has been made, because no key was available. docs/NACE.md lists what still has to be checked with a real account.</div>

<h2 class="pb">10. Operational report check (Kazakhstan)</h2>
<p>Scenario "anomalies in a daily operational report": a synthetic report of a pickup-point network for one day, amounts in tenge. The rules are JSON and can be adapted per organisation; the historical spike is computed from a history file and a configurable threshold and has the status "probable issue", not an error. Real output:</p>
<pre class="light">${esc(opsDemo.trim())}</pre>
<p>The same report in Russian (<code>--lang ru</code>) and Kazakh (<code>--lang kk</code>):</p>
<pre class="light">${esc(opsRu.trim())}</pre>
<pre class="light">${esc(opsKk.trim())}</pre>

<h2 class="pb">11. Installation</h2>
<p><b>Requirements:</b> Node.js 20 or newer; Git — for category E rules and ARCH-005.</p>
<p><b>Claude Code plugin</b> (inside a Claude Code session, one command at a time):</p>
<pre class="light">/plugin marketplace add RuslanKazyradzi13/lwc-vibe
/plugin install lwc-vibe@lwc-vibe</pre>
<p><b>CLI:</b></p>
<pre class="light">npm install -g github:RuslanKazyradzi13/lwc-vibe
lwc --version      # ${VERSION}</pre>
<p>Or from a clone: <code>git clone … && cd lwc-vibe && npm install && npm link</code>. Updating: <code>git pull</code> in the clone, or <code>claude plugin marketplace update lwc-vibe</code> and <code>claude plugin update lwc-vibe@lwc-vibe</code>.</p>

<h2>12. Run example</h2>
<pre class="light">cd my-project
lwc init --lang en --level beginner
lwc task start "Staff discount 20 %" --scope "src/services/**,tests/**"
lwc decision add "The discount is a separate function in discount.js"
lwc task stage build          # refuses: decision D1 is not confirmed
lwc decision confirm D1       # only a human confirms
lwc task stage build
lwc run -- npm test           # the run is recorded in .lwc/evidence/
lwc claim add "Implemented, tests pass"
lwc radar --run-tests --format md --out .lwc/reports/review.md
lwc gate                      # is claim C1 backed by a run on the current code?
lwc task finish</pre>
<p>CLI help:</p>
<pre class="light">${esc(help.trim())}</pre>

<h2 class="pb">13. Security and limitations</h2>
<ul>
<li>Everything runs locally: no telemetry, accounts or paid backend. The only possible network call is the optional Nace advisory, made only when enabled and with <code>NACE_API_KEY</code> set. API keys are never read from config files. Project commands are executed only on explicit request.</li>
<li>An AI answer never counts as evidence. "Nace found no risk" is never reported as secure.</li>
<li>Hooks never block the session on error; the guard hook asks by default rather than blocking.</li>
<li><code>.lwc/</code> files contain fragments of code and command output — they are project working files.</li>
<li>Category A, C and D rules are regular-expression heuristics, not AST analysis: misses and false positives are possible; the finding status reflects this.</li>
<li>Code is analysed for JavaScript/TypeScript and Python; other languages — secrets and configuration only. The import graph does not know path aliases or monorepos.</li>
<li>Only the Claude Code integration is tested. Other agents are not claimed.</li>
<li>Claim classification is keyword-based (English, Russian, Kazakh). Run freshness needs git; without it, freshness is reported as unknown.</li>
</ul>
<div class="note">LWC — vibe does not claim compliance with the legislation of the Republic of Kazakhstan or any other country and does not check it. If a project processes personal or financial data, study the primary sources and record the date of the check. As of ${DATE} the authors have not performed a legal review.</div>

<h2>14. Licensing</h2>
<p>LWC — vibe code is distributed under the MIT licence (© 2026 Ruslan Kazyradzi). There are no runtime dependencies; development dependencies are TypeScript (Apache-2.0), Prettier (MIT) and @types/node (MIT). The VibeWise reference (MIT, Noah Kim) was studied as a product idea; its materials were not copied. The full list is in THIRD_PARTY_NOTICES.md.</p>

<h2>15. Roadmap</h2>
<ol>
<li>The Evidence Gate as a GitHub Action posting its Markdown report to pull requests; gate history per task and per agent.</li>
<li>Nace Perception for extracting acceptance criteria from requirement documents.</li>
<li>AST analyzers for JS/TS based on the TypeScript Compiler API — fewer false positives, more rules.</li>
<li>A PostToolUse hook that records test runs from Bash into <code>.lwc/evidence/</code> automatically.</li>
<li>Path aliases and monorepos in the import graph; SARIF export for GitHub Code Scanning.</li>
<li>Skills for other agents on top of the same CLI — only after real testing.</li>
<li>Editorial review of the Kazakh catalog by native speakers.</li>
</ol>
<p class="small">This document was built automatically by <code>docs/build-pdf.mjs</code> from the repository sources on ${DATE}. The output fragments are the result of actually running the commands while building the document.</p>
</body></html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
const htmlPath = path.join(OUT_DIR, 'lwc-vibe.html');
fs.writeFileSync(htmlPath, html, 'utf8');

const candidates = [
  process.env.BROWSER_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browser = candidates.find((c) => fs.existsSync(c));
if (!browser) {
  console.error('Chromium/Chrome/Edge not found. Set BROWSER_PATH. HTML saved to: ' + htmlPath);
  process.exit(1);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lwc-pdf-'));
const r = spawnSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${profile}`,
    '--no-pdf-header-footer',
    `--print-to-pdf=${PDF}`,
    'file:///' + htmlPath.replace(/\\/g, '/'),
  ],
  { encoding: 'utf8', windowsHide: true },
);
try {
  fs.rmSync(profile, { recursive: true, force: true }); // lwc-ignore: temporary browser profile from mkdtemp
} catch {
  /* not critical */
}
if (r.status !== 0 || !fs.existsSync(PDF)) {
  console.error('Could not build the PDF:', r.stderr);
  process.exit(1);
}
console.log(`PDF ready: ${PDF} (${fs.statSync(PDF).size} bytes)`);
