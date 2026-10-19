import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, matchesAny } from '../dist/core/glob.js';
import { buildImportGraph, findCycles, parseExports, parseImports } from '../dist/core/graph.js';
import { words, stems } from '../dist/core/text.js';

test('glob: ** and * behave as expected', () => {
  assert.ok(globToRegExp('src/**').test('src/a/b.ts'));
  assert.ok(globToRegExp('src/**/*.ts').test('src/b.ts'));
  assert.ok(globToRegExp('src/**/*.ts').test('src/a/b.ts'));
  assert.ok(!globToRegExp('src/*.ts').test('src/a/b.ts'));
  assert.ok(matchesAny('node_modules/x/y.js', ['node_modules/**']));
  assert.ok(matchesAny('node_modules', ['node_modules/**']), 'the directory itself must match');
  assert.ok(matchesAny('a/b/c.min.js', ['**/*.min.js']));
  assert.ok(matchesAny('deep/dir/.env', ['.env']), 'a pattern without / applies to the file name');
  assert.ok(!matchesAny('src/app.ts', ['tests/**']));
});

test('text: Cyrillic word boundaries', () => {
  assert.ok(words('тест\\p{L}*').test('а тесты пройдены'));
  assert.ok(!words('тест').test('протестировано'));
  assert.ok(words(stems('сохран')).test('Система сохраняет заказ'));
});

test('graph: JS/TS and Python import parsing', () => {
  const js = `import a from './a.js';\nimport { b } from "../b";\nconst c = require('./c');\nexport * from './d.js';\nimport('./e.js');`;
  const specs = parseImports('src/x.ts', js).map((i) => i.specifier);
  assert.deepEqual(specs, ['./a.js', '../b', './c', './d.js', './e.js']);
  const py = `import os\nfrom .mod import x\nfrom pkg.sub import y\nimport json`;
  assert.deepEqual(
    parseImports('app/m.py', py).map((i) => i.specifier),
    ['os', '.mod', 'pkg.sub', 'json'],
  );
});

test("graph: cycles are found by Tarjan's algorithm", () => {
  const files = ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js'];
  const texts = {
    'src/a.js': "import './b.js';",
    'src/b.js': "import './c.js';",
    'src/c.js': "import './a.js';",
    'src/d.js': "import './a.js';",
  };
  const g = buildImportGraph(
    files,
    (f) => texts[f],
    () => true,
  );
  const cycles = findCycles(g);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0], ['src/a.js', 'src/b.js', 'src/c.js']);
  assert.ok(!cycles.flat().includes('src/d.js'));
});

test('graph: ./x.js → x.ts and index file resolution', () => {
  const files = ['src/a.ts', 'src/util/index.ts', 'src/b.ts'];
  const texts = {
    'src/a.ts': "import './b.js';\nimport './util';",
    'src/util/index.ts': '',
    'src/b.ts': '',
  };
  const g = buildImportGraph(
    files,
    (f) => texts[f],
    () => true,
  );
  assert.deepEqual([...g.out.get('src/a.ts')], ['src/b.ts', 'src/util/index.ts']);
});

test('graph: JS/TS/Python exports', () => {
  assert.deepEqual(
    parseExports(
      'a.ts',
      'export function f() {}\nexport const x = 1;\nexport { y as z, w };\nexport default class Q {}',
    ).sort(),
    ['Q', 'f', 'w', 'x', 'z'],
  );
  assert.deepEqual(
    parseExports('a.cjs', 'module.exports = { foo, bar: baz };\nexports.qux = 1;').sort(),
    ['bar', 'foo', 'qux'],
  );
  assert.deepEqual(
    parseExports('a.py', 'def pub():\n  pass\ndef _priv():\n  pass\nclass K:\n  pass'),
    ['pub', 'K'],
  );
});
