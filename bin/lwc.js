#!/usr/bin/env node
// CLI entry point. Requires the built dist/ (npm run build) — dist/ is committed to the repository.
import { main } from '../dist/cli/main.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  },
);
