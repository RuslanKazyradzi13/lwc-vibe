import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface GitInfo {
  available: boolean;
  root?: string;
  branch?: string;
  /** Changed files (staged + unstaged + untracked) relative to HEAD, paths from the repository root. */
  changedFiles: string[];
}

function git(root: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) return { ok: false, out: r.stdout ?? '' };
  return { ok: true, out: r.stdout ?? '' };
}

export function getGitInfo(root: string): GitInfo {
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return { available: false, changedFiles: [] };
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = git(root, ['status', '--porcelain', '--untracked-files=all']);
  const changed: string[] = [];
  for (const line of status.out.split('\n')) {
    if (!line.trim()) continue;
    const p = line.slice(3).trim();
    const renamed = p.includes(' -> ') ? p.split(' -> ')[1]! : p;
    changed.push(renamed.replace(/^"|"$/g, ''));
  }
  return {
    available: true,
    root: top.out.trim(),
    branch: branch.ok ? branch.out.trim() : undefined,
    changedFiles: changed,
  };
}

/** File content at HEAD, or null when absent / git unavailable. */
export function gitShowHead(root: string, rel: string): string | null {
  const r = git(root, ['show', `HEAD:${rel}`]);
  return r.ok ? r.out : null;
}

function realpath(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Project path prefix relative to the git repository root ('' when they coincide).
 * Both paths are resolved to real paths (Windows long names, symbolic links).
 */
export function gitPrefix(gitRoot: string, projectRoot: string): string {
  return path.relative(realpath(gitRoot), realpath(projectRoot)).replace(/\\/g, '/');
}

/** Translates `git status` paths (from the repository root) into project-relative paths. */
export function changedFilesForProject(gi: GitInfo, projectRoot: string): string[] {
  if (!gi.available || !gi.root) return [];
  const prefix = gitPrefix(gi.root, projectRoot);
  if (prefix.startsWith('..')) return [];
  return gi.changedFiles
    .map((p) => (prefix ? (p.startsWith(prefix + '/') ? p.slice(prefix.length + 1) : null) : p))
    .filter((x): x is string => !!x);
}
