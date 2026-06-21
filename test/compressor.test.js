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

  it('maps Java extension to correct tag', () => {
    assert.equal(getLanguageTag('foo.java'), 'java');
    assert.equal(getLanguageTag('com/example/Main.java'), 'java');
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

describe('compress — stripComments mode (Go, Rust, Java, C)', () => {
  it('removes Go line comments and preserves code', () => {
    const input = '// package comment\npackage main\n\nfunc main() {\n\t// body\n\tfmt.Println("hi")\n}';
    const result = compress(input, 'main.go', 'stripComments');
    assert.ok(!result.includes('//'), 'should remove all // comments');
    assert.ok(result.includes('package main'));
    assert.ok(result.includes('func main()'));
    assert.ok(result.includes('fmt.Println'));
  });

  it('removes Go block comments and preserves code', () => {
    const input = '/* file header */\npackage main\n\nfunc Add(a, b int) int {\n    return a + b\n}';
    const result = compress(input, 'add.go', 'stripComments');
    assert.ok(!result.includes('/*'));
    assert.ok(!result.includes('*/'));
    assert.ok(result.includes('package main'));
    assert.ok(result.includes('func Add'));
  });

  it('removes Rust line and block comments and preserves code', () => {
    const input = '// crate doc\nfn main() {\n    /* block */\n    println!("hi");\n}';
    const result = compress(input, 'main.rs', 'stripComments');
    assert.ok(!result.includes('//'));
    assert.ok(!result.includes('/*'));
    assert.ok(result.includes('fn main()'));
    assert.ok(result.includes('println!'));
  });

  it('removes Java line and block comments and preserves code', () => {
    const input = '/* license */\npublic class Foo {\n    // method\n    public void bar() {}\n}';
    const result = compress(input, 'Foo.java', 'stripComments');
    assert.ok(!result.includes('/*'));
    assert.ok(!result.includes('//'));
    assert.ok(result.includes('public class Foo'));
    assert.ok(result.includes('public void bar()'));
  });

  it('removes C line and block comments and preserves code', () => {
    const input = '/* header */\n#include <stdio.h>\n// comment\nint main() { return 0; }';
    const result = compress(input, 'main.c', 'stripComments');
    assert.ok(!result.includes('/*'));
    assert.ok(!result.includes('//'));
    assert.ok(result.includes('#include'));
    assert.ok(result.includes('int main()'));
  });
});

describe('compress — signaturesOnly mode (Go)', () => {
  it('keeps func signatures and inserts body placeholder', () => {
    const input = 'func Add(a, b int) int {\n\treturn a + b\n}';
    const result = compress(input, 'math.go', 'signaturesOnly');
    assert.ok(result.includes('func Add(a, b int) int {'), 'should include func signature');
    assert.ok(result.includes('// ...'), 'should insert body placeholder');
    assert.ok(!result.includes('return a + b'), 'should drop body');
  });

  it('keeps type and struct declarations', () => {
    const input = 'type Point struct {\n\tX, Y float64\n}';
    const result = compress(input, 'geo.go', 'signaturesOnly');
    assert.ok(result.includes('type Point struct {'));
    assert.ok(result.includes('// ...'));
    assert.ok(!result.includes('X, Y float64'));
  });
});

describe('compress — signaturesOnly mode (Rust)', () => {
  it('keeps fn signatures and inserts body placeholder', () => {
    const input = 'fn add(a: i32, b: i32) -> i32 {\n    a + b\n}';
    const result = compress(input, 'lib.rs', 'signaturesOnly');
    assert.ok(result.includes('fn add(a: i32, b: i32) -> i32 {'), 'should include fn signature');
    assert.ok(result.includes('// ...'), 'should insert body placeholder');
    assert.ok(!result.includes('a + b'), 'should drop body');
  });

  it('keeps struct declarations and drops fields', () => {
    const input = 'struct Point {\n    x: f32,\n    y: f32,\n}';
    const result = compress(input, 'geo.rs', 'signaturesOnly');
    assert.ok(result.includes('struct Point {'));
    assert.ok(result.includes('// ...'));
    assert.ok(!result.includes('x: f32'));
  });

  it('keeps enum declarations and drops variants', () => {
    const input = 'enum Direction {\n    North,\n    South,\n}';
    const result = compress(input, 'dir.rs', 'signaturesOnly');
    assert.ok(result.includes('enum Direction {'));
    assert.ok(result.includes('// ...'));
    assert.ok(!result.includes('North,'));
  });
});

describe('compress — signaturesOnly mode (Java)', () => {
  it('keeps class declarations and drops all member bodies', () => {
    const input = 'class Calculator {\n    public int add(int a, int b) {\n        return a + b;\n    }\n}';
    const result = compress(input, 'Calculator.java', 'signaturesOnly');
    assert.ok(result.includes('class Calculator {'), 'should include class signature');
    assert.ok(result.includes('// ...'), 'should insert body placeholder');
    assert.ok(!result.includes('return a + b'), 'should drop method body');
    assert.ok(!result.includes('public int add'), 'members inside class body are dropped');
  });

  it('keeps interface declarations and drops member bodies', () => {
    const input = 'interface Adder {\n    int add(int a, int b);\n}';
    const result = compress(input, 'Adder.java', 'signaturesOnly');
    assert.ok(result.includes('interface Adder {'));
    assert.ok(!result.includes('int add(int a'));
  });
});

describe('compress — signaturesOnly mode (C struct)', () => {
  it('keeps struct declarations and drops fields', () => {
    const input = 'struct Point {\n    float x;\n    float y;\n};';
    const result = compress(input, 'geo.c', 'signaturesOnly');
    assert.ok(result.includes('struct Point {'));
    assert.ok(result.includes('// ...'));
    assert.ok(!result.includes('float x'));
    assert.ok(!result.includes('float y'));
  });
});

describe('getLanguageTag — shell extensions', () => {
  it('maps .sh extension to sh tag', () => {
    assert.equal(getLanguageTag('deploy.sh'), 'sh');
  });

  it('maps .bash extension to sh tag', () => {
    assert.equal(getLanguageTag('setup.bash'), 'sh');
  });
});

describe('compress — stripComments mode (unknown-language files)', () => {
  it('leaves HTML content unchanged including HTML comments', () => {
    const input = '<!-- header --><p>hello</p>';
    const result = compress(input, 'page.html', 'stripComments');
    assert.ok(result.includes('<!-- header -->'), 'HTML comments should be preserved');
    assert.ok(result.includes('<p>hello</p>'));
  });

  it('leaves JSON content unchanged', () => {
    const input = '{"key": "value", "n": 1}';
    const result = compress(input, 'data.json', 'stripComments');
    assert.equal(result, input);
  });

  it('leaves shell script hash comments unchanged (.sh is unknown language)', () => {
    const input = '#!/bin/bash\n# setup script\necho "done"';
    const result = compress(input, 'setup.sh', 'stripComments');
    assert.ok(result.includes('#!/bin/bash'), 'shebang should be preserved');
    assert.ok(result.includes('# setup script'), 'hash comments should be preserved in sh files');
    assert.ok(result.includes('echo "done"'));
  });

  it('leaves YAML content unchanged', () => {
    const input = '# yaml comment\nkey: value';
    const result = compress(input, 'config.yaml', 'stripComments');
    assert.equal(result, input);
  });
});

describe('compress — collapseWhitespace blank-line boundary behaviour', () => {
  it('preserves a single blank line (exactly 2 consecutive newlines)', () => {
    const input = 'line1\n\nline2';
    const result = compress(input, 'foo.js', 'collapseWhitespace');
    assert.equal(result, 'line1\n\nline2');
  });

  it('collapses exactly two blank lines (3 consecutive newlines) to one blank line', () => {
    const input = 'line1\n\n\nline2';
    const result = compress(input, 'foo.js', 'collapseWhitespace');
    assert.equal(result, 'line1\n\nline2');
  });

  it('does not strip hash comments in a Python file — only collapses whitespace', () => {
    const input = '# comment\n\n\n\ndef foo():\n    pass';
    const result = compress(input, 'script.py', 'collapseWhitespace');
    assert.ok(result.includes('# comment'), 'collapseWhitespace must not strip Python comments');
    assert.ok(!result.includes('\n\n\n'), 'should collapse 3+ blank lines');
    assert.ok(result.includes('def foo():'));
  });
});

describe('compress — signaturesOnly mode (TypeScript)', () => {
  it('applies brace-language extraction for .ts files', () => {
    const input = 'function greet(name: string): string {\n  return "hello " + name;\n}';
    const result = compress(input, 'greeter.ts', 'signaturesOnly');
    assert.ok(result.includes('function greet(name: string): string {'), 'should keep signature');
    assert.ok(result.includes('// ...'), 'should insert body placeholder');
    assert.ok(!result.includes('return "hello "'), 'should drop body');
  });

  it('applies brace-language extraction for .tsx files', () => {
    const input = 'const Button = ({ label }: Props) => {\n  return <button>{label}</button>;\n};';
    const result = compress(input, 'Button.tsx', 'signaturesOnly');
    assert.ok(result.includes('const Button'), 'should keep arrow function declaration');
    assert.ok(result.includes('// ...'), 'should insert body placeholder');
    assert.ok(!result.includes('<button>'), 'should drop JSX body');
  });
});

describe('compress — signaturesOnly mode (Python docstrings)', () => {
  it('preserves the docstring line immediately after a def', () => {
    const input = 'def describe():\n    """Returns a description."""\n    return "hello"';
    const result = compress(input, 'foo.py', 'signaturesOnly');
    assert.ok(result.includes('def describe():'), 'should include function signature');
    assert.ok(result.includes('"""Returns a description."""'), 'should preserve docstring');
    assert.ok(!result.includes('return "hello"'), 'should drop function body after docstring');
  });

  it('preserves the docstring line immediately after a class', () => {
    const input = "class Greeter:\n    '''A simple greeter.'''\n    def hello(self):\n        print('hi')";
    const result = compress(input, 'foo.py', 'signaturesOnly');
    assert.ok(result.includes('class Greeter:'));
    assert.ok(result.includes("'''A simple greeter.'''"));
    assert.ok(!result.includes("print('hi')"));
  });
});
