// PreToolUse hook (Edit/Write/MultiEdit/NotebookEdit): while the LWC task is not at the build stage,
// editing a source file requires user confirmation (ask) or is blocked (deny).
// Setting: .lwc/config.json → "guard": "ask" | "deny" | "off". Any error → skip (exit 0, no output).
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_RE =
  /\.(js|mjs|cjs|jsx|ts|tsx|mts|cts|py|go|rs|java|kt|cs|rb|php|swift|sql|sh|ps1|yml|yaml|toml)$/i;

function readStdin(limit = 65536) {
  try {
    return fs.readFileSync(0, 'utf8').slice(0, limit);
  } catch {
    return '';
  }
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch {
    return;
  }
  const filePath = payload?.tool_input?.file_path ?? payload?.tool_input?.notebook_path;
  if (typeof filePath !== 'string') return;
  const cwd =
    typeof payload.cwd === 'string' && path.isAbsolute(payload.cwd) ? payload.cwd : process.cwd();
  const { findRoot, hasState, loadConfig, loadSession, STATE_DIR } = await import(
    new URL('../dist/core/state.js', import.meta.url).href
  );
  const root = findRoot(cwd);
  if (!hasState(root)) return;
  const config = loadConfig(root);
  if (config.guard === 'off') return;
  const session = loadSession(root);
  const task = session.task;
  if (!task || task.stage === 'build' || task.stage === 'done') return;
  const abs = path.resolve(cwd, filePath);
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  if (rel.startsWith('..') || rel.startsWith(STATE_DIR + '/')) return;
  if (!SOURCE_RE.test(rel)) return; // documents and notes may be edited at any stage
  const pending = task.decisions.filter((d) => !d.confirmedAt).map((d) => d.id);
  const reason =
    `LWC — vibe: task "${task.title}" is at stage "${task.stage}", not build. ` +
    `Changing the source file ${rel} is not agreed yet` +
    (pending.length ? ` (decisions ${pending.join(', ')} are unconfirmed)` : '') +
    '. Confirm the plan first: lwc decision confirm <id> and lwc task stage build.';
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: config.guard === 'deny' ? 'deny' : 'ask',
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch(() => {});
