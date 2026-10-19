/**
 * Local LWC state: the `.lwc/` directory in the project root.
 *
 *   .lwc/config.json        — settings (language, level, module boundaries, rules)
 *   .lwc/session.json       — current task: stage, scope, decisions, claims
 *   .lwc/journal.md         — human-readable journal of decisions and explanations
 *   .lwc/project-map.md     — project map
 *   .lwc/evidence/*.json    — records of commands that actually ran (tests etc.)
 *   .lwc/suppressions.json  — suppressed findings with reasons
 *   .lwc/reports/           — Anomaly Radar reports
 *
 * Everything is plain JSON/Markdown in UTF-8. No server, telemetry or cloud.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULT_CONFIG } from './findings.js';
export const STATE_DIR = '.lwc';
export function statePaths(root) {
    const dir = path.join(root, STATE_DIR);
    return {
        root,
        dir,
        config: path.join(dir, 'config.json'),
        session: path.join(dir, 'session.json'),
        journal: path.join(dir, 'journal.md'),
        map: path.join(dir, 'project-map.md'),
        evidenceDir: path.join(dir, 'evidence'),
        suppressions: path.join(dir, 'suppressions.json'),
        reportsDir: path.join(dir, 'reports'),
    };
}
/** Finds the project root: the nearest directory containing .lwc/ or .git/, else cwd. */
export function findRoot(start) {
    let dir = path.resolve(start);
    for (;;) {
        if (fs.existsSync(path.join(dir, STATE_DIR)) || fs.existsSync(path.join(dir, '.git')))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            return path.resolve(start);
        dir = parent;
    }
}
function readJson(file) {
    try {
        if (!fs.existsSync(file))
            return null;
        const st = fs.lstatSync(file);
        if (st.isSymbolicLink())
            return null;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
        return null;
    }
}
function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
/** Shared (team) config in the project root: kept in Git, unlike the personal `.lwc/config.json`. */
export const SHARED_CONFIG_FILE = 'lwc.config.json';
/**
 * Layer order: DEFAULT_CONFIG ← lwc.config.json (in Git, shared by the team) ← .lwc/config.json (personal).
 * Arrays ignore/boundaries/requirementFiles/architectureDocs and the rules object are merged; scalars override.
 */
export function loadConfig(root) {
    const shared = readJson(path.join(root, SHARED_CONFIG_FILE));
    const personal = readJson(statePaths(root).config);
    return mergeConfig(personal, mergeConfig(shared));
}
export function mergeConfig(raw, base = structuredClone(DEFAULT_CONFIG)) {
    if (!raw)
        return base;
    const uniq = (xs) => [...new Set(xs)];
    return {
        ...base,
        ...raw,
        ignore: Array.isArray(raw.ignore) ? uniq([...base.ignore, ...raw.ignore]) : base.ignore,
        boundaries: Array.isArray(raw.boundaries)
            ? [...base.boundaries, ...raw.boundaries]
            : base.boundaries,
        thresholds: { ...base.thresholds, ...(raw.thresholds ?? {}) },
        rules: { ...base.rules, ...(raw.rules ?? {}) },
        requirementFiles: Array.isArray(raw.requirementFiles)
            ? uniq([...raw.requirementFiles, ...base.requirementFiles])
            : base.requirementFiles,
        architectureDocs: Array.isArray(raw.architectureDocs)
            ? uniq([...raw.architectureDocs, ...base.architectureDocs])
            : base.architectureDocs,
    };
}
export function saveConfig(root, config) {
    // Do not persist the default ignore list again — only user additions.
    const toSave = {
        ...config,
        ignore: config.ignore.filter((g) => !DEFAULT_CONFIG.ignore.includes(g)),
    };
    writeJson(statePaths(root).config, toSave);
}
export function hasState(root) {
    return fs.existsSync(statePaths(root).config);
}
export function loadSession(root) {
    return readJson(statePaths(root).session) ?? { version: 1, history: [] };
}
export function saveSession(root, s) {
    writeJson(statePaths(root).session, s);
}
export function loadSuppressions(root) {
    const s = readJson(statePaths(root).suppressions);
    return Array.isArray(s) ? s : [];
}
export function saveSuppressions(root, list) {
    writeJson(statePaths(root).suppressions, list);
}
export function loadEvidence(root) {
    const dir = statePaths(root).evidenceDir;
    if (!fs.existsSync(dir))
        return [];
    const out = [];
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json'))
            continue;
        const rec = readJson(path.join(dir, f));
        if (rec && typeof rec.command === 'string')
            out.push(rec);
    }
    return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
export function saveEvidence(root, rec) {
    const file = path.join(statePaths(root).evidenceDir, `${rec.id}.json`);
    writeJson(file, rec);
    return path.relative(root, file).replace(/\\/g, '/');
}
export function appendJournal(root, heading, body) {
    const p = statePaths(root).journal;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const stamp = new Date().toISOString();
    const entry = `\n## ${heading}\n\n_${stamp}_\n\n${body.trim()}\n`;
    if (!fs.existsSync(p))
        fs.writeFileSync(p, '# LWC — vibe journal\n', 'utf8');
    fs.appendFileSync(p, entry, 'utf8');
}
export function nowId(prefix) {
    const t = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, '')
        .slice(0, 14);
    const r = createHash('sha256')
        .update(String(Math.random()) + t)
        .digest('hex')
        .slice(0, 6);
    return `${prefix}-${t}-${r}`;
}
export function sha256(text) {
    return createHash('sha256').update(text).digest('hex');
}
