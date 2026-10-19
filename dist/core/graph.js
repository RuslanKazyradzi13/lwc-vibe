/**
 * Import graph for JS/TS and Python. Only relative/internal imports are resolved
 * (external packages become external nodes).
 */
import path from 'node:path';
const JS_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx'];
const JS_IMPORT_RE = /(?:^|\n)\s*(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+(?:[^'"]*?\s+from\s+))['"]([^'"\n]+)['"]|\brequire\(\s*['"]([^'"\n]+)['"]\s*\)|\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const PY_IMPORT_RE = /(?:^|\n)[ \t]*(?:from[ \t]+([\w.]+)[ \t]+import\b|import[ \t]+([\w.]+))/g;
export function parseImports(rel, text) {
    const res = [];
    const ext = path.extname(rel);
    const re = ext === '.py' ? PY_IMPORT_RE : JS_IMPORT_RE;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
        const spec = m[1] ?? m[2] ?? m[3];
        if (!spec)
            continue;
        const line = text.slice(0, m.index).split('\n').length + (m[0].startsWith('\n') ? 1 : 0);
        res.push({ specifier: spec, line });
    }
    return res;
}
function resolveJs(fromRel, spec, files) {
    if (!spec.startsWith('.') && !spec.startsWith('/'))
        return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
    const candidates = [base];
    // "./x.js" in TS projects usually points to x.ts
    const stripped = base.replace(/\.(m|c)?js$/, '');
    for (const e of JS_EXT)
        candidates.push(stripped + e, base + e);
    for (const e of JS_EXT)
        candidates.push(path.posix.join(base, 'index' + e));
    for (const c of candidates)
        if (files.has(c))
            return c;
    return null;
}
function resolvePy(fromRel, spec, files) {
    const dir = path.posix.dirname(fromRel);
    // Relative imports: from .mod import x / from ..pkg.mod import y
    const m = /^(\.+)(.*)$/.exec(spec);
    let baseDir;
    let modPath;
    if (m) {
        const ups = m[1].length - 1;
        baseDir = dir;
        for (let i = 0; i < ups; i++)
            baseDir = path.posix.dirname(baseDir);
        modPath = m[2].replace(/\./g, '/');
    }
    else {
        baseDir = '';
        modPath = spec.replace(/\./g, '/');
    }
    const joined = modPath ? path.posix.join(baseDir, modPath) : baseDir;
    const candidates = [joined + '.py', path.posix.join(joined, '__init__.py')];
    // Absolute import of a package next to the current file (src layout).
    if (!m) {
        candidates.push(path.posix.join(dir, modPath + '.py'));
        candidates.push(path.posix.join(dir, modPath, '__init__.py'));
        const top = fromRel.split('/')[0];
        candidates.push(path.posix.join(top, modPath + '.py'));
    }
    for (const c of candidates) {
        const n = path.posix.normalize(c);
        if (files.has(n))
            return n;
    }
    return null;
}
export function buildImportGraph(files, read, isSource) {
    const set = new Set(files);
    const g = { nodes: new Set(), edges: [], out: new Map(), in: new Map() };
    for (const rel of files) {
        if (!isSource(rel))
            continue;
        const text = read(rel);
        if (text == null)
            continue;
        g.nodes.add(rel);
        for (const imp of parseImports(rel, text)) {
            const target = path.extname(rel) === '.py'
                ? resolvePy(rel, imp.specifier, set)
                : resolveJs(rel, imp.specifier, set);
            const to = target ?? `pkg:${imp.specifier}`;
            g.edges.push({ from: rel, to, line: imp.line, specifier: imp.specifier });
            if (target) {
                if (!g.out.has(rel))
                    g.out.set(rel, new Set());
                g.out.get(rel).add(target);
                if (!g.in.has(target))
                    g.in.set(target, new Set());
                g.in.get(target).add(rel);
            }
        }
    }
    return g;
}
/** Tarjan's algorithm: strongly connected components of size > 1 (cycles). */
export function findCycles(g) {
    let index = 0;
    const stack = [];
    const onStack = new Set();
    const idx = new Map();
    const low = new Map();
    const result = [];
    const strong = (v) => {
        idx.set(v, index);
        low.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);
        for (const w of g.out.get(v) ?? []) {
            if (!idx.has(w)) {
                strong(w);
                low.set(v, Math.min(low.get(v), low.get(w)));
            }
            else if (onStack.has(w)) {
                low.set(v, Math.min(low.get(v), idx.get(w)));
            }
        }
        if (low.get(v) === idx.get(v)) {
            const comp = [];
            let w;
            do {
                w = stack.pop();
                onStack.delete(w);
                comp.push(w);
            } while (w !== v);
            if (comp.length > 1)
                result.push(comp.sort());
            else if (g.out.get(v)?.has(v))
                result.push([v]);
        }
    };
    for (const v of g.nodes)
        if (!idx.has(v))
            strong(v);
    return result;
}
/** Exported names of a module (rough, text-based). */
export function parseExports(rel, text) {
    const names = new Set();
    if (path.extname(rel) === '.py') {
        for (const m of text.matchAll(/^(?:def|class)\s+([A-Za-z_]\w*)/gm)) {
            if (!m[1].startsWith('_'))
                names.add(m[1]);
        }
        return [...names];
    }
    for (const m of text.matchAll(/^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
        names.add(m[1]);
    }
    for (const m of text.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
        for (const part of m[1].split(',')) {
            const n = part
                .trim()
                .split(/\s+as\s+/)
                .pop()
                ?.trim();
            if (n)
                names.add(n);
        }
    }
    for (const m of text.matchAll(/^\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gm))
        names.add(m[1]);
    const mod = /module\.exports\s*=\s*\{([^}]*)\}/.exec(text);
    if (mod) {
        for (const part of mod[1].split(',')) {
            const n = part.trim().split(':')[0]?.trim();
            if (n && /^[A-Za-z_$][\w$]*$/.test(n))
                names.add(n);
        }
    }
    return [...names];
}
