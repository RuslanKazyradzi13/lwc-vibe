/**
 * Working-tree fingerprint: a short digest of "which code state was this?".
 *
 * Evidence records store the fingerprint taken right before the command ran. The Evidence Gate
 * compares it with the current fingerprint: a passing test run made on a different code state is
 * stale and no longer proves anything about the current code.
 *
 * The digest covers the git HEAD commit plus the content of every changed file (staged, unstaged,
 * untracked) inside the project, except `.lwc/` and paths ignored by the LWC config. Without git
 * the fingerprint is unavailable and freshness is reported as unknown — never as fresh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { changedFilesForProject, getGitInfo } from './git.js';
import { matchesAny } from './glob.js';
function headCommit(root) {
    const r = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
    });
    return r.status === 0 ? (r.stdout ?? '').trim() || null : null;
}
/** Changed project files that matter for the code state (sorted, `.lwc/` and ignored paths excluded). */
export function relevantChangedFiles(root, ignore) {
    const gi = getGitInfo(root);
    if (!gi.available)
        return null;
    return changedFilesForProject(gi, root)
        .filter((p) => !p.startsWith('.lwc/') && !matchesAny(p, ignore))
        .sort();
}
export function worktreeFingerprint(root, ignore) {
    const changed = relevantChangedFiles(root, ignore);
    if (changed === null)
        return null;
    const head = headCommit(root);
    const h = createHash('sha256');
    h.update(`head:${head ?? 'none'}\n`);
    for (const rel of changed) {
        const abs = path.join(root, rel);
        let content;
        try {
            const st = fs.lstatSync(abs);
            content = st.isFile()
                ? createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
                : `non-file:${st.isSymbolicLink() ? 'link' : 'dir'}`;
        }
        catch {
            content = 'deleted';
        }
        h.update(`${rel}\0${content}\n`);
    }
    return { head, changedFiles: changed.length, digest: h.digest('hex') };
}
/** Compares a recorded fingerprint with the current one. */
export function freshnessOf(recorded, current) {
    if (!recorded || !current)
        return 'unknown';
    return recorded.digest === current.digest ? 'fresh' : 'stale';
}
