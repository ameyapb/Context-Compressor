'use strict';

const assert = require('node:assert/strict');
const Module = require('module');

let mockReadFileImpl = async () => Buffer.alloc(0);

const vscodeMock = {
  workspace: {
    fs: {
      readFile: (uri) => mockReadFileImpl(uri),
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

delete require.cache[require.resolve('../src/fileReader')];
const { readFileAsText } = require('../src/fileReader');

Module._load = originalLoad;

describe('readFileAsText', () => {
  it('returns the decoded string for valid UTF-8 bytes', async () => {
    mockReadFileImpl = async () => Buffer.from('hello world', 'utf-8');
    const result = await readFileAsText({ fsPath: '/fake/file.txt' });
    assert.equal(result, 'hello world');
  });

  it('returns null when readFile throws (e.g. file not found)', async () => {
    mockReadFileImpl = async () => { throw new Error('ENOENT: no such file'); };
    const result = await readFileAsText({ fsPath: '/nonexistent.txt' });
    assert.equal(result, null);
  });

  it('returns null for bytes that are invalid UTF-8 (fatal decoder rejects them)', async () => {
    // A lone continuation byte (0x80) is never valid UTF-8 without a leading start byte.
    mockReadFileImpl = async () => Buffer.from([0x80, 0x81, 0x82]);
    const result = await readFileAsText({ fsPath: '/binary.bin' });
    assert.equal(result, null);
  });

  it('returns null for 0xFF bytes which are not valid UTF-8', async () => {
    mockReadFileImpl = async () => Buffer.from([0xff, 0xfe]);
    const result = await readFileAsText({ fsPath: '/garbage.bin' });
    assert.equal(result, null);
  });

  it('returns an empty string for a zero-length file', async () => {
    mockReadFileImpl = async () => Buffer.alloc(0);
    const result = await readFileAsText({ fsPath: '/empty.txt' });
    assert.equal(result, '');
  });

  it('preserves multi-line content exactly', async () => {
    const content = 'line1\nline2\nline3';
    mockReadFileImpl = async () => Buffer.from(content, 'utf-8');
    const result = await readFileAsText({ fsPath: '/multi.txt' });
    assert.equal(result, content);
  });

  it('handles multi-byte Unicode characters', async () => {
    const content = 'café 世界';
    mockReadFileImpl = async () => Buffer.from(content, 'utf-8');
    const result = await readFileAsText({ fsPath: '/unicode.txt' });
    assert.equal(result, content);
  });

  it('preserves Windows-style CRLF line endings', async () => {
    const content = 'line1\r\nline2\r\nline3';
    mockReadFileImpl = async () => Buffer.from(content, 'utf-8');
    const result = await readFileAsText({ fsPath: '/crlf.txt' });
    assert.equal(result, content);
  });
});
