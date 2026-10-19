import { stems, words } from '../core/text.js';
import { mk, ruleEnabled, shortList } from './base.js';
const NEG_RU = words('не\\s+(?:должен|должна|должно|должны|может|могут|следует|разрешается|допускается)|запрещено|запрещается|нельзя|никогда');
const POS_RU = words('должен|должна|должно|должны|обязан|обязана|обязаны|всегда|необходимо|следует|разрешается|допускается');
const NEG_EN = words("must\\s+not|mustn't|shall\\s+not|should\\s+not|shouldn't|never|forbidden|not\\s+allowed|cannot");
const POS_EN = words('must|shall|should|always|required|allowed|can');
const NEG_KK = words('тиіс\\s+емес|болмауы\\s+тиіс|тыйым|ешқашан|рұқсат\\s+етілмейді');
const POS_KK = words('тиіс|керек|қажет|әрқашан|рұқсат\\s+етіледі');
const STOP = new Set(('и в на с по для не при от до из к о что это как или ' +
    'the a an to of in on for and or is be with at by it ' +
    'должен должна должно должны может могут всегда никогда нельзя запрещено ' +
    'must shall should never always not can cannot ' +
    'система пользователь system user жүйе пайдаланушы тиіс емес керек ' +
    'если когда после перед then when after before if with every each all any only').split(' '));
const OPS_RE = words(stems('сохран', 'отправ', 'оплат', 'оплач', 'загруж', 'загруз', 'импорт', 'экспорт', 'синхрониз', 'удал', 'save', 'send', 'pay', 'upload', 'download', 'import', 'export', 'sync', 'delet', 'сақта', 'жібер', 'төле', 'жүкте'));
const ERROR_RE = words(stems('ошибк', 'сбо', 'недоступ', 'повтор', 'откат', 'таймаут', 'исключен', 'error', 'fail', 'unavailab', 'retr', 'rollback', 'timeout', 'exception', 'қате', 'сәтсіз', 'қолжетімсіз', 'қайтала') + '|не\\s+удал\\p{L}*');
const EDGE_TERMS = [
    {
        re: words(stems('списк', 'списо', 'перечн', 'перечен', 'list', 'тізім')),
        term: { en: 'list', ru: 'список', kk: 'тізім' },
        cases: [
            { en: 'empty list', ru: 'пустой список', kk: 'бос тізім' },
            { en: 'very long list', ru: 'очень длинный список', kk: 'өте ұзын тізім' },
        ],
        probes: [
            words(stems('пуст', 'empt', 'бос')),
            words(stems('максим', 'лимит', 'ограничен', 'limit', 'maximum', 'pagination', 'пагинац', 'шек')),
        ],
    },
    {
        re: words(stems('сумм', 'стоимост', 'цен', 'amount', 'price', 'total', 'сома', 'баға', 'тенге', 'kzt') +
            '|₸'),
        term: { en: 'amount', ru: 'сумма', kk: 'сома' },
        cases: [
            { en: 'zero amount', ru: 'нулевая сумма', kk: 'нөлдік сома' },
            { en: 'negative amount', ru: 'отрицательная сумма', kk: 'теріс сома' },
            { en: 'maximum amount', ru: 'максимальная сумма', kk: 'максималды сома' },
        ],
        probes: [
            words(stems('нол', 'нулев', 'zero', 'нөл') + '|0\\s*(?:₸|тг|kzt)'),
            words(stems('отрицат', 'negativ', 'теріс')),
            words(stems('максим', 'лимит', 'limit', 'maximum', 'шек')),
        ],
    },
    {
        re: words(stems('дат', 'срок', 'date', 'deadline', 'күн', 'мерзім')),
        term: { en: 'date', ru: 'дата', kk: 'күн' },
        cases: [
            { en: 'date in the past/future', ru: 'дата в прошлом/будущем', kk: 'өткен/болашақтағы күн' },
            { en: 'invalid date format', ru: 'некорректный формат даты', kk: 'жарамсыз күн форматы' },
        ],
        probes: [
            words(stems('прошл', 'будущ', 'past', 'future', 'өткен', 'болашақ')),
            words(stems('формат', 'format', 'invalid', 'некоррект', 'жарамсыз')),
        ],
    },
    {
        re: words(stems('файл', 'вложен', 'file', 'attachment', 'upload')),
        term: { en: 'file', ru: 'файл', kk: 'файл' },
        cases: [
            { en: 'empty file', ru: 'пустой файл', kk: 'бос файл' },
            { en: 'file too large', ru: 'слишком большой файл', kk: 'тым үлкен файл' },
            {
                en: 'unsupported format',
                ru: 'неподдерживаемый формат',
                kk: 'қолдау көрсетілмейтін формат',
            },
        ],
        probes: [
            words(stems('пуст', 'empt', 'бос')),
            words(stems('размер', 'size', 'мб', 'mb', 'кб', 'kb', 'өлшем')),
            words(stems('формат', 'тип', 'format', 'type', 'расширен', 'extension')),
        ],
    },
];
const VAGUE_RE = words(stems('быстр', 'удобн', 'интуитивн', 'надёжн', 'надежн', 'производительн', 'масштабируем', 'оптимальн', 'дружелюбн', 'жылдам', 'ыңғайлы', 'сенімді', 'интуитивті') +
    '|простой\\s+в\\s+использовании|минимальн\\p{L}+\\s+задержк\\p{L}*|fast|quick|user-friendly|intuitive|reliable|robust|scalable|performant|responsive|seamless|easy\\s+to\\s+use', 'giu');
const NUMBER_RE = /\d/;
const LINE_WORD = { en: 'line', ru: 'строка', kk: 'жол' };
function splitSentences(text) {
    const out = [];
    const lines = text.split('\n');
    let section = '';
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const h = /^\s*#+\s*(.+)$/.exec(raw);
        if (h) {
            section = h[1].trim().toLowerCase();
            continue;
        }
        const line = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
        if (!line || line.startsWith('```') || line.startsWith('|'))
            continue;
        for (const s of line.split(/(?<=[.!?;])\s+/)) {
            const t = s.trim();
            if (t.length > 8)
                out.push({ text: t, line: i + 1, section });
        }
    }
    return out;
}
function keywords(s) {
    const ws = s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w))
        // crude stemming: strip an English plural "s", then keep a 5-letter prefix
        .map((w) => (/^[a-z]{4,}s$/.test(w) ? w.slice(0, -1) : w).slice(0, 5));
    return new Set(ws);
}
function polarity(s) {
    if (NEG_RU.test(s) || NEG_EN.test(s) || NEG_KK.test(s))
        return 'neg';
    if (POS_RU.test(s) || POS_EN.test(s) || POS_KK.test(s))
        return 'pos';
    return null;
}
function jaccard(a, b) {
    let inter = 0;
    for (const x of a)
        if (b.has(x))
            inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}
const ACCEPT_SECTION = /(критери|приём|прием|acceptance|қабылдау)/i;
const RULES_SECTION = /(правил|ограничен|бизнес|rules?|constraints?|ереже|шектеу)/i;
export const requirementsAnalyzer = {
    id: 'requirements',
    category: 'requirements',
    run(ctx) {
        const out = [];
        const lang = ctx.lang;
        const files = ctx.config.requirementFiles.filter((f) => ctx.read(f) != null);
        if (files.length === 0) {
            if (ruleEnabled(ctx.config.rules, 'REQ-000')) {
                out.push(mk(lang, {
                    rule: 'REQ-000',
                    category: 'requirements',
                    severity: 'info',
                    status: 'evidence-gap',
                    source: 'rule',
                    vars: { list: ctx.config.requirementFiles.join(', ') },
                    idParts: ['REQ-000'],
                }));
            }
            return out;
        }
        for (const file of files) {
            const text = ctx.read(file);
            const sentences = splitSentences(text);
            // REQ-001: contradictions — similar sentences with opposite polarity.
            if (ruleEnabled(ctx.config.rules, 'REQ-001')) {
                const withPol = sentences
                    .map((s) => ({ s, pol: polarity(s.text), kw: keywords(s.text) }))
                    .filter((x) => x.pol && x.kw.size >= 2);
                for (let i = 0; i < withPol.length; i++) {
                    for (let j = i + 1; j < withPol.length; j++) {
                        const a = withPol[i];
                        const b = withPol[j];
                        if (a.pol === b.pol)
                            continue;
                        if (jaccard(a.kw, b.kw) >= 0.5) {
                            out.push(mk(lang, {
                                rule: 'REQ-001',
                                category: 'requirements',
                                severity: 'high',
                                status: 'probable',
                                source: 'rule',
                                location: { file, line: a.s.line },
                                vars: { a: a.s.text, b: `${b.s.text} (${LINE_WORD[lang]} ${b.s.line})` },
                                idParts: [file, a.s.text, b.s.text],
                            }));
                        }
                    }
                }
            }
            // REQ-002: operations without error behaviour (document-wide).
            if (ruleEnabled(ctx.config.rules, 'REQ-002')) {
                const hasErrorAnywhere = ERROR_RE.test(text);
                const seen = new Set();
                for (const s of sentences) {
                    const m = OPS_RE.exec(s.text);
                    if (!m)
                        continue;
                    const op = m[0].toLowerCase();
                    const key = op.slice(0, 5);
                    if (seen.has(key))
                        continue;
                    // Is an error mentioned nearby (same or neighbouring sentences)?
                    const idx = sentences.indexOf(s);
                    const near = sentences
                        .slice(Math.max(0, idx - 2), idx + 3)
                        .map((x) => x.text)
                        .join(' ');
                    if (ERROR_RE.test(near))
                        continue;
                    seen.add(key);
                    out.push(mk(lang, {
                        rule: 'REQ-002',
                        category: 'requirements',
                        severity: hasErrorAnywhere ? 'low' : 'medium',
                        status: hasErrorAnywhere ? 'warning' : 'probable',
                        source: 'rule',
                        location: { file, line: s.line },
                        vars: { op },
                        idParts: [file, 'REQ-002', key],
                    }));
                }
            }
            // REQ-003: edge cases.
            if (ruleEnabled(ctx.config.rules, 'REQ-003')) {
                for (const et of EDGE_TERMS) {
                    const first = sentences.find((s) => et.re.test(s.text));
                    if (!first)
                        continue;
                    const missing = et.cases.filter((_, i) => !et.probes[i].test(text));
                    if (missing.length === 0)
                        continue;
                    out.push(mk(lang, {
                        rule: 'REQ-003',
                        category: 'requirements',
                        severity: 'medium',
                        status: 'warning',
                        source: 'rule',
                        location: { file, line: first.line },
                        vars: { term: et.term[lang], cases: missing.map((c) => c[lang]).join('; ') },
                        idParts: [file, 'REQ-003', et.term.en],
                    }));
                }
            }
            // REQ-004: unmeasurable wording in sentences without numbers.
            if (ruleEnabled(ctx.config.rules, 'REQ-004')) {
                for (const s of sentences) {
                    VAGUE_RE.lastIndex = 0;
                    const m = VAGUE_RE.exec(s.text);
                    if (!m || NUMBER_RE.test(s.text))
                        continue;
                    out.push(mk(lang, {
                        rule: 'REQ-004',
                        category: 'requirements',
                        severity: 'low',
                        status: 'warning',
                        source: 'rule',
                        location: { file, line: s.line },
                        vars: { word: m[0] },
                        idParts: [file, s.line, m[0].toLowerCase()],
                    }));
                }
            }
            // REQ-005: rules not reflected in acceptance criteria.
            if (ruleEnabled(ctx.config.rules, 'REQ-005')) {
                const rules = sentences.filter((s) => RULES_SECTION.test(s.section) && !ACCEPT_SECTION.test(s.section));
                const accept = sentences.filter((s) => ACCEPT_SECTION.test(s.section));
                if (rules.length > 0 && accept.length > 0) {
                    const acceptKw = new Set();
                    for (const a of accept)
                        for (const k of keywords(a.text))
                            acceptKw.add(k);
                    for (const r of rules) {
                        const kw = [...keywords(r.text)];
                        if (kw.length === 0)
                            continue;
                        const hit = kw.filter((k) => acceptKw.has(k)).length;
                        if (hit / kw.length < 0.34) {
                            out.push(mk(lang, {
                                rule: 'REQ-005',
                                category: 'requirements',
                                severity: 'medium',
                                status: 'probable',
                                source: 'rule',
                                location: { file, line: r.line },
                                vars: { rule: r.text },
                                idParts: [file, 'REQ-005', r.text],
                            }));
                        }
                    }
                }
            }
        }
        ctx.log(`requirements: ${files.length} file(s), ${out.length} findings; files: ${shortList(files)}`);
        return out;
    },
};
