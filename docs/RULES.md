# Anomaly Radar rule reference

Every rule has a stable identifier, a category, a default severity, a **status** (how well the finding
is confirmed) and a **source** (where it came from). A rule can be disabled in `lwc.config.json` or
`.lwc/config.json`: `{ "rules": { "IMPL-004": false } }`.

Statuses: `confirmed` — confirmed defect; `probable` — probable issue; `warning` — advisory;
`evidence-gap` — missing evidence; `false-positive` — suppressed with a reason.
Sources: `rule` — deterministic rule (pattern/invariant), `static-analyzer` — structure analysis
(import graph, exports), `test` — a real command run, `dependency-analysis` — dependency manifests,
`ai-reasoning` — agent reasoning (the radar never creates such findings; the agent must label its own
conclusions with this source).

## A. Requirements (`requirements`)

Files from `requirementFiles` are analysed (by default `REQUIREMENTS.md`, `SPEC.md`,
`docs/REQUIREMENTS.md`, `.lwc/task.md`). Russian, Kazakh and English are supported. All rules are text
heuristics, so the status is never above `probable`.

| ID | What it looks for | Severity | Status | How it works |
| --- | --- | --- | --- | --- |
| REQ-000 | requirements file not found | info | evidence-gap | none of the `requirementFiles` exists |
| REQ-001 | contradiction | high | probable | two sentences with shared keywords (Jaccard ≥ 0.5) and opposite modality (must / must not, always / never, должен / не должен, тиіс / тиіс емес) |
| REQ-002 | error behaviour undefined | medium / low | probable / warning | an operation (save, send, pay, upload…) without words about error/failure/retry in neighbouring sentences; low/warning when errors are described somewhere in the document |
| REQ-003 | missing edge cases | medium | warning | a list/amount/date/file is mentioned but there are no words about empty, zero, negative, maximum, format |
| REQ-004 | unverifiable requirement | low | warning | unmeasurable words (fast, intuitive, reliable, быстро, удобно, жылдам…) in a sentence without numbers |
| REQ-005 | business rule missing from acceptance criteria | medium | probable | a sentence from a "Rules/Constraints" section shares < 34 % of its keywords with the "Acceptance criteria" section |

## B. Architecture (`architecture`)

An import graph is built for JS/TS (`import`, `require`, `export … from`, `import()`) and Python
(`import`, `from … import`). Only relative/internal imports are resolved.

| ID | What it looks for | Severity | Status | How it works |
| --- | --- | --- | --- | --- |
| ARCH-001 | cyclic dependency | medium (2 nodes) / high | confirmed | strongly connected components (Tarjan's algorithm) |
| ARCH-002 | declared boundary violated | high | confirmed | `boundaries: [{from, deny}]` in the configuration; glob matching of graph edges |
| ARCH-003 | excessive coupling | low | warning | a module's internal imports > `thresholds.maxFanOut` (12) |
| ARCH-004 | documentation diverges from structure | low | probable | back-quoted paths from `architectureDocs` whose first segment exists but which are missing from the project |
| ARCH-005 | interface changed without dependents | high | probable | an export was removed relative to `git HEAD` while files using that name are unchanged |

## C. Implementation (`implementation`)

| ID | What it looks for | Severity | Status | How it works |
| --- | --- | --- | --- | --- |
| IMPL-001 | data handling error | medium / low | probable / warning | `JSON.parse`/`json.loads` outside `try` (not in test files); `parseInt` without a radix |
| IMPL-002 | missing exception handling | medium / low | probable / warning | empty `catch {}` (comments allowed); `.then()` without `.catch` and without `await/return`; bare `except:`; `except … : pass` |
| IMPL-003 | suspicious condition | high / low | probable / warning | `i <= x.length` in a loop; assignment in `if (a = b)`; loose `==`/`!=` (except against `null`); `range(1, len(x))` |
| IMPL-004 | no tests for module | medium / low | evidence-gap | the module name appears in no test file (`tests/`, `*.test.*`, `test_*.py`) |
| IMPL-005 | regression | critical | confirmed | a **real run** of `testCommand` (only with `--run-tests`) exited non-zero; recorded in `evidence/` |
| IMPL-006 | unused export | low | warning / probable | an exported name appears in no other file |
| IMPL-007 | duplication | low | probable | a window of `duplicateMinLines` (8) normalised lines repeats in another file or further down the same file |

Pattern rules (IMPL-001…003, SEC-*) skip comments, strings/regex literals, lines with the
`lwc-ignore` marker and files with `lwc-ignore-file` in the first five lines.

## D. Security (`security`)

| ID | What it looks for | Severity | Status | How it works |
| --- | --- | --- | --- | --- |
| SEC-001 | secrets in code | critical / high | probable | AWS, GitHub, Slack, Stripe, Google formats, private keys, JWT, database URLs with passwords, `password/secret/token = '…'`; placeholders (`example`, `changeme`, `process.env`, `<…>`) are skipped; comments are checked too |
| SEC-002 | unsafe input | critical / high | probable | `eval`, `new Function`, `innerHTML =` with a non-static string, `exec` with string concatenation/template, SQL strings with `+`/`${}`/f-string, `shell=True`, `os.system`, `pickle.loads`, `yaml.load` without SafeLoader |
| SEC-003 | authentication/authorisation | critical / high / medium | confirmed / probable | `rejectUnauthorized: false`, `verify=False`, JWT `none`, signature not verified, role from `req.body`; an Express-style route without auth middleware when such middleware exists in the project |
| SEC-004 | dangerous file operations | critical / high | probable / warning | a path from `req.query/params/body` in `fs.*`/`open`/`path.join`; recursive delete on a variable; `rm -rf` |
| SEC-005 | suspicious dependencies | high / medium / low | probable / warning | `git+`/`http` sources, `*`/`latest` versions, known deprecated packages, `postinstall` with `curl|sh`, unpinned `requirements.txt` |
| SEC-006 | excessive permissions | critical / high / medium | confirmed / warning | `chmod 777`, CORS `*` + credentials, `permissions: write-all`, IAM `"*"/"*"`, `USER root`, `pull_request_target` + PR checkout |

## E. AI-development process (`process`)

Works only with an active task in `.lwc/session.json`. Changed files come from `git status` minus
`baselineChanged` (the snapshot taken when the task started / entered build).

| ID | What it looks for | Severity | Status | How it works |
| --- | --- | --- | --- | --- |
| PROC-001 | code written before agreement | high | confirmed | stage `learn`/`design` while source files are changed |
| PROC-002 | "verified" without a run | high | confirmed | a claim containing "tests pass / verified / тесты пройдены / проверено" without an `evidence` record of kind test/lint/build before it |
| PROC-003 | file outside the scope | medium | confirmed | a changed file matches none of the `scope` globs |
| PROC-004 | changes without tests | medium | evidence-gap | at the build/review stage source files changed but no test file did |
| PROC-005 | success after failure | critical | confirmed | the last run before the claim exited non-zero |

## Operational data (`ops`)

Command `lwc ops-check <csv|json> --rules <json> [--history <csv|json>]`. Rules are JSON, see
`examples/ops-report/rules.json`. Every finding explains which rule fired and why.

| ID | Rule in JSON | Severity | Status |
| --- | --- | --- | --- |
| OPS-001 | `required: [fields]` — empty value | high | confirmed |
| OPS-002 | `nonNegative: [fields]` — negative value | high | confirmed |
| OPS-003 | `totals: [{total, parts, tolerance}]` — total ≠ sum | high | confirmed |
| OPS-004 | `uniqueKey: [fields]` — duplicate | high | confirmed |
| OPS-005 | `timeSequence: [{before, after}]` — after earlier than before | high | confirmed |
| OPS-006 | `spikes: [{field, periodField, window, maxRatio, aggregate}]` — the aggregate differs from the historical median by more than `maxRatio` | medium | **probable** |
| OPS-007 | `ranges: [{field, min, max}]` — out of range | medium | confirmed |
| OPS-008 | `numericFields`/`dateFields` — value cannot be parsed | medium | confirmed |

Numbers accept space separators, a decimal comma and the suffixes `₸`, `KZT`, `тг`; dates accept
ISO 8601 and `DD.MM.YYYY [HH:mm]`.

## Extending

A custom analyzer is an object `{ id, category, run(ctx) }` returning `Finding[]`; plug it in with
`runRadar({ extraAnalyzers: [myAnalyzer] })`. Texts for new rules go into the catalogs
`src/i18n/{ru,kk,en}.ts` (the `i18n.test.mjs` test verifies that all three languages have the same
keys and placeholders).
