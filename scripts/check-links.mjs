// Checks that relative links and images in Markdown files point to existing files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['node_modules', '.git', 'dist', '.lwc']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (e.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

let bad = 0;
let total = 0;
for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img[^>]+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = decodeURIComponent((m[1] ?? m[2] ?? '').replace(/^<|>$/g, ''));
    if (!raw || /^(https?:|mailto:|#)/.test(raw)) continue;
    const target = raw.split('#')[0];
    if (!target) continue;
    total++;
    const abs = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(abs)) {
      bad++;
      console.error(`✖ ${path.relative(root, file)} → ${raw} (not found)`);
    }
  }
}
console.log(`Local links checked: ${total}, broken: ${bad}`);
process.exit(bad ? 1 : 0);
