---
name: radar
description: Anomaly Radar — finding and discussing anomalies in requirements, architecture, implementation, security and the AI-development process. Runs lwc radar, explains the findings, distinguishes confirmed defects from suspicions, records suppressions with reasons.
---

# LWC — vibe · Anomaly Radar

Read [../../docs/PROCESS.md](../../docs/PROCESS.md). Rule reference: [../../docs/RULES.md](../../docs/RULES.md).

## Running

- Whole project: `lwc radar` (text) or `lwc radar --format md --out .lwc/reports/radar.md`.
- Part of the project: `lwc radar src/orders` or `--category a,b,c,d,e` (requirements,
  architecture, implementation, security, process).
- With a real test run: `--run-tests` (executes `testCommand` and records evidence). Only with the
  user's consent: it runs a command from the project configuration.
- Report language: `--lang ru|kk|en`. Operational data: `lwc ops-check <csv> --rules <json>`.

## Walking through the report

1. Summary first: how many findings per severity, whether there are suppressed Critical/High (the radar
   always lists them separately — do not skip them).
2. For every finding speak in the report's terms: **observation** (fact), **explanation**,
   **consequence**, **how to verify**, **fix**. Always name the **status** and the **source**:
   - `confirmed` — a reproducible fact (an import cycle, a failed test, a violated invariant);
   - `probable` / `warning` — a heuristic, manual verification needed: open the code and check;
   - `evidence-gap` — not a bug but a gap (no tests, no recorded run);
   - source `rule` / `static-analyzer` / `test` / `dependency-analysis`.
   Label your own conclusions as `ai-reasoning` — they are not analyzer results.
3. Propose fixes, but do not apply them outside Build mode and the agreed scope.
4. Suppress false positives only with a meaningful reason:
   `lwc suppress <id> --reason "..." --by "<name>"`. Suppressing a whole rule requires `--file` or
   explicit consent (`--yes`). Never hide critical findings silently.
5. Rule adaptation: `lwc.config.json` (in Git, shared by the team) and `.lwc/config.json` (personal):
   `rules`, `boundaries`, `thresholds`, `requirementFiles`, `architectureDocs`. New analyzers plug in
   through the API `runRadar({ extraAnalyzers })` — see docs/ARCHITECTURE.md.

The radar does not replace a full static analyzer, SAST or legal review. The absence of findings is
not proof of the absence of bugs.
