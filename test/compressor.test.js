'use strict';

const assert = require('node:assert/strict');
const { COMPRESSION_MODES, COMPRESSION_MODE_NONE, compress, getLanguageTag } = require('../src/compressor');

describe('getLanguageTag', () => {
  it('maps JavaScript extensions to correct tags', () => {
    assert.equal(getLanguageTag('foo.js'), 'js');
    assert.equal(getLanguageTag('foo.mjs'), 'js');
    assert.equal(getLanguageTag('foo.cjs'), 'js');
    assert.equal(getLanguageTag('foo.ts'), 'ts');
    assert.equal(getLanguageTag('foo.tsx'), 'tsx');
    assert.equal(getLanguageTag('foo.jsx'), 'jsx');
  });

  it('maps Python extension to correct tag', () => {
    assert.equal(getLanguageTag('foo.py'), 'python');
  });

  it('maps systems language extensions to correct tags', () => {
    assert.equal(getLanguageTag('foo.go'), 'go');
    assert.equal(getLanguageTag('foo.rs'), 'rust');
    assert.equal(getLanguageTag('foo.c'), 'c');
    assert.equal(getLanguageTag('foo.cpp'), 'cpp');
    assert.equal(getLanguageTag('foo.cc'), 'cpp');
    assert.equal(getLanguageTag('foo.h'), 'c');
    assert.equal(getLanguageTag('foo.hpp'), 'cpp');
  });

  it('maps markup and data extensions to correct tags', () => {
    assert.equal(getLanguageTag('foo.json'), 'json');
    assert.equal(getLanguageTag('foo.md'), 'md');
    assert.equal(getLanguageTag('foo.yaml'), 'yaml');
    assert.equal(getLanguageTag('foo.yml'), 'yaml');
    assert.equal(getLanguageTag('foo.html'), 'html');
    assert.equal(getLanguageTag('foo.css'), 'css');
    assert.equal(getLanguageTag('foo.sql'), 'sql');
    assert.equal(getLanguageTag('foo.xml'), 'xml');
  });

  it('returns empty string for unknown extension', () => {
    assert.equal(getLanguageTag('foo.xyz'), '');
    assert.equal(getLanguageTag('Makefile'), '');
  });

  it('handles full file paths correctly', () => {
    assert.equal(getLanguageTag('/path/to/file.ts'), 'ts');
    assert.equal(getLanguageTag('/src/utils/helper.py'), 'python');
  });
});

describe('COMPRESSION_MODES', () => {
  it('is an array of exactly four modes', () => {
    assert.ok(Array.isArray(COMPRESSION_MODES));
    assert.equal(COMPRESSION_MODES.length, 4);
  });

  it('each mode has non-empty id, label, and description strings', () => {
    for (const mode of COMPRESSION_MODES) {
      assert.equal(typeof mode.id, 'string');
      assert.ok(mode.id.length > 0);
      assert.equal(typeof mode.label, 'string');
      assert.ok(mode.label.length > 0);
      assert.equal(typeof mode.description, 'string');
      assert.ok(mode.description.length > 0);
    }
  });

  it('all mode ids are unique', () => {
    const ids = COMPRESSION_MODES.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('COMPRESSION_MODE_NONE constant equals the none mode id', () => {
    assert.equal(COMPRESSION_MODE_NONE, 'none');
    assert.ok(COMPRESSION_MODES.some((m) => m.id === COMPRESSION_MODE_NONE));
  });
});

describe('compress — none mode', () => {
  it('returns text completely unchanged', () => {
    const text = 'function foo() {\n  return 1;\n}';
    assert.equal(compress(text, 'foo.js', 'none'), text);
  });

  it('returns text unchanged even for unknown file types', () => {
    const text = 'raw content with   spaces\n\n\n';
    assert.equal(compress(text, 'file.xyz', 'none'), text);
  });
});

describe('compress — stripComments mode', () => {
  it('removes JS line comments and preserves code', () => {
    const input = '// top comment\nfunction foo() {\n  return 1; // inline\n}';
    const result = compress(input, 'foo.js', 'stripComments');
    assert.ok(!result.includes('//'), 'should remove all // comments');
    assert.ok(result.includes('function foo()'));
    assert.ok(result.includes('return 1;'));
  });

  it('removes JS block comments and preserves code', () => {
    const input = '/* file header */\nfunction foo() {\n  /* body comment */\n  return 1;\n}';
    const result = compress(input, 'foo.js', 'stripComments');
    assert.ok(!result.includes('/*'));
    assert.ok(!result.includes('*/'));
    assert.ok(result.includes('function foo()'));
    assert.ok(result.includes('return 1;'));
  });

  it('also strips TypeScript comments', () => {
    const input = '// type-level comment\nconst x: number = 1;';
    const result = compress(input, 'foo.ts', 'stripComments');
    assert.ok(!result.includes('//'));
    assert.ok(result.includes('const x: number = 1;'));
  });

  it('removes Python hash comments and preserves code', () => {
    const input = '# module doc\ndef foo():\n    return 1  # inline';
    const result = compress(input, 'foo.py', 'stripComments');
    assert.ok(!result.includes('#'), 'should remove all # comments');
    assert.ok(result.includes('def foo():'));
    assert.ok(result.includes('return 1'));
  });

  it('does not strip from unknown-language files', () => {
    const input = '# yaml comment\nkey: value';
    const result = compress(input, 'data.yaml', 'stripComments');
    assert.ok(result.includes('# yaml comment'), 'should preserve yaml hash comments');
    assert.ok(result.includes('key: value'));
  });
});

describe('compress — collapseWhitespace mode', () => {
  it('collapses three or more blank lines into one blank line', () => {
    const input = 'line1\n\n\n\nline2';
    const result = compress(input, 'foo.js', 'collapseWhitespace');
    assert.ok(!result.includes('\n\n\n'), 'should not have 3+ consecutive newlines');
    assert.ok(result.includes('line1'));
    assert.ok(result.includes('line2'));
  });

  it('strips trailing whitespace from each line', () => {
    const input = 'line1   \nline2\t\nline3';
    const result = compress(input, 'foo.js', 'collapseWhitespace');
    const lines = result.split('\n');
    for (const line of lines) {
      assert.equal(line, line.trimEnd(), `line should have no trailing whitespace: "${line}"`);
    }
  });

  it('trims leading and trailing blank lines from the result', () => {
    const input = '\n\ncode here\n\n';
    const result = compress(input, 'foo.js', 'collapseWhitespace');
    assert.equal(result, 'code here');
  });
});

describe('compress — signaturesOnly mode (Python)', () => {
  it('keeps class and def signatures and drops their bodies', () => {
    const input = [
      'class Foo:',
      '    def bar(self):',
      '        x = 1',
      '        return x',
      '',
      'def standalone():',
      '    pass',
    ].join('\n');

    const result = compress(input, 'foo.py', 'signaturesOnly');
    assert.ok(result.includes('class Foo:'), 'should include class signature');
    assert.ok(result.includes('def bar(self):'), 'should include method signature');
    assert.ok(result.includes('def standalone():'), 'should include top-level function');
    assert.ok(!result.includes('x = 1'), 'should drop body assignment');
    assert.ok(!result.includes('return x'), 'should drop body return');
    assert.ok(!result.includes('pass'), 'should drop body pass');
  });

  it('preserves module-level code outside function bodies', () => {
    const input = 'import os\n\ndef foo():\n    pass';
    const result = compress(input, 'foo.py', 'signaturesOnly');
    assert.ok(result.includes('import os'), 'should preserve top-level imports');
    assert.ok(result.includes('def foo():'), 'should include function signature');
    assert.ok(!result.includes('pass'), 'should drop function body');
  });

  it('handles async def signatures', () => {
    const input = 'async def fetch(url):\n    return await get(url)';
    const result = compress(input, 'foo.py', 'signaturesOnly');
    assert.ok(result.includes('async def fetch(url):'));
    assert.ok(!result.includes('return await get'));
  });
});

describe('compress — signaturesOnly mode (JavaScript)', () => {
  it('keeps function declarations and inserts body placeholder', () => {
    const input = 'function foo() {\n  const x = 1;\n  return x;\n}';
    const result = compress(input, 'foo.js', 'signaturesOnly');
    assert.ok(result.includes('function foo() {'), 'should include function signature');
    assert.ok(result.includes('// ...'), 'should insert body placeholder');
    assert.ok(!result.includes('const x = 1'), 'should drop body');
    assert.ok(!result.includes('return x'), 'should drop body');
  });

  it('keeps arrow function declarations and inserts body placeholder', () => {
    const input = 'const bar = () => {\n  return 2;\n};';
    const result = compress(input, 'foo.js', 'signaturesOnly');
    assert.ok(result.includes('const bar = () =>'), 'should include arrow function signature');
    assert.ok(result.includes('// ...'), 'should insert body placeholder');
    assert.ok(!result.includes('return 2'), 'should drop body');
  });

  it('keeps class declarations and drops method bodies', () => {
    const input = 'class MyClass {\n  constructor() {\n    this.x = 1;\n  }\n}';
    const result = compress(input, 'foo.js', 'signaturesOnly');
    assert.ok(result.includes('class MyClass'), 'should include class declaration');
    assert.ok(!result.includes('this.x = 1'), 'should drop constructor body');
  });
});

describe('compress — signaturesOnly mode (unknown language)', () => {
  it('falls back to collapseWhitespace for unrecognized file types', () => {
    const input = 'line1\n\n\n\nline2';
    const result = compress(input, 'file.xyz', 'signaturesOnly');
    assert.ok(!result.includes('\n\n\n'), 'should collapse blank lines like collapseWhitespace fallback');
    assert.ok(result.includes('line1'));
    assert.ok(result.includes('line2'));
  });
});

describe('compress — unknown mode', () => {
  it('returns text unchanged for an unrecognized compression mode', () => {
    const text = 'some content';
    assert.equal(compress(text, 'foo.js', 'nonExistentMode'), text);
  });
});
