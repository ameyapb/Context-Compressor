'use strict';

const assert = require('node:assert/strict');
const Module = require('module');

let mockStat = async () => ({ type: 1 });
let mockReadDirectory = async () => [];
let mockReadFileAsText = async () => null;

const vscodeMock = {
  FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
  Uri: {
    joinPath: (uri, name) => ({
      fsPath: `${uri.fsPath}/${name}`,
      toString: () => `file://${uri.fsPath}/${name}`,
    }),
  },
  workspace: {
    fs: {
      stat: (uri) => mockStat(uri),
      readDirectory: (uri) => mockReadDirectory(uri),
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  if (request === '../shared/fileReader') return { readFileAsText: (uri) => mockReadFileAsText(uri) };
  return originalLoad.apply(this, arguments);
};

delete require.cache[require.resolve('../../src/shared/fileReader')];
delete require.cache[require.resolve('../../src/context/folderCounter')];
const { collectFileUris, countTokensInUris, shouldExcludeFile } = require('../../src/context/folderCounter');

Module._load = originalLoad;

function makeUri(fsPath) {
  return { fsPath, toString: () => `file://${fsPath}` };
}

const mockEncoder = (text) =>
  Array.from({ length: Math.max(1, Math.ceil(text.length / 4)) }, (_, i) => i);

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

describe('collectFileUris', () => {
  beforeEach(() => {
    mockStat = async () => ({ type: vscodeMock.FileType.File });
    mockReadDirectory = async () => [];
  });

  it('returns the URI itself when given a single file', async () => {
    const uri = makeUri('/project/src/index.js');
    const result = await collectFileUris(uri);
    assert.deepEqual(result, [uri]);
  });

  it('returns an empty array for an empty directory', async () => {
    const uri = makeUri('/project/src');
    mockStat = async () => ({ type: vscodeMock.FileType.Directory });
    mockReadDirectory = async () => [];
    const result = await collectFileUris(uri);
    assert.deepEqual(result, []);
  });

  it('returns file URIs found inside a flat directory', async () => {
    const dirUri = makeUri('/project/src');
    mockStat = async (u) => ({
      type: u.fsPath === '/project/src' ? vscodeMock.FileType.Directory : vscodeMock.FileType.File,
    });
    mockReadDirectory = async () => [
      ['a.js', vscodeMock.FileType.File],
      ['b.js', vscodeMock.FileType.File],
    ];
    const result = await collectFileUris(dirUri);
    assert.equal(result.length, 2);
  });

  it('skips files that shouldExcludeFile rejects', async () => {
    const dirUri = makeUri('/project/src');
    mockStat = async (u) => ({
      type: u.fsPath === '/project/src' ? vscodeMock.FileType.Directory : vscodeMock.FileType.File,
    });
    mockReadDirectory = async () => [
      ['index.js', vscodeMock.FileType.File],
      ['bundle.min.js', vscodeMock.FileType.File],
      ['app.log', vscodeMock.FileType.File],
    ];
    const result = await collectFileUris(dirUri);
    assert.equal(result.length, 1);
    assert.ok(result[0].fsPath.endsWith('/index.js'));
  });

  it('skips well-known ignored directory names (node_modules, .git, dist, etc.)', async () => {
    const dirUri = makeUri('/project');
    const directories = new Set(['/project', '/project/src']);
    mockStat = async (u) => ({
      type: directories.has(u.fsPath) ? vscodeMock.FileType.Directory : vscodeMock.FileType.File,
    });
    mockReadDirectory = async (u) => {
      if (u.fsPath === '/project') {
        return [
          ['src', vscodeMock.FileType.Directory],
          ['node_modules', vscodeMock.FileType.Directory],
          ['.git', vscodeMock.FileType.Directory],
        ];
      }
      if (u.fsPath === '/project/src') {
        return [['index.js', vscodeMock.FileType.File]];
      }
      return [];
    };
    const result = await collectFileUris(dirUri);
    assert.equal(result.length, 1);
    assert.ok(result[0].fsPath.endsWith('/index.js'));
  });

  it('skips symbolic links (neither File nor Directory type)', async () => {
    const dirUri = makeUri('/project/src');
    mockStat = async (u) => ({
      type: u.fsPath === '/project/src' ? vscodeMock.FileType.Directory : vscodeMock.FileType.File,
    });
    mockReadDirectory = async () => [
      ['index.js', vscodeMock.FileType.File],
      ['link', vscodeMock.FileType.SymbolicLink],
    ];
    const result = await collectFileUris(dirUri);
    assert.equal(result.length, 1);
    assert.ok(result[0].fsPath.endsWith('/index.js'));
  });

  it('does not revisit a URI already in the visited set', async () => {
    const uri = makeUri('/project/src/index.js');
    const visited = new Set([uri.toString()]);
    const result = await collectFileUris(uri, visited);
    assert.deepEqual(result, []);
  });

  it('recursively collects files from nested subdirectories', async () => {
    const rootUri = makeUri('/project');
    const directories = new Set(['/project', '/project/src', '/project/src/utils']);
    mockStat = async (u) => ({
      type: directories.has(u.fsPath) ? vscodeMock.FileType.Directory : vscodeMock.FileType.File,
    });
    mockReadDirectory = async (u) => {
      if (u.fsPath === '/project') return [['src', vscodeMock.FileType.Directory]];
      if (u.fsPath === '/project/src') {
        return [
          ['index.js', vscodeMock.FileType.File],
          ['utils', vscodeMock.FileType.Directory],
        ];
      }
      if (u.fsPath === '/project/src/utils') {
        return [['helper.js', vscodeMock.FileType.File]];
      }
      return [];
    };
    const result = await collectFileUris(rootUri);
    assert.equal(result.length, 2);
  });

  it('applies gitignore patterns to skip matching files', async () => {
    const dirUri = makeUri('/project/src');
    mockStat = async (u) => ({
      type: u.fsPath === '/project/src' ? vscodeMock.FileType.Directory : vscodeMock.FileType.File,
    });
    mockReadDirectory = async () => [
      ['index.js', vscodeMock.FileType.File],
      ['secret.env', vscodeMock.FileType.File],
    ];
    const gitignorePatterns = ['*.env'];
    const result = await collectFileUris(dirUri, new Set(), gitignorePatterns, '/project');
    assert.equal(result.length, 1);
    assert.ok(result[0].fsPath.endsWith('/index.js'));
  });
});

describe('countTokensInUris', () => {
  beforeEach(() => {
    mockStat = async () => ({ type: vscodeMock.FileType.File });
    mockReadDirectory = async () => [];
    mockReadFileAsText = async () => null;
  });

  it('returns the token count and fileCount for a single readable file', async () => {
    const uri = makeUri('/project/src/index.js');
    mockReadFileAsText = async () => 'abcd'; // 4 chars = 1 token
    const { totalTokenCount, fileCount } = await countTokensInUris([uri], mockEncoder);
    assert.equal(totalTokenCount, 1);
    assert.equal(fileCount, 1);
  });

  it('sums token counts across multiple distinct files', async () => {
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    mockReadFileAsText = async () => 'abcd'; // 1 token each
    const { totalTokenCount, fileCount } = await countTokensInUris([uriA, uriB], mockEncoder);
    assert.equal(totalTokenCount, 2);
    assert.equal(fileCount, 2);
  });

  it('deduplicates overlapping file URIs and counts each file once', async () => {
    const uri = makeUri('/project/src/index.js');
    mockReadFileAsText = async () => 'abcd'; // 1 token
    const { totalTokenCount, fileCount } = await countTokensInUris([uri, uri], mockEncoder);
    assert.equal(totalTokenCount, 1);
    assert.equal(fileCount, 1);
  });

  it('counts an unreadable file as 0 tokens but still increments fileCount', async () => {
    const uri = makeUri('/project/src/binary.bin');
    mockReadFileAsText = async () => null;
    const { totalTokenCount, fileCount } = await countTokensInUris([uri], mockEncoder);
    assert.equal(totalTokenCount, 0);
    assert.equal(fileCount, 1);
  });

  it('returns zeros for an empty URI list', async () => {
    const { totalTokenCount, fileCount } = await countTokensInUris([], mockEncoder);
    assert.equal(totalTokenCount, 0);
    assert.equal(fileCount, 0);
  });

  it('token count scales with content length', async () => {
    const uri = makeUri('/project/src/long.js');
    // 16 chars → ceil(16/4) = 4 tokens
    mockReadFileAsText = async () => 'aaaabbbbccccdddd';
    const { totalTokenCount } = await countTokensInUris([uri], mockEncoder);
    assert.equal(totalTokenCount, 4);
  });
});
