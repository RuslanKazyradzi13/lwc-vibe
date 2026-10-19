import fs from 'node:fs';
import path from 'node:path';
import { matchesAny } from './glob.js';
export const SOURCE_EXT = new Set([
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.py',
]);
export const TEXT_EXT = new Set([
    ...SOURCE_EXT,
    '.json',
    '.md',
    '.yml',
    '.yaml',
    '.toml',
    '.env',
    '.txt',
    '.cfg',
    '.ini',
    '.sh',
    '.ps1',
    '.html',
    '.css',
    '.sql',
    '.csv',
]);
const TEXT_NAMES = new Set(['Dockerfile', '.env', '.npmrc', 'Makefile']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Recursively collects text files, skipping ignored paths and symbolic links. */
export function scanFiles(root, ignore) {
    const out = [];
    const walk = (dir) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const abs = path.join(dir, e.name);
            const rel = path.relative(root, abs).replace(/\\/g, '/');
            if (e.isSymbolicLink())
                continue;
            if (e.isDirectory()) {
                if (matchesAny(rel, ignore))
                    continue;
                walk(abs);
            }
            else if (e.isFile()) {
                if (matchesAny(rel, ignore))
                    continue;
                const ext = path.extname(e.name);
                if (!TEXT_EXT.has(ext) && !TEXT_NAMES.has(e.name))
                    continue;
                try {
                    if (fs.statSync(abs).size > MAX_FILE_BYTES)
                        continue;
                }
                catch {
                    continue;
                }
                out.push(rel);
            }
        }
    };
    walk(root);
    return out.sort();
}
export function isSourceFile(rel) {
    return SOURCE_EXT.has(path.extname(rel));
}
export function isTestFile(rel) {
    const base = path.basename(rel).toLowerCase();
    return (/(^|\/)(tests?|__tests__|spec)\//.test(rel) ||
        /\.(test|spec)\.[cm]?[jt]sx?$/.test(base) ||
        /^test_.*\.py$/.test(base) ||
        /_test\.py$/.test(base));
}
export function makeReader(root) {
    const cache = new Map();
    return (rel) => {
        const cached = cache.get(rel);
        if (cached !== undefined)
            return cached;
        let text = null;
        try {
            const buf = fs.readFileSync(path.join(root, rel));
            text = buf.includes(0) ? null : buf.toString('utf8');
        }
        catch {
            text = null;
        }
        cache.set(rel, text);
        return text;
    };
}
export function lineOf(text, index) {
    let line = 1;
    for (let i = 0; i < index && i < text.length; i++)
        if (text.charCodeAt(i) === 10)
            line++;
    return line;
}
/** Rough check: is the position inside a comment (reduces false positives). */
export function isInComment(text, index) {
    const lineStart = text.lastIndexOf('\n', index - 1) + 1;
    const prefix = text.slice(lineStart, index);
    if (/^\s*(\/\/|#|\*)/.test(prefix))
        return true;
    const lastOpen = text.lastIndexOf('/*', index);
    const lastClose = text.lastIndexOf('*/', index);
    return lastOpen !== -1 && lastOpen > lastClose;
}
/**
 * In-code suppression markers (like eslint-disable):
 *   - `lwc-ignore-file` within the first 5 lines — pattern rules skip the file;
 *   - `lwc-ignore` on a line — that line is skipped.
 * Markers are visible in code and diffs, so they are never a silent suppression.
 */
export function fileIgnored(text) {
    return /lwc-ignore-file/.test(text.split('\n').slice(0, 5).join('\n'));
}
export function lineIgnored(text, index) {
    return /lwc-ignore\b/.test(snippet(text, index, 10_000));
}
/** Rough check: is the position inside a string literal or a regex literal on this line. */
export function isInStringOrRegex(text, index) {
    const lineStart = text.lastIndexOf('\n', index - 1) + 1;
    const prefix = text.slice(lineStart, index);
    const count = (ch) => (prefix.match(new RegExp(`(?<!\\\\)${ch}`, 'g')) ?? []).length;
    if (count("'") % 2 === 1 || count('"') % 2 === 1 || count('`') % 2 === 1)
        return true;
    // Regex literal: a '/' after an operator-like token; an even number of later '/' means we are still inside.
    const regexOpen = /(?:^|[=(,:!&|?\[>]|\breturn)\s*\/(?![/*])/.exec(prefix);
    if (regexOpen) {
        const after = prefix.slice(regexOpen.index + regexOpen[0].length);
        const closes = (after.match(/(?<!\\)\//g) ?? []).length;
        if (closes % 2 === 0)
            return true;
    }
    return false;
}
/** Line fragment for quoting in the report (trimmed, length-limited). */
export function snippet(text, index, max = 120) {
    const start = text.lastIndexOf('\n', index - 1) + 1;
    let end = text.indexOf('\n', index);
    if (end === -1)
        end = text.length;
    const s = text.slice(start, end).trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
