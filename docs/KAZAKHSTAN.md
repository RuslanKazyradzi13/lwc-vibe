# LWC — vibe for Kazakhstan

The product is made convenient for teams in Kazakhstan without being limited to the country.

## Languages and encoding

- English is the repository language (code, documentation, commits). Reports and the agent's
  conversation follow `lang` in the configuration: `lwc init --lang ru` for Russian, `--lang kk` for
  Kazakh, `--lang en` for English (default).
- Russian and Kazakh are full message catalogs for every rule and every report label; the
  `i18n.test.mjs` test checks their completeness and placeholder parity. Pattern names inside
  observations are localised as well.
- All files are UTF-8. Rule regular expressions use Unicode word boundaries, so Cyrillic and Kazakh
  letters (ә, ғ, қ, ң, ө, ұ, ү, һ, і) are handled correctly; this is covered by tests
  (`text: Cyrillic word boundaries`, `REQ: Kazakh and mixed-language text`).
- Numbers are accepted in local formats: `1 842 000`, `1 842 000,50 ₸`, `15000 KZT`, `тг`.
  Dates: ISO 8601 and `DD.MM.YYYY HH:mm`.
- Translated READMEs: [README.ru.md](../README.ru.md), [README.kk.md](../README.kk.md).

## Examples for different teams

| Who | Example in the repository | What it shows |
| --- | --- | --- |
| Small business | `examples/demo-buggy-app` — a coffee-shop checkout with amounts in tiyn and ₸, requirements in Russian | defects in requirements, code and security typical of an "app built in one evening" |
| Product teams | the demo `REQUIREMENTS.md` + the REQ-* rules | contradictions, unmeasurable wording, rules missing from acceptance criteria |
| Finance / operations | `examples/ops-report` — a daily report of a pickup-point network in KZT | required fields, negative amounts, inconsistent totals, duplicates, time, spikes, ranges |
| Engineering teams | `lwc.config.json` with module boundaries, CI with `--fail-on high` | architectural agreements and process rules inside a team |

## Adapting rules to an organisation

- `lwc.config.json` in the repository root (in Git): disabling rules, module boundaries, thresholds,
  the list of requirement files and architecture documents.
- `rules.json` for operational reports: fields, totals, uniqueness keys, ranges, spike thresholds.
  Historical deviations are computed from your data (`--history`) and a configurable threshold — the
  radar never declares them errors automatically.
- Custom analyzers through the `runRadar({ extraAnalyzers })` API.

## Personal and financial data, legislation

LWC — vibe **does not claim** compliance with the legislation of the Republic of Kazakhstan
(including personal data, information security, accounting and tax requirements) and does not check
it. Radar rules are technical heuristics. The presence of a check or a setting does not mean legal
compliance.

If a project processes personal or financial data, study the primary sources (the texts of laws and
regulations on official resources) and record the date of the check. As of the date this
documentation was prepared (20 October 2026) the authors **have not performed** a legal review and
have not included any statements about legal norms in the product.

## Synthetic data

All data in the examples is fictional: pickup-point names, amounts, keys and passwords in the demo
project. Do not upload corporate documents, real personal data or confidential information into the
examples and reports. The radar works locally and sends nothing anywhere, but `.lwc/reports/` and
`.lwc/evidence/` contain fragments of your code and command output — treat them as ordinary working
files of the project.
