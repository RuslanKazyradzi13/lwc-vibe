# Expected Anomaly Radar findings for demo-buggy-app

This table is verified by the test `tests/radar-demo.test.mjs`: every rule in the first column must
fire (or appear in the suppressed list with a reason) when running
`node bin/lwc.js radar examples/demo-buggy-app`.

Category E rules that depend on `git status` (PROC-001, PROC-003, PROC-004) are listed separately:
they do not fire in a clean working tree; the test `tests/process.test.mjs` reproduces them.

| Rule | Where | Status | What is found |
| --- | --- | --- | --- |
| `REQ-001` | REQUIREMENTS.md:12 | probable issue | requirements 4 and 5 about the discount contradict each other |
| `REQ-002` | REQUIREMENTS.md:10 | probable issue | "saves" without a description of error behaviour |
| `REQ-003` | REQUIREMENTS.md:5 | warning | "amount" without a zero/negative case |
| `REQ-004` | REQUIREMENTS.md:14 | warning | "fast", "reliably" — unmeasurable |
| `REQ-005` | REQUIREMENTS.md:20 | probable issue | the refund and tiyn rules are not reflected in the acceptance criteria |
| `ARCH-001` | src/db/storage.js:3 | confirmed defect | the cycle storage.js ↔ orders.js |
| `ARCH-002` | src/ui/receipt.js:1 | confirmed defect | the UI imports db against the boundary in lwc.config.json |
| `ARCH-004` | docs/ARCHITECTURE.md:7 | probable issue | the non-existent `src/payments/` is described |
| `IMPL-001` | src/db/storage.js:8 | probable issue | JSON.parse without try/catch; parseInt without a radix |
| `IMPL-002` | src/services/orders.js:23 | probable issue | an empty catch; a promise without catch |
| `IMPL-003` | src/services/orders.js:9 | probable issue | `i <= items.length`; `if (order.loyalty = true)`; `==` |
| `IMPL-004` | src/services/orders.js | evidence gap | modules without tests |
| `IMPL-006` | src/utils/legacy.js | warning | `formatTenge` is never used |
| `IMPL-007` | src/services/discount.js:25 | probable issue | a duplicated discount calculation |
| `SEC-001` | src/config.js:6 | probable issue | an AWS key, an SMTP password, a DB URL with a password (all fictional) |
| `SEC-002` | src/api/server.js:21 | probable issue | SQL concatenation, execSync with a template, innerHTML |
| `SEC-003` | src/api/server.js:26 | probable / confirmed | DELETE without requireAuth; rejectUnauthorized: false |
| `SEC-004` | src/api/server.js:33 | probable issue | readFileSync with a path from req.query |
| `SEC-005` | package.json | probable issue | a git+https dependency, a `*` version, a postinstall with curl |
| `SEC-006` | .github/workflows/deploy.yml:3 | confirmed defect | permissions: write-all |
| `PROC-005` | .lwc/session.json | confirmed defect | the claim "tests pass" after a run with exit code 1 |

## Suppressed with a reason (visible in the report, not hidden)

| Rule | File | Reason |
| --- | --- | --- |
| IMPL-006 | src/ui/receipt.js | the receipt functions are called dynamically from an HTML template |

## Rules that depend on git status

| Rule | How to reproduce |
| --- | --- |
| PROC-001 | move the task to the `design` stage and change a file in `src/` |
| PROC-003 | change a file outside the task `scope` (for example `src/ui/receipt.js`) |
| PROC-004 | change a source file at the `build` stage without touching tests |
