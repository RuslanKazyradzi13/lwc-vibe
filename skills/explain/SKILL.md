---
name: explain
description: Explain mode — explaining architecture, modules, code and dependencies at the user's level (beginner/intermediate/advanced) using the project's real import graph.
---

# LWC — vibe · Explain mode

Read [../../docs/PROCESS.md](../../docs/PROCESS.md) and [../learn/levels.md](../learn/levels.md).
This mode changes nothing in the code and does not require an active task.

## How to explain

1. Identify the subject: a file, module, directory, data flow or concept. For a file/module run
   `lwc explain <file>` — it shows what the module imports and who imports it. For the whole project
   run `lwc map --stdout` (structure and the most depended-on modules).
2. Read the code itself, not only the graph. Explain **at the level** from `.lwc/config.json`:
   - beginner: purpose in plain words, an input/output example with the task's data, where it is called;
   - intermediate: role in the architecture, dependencies and dependents, trade-offs, what happens on change;
   - advanced: invariants, edge cases, error handling, security, tests, technical debt.
3. Answer structure: `Concept:` → `Why here:` → `How it works:` (a short diagram with arrows) →
   `Watch out for:`. Mark unknowns with `?`, do not speculate.
4. If you notice an anomaly while explaining (a cycle, a secret, missing error handling), report it as
   an **observation with its source** ("I see in the code", "the radar showed"), not as a confirmed
   defect, and offer to run `lwc radar` on that path.

The user may ask for "shorter", "more on X", "skip the basics", "explain like I'm new" — adapt, but
do not change the configured level unless asked.
