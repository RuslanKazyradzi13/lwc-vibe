import { parseArgs } from './args.js';
import { VERSION } from '../core/radar.js';
import { cmdClaim, cmdDecision, cmdInit, cmdMap, cmdResume, cmdStatus, cmdTask, } from './commands/session.js';
import { cmdExplain, cmdOpsCheck, cmdRadar, cmdRun, cmdSuppress } from './commands/radar.js';
import { cmdGate } from './commands/gate.js';
export const HELP = `LWC — vibe ${VERSION} · Local Workflow Coach
AI writes. You decide. LWC verifies.

Usage: lwc <command> [options]

State and process
  init [--lang ru|kk|en] [--level beginner|intermediate|advanced] [--checkpoints light|normal|frequent] [--test-command "npm test"]
  status [--json]                     current task, stage, decisions, last run
  resume [--json]                     context for restoring an agent session
  map                                 refresh the project map (.lwc/project-map.md)
  task start "title" [--scope "src/**,tests/**"]
  task scope add|set|clear <glob...>
  task stage learn|design|build|review|done [--yes]
  task finish
  decision add "text" | confirm <id> | list
  claim add "text" | list             record an agent claim (checked against evidence)
  run [--kind test|lint|build] -- <command>   run a command and record evidence

Anomaly Radar
  radar [path...] [--format text|md|json] [--category a,b,c,d,e] [--run-tests] [--out file] [--fail-on high] [--lang ru|kk|en] [--verbose]
  suppress <id | RULE-ID> [--file path] --reason "…" [--by name] | suppress list
  explain <file>                      module relations: what it imports, who imports it

Evidence Gate
  gate [path] [--format text|md|json] [--out file] [--run-tests] [--fail-on fail|insufficient|never]
       [--ai nace|off] [--ai-preview] [--lang ru|kk|en]
                                      is the task really done? checks claims against recorded
                                      evidence; optional Nace Drex advisory (never part of the verdict)

Operational data
  ops-check <data.csv|json> --rules <rules.json> [--history <history>] [--format text|md|json] [--lang ru|kk|en] [--out file]

General
  --root <dir>   project root (default: nearest directory with .lwc or .git)
  --help, --version
`;
export async function main(argv, io = { out: (s) => console.log(s), err: (s) => console.error(s) }) {
    const args = parseArgs(argv);
    const cmd = args.positional.shift();
    if (args.flags.version) {
        io.out(VERSION);
        return 0;
    }
    if (!cmd || args.flags.help || cmd === 'help') {
        io.out(HELP);
        return 0;
    }
    try {
        switch (cmd) {
            case 'init':
                return cmdInit(args, io);
            case 'status':
                return cmdStatus(args, io);
            case 'resume':
                return cmdResume(args, io);
            case 'map':
                return cmdMap(args, io);
            case 'task':
                return cmdTask(args, io);
            case 'decision':
                return cmdDecision(args, io);
            case 'claim':
                return cmdClaim(args, io);
            case 'run':
                return cmdRun(args, io);
            case 'radar':
                return await cmdRadar(args, io);
            case 'gate':
                return await cmdGate(args, io);
            case 'suppress':
                return cmdSuppress(args, io);
            case 'explain':
                return cmdExplain(args, io);
            case 'ops-check':
                return cmdOpsCheck(args, io);
            default:
                io.err(`Unknown command: ${cmd}\n`);
                io.out(HELP);
                return 2;
        }
    }
    catch (err) {
        io.err(`Error: ${err instanceof Error ? err.message : String(err)}`);
        if (args.flags.verbose && err instanceof Error && err.stack)
            io.err(err.stack);
        return 1;
    }
}
