# Third-party notices

Audit date: 20 October 2026 (`npm ls --all` plus reading the `license` field of every installed
package's `package.json`).

## Runtime dependencies

**None.** LWC — vibe uses only Node.js built-in modules (`fs`, `path`, `child_process`, `crypto`,
`url`, and `node:test` for tests).

## Development dependencies (not distributed with the product)

| Package | Version | Licence | Purpose |
| --- | --- | --- | --- |
| typescript | 5.9.3 | Apache-2.0 | compiling `src/` → `dist/`, type checking |
| prettier | 3.9.10 | MIT | formatting checks |
| @types/node | 20.19.43 | MIT | Node.js types |
| undici-types | 6.21.0 | MIT | transitive dependency of @types/node |

All licences are compatible with MIT. The built `dist/` contains only this project's code (`tsc`
output, no bundled libraries).

## Reference

[VibeWise](https://github.com/nykooi1/vibe-wise) (MIT, © 2026 Noah Kim) was studied as a reference
for the product idea. Its code, texts, illustrations and structure were not copied and are not
included in this repository. See [docs/REFERENCE_ANALYSIS.md](docs/REFERENCE_ANALYSIS.md).

## Fonts and images

All SVG illustrations in `assets/` were created for this project. They use system fonts
(Segoe UI / Inter / Roboto / Arial, Consolas / Cascadia Mono / Menlo) without embedding font files.
The PDF is produced by headless Chromium from HTML; fonts are embedded from the system at build time.

## Code of conduct

`CODE_OF_CONDUCT.md` is adapted from the [Contributor Covenant](https://www.contributor-covenant.org/)
v2.1 (CC BY 4.0).
