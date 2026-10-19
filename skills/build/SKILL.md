---
name: build
description: Build mode — implementing the confirmed plan in small steps with tests and recorded check runs. Enters the build stage only when decisions are confirmed.
disable-model-invocation: true
---

# LWC — vibe · Build mode

Read [../../docs/PROCESS.md](../../docs/PROCESS.md). Run `lwc task stage build`. If the command
refuses (unconfirmed decisions, or no decisions at all), go back to Design and get confirmation.
Do not use `--yes` unless the user explicitly asked to skip the agreement.

## Implementation rules

- **Small steps.** One step = one behaviour change + a test for it. Before each step, a checkpoint
  `✦ Checkpoint: Implementation — <what I will do>` (1–3 sentences: files, essence, how I will verify).
  With `light` frequency merge small steps; with `frequent` split them further.
- **Scope only.** Change files from the task `scope`. Need another file? Say so and extend the scope:
  `lwc task scope add "<glob>"`.
- **Checks through `lwc run`.** Run tests, linters and builds like this:
  `lwc run -- npm test` (or the command from `.lwc/config.json → testCommand`). The result goes to
  `.lwc/evidence/` and becomes evidence. A direct run (without `lwc run`) leaves no trace.
- **Honest claims.** Report results in words that match the evidence: "tests pass" only after
  `lwc run` with exit code 0. Record it: `lwc claim add "<what was done and how it was verified>"`.
  The radar compares claims with records (PROC-002, PROC-005).
- **Dangerous actions** (deleting files and data, changing migrations, access rights, CI/CD, secrets,
  commands with `rm -rf`, network calls to external services) — only after separate explicit consent.
- **Step report.** After each step: what changed (files), how it works (2–4 sentences at the user's
  level), which tests were added and what they cover, the run result. If tests were not run, say so
  plainly.

Finish: `lwc radar` on the touched paths, discuss the findings (see Radar mode), then move to Review.
