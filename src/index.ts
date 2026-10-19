/**
 * Public lwc-vibe API for programmatic use and extension.
 */
export type {
  Analyzer,
  AnalyzerContext,
  Category,
  Finding,
  FindingSource,
  FindingStatus,
  Lang,
  LwcConfig,
  Severity,
} from './core/findings.js';
export type { BoundaryRule, Location } from './core/findings.js';
export {
  DEFAULT_CONFIG,
  fnv1a,
  makeFindingId,
  sortFindings,
  SEVERITY_ORDER,
} from './core/findings.js';
export { globToRegExp, matchesAny } from './core/glob.js';
export { words, stems } from './core/text.js';
export { SHARED_CONFIG_FILE, STATE_DIR } from './core/state.js';
export type { GitInfo } from './core/git.js';
export type { ImportEdge, ImportGraph } from './core/graph.js';
export type {
  Decision,
  Claim,
  TaskState,
  SessionState,
  EvidenceRecord,
  Suppression,
  Paths,
  Stage,
} from './core/state.js';
export { SOURCE_EXT, TEXT_EXT } from './core/scan.js';
export { toNumber, toDate, fmtMoney } from './ops/opscheck.js';
export type { MkOptions } from './analyzers/base.js';
export type { RuleText, Catalog } from './i18n/types.js';
export { runRadar, applySuppressions, ANALYZERS, VERSION } from './core/radar.js';
export type { RadarOptions, RadarReport } from './core/radar.js';
export { render, renderJson, renderMarkdown, renderText } from './core/report.js';
export { checkOps, parseCsv, parseData } from './ops/opscheck.js';
export type { OpsRules, OpsResult, Row } from './ops/opscheck.js';
export { buildImportGraph, findCycles, parseExports, parseImports } from './core/graph.js';
export { scanFiles, makeReader, isSourceFile, isTestFile } from './core/scan.js';
export {
  loadConfig,
  mergeConfig,
  loadSession,
  loadEvidence,
  loadSuppressions,
  findRoot,
} from './core/state.js';
export { describe, ui, catalog, fill } from './i18n/index.js';
export { mk } from './analyzers/base.js';
export { main } from './cli/main.js';
