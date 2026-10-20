/**
 * Command: gate — the Evidence Gate.
 *
 *   lwc gate [path] [--format text|md|json] [--out file] [--run-tests]
 *            [--ai nace|off] [--ai-preview] [--fail-on fail|insufficient|never] [--lang ru|kk|en]
 *
 * Exit codes: 0 — the verdict is below the --fail-on threshold; 1 — it is not; 2 — bad arguments
 * or an unsafe configuration (a secret stored in a config file).
 */
import fs from 'node:fs';
import path from 'node:path';
import { bool, str } from '../args.js';
import { appendJournal, hasState, loadConfig, secretKeysInConfig, statePaths, } from '../../core/state.js';
import { runGate } from '../../gate/gate.js';
import { renderGate } from '../../gate/report.js';
import { createNaceProvider } from '../../providers/nace.js';
import { rootOf } from './radar.js';
import { langFromArgs } from './session.js';
const FAIL_ON = {
    fail: ['fail'],
    insufficient: ['fail', 'insufficient-evidence'],
    never: [],
};
export async function cmdGate(args, io) {
    const { root } = rootOf(args);
    const secrets = secretKeysInConfig(root);
    if (secrets.length) {
        io.err(`Refusing to run: secret-looking keys found in config (${secrets.join('; ')}). ` +
            'Keep API keys in environment variables, remove them from the file and rotate the key if it was committed.');
        return 2;
    }
    const config = loadConfig(root);
    const lang = langFromArgs(args, config);
    const format = (str(args.flags, 'format') ?? 'text');
    if (!['text', 'md', 'json'].includes(format)) {
        io.err(`Unknown format: ${format}. Allowed: text, md, json.`);
        return 2;
    }
    const failOn = str(args.flags, 'fail-on') ?? 'fail';
    if (!FAIL_ON[failOn]) {
        io.err(`Unknown --fail-on value: ${failOn}. Allowed: fail, insufficient, never.`);
        return 2;
    }
    const preview = bool(args.flags, 'ai-preview');
    const aiFlag = str(args.flags, 'ai') ?? (preview ? 'nace' : config.ai.provider);
    if (!['nace', 'off'].includes(aiFlag)) {
        io.err(`Unknown --ai provider: ${aiFlag}. Allowed: nace, off.`);
        return 2;
    }
    const provider = aiFlag === 'nace' ? createNaceProvider(config.ai.nace) : null;
    const report = await runGate({
        root,
        config,
        lang,
        runTests: bool(args.flags, 'run-tests'),
        provider,
        previewOnly: preview,
    });
    if (preview) {
        // Show exactly what would leave the machine, and nothing else.
        io.out(JSON.stringify(report.advisory.sentPayload, null, 2));
        io.err(`Preview only: nothing was sent. ${report.advisory.meta.requestBytes ?? 0} bytes would go to ${config.ai.nace.baseUrl}/v1/systemone.`);
        return 0;
    }
    const text = renderGate(report, format);
    const outFile = str(args.flags, 'out');
    if (outFile) {
        fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
        fs.writeFileSync(outFile, text, 'utf8');
        io.out(`Gate report saved: ${outFile} (verdict: ${report.verdict})`);
    }
    else
        io.out(text);
    if (hasState(root) && !bool(args.flags, 'no-journal')) {
        const p = statePaths(root);
        fs.mkdirSync(p.reportsDir, { recursive: true });
        const stamp = report.generatedAt.replace(/[:.]/g, '-');
        fs.writeFileSync(path.join(p.reportsDir, `gate-${stamp}.json`), renderGate(report, 'json'), 'utf8');
        const failed = report.checks.filter((c) => c.status === 'fail').map((c) => c.id);
        const gaps = report.checks.filter((c) => c.status === 'gap').map((c) => c.id);
        appendJournal(root, 'Evidence Gate', `Verdict: **${report.verdict}**. Failed: ${failed.join(', ') || '—'}. Gaps: ${gaps.join(', ') || '—'}. ` +
            `AI advisory: ${report.advisory.provider} (${report.advisory.status}). Report: \`.lwc/reports/gate-${stamp}.json\`.`);
    }
    return FAIL_ON[failOn].includes(report.verdict) ? 1 : 0;
}
