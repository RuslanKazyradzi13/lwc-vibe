/**
 * Core Anomaly Radar types: finding, severity, verification status, source.
 *
 * Every finding must state honestly where it came from (source) and how well it
 * is confirmed (status). The radar never presents model reasoning as the result
 * of static analysis or a test run.
 */
export const SEVERITY_ORDER = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
};
export const DEFAULT_CONFIG = {
    version: 1,
    lang: 'en',
    level: 'intermediate',
    checkpoints: 'normal',
    ignore: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '.git/**',
        'coverage/**',
        '**/*.min.js',
        '**/*.map',
        '.lwc/reports/**',
        'vendor/**',
        '__pycache__/**',
        '.venv/**',
        'venv/**',
    ],
    boundaries: [],
    thresholds: { maxFanOut: 12, duplicateMinLines: 8 },
    rules: {},
    requirementFiles: ['REQUIREMENTS.md', 'SPEC.md', 'docs/REQUIREMENTS.md', '.lwc/task.md'],
    architectureDocs: ['docs/ARCHITECTURE.md', 'ARCHITECTURE.md'],
    guard: 'ask',
    gate: { requireTests: 'auto' },
    ai: {
        provider: 'off',
        timeoutMs: 60_000,
        maxFindings: 40,
        includePaths: true,
        includeObservations: false,
        includeRequirements: false,
        maxRequirementChars: 4_000,
        nace: { baseUrl: 'https://console.nace.ai', model: 'drex-latest', apiKeyEnv: 'NACE_API_KEY' },
    },
};
/** Deterministic hash (FNV-1a, 32-bit) for stable identifiers. */
export function fnv1a(input) {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}
export function makeFindingId(rule, parts) {
    return `${rule}-${fnv1a(parts.map((p) => String(p ?? '')).join('|'))}`;
}
export function sortFindings(findings) {
    return [...findings].sort((a, b) => {
        const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (s !== 0)
            return s;
        const f = (a.location?.file ?? '').localeCompare(b.location?.file ?? '');
        if (f !== 0)
            return f;
        return (a.location?.line ?? 0) - (b.location?.line ?? 0);
    });
}
