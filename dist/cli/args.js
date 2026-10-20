export function parseArgs(argv) {
    const res = { positional: [], flags: {}, rest: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--') {
            res.rest = argv.slice(i + 1);
            break;
        }
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            if (eq !== -1) {
                res.flags[a.slice(2, eq)] = a.slice(eq + 1);
                continue;
            }
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--') && !BOOLEAN_FLAGS.has(key)) {
                res.flags[key] = next;
                i++;
            }
            else
                res.flags[key] = true;
        }
        else if (a.startsWith('-') && a.length === 2) {
            res.flags[a.slice(1)] = true;
        }
        else
            res.positional.push(a);
    }
    return res;
}
const BOOLEAN_FLAGS = new Set([
    'help',
    'verbose',
    'run-tests',
    'json',
    'yes',
    'quiet',
    'no-journal',
    'version',
    'ai-preview',
]);
export function str(flags, key, def) {
    const v = flags[key];
    if (typeof v === 'string')
        return v;
    return def;
}
export function bool(flags, key) {
    return flags[key] === true || flags[key] === 'true';
}
