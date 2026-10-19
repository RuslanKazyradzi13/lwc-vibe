# Reference analysis: VibeWise (nykooi1/vibe-wise)

Studied on 19 October 2026. Source: the public repository
<https://github.com/nykooi1/vibe-wise>, plugin version 0.1.44, MIT licence (© 2026 Noah Kim).
Reviewed: README, LICENSE, directory tree, `plugin.json`, `hooks.json`, `hooks/session_start.py`,
the `learn` and `reset` skills with their companion files, tests, and the demo `docs/demos/notion-dupe.md`.

## How VibeWise works

1. **Main scenario.** A plugin for Claude Code and Codex. The user runs `/vibe-wise:learn`, goes
   through onboarding (new/existing project, experience, goals, preferences), then describes a task.
   The agent coaches "learning before speed": asks the user to propose an approach, discusses it,
   writes the agreed code and explains the changes.
2. **Stages.** Three checkpoint types: *Build checkpoint* (the user reasons about the approach),
   *Design checkpoint* (a design summary, "Confirm and continue" — no code), *Implementation
   checkpoint* ("Implement this step" — permission for specific changes). Not all three are mandatory.
3. **Confirmation.** Through AskUserQuestion with the options "Confirm and continue / Implement this
   step" and "Discuss". Only the user's explicit choice counts; a session restart is not a confirmation.
4. **Explaining changes.** An *Implementation report*: what changed, how the key code works, why it
   fits the decision, which tests were added and what actually ran.
5. **Storage.** The `.vibe-wise/` directory in the project root: `profile.md` (preferences, level,
   understanding), `progress.md` (learning events, pending decisions), `project-map.md` (project map).
   A `SessionStart` hook (Python) asks Claude to read these files on start/compaction.
6. **Limitations and risks.** All behaviour is Markdown instructions: nothing is *verified*
   programmatically. No code, test, dependency or security analysis; no mechanism notices that the agent
   wrote code before confirmation or claimed "tests pass" without running them. English-only
   interface. Notes are schema-less Markdown whose integrity depends on the model. Codex has no hook —
   the skill must be re-run manually.
7. **What we take as an idea and what we build ourselves.** We take the general product idea: learn on
   a real task, checkpoints before code, explanation after code, local context without a server.
   Everything else — architecture, CLI, analyzers, state format, hooks, texts, diagrams and
   documentation — is built independently. VibeWise code, texts, illustrations and structure are not copied.

## Comparison

| Reference capability | Benefit for the user | Gap / unmet need | Our solution | How it is verified |
| --- | --- | --- | --- | --- |
| Build/Design/Implementation checkpoints in a Markdown skill | the agent does not write code without consent | not enforced: the model may "forget"; no trace of decisions | task stages in `.lwc/session.json`, the CLI gate `lwc task stage build` (refuses while decisions are unconfirmed), the PreToolUse hook `guard.mjs` (ask/deny), rule PROC-001 | `tests/cli.test.mjs` (build gate), `tests/hooks.test.mjs`, `tests/process.test.mjs` |
| Implementation report stating what ran | honesty about checks | words only; a real run cannot be told from a claim | `lwc run -- <cmd>` records evidence (exit code, output hash); `lwc claim add`; rules PROC-002/PROC-005; IMPL-005 runs the tests itself | `tests/process.test.mjs`, the scenario in `tests/cli.test.mjs` |
| Onboarding with Beginner/Intermediate/Advanced levels | tailored explanations | the level affects style only; no link to step size or checks | levels in `config.json` + `skills/learn/levels.md` (depth, questions, step size); `--level` in `lwc init` | `tests/cli.test.mjs` (level is stored) |
| Local notes `.vibe-wise/` (profile/progress/map) | context across sessions | free-form Markdown, no machine-checkable format | `.lwc/`: JSON for state and evidence + Markdown for the journal and map; `lwc resume`, `lwc status --json` | `tests/cli.test.mjs` (resume/status), `docs/ARCHITECTURE.md` |
| SessionStart hook (Python) | restoration after compaction | needs Python 3; says nothing specific about unconfirmed decisions | a Node.js hook (same runtime as Claude Code) reports the stage, unconfirmed decisions and the last run | `tests/hooks.test.mjs` |
| Project map drawn by the agent | understanding the system | may diverge from reality | `lwc map` builds the map from the real import graph; ARCH-004 catches documentation diverging from the structure | `tests/analyzers.test.mjs` (ARCH-004) |
| Concept explanations (Concept / Why this matters) | learning | not grounded in actual module relations | Explain mode + `lwc explain <file>` (who imports it, what it imports) | `tests/cli.test.mjs` (explain) |
| Reset with a notes backup | safe restart | — | `lwc task finish` + history; state is never deleted, the journal keeps everything | `tests/cli.test.mjs` (finish) |
| No requirements checks | — | contradictions and gaps leak into code | Anomaly Radar A: REQ-001…005 in ru/kk/en | `tests/analyzers.test.mjs` |
| No architecture checks | — | cycles, boundary violations | ARCH-001…005 (import graph, configured boundaries, git diff of exports) | `tests/analyzers.test.mjs`, `tests/glob-graph.test.mjs` |
| No code and security checks | — | secrets, injections, empty catch blocks | IMPL-001…007, SEC-001…006, `lwc-ignore` markers | `tests/analyzers.test.mjs` (including false positives) |
| No operational data checks | — | business teams cannot use it | `lwc ops-check` with configurable rules and history | `tests/ops-check.test.mjs`, `examples/ops-report/expected.json` |
| English only | — | a barrier for Russian- and Kazakh-speaking teams | English repository, full ru and kk catalogs, README translations | `tests/i18n.test.mjs` |
| Codex support | a second agent | partial in VibeWise (no hook) | not claimed; the extension architecture is described | — |

## Licence hygiene

VibeWise code (MIT) is not used and was not copied. The LWC — vibe implementation was written from
scratch in TypeScript with its own state format, rules, texts and illustrations. General ideas
(checkpoints, local notes, levels) are not subject to copyright. VibeWise is mentioned in the
documentation for comparison, with attribution and a link.
