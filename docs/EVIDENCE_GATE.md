# Evidence Gate

An AI agent says "done, tests pass, it is secure". The Evidence Gate answers a narrower and
checkable question: **do the recorded facts support that claim for the code as it is now?**

```bash
lwc gate                       # text report, exit 1 when the verdict is FAIL
lwc gate --run-tests           # run the configured test command first and record it
lwc gate --format md --out gate.md --fail-on insufficient   # CI: fail on gaps too
lwc gate --ai nace             # add an optional Nace Drex advisory section
lwc gate --ai-preview          # print exactly what would be sent to Nace; send nothing
```

The gate works offline, without an account, and without any AI provider. Nace is an optional
extra described in [NACE.md](NACE.md).

## What goes in

| Input | Source | Deterministic |
| --- | --- | --- |
| Anomaly Radar findings | the same analyzers as `lwc radar` | yes |
| Recorded runs | `.lwc/evidence/*.json` from `lwc run -- <cmd>` or `--run-tests` | yes |
| Code state of each run | working-tree fingerprint stored with the run | yes |
| Changed files | `git status`, minus the task baseline, `.lwc/` and ignored paths | yes |
| Agent claims | `lwc claim add "…"` | the text is the agent's; the check is deterministic |
| Decisions | `lwc decision add/confirm` | yes |
| AI advisory | Nace Drex, only when enabled | **no** — kept in a separate section |

## Run freshness

Every `lwc run` now stores a fingerprint of the code it ran on: a sha256 over the git `HEAD`
commit and the content of every changed project file. `.lwc/` and the `ignore` globs are left out,
so build output in `dist/` does not count. The gate compares that fingerprint with the current one.

- **fresh** — the run happened on exactly this code.
- **stale** — the code changed after the run, so the run proves nothing about the current code.
- **unknown** — no git, or a record made by LWC 0.1.0. It is never shown as fresh.

## Claims

Each claim is split into the kinds of verification it asserts. English, Russian and Kazakh
wording is recognised. The weakest kind decides the claim's status.

| Kind | Example wording | What backs it |
| --- | --- | --- |
| tests | "tests pass", «тесты пройдены», «тесттер өтті» | the latest `test` run before the claim, exit 0, still the latest, fresh |
| build | "build is green" | a `build` run |
| lint | "typecheck passes" | a `lint` run |
| completion | "done", "implemented", «готово» | the latest `test` run |
| security | "it is secure", «безопасность проверена» | **cannot be proven by an exit code** |
| requirements | "all requirements met" | **cannot be proven by recorded runs** |

The claim statuses are:

| Status | Meaning |
| --- | --- |
| `supported` | a passing run of the right kind backs it, and nothing later contradicts it |
| `stale` | the run passed, but on a different code state |
| `contradicted` | the backing run failed, a later run failed, or a confirmed Critical/High security finding exists |
| `unsupported` | no run of the right kind was recorded before the claim |
| `unverifiable` | security and requirement claims; a human must decide |
| `informational` | the claim asserts no verification, so it is reported but not judged |

A run recorded *after* a claim does not back it retroactively. The agent should record a new claim
after the new run.

## Checks and verdict

| Check | fail | gap | pass |
| --- | --- | --- | --- |
| `GATE-TESTS` | the latest test run failed | no run, or a stale run, when tests are required | the latest run passed on the current code, or freshness is unknown |
| `GATE-CLAIMS` | a claim is contradicted | a claim is unsupported, stale or unverifiable | every verification claim is supported |
| `GATE-FINDINGS` | a confirmed Critical/High finding exists | a Critical/High finding with status probable, warning or evidence-gap | none |
| `GATE-DECISIONS` | — | a decision is unconfirmed at build/review/done | all decisions are confirmed |
| `GATE-ANALYZERS` | — | an analyzer crashed (`RADAR-ERR`) | all analyzers completed |

Tests are required (`gate.requireTests: "auto"`) when source files changed or a claim asserts tests
or completion. Set it to `"always"` or `"never"` in `lwc.config.json`. A skipped check never counts
as a pass.

The verdict is **FAIL** when any check fails. It is **INSUFFICIENT EVIDENCE** when any check has a
gap. Otherwise it is **PASS**, meaning no blocking problem was found by the enabled deterministic
checks. A PASS is not proof of correctness or security, and every report says so.

## Exit codes

| `--fail-on` | exit 1 when the verdict is |
| --- | --- |
| `fail` (default) | FAIL |
| `insufficient` | FAIL or INSUFFICIENT EVIDENCE |
| `never` | never; the report is informational |

Exit code 2 means invalid arguments, or a config file containing a secret-looking key such as
`ai.nace.apiKey`. The gate refuses to run in that case and names the key, not its value.

## Report

The text and Markdown reports have the same structure. Three sections are kept visibly apart:

1. **Blocking problems**: failed checks, contradicted claims and confirmed Critical/High findings.
2. **Not confirmed yet**: gaps and claims without current evidence.
3. **Confirmed by deterministic checks**: passed checks and supported claims.

Then come the facts (changes, radar summary, recorded runs) and the **AI advisory (not evidence)**
section. The report ends with a reproducibility line.

The JSON report uses the `lwc-gate/1` schema (`src/gate/types.ts`):

```jsonc
{
  "tool": "lwc-vibe", "kind": "evidence-gate", "schema": "lwc-gate/1", "version": "0.2.0",
  "verdict": "fail | insufficient-evidence | pass",
  "checks": [{ "id": "GATE-TESTS", "status": "fail", "reason": "gate.tests.failed", "vars": {}, "refs": ["run-…"] }],
  "claims": [{ "id": "C1", "text": "…", "kinds": ["tests"], "status": "contradicted", "evidence": "run-…" }],
  "evidence": [{ "id": "run-…", "command": "npm test", "kind": "test", "exitCode": 1, "freshness": "stale" }],
  "changes": { "git": true, "files": ["src/a.js"], "sources": 1, "tests": 0 },
  "radar": { "summary": {}, "findings": [], "suppressed": [] },
  "advisory": { "provider": "nace-drex", "status": "ok | disabled | not-configured | preview | error | invalid-response", "items": [], "meta": {}, "sentPayload": {} },
  "reproducibility": { "lwcVersion": "0.2.0", "rulesetDigest": "0.2.0:6b427bfe", "configDigest": "…", "checks": [], "gitHead": "…", "worktreeDigest": "…", "evidenceIds": [], "node": "v22…", "platform": "linux-x64" }
}
```

When `.lwc/` exists, every run of the gate also writes `.lwc/reports/gate-<time>.json` and a
journal entry. `--no-journal` turns that off.

### Reproducibility

The same inputs give the same verdict. The report records what it rested on:

- the LWC version;
- a digest of the enabled rule set;
- a digest of the effective config;
- the list of checks;
- git `HEAD`;
- the working-tree fingerprint;
- the evidence record ids;
- the Node.js version and platform.

For the AI section it also records the endpoint, the pinned model version Nace reports, the HTTP
status, the duration and the sha256 of the exact request body.

## Example

This is a real run on a small project. The tests pass, the agent claims success, then edits the
code again.

```bash
lwc task start "VAT 12% helper" && lwc task stage build --yes
# … the agent edits src/vat.js …
lwc run -- npm test
lwc claim add "Implemented, tests pass"
lwc gate
```

```text
Verdict: PASS — no blocking problem found by the enabled deterministic checks
── Confirmed by deterministic checks (6) ───────────────────────────
  ✔ GATE-TESTS · Test run on the current code — The last test run `npm test` passed on the current code
  ✔ GATE-CLAIMS · Agent claims backed by evidence — All 1 verification claim(s) are backed by passing runs
  C1 "Implemented, tests pass" [tests, completion] → supported: `npm test` passed on the current code
```

After one more edit to `src/vat.js`, without rerunning the tests:

```text
Verdict: INSUFFICIENT EVIDENCE — some claims or changes are not backed by checks yet
── Not confirmed yet (3) ───────────────────────────────────────────
  ? GATE-TESTS · Test run on the current code — The last test run `npm test` passed on a different code state; rerun it on the current code
  ? GATE-CLAIMS · Agent claims backed by evidence — 1 of 1 claim(s) are not backed by current evidence [C1]
```

On the demo project (`lwc gate examples/demo-buggy-app`) the verdict is **FAIL**. The claim
"Implemented, tests pass" is contradicted by the recorded failing run, and PROC-005 is among the
confirmed Critical findings.

## Using it in CI

```yaml
- run: node bin/lwc.js gate --no-journal --format md --out gate.md --fail-on fail
- run: cat gate.md >> "$GITHUB_STEP_SUMMARY"
  if: always()
```

The LWC repository runs exactly this on itself in [ci.yml](../.github/workflows/ci.yml).

## Designed to grow

These are planned, not implemented:

- **Pull request reports.** `--format md` is already PR-comment sized. A GitHub Action can post it.
- **Team policies.** `gate.requireTests` is the first policy knob. Thresholds per check can follow
  in `lwc.config.json`.
- **History and agent comparison.** `.lwc/reports/gate-*.json` is append-only and versioned
  (`lwc-gate/1`), so a later `lwc history` command can aggregate it per task and per agent.
- **Manager summaries.** The verdict plus the three sections, without findings detail.
- **Other advisory providers.** They implement `AdvisoryProvider` in `src/providers/types.ts`. The
  gate guarantees that their output stays advisory.
