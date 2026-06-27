'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const {
  extractRelativeImportSpecifiers,
  buildCandidatePaths,
  buildTestCandidatePaths,
} = require('../../src/context/relatedFilesResolver');

describe('extractRelativeImportSpecifiers', () => {
  describe('JavaScript / TypeScript', () => {
    it('extracts a bare import-from specifier', () => {
      const result = extractRelativeImportSpecifiers(
        "import foo from './foo';",
        'src/index.js'
      );
      assert.deepEqual(result, ['./foo']);
    });

    it('extracts a named import-from specifier', () => {
      const result = extractRelativeImportSpecifiers(
        "import { a, b } from '../utils';",
        'src/index.js'
      );
      assert.deepEqual(result, ['../utils']);
    });

    it('extracts a require call', () => {
      const result = extractRelativeImportSpecifiers(
        "const bar = require('./bar');",
        'src/index.js'
      );
      assert.deepEqual(result, ['./bar']);
    });

    it('extracts a parent-relative require', () => {
      const result = extractRelativeImportSpecifiers(
        "const cfg = require('../config');",
        'src/index.js'
      );
      assert.deepEqual(result, ['../config']);
    });

    it('ignores absolute package imports', () => {
      const result = extractRelativeImportSpecifiers(
        "import React from 'react';",
        'src/index.js'
      );
      assert.deepEqual(result, []);
    });

    it('extracts a TypeScript type import', () => {
      const result = extractRelativeImportSpecifiers(
        "import type { Foo } from './types';",
        'src/index.ts'
      );
      assert.deepEqual(result, ['./types']);
    });

    it('extracts a dynamic import', () => {
      const result = extractRelativeImportSpecifiers(
        "const mod = await import('./module');",
        'src/index.js'
      );
      assert.deepEqual(result, ['./module']);
    });

    it('deduplicates repeated specifiers', () => {
      const text = "import a from './shared';\nimport b from './shared';";
      const result = extractRelativeImportSpecifiers(text, 'src/index.js');
      assert.deepEqual(result, ['./shared']);
    });

    it('returns empty array for file with no imports', () => {
      const result = extractRelativeImportSpecifiers('const x = 1;', 'src/index.js');
      assert.deepEqual(result, []);
    });

    it('handles .tsx extension', () => {
      const result = extractRelativeImportSpecifiers(
        "import Component from './Component';",
        'src/App.tsx'
      );
      assert.deepEqual(result, ['./Component']);
    });

    it('handles .mjs extension', () => {
      const result = extractRelativeImportSpecifiers(
        "import { fn } from './helpers';",
        'src/index.mjs'
      );
      assert.deepEqual(result, ['./helpers']);
    });

    it('handles .cjs extension', () => {
      const result = extractRelativeImportSpecifiers(
        "const x = require('./compat');",
        'src/index.cjs'
      );
      assert.deepEqual(result, ['./compat']);
    });

    it('extracts a namespace import', () => {
      const result = extractRelativeImportSpecifiers(
        "import * as ns from './module';",
        'src/index.js'
      );
      assert.deepEqual(result, ['./module']);
    });

    it('deduplicates across import and require for the same specifier', () => {
      const text = "import foo from './shared';\nconst bar = require('./shared');";
      const result = extractRelativeImportSpecifiers(text, 'src/index.js');
      assert.deepEqual(result, ['./shared']);
    });
  });

  describe('Python', () => {
    it('extracts a single-dot relative import', () => {
      const result = extractRelativeImportSpecifiers(
        'from .utils import helper',
        'src/module.py'
      );
      assert.deepEqual(result, ['./utils']);
    });

    it('extracts a double-dot relative import', () => {
      const result = extractRelativeImportSpecifiers(
        'from ..config import settings',
        'src/module.py'
      );
      assert.deepEqual(result, ['../config']);
    });

    it('extracts a triple-dot relative import', () => {
      const result = extractRelativeImportSpecifiers(
        'from ...helpers import util',
        'src/a/b/module.py'
      );
      assert.deepEqual(result, ['../../helpers']);
    });

    it('ignores absolute Python imports', () => {
      const result = extractRelativeImportSpecifiers(
        'import os\nimport sys',
        'src/module.py'
      );
      assert.deepEqual(result, []);
    });

    it('extracts a dotted submodule path', () => {
      const result = extractRelativeImportSpecifiers(
        'from .utils.sub import helper',
        'src/module.py'
      );
      assert.deepEqual(result, ['./utils/sub']);
    });

    it('ignores a bare-dot import with no module name', () => {
      const result = extractRelativeImportSpecifiers(
        'from . import utils',
        'src/module.py'
      );
      assert.deepEqual(result, []);
    });
  });

  describe('CSS / SCSS', () => {
    it('extracts a CSS @import', () => {
      const result = extractRelativeImportSpecifiers(
        "@import './variables.css';",
        'styles/main.css'
      );
      assert.deepEqual(result, ['./variables.css']);
    });

    it('extracts a SCSS @import', () => {
      const result = extractRelativeImportSpecifiers(
        "@import './mixins';",
        'styles/main.scss'
      );
      assert.deepEqual(result, ['./mixins']);
    });

    it('ignores absolute CSS imports', () => {
      const result = extractRelativeImportSpecifiers(
        '@import "https://fonts.googleapis.com/css2?family=Roboto";',
        'styles/main.css'
      );
      assert.deepEqual(result, []);
    });

    it('handles .less extension', () => {
      const result = extractRelativeImportSpecifiers(
        "@import './tokens';",
        'styles/main.less'
      );
      assert.deepEqual(result, ['./tokens']);
    });

    it('handles .sass extension', () => {
      const result = extractRelativeImportSpecifiers(
        "@import './base'",
        'styles/main.sass'
      );
      assert.deepEqual(result, ['./base']);
    });
  });

  describe('unknown extensions', () => {
    it('returns empty array for unknown file types', () => {
      const result = extractRelativeImportSpecifiers(
        "import './something'",
        'file.xyz'
      );
      assert.deepEqual(result, []);
    });
  });
});

describe('buildCandidatePaths', () => {
  const dir = path.resolve('/src');
  const parentDir = path.dirname(dir);

  it('produces extension variants for a bare specifier', () => {
    const results = buildCandidatePaths('./utils', dir);
    assert.ok(results.includes(path.join(dir, 'utils.js')));
    assert.ok(results.includes(path.join(dir, 'utils.ts')));
    assert.ok(results.includes(path.join(dir, 'utils.jsx')));
    assert.ok(results.includes(path.join(dir, 'utils.tsx')));
  });

  it('produces index file variants for a bare specifier', () => {
    const results = buildCandidatePaths('./utils', dir);
    assert.ok(results.includes(path.join(dir, 'utils', 'index.js')));
    assert.ok(results.includes(path.join(dir, 'utils', 'index.ts')));
  });

  it('returns exactly one candidate when specifier already has a known extension', () => {
    const results = buildCandidatePaths('./foo.css', dir);
    assert.equal(results.length, 1);
    assert.equal(results[0], path.join(dir, 'foo.css'));
  });

  it('resolves parent-relative specifiers correctly', () => {
    const results = buildCandidatePaths('../config', dir);
    assert.ok(results.includes(path.join(parentDir, 'config.js')));
    assert.ok(results.includes(path.join(parentDir, 'config.ts')));
  });

  it('extension variants appear before index variants', () => {
    const results = buildCandidatePaths('./mod', dir);
    const firstExtIdx = results.findIndex((p) => p.endsWith('.js') && !p.includes('index'));
    const firstIndexIdx = results.findIndex((p) => p.includes('index'));
    assert.ok(firstExtIdx < firstIndexIdx);
  });

  it('returns exactly one candidate for a .ts specifier', () => {
    const results = buildCandidatePaths('./types.ts', dir);
    assert.equal(results.length, 1);
    assert.equal(results[0], path.join(dir, 'types.ts'));
  });

  it('returns exactly one candidate for a .json specifier', () => {
    const results = buildCandidatePaths('./config.json', dir);
    assert.equal(results.length, 1);
    assert.equal(results[0], path.join(dir, 'config.json'));
  });

  it('resolves a nested-path bare specifier correctly', () => {
    const results = buildCandidatePaths('./utils/format', dir);
    assert.ok(results.includes(path.join(dir, 'utils', 'format.js')));
    assert.ok(results.includes(path.join(dir, 'utils', 'format.ts')));
    assert.ok(results.includes(path.join(dir, 'utils', 'format', 'index.js')));
  });

  it('produces no duplicate paths for a bare specifier', () => {
    const results = buildCandidatePaths('./utils', dir);
    const unique = [...new Set(results)];
    assert.equal(results.length, unique.length);
  });
});

describe('buildTestCandidatePaths', () => {
  it('includes adjacent .test.js candidate', () => {
    const results = buildTestCandidatePaths(path.join('/', 'src', 'parser.js'));
    assert.ok(results.includes(path.join('/', 'src', 'parser.test.js')));
  });

  it('includes adjacent .spec.js candidate', () => {
    const results = buildTestCandidatePaths(path.join('/', 'src', 'parser.js'));
    assert.ok(results.includes(path.join('/', 'src', 'parser.spec.js')));
  });

  it('includes __tests__ subdirectory candidates', () => {
    const results = buildTestCandidatePaths(path.join('/', 'src', 'parser.js'));
    assert.ok(results.includes(path.join('/', 'src', '__tests__', 'parser.test.js')));
  });

  it('includes TypeScript test variants for .ts source files', () => {
    const results = buildTestCandidatePaths(path.join('/', 'src', 'parser.ts'));
    assert.ok(results.includes(path.join('/', 'src', 'parser.test.ts')));
    assert.ok(results.includes(path.join('/', 'src', 'parser.spec.ts')));
  });

  it('returns an array of strings', () => {
    const results = buildTestCandidatePaths(path.join('/', 'src', 'utils.js'));
    assert.ok(Array.isArray(results));
    assert.ok(results.every((r) => typeof r === 'string'));
  });

  it('includes .test.jsx and .spec.jsx variants for .jsx source files', () => {
    const results = buildTestCandidatePaths(path.join('/', 'src', 'Button.jsx'));
    assert.ok(results.includes(path.join('/', 'src', 'Button.test.jsx')));
    assert.ok(results.includes(path.join('/', 'src', 'Button.spec.jsx')));
  });

  it('includes .test.tsx and .spec.tsx variants for .tsx source files', () => {
    const results = buildTestCandidatePaths(path.join('/', 'src', 'App.tsx'));
    assert.ok(results.includes(path.join('/', 'src', 'App.test.tsx')));
    assert.ok(results.includes(path.join('/', 'src', 'App.spec.tsx')));
  });

  it('produces candidates relative to the source file directory for nested paths', () => {
    const sourceFile = path.join('/', 'src', 'auth', 'login.ts');
    const results = buildTestCandidatePaths(sourceFile);
    assert.ok(results.includes(path.join('/', 'src', 'auth', 'login.test.ts')));
    assert.ok(results.includes(path.join('/', 'src', 'auth', '__tests__', 'login.test.ts')));
  });

  it('produces exactly twice as many candidates as there are test suffixes', () => {
    const results = buildTestCandidatePaths(path.join('/', 'src', 'parser.js'));
    assert.equal(results.length, 16);
  });

  it('produces no duplicate paths', () => {
    const results = buildTestCandidatePaths(path.join('/', 'src', 'parser.js'));
    const unique = [...new Set(results)];
    assert.equal(results.length, unique.length);
  });
});
