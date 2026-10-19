# Requirements for LWC — vibe 0.1

This document holds the requirements for the product itself. It also serves as the input for the
category A rules during the repository self-check (`node bin/lwc.js radar`), so the wording tries to
be measurable.

## Requirements

1. The CLI must work on Node.js 20 and 22 on Windows and Linux without runtime dependencies.
2. The command `lwc task stage build` must refuse with exit code 1 when at least one decision is unconfirmed.
3. The command `lwc run -- <command>` must store a run record in `.lwc/evidence/` with the exit code and an output hash; if the record cannot be stored, the command must report the error on stderr and return exit code 1.
4. The `lwc radar` report must contain 12 fields for every finding: id, rule, category, severity, status, source, title, observation, explanation, consequence, howToVerify, fix.
5. Every rule must have texts in three languages (ru, kk, en) with identical placeholders; this is checked by a test.
6. A suppressed finding must stay in the report in the suppressed section with its reason; the report must count suppressed Critical and High findings separately.
7. Claude Code hooks must exit with code 0 and empty output on any input error so that the session is never blocked.
8. One analyzer's error must not interrupt the others: it becomes an info-level `RADAR-ERR` finding.
9. The radar must not execute project commands without the `--run-tests` flag or the `lwc run` command.
10. The radar must handle an empty project, an empty CSV and corrupted JSON correctly: no exceptions, a clear message and exit code 1 for input errors.

## Rules

- AI agent reasoning is never presented as a static-analysis or test result: analyzers never assign the `ai-reasoning` source.
- The product does not claim compliance with the legislation of any country.

## Acceptance criteria

- `npm test` passes on Node 20 and 22, Windows and Ubuntu (CI).
- The `i18n.test.mjs` test confirms identical keys and placeholders in the three catalogs.
- The `radar-demo.test.mjs` test confirms the finding fields and the suppressed section with reasons.
- The `hooks.test.mjs` test confirms exit code 0 and empty output on garbage input.
- The `analyzers.test.mjs` test confirms the `RADAR-ERR` finding on an analyzer error; no analyzer assigns the `ai-reasoning` source.
- The `cli.test.mjs` test confirms the `stage build` refusal without confirmation, the evidence record and exit code 1 for corrupted JSON; the product documentation contains no statements about compliance with the legislation of any country.
