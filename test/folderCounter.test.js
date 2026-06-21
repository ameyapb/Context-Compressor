'use strict';

const assert = require('node:assert/strict');
const Module = require('module');

const vscodeMock = {
  FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
  Uri: { joinPath: (uri, name) => ({ fsPath: `${uri.fsPath}/${name}`, toString: () => `${uri}/${name}` }) },
  workspace: { fs: { stat: async () => {}, readDirectory: async () => [] } },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

const { shouldExcludeFile } = require('../src/folderCounter');

describe('shouldExcludeFile', () => {
  it('excludes files with .lock suffix', () => {
    assert.equal(shouldExcludeFile('yarn.lock'), true);
    assert.equal(shouldExcludeFile('Gemfile.lock'), true);
    assert.equal(shouldExcludeFile('Pipfile.lock'), true);
    assert.equal(shouldExcludeFile('composer.lock'), true);
  });

  it('excludes minified JavaScript files', () => {
    assert.equal(shouldExcludeFile('bundle.min.js'), true);
    assert.equal(shouldExcludeFile('jquery.min.js'), true);
  });

  it('excludes minified CSS files', () => {
    assert.equal(shouldExcludeFile('styles.min.css'), true);
  });

  it('excludes Python bytecode files', () => {
    assert.equal(shouldExcludeFile('module.pyc'), true);
    assert.equal(shouldExcludeFile('module.pyo'), true);
    assert.equal(shouldExcludeFile('module.pyd'), true);
  });

  it('excludes source map files', () => {
    assert.equal(shouldExcludeFile('bundle.js.map'), true);
    assert.equal(shouldExcludeFile('styles.css.map'), true);
  });

  it('excludes log files', () => {
    assert.equal(shouldExcludeFile('error.log'), true);
    assert.equal(shouldExcludeFile('npm-debug.log'), true);
  });

  it('excludes well-known noise filenames', () => {
    assert.equal(shouldExcludeFile('package-lock.json'), true);
    assert.equal(shouldExcludeFile('go.sum'), true);
    assert.equal(shouldExcludeFile('pnpm-lock.yaml'), true);
  });

  it('does not exclude normal source files', () => {
    assert.equal(shouldExcludeFile('index.js'), false);
    assert.equal(shouldExcludeFile('main.ts'), false);
    assert.equal(shouldExcludeFile('app.py'), false);
    assert.equal(shouldExcludeFile('config.json'), false);
    assert.equal(shouldExcludeFile('README.md'), false);
    assert.equal(shouldExcludeFile('styles.css'), false);
  });

  it('does not exclude package.json', () => {
    assert.equal(shouldExcludeFile('package.json'), false);
  });
});
