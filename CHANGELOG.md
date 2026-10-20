# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [0.2.0] — 2026-10-20

Evidence Gate: checking that "done" is backed by facts.

### Added

- `lwc gate`. It checks agent claims against recorded runs on the current code and gives the
  verdict PASS / INSUFFICIENT EVIDENCE / FAIL.
  - Five checks: tests, claims, Critical/High findings, decisions, analyzer health.
  - text / md / json reports (schema `lwc-gate/1`) with separate *confirmed*, *not confirmed yet*
    and *AI advisory (not evidence)* sections.
  - Reproducibility metadata: rule-set digest, config digest, git HEAD, working-tree digest,
    evidence ids, Node.js and platform.
  - `--fail-on fail|insufficient|never` for CI.
  - Reports are stored in `.lwc/reports/gate-*.json`.
- A working-tree fingerprint on every `lwc run` and `--run-tests` record (`worktree.digest`). A run
  made before the latest edit is reported as stale.
- Claim classification in English, Russian and Kazakh: tests, build, lint, completion, security,
  requirements. Security and requirement claims are reported as not verifiable automatically.
- Optional Nace Drex advisory (`--ai nace`, `ai.provider: "nace"`).
  - One documented endpoint, `POST /v1/systemone`, called with plain `fetch`; no new dependency.
  - The key comes only from `NACE_API_KEY` and is checked against the documented format before
    anything is sent.
  - The payload is minimal and redacted: secrets, e-mails, IIN/BIN-like numbers, phones.
  - `--ai-preview` prints the payload without sending it.
  - One retry on 429/500/529, a single deadline, strict response validation.
  - The verdict is computed before the provider runs and cannot be changed by it.
- `lwc gate` refuses to run when a config file contains a secret-looking key such as `apiKey`.
- Documentation: [docs/EVIDENCE_GATE.md](docs/EVIDENCE_GATE.md), [docs/NACE.md](docs/NACE.md).
- 26 new tests (75 in total). The Nace tests use mocked responses and never touch the network.
  `NACE_API_KEY` is removed from child processes in tests.
- CI publishes the Evidence Gate report of the repository to the job summary.

### Changed

- Version 0.2.0. Evidence records gain an optional `worktree` field; older records stay valid, and
  their freshness is reported as unknown.

## [0.1.0] — 2026-10-20

First public prototype.

### Added

- `lwc` CLI: `init`, `status`, `resume`, `map`, `task`, `decision`, `claim`, `run`, `radar`,
  `suppress`, `explain`, `ops-check`.
- Anomaly Radar: 29 rules in five categories (requirements, architecture, implementation, security,
  AI-development process) with a status and a source on every finding; suppressions with reasons;
  `lwc-ignore` / `lwc-ignore-file` markers; text / md / json reports; `--fail-on` for CI.
- Operational report checks `lwc ops-check` (8 rules, configurable thresholds, history).
- Claude Code plugin: skills `learn`, `design`, `build`, `review`, `explain`, `radar`, `resume`;
  hooks `SessionStart` (context) and `PreToolUse` (guard against code before the build stage).
- Message catalogs in English, Russian and Kazakh; translated READMEs.
- A demo project with deliberate defects and an operational report demo in KZT with expected results.
- Documentation: README, the "LWC - vibe" PDF, ARCHITECTURE, RULES, REPORT_FORMAT, PROCESS,
  KAZAKHSTAN, REFERENCE_ANALYSIS; SVG illustrations.
- 49 tests (node:test), CI on Ubuntu/Windows, Node 20/22.
