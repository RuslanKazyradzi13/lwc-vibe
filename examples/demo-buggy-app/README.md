# Demo project "coffee-shop checkout" with deliberate defects

A small sales-tracking app for a coffee shop in Almaty (synthetic data, amounts in KZT). Defects of
all five Anomaly Radar categories were **planted on purpose**. The project shows what the radar finds
and how it separates confirmed defects from suspicions. The requirements file is written in Russian
to demonstrate Cyrillic requirement analysis.

Run the check from the repository root:

```bash
node bin/lwc.js radar examples/demo-buggy-app --format text
```

The expected result is described in [EXPECTED_FINDINGS.md](EXPECTED_FINDINGS.md) and verified by the
test `tests/radar-demo.test.mjs`.

## What was planted

| File | Defect | Rule |
| --- | --- | --- |
| `REQUIREMENTS.md` | a contradiction, no error behaviour, unmeasurable requirements, a rule missing from the acceptance criteria | REQ-001 … REQ-005 |
| `src/services/orders.js` ↔ `src/db/storage.js` | a cyclic import | ARCH-001 |
| `src/ui/receipt.js` → `src/db/storage.js` | violates the boundary "the UI never talks to the DB" (see `lwc.config.json`) | ARCH-002 |
| `docs/ARCHITECTURE.md` | describes a non-existent directory `src/payments/` | ARCH-004 |
| `src/services/orders.js` | `JSON.parse` without try/catch, `parseInt` without a radix, a `<= length` loop, assignment in `if`, an empty `catch` | IMPL-001 … IMPL-003 |
| `src/services/discount.js` | a copied discount calculation block (duplicate) | IMPL-007 |
| `src/utils/legacy.js` | an unused export | IMPL-006 |
| `src/config.js` | a hard-coded API key and database password | SEC-001 |
| `src/api/server.js` | SQL concatenation, `exec` with a template, a route without authorisation, a path from `req.query`, `rejectUnauthorized: false` | SEC-002 … SEC-004 |
| `package.json` | a `git+https://` dependency, a `*` version, a `postinstall` with `curl` | SEC-005 |
| `.github/workflows/deploy.yml` | `permissions: write-all` | SEC-006 |
| `.lwc/session.json` + `.lwc/evidence/` | a "tests pass" claim after a failed run; a file outside the task scope | PROC-002, PROC-003, PROC-005 |

All secrets in this directory are fictional and invalid.
