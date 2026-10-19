# Demo: anomalies in a daily operational report

A synthetic daily report of a pickup-point network in Kazakhstan for 18 October 2026. Amounts in
tenge (₸). All names and figures are fictional.

Run from the repository root:

```bash
node bin/lwc.js ops-check examples/ops-report/daily_report.csv --rules examples/ops-report/rules.json --history examples/ops-report/history.csv
```

## Planted anomalies and the rules that catch them

| Row | Point | Anomaly | Rule | Why it fires |
| --- | --- | --- | --- | --- |
| 4 | AST-01 | empty `orders_count` and `avg_ticket_kzt` | OPS-001 | the fields are declared in `rules.json → required` |
| 6 | SHY-01 | `refunds_kzt = -4000` | OPS-002 | the field is in the `nonNegative` list |
| 6 | SHY-01 | `revenue_kzt` 1 210 000 ≠ `cash_kzt` + `card_kzt` = 1 160 000 | OPS-003 | the `totals` rule with a 1 ₸ tolerance |
| 3 and 8 | ALA-02 | the row is repeated in full | OPS-004 | the uniqueness key `point_id + date` |
| 7 | KGF-01 | `closed_at` is earlier than `opened_at` | OPS-005 | the `timeSequence` rule |
| 9 | AKT-01 | `avg_ticket_kzt = 300 000` with an allowed maximum of 50 000 | OPS-007 | the `ranges` rule |
| total | all | daily revenue of 28.4 M ₸ against a 7-day median of ≈ 8.4 M ₸ | OPS-006 | the ×2.5 threshold in `spikes`; status "probable issue", not an error |

The historical spike (OPS-006) is computed from `history.csv` and the configurable `window` and
`maxRatio` parameters. It is a warning for manual review, not an automatic verdict: revenue may
really have grown (a promotion, a holiday).

The expected result is recorded in `expected.json` and verified by the test `tests/ops-check.test.mjs`.
Add `--lang ru` or `--lang kk` for a Russian or Kazakh report.

## Adapting to your organisation

Copy `rules.json`, rename the fields to match your report and adjust the thresholds. The supported
rules are described in [docs/RULES.md](../../docs/RULES.md#operational-data-ops).
