// lwc-ignore-file: this module contains the rule patterns themselves (strings with eval, rm -rf, etc.), not their use.
/**
 * D. Security anomalies. Pattern rules plus dependency manifest analysis.
 * Secrets (SEC-001) are `probable`: the value looks like a real key by format;
 * placeholders such as "xxx", "example", "changeme" are filtered out.
 */
import path from 'node:path';
import { fileIgnored, isInComment, isSourceFile, isTestFile, lineIgnored, lineOf, snippet, } from '../core/scan.js';
import { mk, ruleEnabled } from './base.js';
const GENERIC_SECRET = 'Hard-coded password/secret';
const SECRETS = [
    { kind: 'AWS Access Key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: 'critical' },
    { kind: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, severity: 'critical' },
    { kind: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g, severity: 'critical' },
    {
        kind: 'Private key',
        re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
        severity: 'critical',
    },
    { kind: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: 'high' },
    { kind: 'Stripe key', re: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/g, severity: 'critical' },
    {
        kind: 'JWT',
        re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        severity: 'high',
    },
    {
        kind: GENERIC_SECRET,
        re: /[\w.]*(?:password|passwd|pwd|secret|api[_-]?key|apikey|token|access[_-]?key)['"]?\s*[:=]\s*['"]([^'"\n]{8,})['"]/gi,
        severity: 'high',
    },
    {
        kind: 'Database URL with password',
        re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s/]+:[^@\s/]{3,}@/gi,
        severity: 'critical',
    },
];
/** Replaces every secret-looking value with [REDACTED] (used before data leaves the machine). */
export function redactSecrets(text) {
    let out = text;
    for (const p of SECRETS)
        out = out.replace(new RegExp(p.re.source, p.re.flags), '[REDACTED]');
    return out;
}
const PLACEHOLDER_RE = /(xxx|example|changeme|change_me|placeholder|your[_-]?|<[^>]+>|\$\{|process\.env|os\.environ|getenv|dummy|sample|test[_-]?key|\*\*\*|12345678|password123|secret123)/i;
const CODE = [
    // SEC-002 — unsafe input
    {
        rule: 'SEC-002',
        what: {
            en: 'eval() of an arbitrary string',
            ru: 'eval() произвольной строки',
            kk: 'еркін жолдың eval()',
        },
        re: /\beval\s*\(/g,
        severity: 'critical',
        status: 'probable',
        langs: ['js', 'py'],
    },
    {
        rule: 'SEC-002',
        what: {
            en: 'new Function() from a string',
            ru: 'new Function() из строки',
            kk: 'жолдан new Function()',
        },
        re: /\bnew\s+Function\s*\(/g,
        severity: 'high',
        status: 'probable',
        langs: ['js'],
    },
    {
        rule: 'SEC-002',
        what: {
            en: 'innerHTML / document.write with dynamic data (XSS)',
            ru: 'innerHTML / document.write с динамическими данными (XSS)',
            kk: 'динамикалық деректермен innerHTML / document.write (XSS)',
        },
        re: /\.(innerHTML|outerHTML)\s*[+]?=(?!\s*['"`][^'"`$]*['"`]\s*;)|document\.write\s*\(/g,
        severity: 'high',
        status: 'probable',
        langs: ['js'],
    },
    {
        rule: 'SEC-002',
        what: {
            en: 'Shell command built from a string (exec/execSync with concatenation or a template)',
            ru: 'Команда оболочки, собранная из строки (exec/execSync с конкатенацией или шаблоном)',
            kk: 'Жолдан құрастырылған shell командасы (exec/execSync конкатенациямен немесе шаблонмен)',
        },
        re: /\b(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|['"][^'"]*['"]\s*\+)/g,
        severity: 'critical',
        status: 'probable',
        langs: ['js'],
    },
    {
        rule: 'SEC-002',
        what: {
            en: 'SQL query built by concatenation/template',
            ru: 'SQL-запрос, собранный конкатенацией/шаблоном',
            kk: 'Конкатенация/шаблонмен құрастырылған SQL сұранысы',
        },
        re: /(?:"\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"\n]*"\s*\+\s*\w|'\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^'\n]*'\s*\+\s*\w|`\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{)/gi,
        severity: 'critical',
        status: 'probable',
        langs: ['js', 'py'],
    },
    {
        rule: 'SEC-002',
        what: {
            en: 'SQL query via f-string / % / format',
            ru: 'SQL-запрос через f-строку / % / format',
            kk: 'f-жол / % / format арқылы SQL сұранысы',
        },
        re: /(?:f['"]\s*(?:SELECT|INSERT|UPDATE|DELETE)\b|['"](?:SELECT|INSERT|UPDATE|DELETE)\b[^'"]*%s[^'"]*['"]\s*%|\.format\()/gi,
        severity: 'critical',
        status: 'probable',
        langs: ['py'],
        guard: (t, i) => /(SELECT|INSERT|UPDATE|DELETE)/i.test(snippet(t, i)),
    },
    {
        rule: 'SEC-002',
        what: {
            en: 'subprocess with shell=True',
            ru: 'subprocess с shell=True',
            kk: 'shell=True параметрімен subprocess',
        },
        re: /\bsubprocess\.\w+\([^)]*shell\s*=\s*True/g,
        severity: 'high',
        status: 'probable',
        langs: ['py'],
    },
    {
        rule: 'SEC-002',
        what: {
            en: 'os.system() with a dynamic string',
            ru: 'os.system() с динамической строкой',
            kk: 'динамикалық жолмен os.system()',
        },
        re: /\bos\.system\s*\(/g,
        severity: 'high',
        status: 'probable',
        langs: ['py'],
    },
    {
        rule: 'SEC-002',
        what: {
            en: 'pickle.loads of untrusted data',
            ru: 'pickle.loads недоверенных данных',
            kk: 'сенімсіз деректердің pickle.loads',
        },
        re: /\bpickle\.loads?\s*\(/g,
        severity: 'high',
        status: 'warning',
        langs: ['py'],
    },
    {
        rule: 'SEC-002',
        what: {
            en: 'yaml.load without a safe Loader',
            ru: 'yaml.load без безопасного Loader',
            kk: 'қауіпсіз Loader-сіз yaml.load',
        },
        re: /\byaml\.load\s*\((?![^)]*Loader\s*=\s*yaml\.(?:Safe|CSafe))/g,
        severity: 'high',
        status: 'probable',
        langs: ['py'],
    },
    // SEC-003 — authentication / authorisation
    {
        rule: 'SEC-003',
        what: {
            en: 'TLS certificate verification disabled',
            ru: 'Отключена проверка TLS-сертификата',
            kk: 'TLS сертификатын тексеру өшірілген',
        },
        re: /rejectUnauthorized\s*:\s*false|verify\s*=\s*False|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/g,
        severity: 'high',
        status: 'confirmed',
        langs: ['any'],
    },
    {
        rule: 'SEC-003',
        what: {
            en: 'JWT with the "none" algorithm',
            ru: 'JWT с алгоритмом none',
            kk: 'none алгоритмі бар JWT',
        },
        re: /algorithms?\s*[:=]\s*\[?\s*['"]none['"]/gi,
        severity: 'critical',
        status: 'confirmed',
        langs: ['any'],
    },
    {
        rule: 'SEC-003',
        what: {
            en: 'JWT signature not verified (verify_signature=False / decode without verify)',
            ru: 'JWT-подпись не проверяется (verify_signature=False / decode без verify)',
            kk: 'JWT қолтаңбасы тексерілмейді (verify_signature=False / verify-сіз decode)',
        },
        re: /verify_signature['"]?\s*[:=]\s*False|jwt\.decode\s*\([^)]*\)\s*(?![^;\n]*verify)/g,
        severity: 'high',
        status: 'probable',
        langs: ['any'],
        guard: (t, i) => /verify_signature|jwt\.decode\(/.test(snippet(t, i)) &&
            !/jwt\.verify|verify=True/.test(snippet(t, i)),
    },
    {
        rule: 'SEC-003',
        what: {
            en: 'Role/permissions taken from user input',
            ru: 'Роль/права берутся из пользовательского ввода',
            kk: 'Рөл/құқықтар пайдаланушы енгізуінен алынады',
        },
        re: /\b(?:role|isAdmin|is_admin|admin)\b\s*(?:=|===|==)\s*(?:req\.(?:body|query|params)|request\.(?:args|form|json))/g,
        severity: 'critical',
        status: 'probable',
        langs: ['any'],
    },
    // SEC-004 — files
    {
        rule: 'SEC-004',
        what: {
            en: 'File path built from user input',
            ru: 'Путь к файлу формируется из пользовательского ввода',
            kk: 'Файл жолы пайдаланушы енгізуінен құрылады',
        },
        re: /\b(?:path\.join|path\.resolve|os\.path\.join|open|fs\.\w+|readFile\w*|writeFile\w*|createReadStream|sendFile)\s*\([^)\n]*\b(?:req\.(?:body|query|params)|request\.(?:args|form|json|files)|params\.|query\.)/g,
        severity: 'critical',
        status: 'probable',
        langs: ['any'],
    },
    {
        rule: 'SEC-004',
        what: {
            en: 'Recursive delete on a variable path',
            ru: 'Рекурсивное удаление по переменному пути',
            kk: 'Айнымалы жол бойынша рекурсивті жою',
        },
        re: /\b(?:fs\.rm(?:Sync)?|fs\.rmdir(?:Sync)?|rimraf|shutil\.rmtree)\s*\(\s*(?!['"])[\w.$\[\]]+[^)]*\)/g,
        severity: 'high',
        status: 'warning',
        langs: ['any'],
        guard: (t, i) => /recursive\s*:\s*true|rmtree|rimraf/.test(snippet(t, i)),
    },
    {
        rule: 'SEC-004',
        what: { en: 'rm -rf in a command', ru: 'rm -rf в команде', kk: 'командадағы rm -rf' },
        re: /\brm\s+-rf?\s+/g,
        severity: 'high',
        status: 'warning',
        langs: ['any'],
    },
    // SEC-006 — permissions
    {
        rule: 'SEC-006',
        what: {
            en: 'chmod 777 / 0o777 (world-writable)',
            ru: 'chmod 777 / 0o777 (доступ всем)',
            kk: 'chmod 777 / 0o777 (барлығына рұқсат)',
        },
        re: /\bchmod\s+(?:-R\s+)?777\b|0o?777\b/g,
        severity: 'high',
        status: 'confirmed',
        langs: ['any'],
    },
    {
        rule: 'SEC-006',
        what: {
            en: 'CORS: any origin together with credentials',
            ru: 'CORS: любой origin вместе с credentials',
            kk: 'CORS: кез келген origin credentials-пен бірге',
        },
        re: /origin\s*:\s*['"]\*['"][^}]*credentials\s*:\s*true|credentials\s*:\s*true[^}]*origin\s*:\s*['"]\*['"]/gs,
        severity: 'high',
        status: 'confirmed',
        langs: ['any'],
    },
    {
        rule: 'SEC-006',
        what: {
            en: 'GitHub Actions: permissions: write-all',
            ru: 'GitHub Actions: permissions: write-all',
            kk: 'GitHub Actions: permissions: write-all',
        },
        re: /^\s*permissions\s*:\s*write-all\s*$/gm,
        severity: 'high',
        status: 'confirmed',
        langs: ['any'],
    },
    {
        rule: 'SEC-006',
        what: {
            en: 'IAM policy: Action "*" on Resource "*"',
            ru: 'IAM/политика: Action "*" на Resource "*"',
            kk: 'IAM саясаты: Resource "*" үшін Action "*"',
        },
        re: /"Action"\s*:\s*"\*"[\s\S]{0,80}"Resource"\s*:\s*"\*"/g,
        severity: 'critical',
        status: 'confirmed',
        langs: ['any'],
    },
    {
        rule: 'SEC-006',
        what: {
            en: 'Docker: running as root (USER root)',
            ru: 'Docker: запуск от root (USER root)',
            kk: 'Docker: root ретінде іске қосу (USER root)',
        },
        re: /^\s*USER\s+root\s*$/gm,
        severity: 'medium',
        status: 'warning',
        langs: ['any'],
    },
];
const ROUTE_NO_AUTH = {
    en: 'Route {m} {route} without authentication middleware',
    ru: 'Маршрут {m} {route} без middleware аутентификации',
    kk: '{m} {route} маршруты аутентификация middleware-сіз',
};
const DEP_TEXT = {
    source: {
        en: 'Dependency from an unverified source (not the npm registry)',
        ru: 'Зависимость из непроверенного источника (не из реестра npm)',
        kk: 'Тексерілмеген дереккөзден алынған тәуелділік (npm реестрінен емес)',
    },
    pinned: {
        en: 'Dependency version is not pinned (* / latest)',
        ru: 'Версия зависимости не зафиксирована (* / latest)',
        kk: 'Тәуелділік нұсқасы бекітілмеген (* / latest)',
    },
    deprecated: {
        en: 'Deprecated package or one compromised in the past',
        ru: 'Устаревший или скомпрометированный в прошлом пакет',
        kk: 'Ескірген немесе бұрын компрометацияланған пакет',
    },
    hook: {
        en: 'Script {hook} downloads or executes external code',
        ru: 'Скрипт {hook} загружает или выполняет внешний код',
        kk: '{hook} скрипті сыртқы кодты жүктейді немесе орындайды',
    },
    pySource: {
        en: 'Dependency from an unverified source (not PyPI)',
        ru: 'Зависимость из непроверенного источника (не из PyPI)',
        kk: 'Тексерілмеген дереккөзден алынған тәуелділік (PyPI емес)',
    },
    pyPinned: {
        en: 'Dependency version is not pinned',
        ru: 'Версия зависимости не зафиксирована',
        kk: 'Тәуелділік нұсқасы бекітілмеген',
    },
    prTarget: {
        en: 'pull_request_target with checkout of PR code (runs untrusted code with secrets)',
        ru: 'pull_request_target с checkout кода из PR (выполнение чужого кода с секретами)',
        kk: 'PR кодын checkout жасайтын pull_request_target (құпиялармен бөгде кодты орындау)',
    },
};
function t(lang, l, vars = {}) {
    return l[lang].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '?');
}
function kindOf(rel) {
    const ext = path.extname(rel);
    if (ext === '.py')
        return 'py';
    if (isSourceFile(rel))
        return 'js';
    return 'any';
}
const DEPRECATED_NPM = new Set([
    'request',
    'node-uuid',
    'left-pad',
    'colors',
    'faker',
    'event-stream',
    'ua-parser-js',
]);
export const securityAnalyzer = {
    id: 'security',
    category: 'security',
    run(ctx) {
        const out = [];
        const lang = ctx.lang;
        for (const file of ctx.files) {
            const text = ctx.read(file);
            if (text == null)
                continue;
            const kind = kindOf(file);
            const isMd = file.endsWith('.md');
            if (fileIgnored(text))
                continue;
            // SEC-001: secrets (any text file except Markdown docs and lock files).
            if (ruleEnabled(ctx.config.rules, 'SEC-001') && !isMd && !/lock\.json$|\.lock$/.test(file)) {
                const secretLines = new Set();
                for (const s of SECRETS) {
                    s.re.lastIndex = 0;
                    let m;
                    while ((m = s.re.exec(text))) {
                        const snip = snippet(text, m.index);
                        if (PLACEHOLDER_RE.test(snip) || lineIgnored(text, m.index))
                            continue;
                        if (isTestFile(file) && s.kind === GENERIC_SECRET)
                            continue;
                        const ln = lineOf(text, m.index);
                        // The generic pattern does not duplicate a specific pattern's finding on the same line.
                        if (s.kind === GENERIC_SECRET && secretLines.has(ln))
                            continue;
                        secretLines.add(ln);
                        out.push(mk(lang, {
                            rule: 'SEC-001',
                            category: 'security',
                            severity: s.severity,
                            status: 'probable',
                            source: 'rule',
                            location: { file, line: ln },
                            vars: {
                                kind: s.kind,
                                snippet: snip.replace(/(['"])([^'"]{4})[^'"]*(['"])/, '$1$2…$3'),
                            },
                            idParts: ['SEC-001', file, ln, s.kind],
                        }));
                    }
                }
            }
            // SEC-002..006: code / configuration patterns.
            if (isMd)
                continue;
            for (const p of CODE) {
                if (!ruleEnabled(ctx.config.rules, p.rule))
                    continue;
                if (!p.langs.includes('any') && !p.langs.includes(kind))
                    continue;
                p.re.lastIndex = 0;
                let m;
                while ((m = p.re.exec(text))) {
                    if (isInComment(text, m.index) || lineIgnored(text, m.index))
                        continue;
                    if (p.guard && !p.guard(text, m.index))
                        continue;
                    out.push(mk(lang, {
                        rule: p.rule,
                        category: 'security',
                        severity: p.severity,
                        status: p.status,
                        source: 'rule',
                        location: { file, line: lineOf(text, m.index) },
                        vars: { what: p.what[lang], snippet: snippet(text, m.index) },
                        idParts: [p.rule, file, lineOf(text, m.index), p.what.en],
                    }));
                    if (m[0].length === 0)
                        p.re.lastIndex++;
                }
            }
            // SEC-003: routes without authentication middleware (when the project has one).
            if (ruleEnabled(ctx.config.rules, 'SEC-003') && kind === 'js') {
                const routeRe = /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*(['"`][^'"`]+['"`])\s*,([^\n]*)/g;
                const authNames = /\b(auth|requireAuth|isAuthenticated|authenticate|ensureLoggedIn|protect|verifyToken|checkAuth|passport\.authenticate|jwtCheck|requireLogin)\w*/i;
                const hasAuthSomewhere = authNames.test(text) || /app\.use\([^)]*auth/i.test(text);
                if (hasAuthSomewhere) {
                    let m;
                    while ((m = routeRe.exec(text))) {
                        const rest = m[3] ?? '';
                        const route = m[2] ?? '';
                        if (authNames.test(rest))
                            continue;
                        if (/login|signin|signup|register|health|public|static|auth/i.test(route))
                            continue;
                        if (m[1] === 'get' && /public|health|status|ping/i.test(route))
                            continue;
                        out.push(mk(lang, {
                            rule: 'SEC-003',
                            category: 'security',
                            severity: m[1] === 'get' ? 'medium' : 'high',
                            status: 'probable',
                            source: 'rule',
                            location: { file, line: lineOf(text, m.index) },
                            vars: {
                                what: t(lang, ROUTE_NO_AUTH, { m: m[1].toUpperCase(), route }),
                                snippet: snippet(text, m.index),
                            },
                            idParts: ['SEC-003', file, route, m[1]],
                        }));
                    }
                }
            }
        }
        // SEC-005: dependencies.
        if (ruleEnabled(ctx.config.rules, 'SEC-005')) {
            for (const file of ctx.files) {
                if (path.basename(file) === 'package.json') {
                    const text = ctx.read(file);
                    if (!text)
                        continue;
                    let pkg;
                    try {
                        pkg = JSON.parse(text);
                    }
                    catch {
                        continue;
                    }
                    const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
                    for (const sec of sections) {
                        const deps = pkg[sec];
                        if (!deps || typeof deps !== 'object')
                            continue;
                        for (const [name, ver] of Object.entries(deps)) {
                            const v = String(ver);
                            let what = null;
                            let severity = 'medium';
                            if (/^(git\+|github:|https?:|file:|link:)/.test(v) || /\/\//.test(v)) {
                                what = DEP_TEXT.source;
                                severity = 'high';
                            }
                            else if (v === '*' || v === 'latest' || v === '' || v === 'x') {
                                what = DEP_TEXT.pinned;
                            }
                            else if (DEPRECATED_NPM.has(name)) {
                                what = DEP_TEXT.deprecated;
                                severity = 'high';
                            }
                            if (!what)
                                continue;
                            out.push(mk(lang, {
                                rule: 'SEC-005',
                                category: 'security',
                                severity,
                                status: 'probable',
                                source: 'dependency-analysis',
                                location: { file, line: lineOf(text, text.indexOf(`"${name}"`)) },
                                vars: { what: what[lang], snippet: `${name}@${v} (${sec})` },
                                idParts: ['SEC-005', file, name],
                            }));
                        }
                    }
                    const scripts = (pkg.scripts ?? {});
                    for (const hook of ['preinstall', 'postinstall']) {
                        if (scripts[hook] &&
                            /curl|wget|http|bash|sh\s|powershell|node\s+-e/.test(scripts[hook])) {
                            out.push(mk(lang, {
                                rule: 'SEC-005',
                                category: 'security',
                                severity: 'high',
                                status: 'probable',
                                source: 'dependency-analysis',
                                location: { file, line: lineOf(text, text.indexOf(`"${hook}"`)) },
                                vars: { what: t(lang, DEP_TEXT.hook, { hook }), snippet: scripts[hook] },
                                idParts: ['SEC-005', file, hook],
                            }));
                        }
                    }
                }
                if (/requirements[^/]*\.txt$/.test(file)) {
                    const text = ctx.read(file) ?? '';
                    text.split('\n').forEach((line, i) => {
                        const l = line.trim();
                        if (!l || l.startsWith('#') || l.startsWith('-'))
                            return;
                        if (/^(git\+|https?:)/.test(l)) {
                            out.push(mk(lang, {
                                rule: 'SEC-005',
                                category: 'security',
                                severity: 'high',
                                status: 'probable',
                                source: 'dependency-analysis',
                                location: { file, line: i + 1 },
                                vars: { what: DEP_TEXT.pySource[lang], snippet: l },
                                idParts: ['SEC-005', file, l],
                            }));
                        }
                        else if (!/[=<>~!]=|==/.test(l)) {
                            out.push(mk(lang, {
                                rule: 'SEC-005',
                                category: 'security',
                                severity: 'low',
                                status: 'warning',
                                source: 'dependency-analysis',
                                location: { file, line: i + 1 },
                                vars: { what: DEP_TEXT.pyPinned[lang], snippet: l },
                                idParts: ['SEC-005', file, l],
                            }));
                        }
                    });
                }
            }
        }
        // SEC-006: workflow with pull_request_target + checkout of PR code.
        if (ruleEnabled(ctx.config.rules, 'SEC-006')) {
            for (const file of ctx.files) {
                if (!/^\.github\/workflows\/.*\.ya?ml$/.test(file))
                    continue;
                const text = ctx.read(file) ?? '';
                if (/pull_request_target/.test(text) &&
                    /ref:\s*\$\{\{\s*github\.event\.pull_request\.head/.test(text)) {
                    out.push(mk(lang, {
                        rule: 'SEC-006',
                        category: 'security',
                        severity: 'critical',
                        status: 'confirmed',
                        source: 'rule',
                        location: { file, line: lineOf(text, text.indexOf('pull_request_target')) },
                        vars: { what: DEP_TEXT.prTarget[lang], snippet: 'pull_request_target + head ref' },
                        idParts: ['SEC-006', file, 'prt'],
                    }));
                }
            }
        }
        ctx.log(`security: ${out.length} findings`);
        return out;
    },
};
