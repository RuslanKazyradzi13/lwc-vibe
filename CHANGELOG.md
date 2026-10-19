# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

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
