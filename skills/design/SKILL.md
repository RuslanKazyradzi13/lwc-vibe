---
name: design
description: Design mode — designing and discussing decisions before any code. Records requirements, options, risks and change scope in .lwc/ and obtains explicit user confirmation.
disable-model-invocation: true
---

# LWC — vibe · Design mode

Read [../../docs/PROCESS.md](../../docs/PROCESS.md). Move the task to the design stage:
`lwc task stage design`. **No source code is written** at this stage — the guard hook asks for
confirmation on any attempt, and the radar flags such a change with PROC-001.

## Steps

1. **Requirements.** Collect them in `.lwc/task.md` (Markdown with the sections "Requirements",
   "Rules", "Acceptance criteria"). Run `lwc radar --category a` and discuss the contradictions,
   undefined error behaviour and unmeasurable wording it finds. Fix the requirement text, not the code.
2. **Options.** Propose 2–3 architecture options with trade-offs in a table
   "Option / Pros / Cons / Risks". Ask which one the user chooses. Do not choose yourself.
3. **Diagram.** A short text diagram of components and data flows; mark unknowns with `?`.
   Update `.lwc/project-map.md` (section "Module boundaries and data").
4. **Scope.** Agree which files will be touched: `lwc task scope set "src/orders/**" "tests/**"`.
   Everything outside the scope is flagged by the radar (PROC-003).
5. **Risks and verification.** Name what can go wrong and how it will be checked (which tests, which
   commands). If personal or financial data, security or regulatory requirements are involved, say
   explicitly that legal compliance is not checked automatically and needs separate expertise.
6. **Decisions.** Every significant decision: `lwc decision add "<text>"`. Confirmation comes only
   from the user through AskUserQuestion ("Confirm / Discuss / Change"), followed by
   `lwc decision confirm <id>`.

End of the mode: a summary "decided / deferred / how we will verify", then offer to move to Build.
