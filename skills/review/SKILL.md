---
name: review
description: Review mode — checking the changes that were made. Compares the diff with the agreed plan, runs Anomaly Radar and the tests, explains every finding and separates confirmed defects from suspicions.
disable-model-invocation: true
---

# LWC — vibe · Review mode

Read [../../docs/PROCESS.md](../../docs/PROCESS.md). Run `lwc task stage review`.

## Order

1. **What changed.** `git status` and `git diff --stat`. Compare the list with the task `scope` and
   the confirmed decisions (`lwc status`). Name everything extra.
2. **Radar.** `lwc radar --run-tests --format md --out .lwc/reports/review.md` (the `--run-tests`
   flag runs the project test command and records the result as evidence; without it tests are not run
   — say so). Add `--lang ru|kk` for a Russian or Kazakh report.
3. **Walking through findings.** For every Critical/High finding and every confirmed defect explain
   to the user: observation, consequence, how to verify, what you propose. Findings with status
   "probable issue" and "warning" need manual verification: check yourself (read the code) and say
   whether the suspicion holds.
4. **False positives.** If a finding really is false, suppress it with a reason:
   `lwc suppress <id> --reason "<why>" --by "<who>"`. Do not suppress whole rules without the user's
   consent. Suppressed findings stay in the report in a separate section.
5. **Regressions.** If `IMPL-005` shows failing tests, the fix goes through Build, not "as part of
   the review".
6. **Evidence Gate.** Run `lwc gate` and show the user the verdict with its three sections as they
   are. If the verdict is INSUFFICIENT EVIDENCE because a run is stale, rerun the check with
   `lwc run -- <command>` and record a new claim; never reword a claim to make it pass. If the
   report has an *AI advisory* section, present it as a recommendation, never as verification.
7. **Summary.** A table "Decision / Implemented? / Verified by?". Then the checkpoint
   `✦ Checkpoint: Verification — accept the changes?` through AskUserQuestion
   ("Accept", "Rework", "Revert"). On acceptance: `lwc task finish`.

Do not claim "everything is verified" if some check did not run. Do not hide critical findings.
