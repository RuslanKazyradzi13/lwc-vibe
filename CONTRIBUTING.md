# Contributing

Thank you for your interest in LWC — vibe. Issues and pull requests in English, Russian or Kazakh
are welcome.

## What is especially useful

- **False positives and misses** of radar rules — with a minimal reproducible example (a 5–20 line
  file and the expected behaviour).
- **New rules** with tests and texts in all three languages.
- **Translations**: proofreading of the Kazakh catalog (`src/i18n/kk.ts`) by native speakers.
- **Reports on the plugin** in Claude Code: what worked, what got in the way.

## Preparing a change

1. Fork the repository and create a branch from `main`.
2. Install dependencies: `npm install` (Node.js ≥ 20).
3. Make your changes in `src/` (TypeScript). Do not edit `dist/` by hand — it is built by
   `npm run build` and **committed together with the change** (CI checks it is up to date via
   `npm run check:dist`).
4. Add or update tests in `tests/*.test.mjs`. For radar rules a test that the rule fires **and** a
   test that it does not fire on correct code are both required.
5. If you add a rule, add texts to `src/i18n/en.ts`, `ru.ts`, `kk.ts` (the `i18n.test.mjs` test checks
   for identical keys and placeholders) and a row in `docs/RULES.md`.
6. Check: `npm run lint && npm test`.
7. Open a pull request describing what changed, why, and how it was verified. Say so if some checks
   were not run.

## Style

- TypeScript strict, ESM, no runtime dependencies. A new runtime dependency only after a discussion
  in an issue.
- Formatting — Prettier (`npm run format`).
- Code, comments, commit messages and documentation are in English; user-facing report texts live in
  the i18n catalogs (English, Russian and Kazakh are required for every rule).
- Radar findings never present assumptions as facts: use the correct `status` and `source`.

## Licensing of contributions

By submitting a pull request you agree that your contribution is distributed under the project's MIT
licence. Do not include third-party code without a compatible licence and attribution in
`THIRD_PARTY_NOTICES.md`.
