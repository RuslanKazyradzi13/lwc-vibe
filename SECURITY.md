# Security policy

## Supported versions

| Version | Support |
| --- | --- |
| 0.1.x | security fixes on the `main` branch |

## Reporting a vulnerability

Please **do not open a public issue** for vulnerabilities.

1. Use GitHub's private form: *Security → Report a vulnerability* in the repository
   <https://github.com/RuslanKazyradzi13/lwc-vibe/security/advisories/new>.
2. If the form is unavailable, contact the repository owner through the contacts in the profile
   <https://github.com/RuslanKazyradzi13> with the subject "lwc-vibe security".

Include: the version, reproduction steps, expected and actual behaviour, an impact assessment. We
acknowledge receipt within 7 days and aim to release a fix within 30 days for confirmed issues;
timelines depend on complexity and maintainer availability.

## What counts as a vulnerability in LWC — vibe

- Executing commands without an explicit user request (`lwc run`, `--run-tests`).
- Reading or writing files outside the project root (for example through symbolic links in `.lwc/`
  or crafted paths in the configuration).
- The `guard.mjs` hook failing in a way that blocks a Claude Code session, or bypassing the hook with
  malicious state-file content.
- Leaking project content anywhere other than the local file system (the product has no network
  calls; their appearance is a bug).
- Injection through analysed file content into Markdown/JSON reports.

## What does not count

- False positives or misses of radar rules (quality bugs; open a regular issue).
- Secrets in `examples/` — they are fictional and planted deliberately for demonstration.

## Principles

LWC — vibe runs locally, has no network calls or telemetry and stores no credentials. The hooks are
designed to exit silently with code 0 on any error.
