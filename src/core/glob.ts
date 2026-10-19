/** Minimal glob → RegExp (supports **, *, ?). No external dependencies. */
export function globToRegExp(glob: string): RegExp {
  let re = '^';
  const g = glob.replace(/\\/g, '/');
  const special = '.+^$(){}|[]\\';
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === '*') {
      if (g[i + 1] === '*') {
        // '**/' → any directory prefix (including none)
        if (g[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (special.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re);
}

export function matchesAny(path: string, globs: string[]): boolean {
  const p = path.replace(/\\/g, '/').replace(/\/$/, '');
  return globs.some((g) => {
    const rx = globToRegExp(g);
    if (rx.test(p)) return true;
    // A "dir/**" pattern must also match the directory "dir" itself.
    if (g.endsWith('/**') && globToRegExp(g.slice(0, -3)).test(p)) return true;
    // A pattern without '/' applies to the file name (like .gitignore).
    if (!g.includes('/')) {
      const base = p.split('/').pop() ?? p;
      return rx.test(base);
    }
    return false;
  });
}
