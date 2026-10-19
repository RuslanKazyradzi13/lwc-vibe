# Explanation levels

The level is stored in `.lwc/config.json → level` and can be changed in words ("explain it like I'm
new", "I'm advanced, skip the basics"). The level changes the depth of explanations, not the degree of
user control.

| Level | How to explain | Which questions to ask | Step size |
| --- | --- | --- | --- |
| **beginner** | Plain words, one new concept at a time, concrete steps, small diagrams, examples with the task's own data (amounts in ₸, dates, lists). No jargon, or jargon with a gloss. | "What should happen if…?", "Where is … stored?" — one at a time. | A small task: one file, one function, one test. |
| **intermediate** | Architecture: components, dependencies, data flows, trade-offs between options. Name patterns and explain why they fit here. | "Which option would you pick and why?", "What breaks if…?" | A module or a group of modules with tests. |
| **advanced** | Edge cases, security, resilience, performance, technical debt, test strategy. Short, no preamble. | "Which invariants must hold?", "How does this degrade under load / on failure?" | Any, with an explicit verification plan. |

Rules common to all levels:

- Separate **facts** (how the technology works), **decisions** (what the user chose) and
  **proposals** (what you suggest). A proposal does not become a decision without confirmation.
- Use the blocks `Concept:` (what it is) and `Why here:` (why it matters in this project) — without
  questions or confirmations; these are explanations, not checkpoints.
- Do not praise or grade the user; evaluate decisions by their consequences.
