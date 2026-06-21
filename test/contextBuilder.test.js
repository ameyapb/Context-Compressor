'use strict';

const assert = require('node:assert/strict');
const Module = require('module');

let mockReadFileAsText = async () => null;

const vscodeMock = {
  EventEmitter: class {
    constructor() { this._listeners = []; }
    get event() { return (listener) => { this._listeners.push(listener); }; }
    fire(data) { for (const listener of this._listeners) listener(data); }
  },
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0 },
  TreeItemCheckboxState: { Unchecked: 0, Checked: 1 },
  MarkdownString: class {
    constructor() { this._value = ''; }
    appendMarkdown(s) { this._value += s; return this; }
    appendText(s) { this._value += s; return this; }
  },
  workspace: { workspaceFolders: null },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  if (request === './fileReader') return { readFileAsText: (uri) => mockReadFileAsText(uri) };
  return originalLoad.apply(this, arguments);
};

// Clear both modules from cache so they load fresh with our mocks.
delete require.cache[require.resolve('../src/contextBuilder')];
const fileReaderCachePath = require.resolve('../src/fileReader');
delete require.cache[fileReaderCachePath];

const {
  ContextFileTreeProvider,
  formatBudget,
  getCompressionModeLabel,
  getCompressionModeId,
  getTotalIncludedTokens,
  getIncludedContextUris,
  initialize,
  clearAllContext,
  applyCompressionMode,
  applyNewEncoder,
  addFilesToContext,
  removeFileFromContext,
  handleCheckboxStateChange,
  assemblePromptText,
  isFileInContext,
} = require('../src/contextBuilder');

Module._load = originalLoad;

// One token per 4 characters — simple and deterministic.
const mockEncoder = (text) =>
  Array.from({ length: Math.max(1, Math.ceil(text.length / 4)) }, (_, i) => i);

function makeUri(fsPath) {
  return { fsPath, toString: () => `file://${fsPath}` };
}

describe('formatBudget', () => {
  it('shows total with thousands separator and practical limit as K shorthand', () => {
    const result = formatBudget(12345, 25000);
    assert.ok(result.includes('12,345'), 'should format total with thousands separator');
    assert.ok(result.includes('25K'), 'should show practical limit in K format');
  });

  it('shows 0.0% when total is zero', () => {
    const result = formatBudget(0, 25000);
    assert.ok(result.startsWith('0 /'), 'total should be 0');
    assert.ok(result.includes('0.0%'));
  });

  it('shows 100.0% when total equals the practical limit', () => {
    const result = formatBudget(25000, 25000);
    assert.ok(result.includes('100.0%'));
  });

  it('shows a percentage above 100 when over the practical limit', () => {
    const result = formatBudget(30000, 25000);
    const match = result.match(/([\d.]+)%/);
    assert.ok(match, 'result should contain a percentage value');
    assert.ok(parseFloat(match[1]) > 100, 'percentage should exceed 100 when over practical limit');
  });

  it('returns 0.0% without dividing by zero when practical limit is zero', () => {
    const result = formatBudget(0, 0);
    assert.ok(result.includes('0.0%'));
  });
});

describe('getCompressionModeLabel', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
  });

  it('returns "None" before any compression mode is applied', () => {
    assert.equal(getCompressionModeLabel(), 'None');
  });

  it('returns the correct label after switching to each supported mode', async () => {
    const expectedLabels = [
      ['stripComments', 'Strip Comments'],
      ['collapseWhitespace', 'Collapse Whitespace'],
      ['signaturesOnly', 'Signatures Only'],
      ['none', 'None'],
    ];
    for (const [modeId, expectedLabel] of expectedLabels) {
      await applyCompressionMode(modeId);
      assert.equal(getCompressionModeLabel(), expectedLabel, `wrong label for mode "${modeId}"`);
    }
  });
});

describe('getCompressionModeId', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
  });

  it('returns "none" immediately after initialize', () => {
    assert.equal(getCompressionModeId(), 'none');
  });

  it('returns the id of the applied compression mode', async () => {
    await applyCompressionMode('stripComments');
    assert.equal(getCompressionModeId(), 'stripComments');
  });

  it('updates when compression mode changes again', async () => {
    await applyCompressionMode('signaturesOnly');
    await applyCompressionMode('collapseWhitespace');
    assert.equal(getCompressionModeId(), 'collapseWhitespace');
  });
});

describe('getTotalIncludedTokens', () => {
  before(() => {
    initialize(mockEncoder);
    clearAllContext();
  });

  it('returns 0 when no files are in context', () => {
    assert.equal(getTotalIncludedTokens(), 0);
  });
});

describe('addFilesToContext', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
    mockReadFileAsText = async () => 'abcd'; // 4 chars = 1 token with mockEncoder
  });

  it('adds a new file to context', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    assert.equal(getIncludedContextUris().length, 1);
  });

  it('added file is included by default', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    assert.equal(getTotalIncludedTokens(), 1);
  });

  it('deduplicates a URI that is already in context', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    await addFilesToContext([uri]);
    assert.equal(getIncludedContextUris().length, 1);
  });

  it('accumulates multiple distinct files across separate calls', async () => {
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA]);
    await addFilesToContext([uriB]);
    assert.equal(getIncludedContextUris().length, 2);
  });

  it('adds multiple files in a single call', async () => {
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA, uriB]);
    assert.equal(getIncludedContextUris().length, 2);
  });

  it('deduplicates a URI already in context even when passed again in the same call', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    await addFilesToContext([uri, makeUri('/project/src/b.js')]);
    // uri was already in context, so only b.js is new
    assert.equal(getIncludedContextUris().length, 2);
  });
});

describe('removeFileFromContext', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
    mockReadFileAsText = async () => 'content';
  });

  it('removes the file with the matching uri string', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    removeFileFromContext(uri.toString());
    assert.equal(getIncludedContextUris().length, 0);
  });

  it('leaves other files intact when removing one', async () => {
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA, uriB]);
    removeFileFromContext(uriA.toString());
    const remaining = getIncludedContextUris();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].toString(), uriB.toString());
  });

  it('is a no-op when the uri string is not in context', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    removeFileFromContext('file:///nonexistent.js');
    assert.equal(getIncludedContextUris().length, 1);
  });
});

describe('clearAllContext', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
    mockReadFileAsText = async () => 'content';
  });

  it('empties a non-empty context', async () => {
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA, uriB]);
    clearAllContext();
    assert.equal(getIncludedContextUris().length, 0);
    assert.equal(getTotalIncludedTokens(), 0);
  });
});

describe('handleCheckboxStateChange', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
    mockReadFileAsText = async () => 'content';
  });

  it('marks a file as excluded when unchecked', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const item = { uriString: uri.toString() };
    handleCheckboxStateChange([[item, vscodeMock.TreeItemCheckboxState.Unchecked]]);
    assert.equal(getIncludedContextUris().length, 0);
  });

  it('marks an excluded file as included when checked', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const item = { uriString: uri.toString() };
    handleCheckboxStateChange([[item, vscodeMock.TreeItemCheckboxState.Unchecked]]);
    assert.equal(getIncludedContextUris().length, 0);
    handleCheckboxStateChange([[item, vscodeMock.TreeItemCheckboxState.Checked]]);
    assert.equal(getIncludedContextUris().length, 1);
  });

  it('handles multiple items in a single call', async () => {
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA, uriB]);
    const itemA = { uriString: uriA.toString() };
    const itemB = { uriString: uriB.toString() };
    handleCheckboxStateChange([
      [itemA, vscodeMock.TreeItemCheckboxState.Unchecked],
      [itemB, vscodeMock.TreeItemCheckboxState.Unchecked],
    ]);
    assert.equal(getIncludedContextUris().length, 0);
  });

  it('does not throw for an unknown uri string', () => {
    const item = { uriString: 'file:///nonexistent.js' };
    assert.doesNotThrow(() =>
      handleCheckboxStateChange([[item, vscodeMock.TreeItemCheckboxState.Unchecked]])
    );
  });
});

describe('getTotalIncludedTokens with files', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
  });

  it('sums tokens of all included files', async () => {
    mockReadFileAsText = async () => 'abcd'; // 4 chars = 1 token
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA, uriB]);
    assert.equal(getTotalIncludedTokens(), 2);
  });

  it('excludes tokens from unchecked files', async () => {
    mockReadFileAsText = async () => 'abcd'; // 1 token
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const item = { uriString: uri.toString() };
    handleCheckboxStateChange([[item, vscodeMock.TreeItemCheckboxState.Unchecked]]);
    assert.equal(getTotalIncludedTokens(), 0);
  });

  it('returns 0 for a file that could not be read', async () => {
    mockReadFileAsText = async () => null;
    const uri = makeUri('/project/src/unreadable.js');
    await addFilesToContext([uri]);
    assert.equal(getTotalIncludedTokens(), 0);
  });
});

describe('getIncludedContextUris', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
    mockReadFileAsText = async () => 'content';
  });

  it('returns an empty array when no files are in context', () => {
    assert.deepEqual(getIncludedContextUris(), []);
  });

  it('returns the URI of an included file', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const uris = getIncludedContextUris();
    assert.equal(uris.length, 1);
    assert.equal(uris[0].toString(), uri.toString());
  });

  it('excludes URIs of unchecked files', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const item = { uriString: uri.toString() };
    handleCheckboxStateChange([[item, vscodeMock.TreeItemCheckboxState.Unchecked]]);
    assert.deepEqual(getIncludedContextUris(), []);
  });

  it('returns only the checked URIs when a mix exists', async () => {
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA, uriB]);
    const item = { uriString: uriA.toString() };
    handleCheckboxStateChange([[item, vscodeMock.TreeItemCheckboxState.Unchecked]]);
    const uris = getIncludedContextUris();
    assert.equal(uris.length, 1);
    assert.equal(uris[0].toString(), uriB.toString());
  });
});

describe('assemblePromptText', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
    mockReadFileAsText = async () => null;
  });

  it('returns empty string when no files are in context', async () => {
    const result = await assemblePromptText();
    assert.equal(result, '');
  });

  it('skips files that readFileAsText cannot read', async () => {
    mockReadFileAsText = async () => null;
    const uri = makeUri('/project/src/unreadable.js');
    await addFilesToContext([uri]);
    const result = await assemblePromptText();
    assert.equal(result, '');
  });

  it('skips files whose content is empty or whitespace-only', async () => {
    mockReadFileAsText = async () => '   ';
    const uri = makeUri('/project/src/empty.js');
    await addFilesToContext([uri]);
    const result = await assemblePromptText();
    assert.equal(result, '');
  });

  it('formats a file as a fenced code block with the correct language tag', async () => {
    mockReadFileAsText = async () => 'const x = 1;';
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const result = await assemblePromptText();
    assert.ok(result.includes('```js'), 'should use js language tag');
    assert.ok(result.includes('const x = 1;'), 'should include file content');
  });

  it('uses the file basename as the heading when no workspace root is set', async () => {
    mockReadFileAsText = async () => 'content';
    const uri = makeUri('/project/src/utils.ts');
    await addFilesToContext([uri]);
    const result = await assemblePromptText();
    assert.ok(result.includes('### utils.ts'), 'should use basename as the section heading');
  });

  it('joins multiple files with double newlines', async () => {
    mockReadFileAsText = async () => 'content';
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA, uriB]);
    const result = await assemblePromptText();
    const blockPairs = (result.match(/```/g) ?? []).length;
    assert.equal(blockPairs, 4); // opening + closing for each of the two files
    assert.ok(result.includes('\n\n'), 'files should be separated by a blank line');
  });

  it('only assembles checked files', async () => {
    mockReadFileAsText = async () => 'const x = 1;';
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA, uriB]);
    const item = { uriString: uriA.toString() };
    handleCheckboxStateChange([[item, vscodeMock.TreeItemCheckboxState.Unchecked]]);
    const result = await assemblePromptText();
    const blockPairs = (result.match(/```/g) ?? []).length;
    assert.equal(blockPairs, 2); // only b.js produces one opening + one closing
  });

  it('applies the active compression mode to the assembled content', async () => {
    mockReadFileAsText = async () => '// a comment\nconst x = 1;';
    await applyCompressionMode('stripComments');
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const result = await assemblePromptText();
    assert.ok(!result.includes('// a comment'), 'comment should be stripped by compression');
    assert.ok(result.includes('const x = 1;'), 'code should be preserved');
  });
});

describe('isFileInContext', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
    mockReadFileAsText = async () => 'content';
  });

  it('returns false when context is empty', () => {
    const uri = makeUri('/project/src/index.js');
    assert.equal(isFileInContext(uri), false);
  });

  it('returns true for a uri that has been added', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    assert.equal(isFileInContext(uri), true);
  });

  it('returns false for a uri that was not added', async () => {
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.js');
    await addFilesToContext([uriA]);
    assert.equal(isFileInContext(uriB), false);
  });

  it('returns false after a file has been removed', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    removeFileFromContext(uri.toString());
    assert.equal(isFileInContext(uri), false);
  });

  it('returns false after clearAllContext', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    clearAllContext();
    assert.equal(isFileInContext(uri), false);
  });

  it('returns true even when the file is unchecked', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const item = { uriString: uri.toString() };
    handleCheckboxStateChange([[item, vscodeMock.TreeItemCheckboxState.Unchecked]]);
    assert.equal(isFileInContext(uri), true);
  });
});

describe('applyNewEncoder', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
  });

  it('recomputes token counts with the new encoder', async () => {
    mockReadFileAsText = async () => 'aaaabbbbccccdddd'; // 16 chars = 4 tokens with mockEncoder
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    assert.equal(getTotalIncludedTokens(), 4); // ceil(16/4) = 4

    const doubleEncoder = (text) =>
      Array.from({ length: Math.ceil(text.length / 2) }, (_, i) => i);
    await applyNewEncoder(doubleEncoder);
    assert.equal(getTotalIncludedTokens(), 8); // ceil(16/2) = 8
  });
});

describe('formatBudget — additional edge cases', () => {
  it('formats total tokens above 999 with a thousands separator', () => {
    const result = formatBudget(1000, 25000);
    assert.ok(result.includes('1,000'), 'total should be formatted with thousands separator');
  });

  it('rounds the practical limit K label to the nearest thousand', () => {
    const result = formatBudget(0, 1500);
    assert.ok(result.includes('2K'), '1500 rounds to 2K');
  });

  it('rounds down correctly for values below the midpoint', () => {
    const result = formatBudget(0, 1400);
    assert.ok(result.includes('1K'), '1400 rounds to 1K');
  });
});

describe('ContextFileTreeProvider', () => {
  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
    mockReadFileAsText = async () => 'content';
  });

  it('getChildren returns one ContextFileItem per file in context', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const provider = new ContextFileTreeProvider();
    const items = provider.getChildren();
    assert.equal(items.length, 1);
    assert.equal(items[0].uriString, uri.toString());
  });

  it('getChildren returns an empty array for a non-root (nested) element', () => {
    const provider = new ContextFileTreeProvider();
    assert.deepEqual(provider.getChildren({ label: 'something' }), []);
  });

  it('getChildren returns an empty array when context is empty', () => {
    const provider = new ContextFileTreeProvider();
    assert.deepEqual(provider.getChildren(), []);
  });

  it('getTreeItem returns the element passed to it unchanged', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const provider = new ContextFileTreeProvider();
    const [item] = provider.getChildren();
    assert.strictEqual(provider.getTreeItem(item), item);
  });

  it('item label is the file basename when no workspace root is configured', async () => {
    const uri = makeUri('/project/src/utils.ts');
    await addFilesToContext([uri]);
    const provider = new ContextFileTreeProvider();
    const [item] = provider.getChildren();
    assert.equal(item.label, 'utils.ts');
  });

  it('item contextValue is "contextFile"', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const provider = new ContextFileTreeProvider();
    const [item] = provider.getChildren();
    assert.equal(item.contextValue, 'contextFile');
  });

  it('item checkboxState is Checked for an included file', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const provider = new ContextFileTreeProvider();
    const [item] = provider.getChildren();
    assert.equal(item.checkboxState, vscodeMock.TreeItemCheckboxState.Checked);
  });

  it('item checkboxState is Unchecked for an excluded file', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const stateItem = { uriString: uri.toString() };
    handleCheckboxStateChange([[stateItem, vscodeMock.TreeItemCheckboxState.Unchecked]]);
    const provider = new ContextFileTreeProvider();
    const [treeItem] = provider.getChildren();
    assert.equal(treeItem.checkboxState, vscodeMock.TreeItemCheckboxState.Unchecked);
  });

  it('item description includes compression savings percentage when compression reduces tokens', async () => {
    // Commented text compresses significantly under stripComments
    mockReadFileAsText = async () => '// comment one\n// comment two\n// comment three\nconst x = 1;';
    await applyCompressionMode('stripComments');
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const provider = new ContextFileTreeProvider();
    const [item] = provider.getChildren();
    assert.ok(item.description.includes('tokens'), 'description should include the word "tokens"');
    assert.ok(item.description.includes('%'), 'description should include a savings percentage');
    assert.ok(item.description.includes('-'), 'description should show a reduction');
  });

  it('fires onDidChangeTreeData when files are added to context', async () => {
    const provider = new ContextFileTreeProvider();
    let fired = false;
    provider.onDidChangeTreeData(() => { fired = true; });
    const uri = makeUri('/project/src/new.js');
    await addFilesToContext([uri]);
    assert.ok(fired, 'onDidChangeTreeData should fire when context changes');
  });

  it('fires onDidChangeTreeData when context is cleared', async () => {
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const provider = new ContextFileTreeProvider();
    let fired = false;
    provider.onDidChangeTreeData(() => { fired = true; });
    clearAllContext();
    assert.ok(fired, 'onDidChangeTreeData should fire when context is cleared');
  });

  it('reflects multiple files when several are added', async () => {
    const uriA = makeUri('/project/src/a.js');
    const uriB = makeUri('/project/src/b.ts');
    const uriC = makeUri('/project/src/c.py');
    await addFilesToContext([uriA, uriB, uriC]);
    const provider = new ContextFileTreeProvider();
    const items = provider.getChildren();
    assert.equal(items.length, 3);
  });
});

describe('assemblePromptText — with workspace root', () => {
  const path = require('path');

  beforeEach(() => {
    initialize(mockEncoder);
    clearAllContext();
  });

  afterEach(() => {
    vscodeMock.workspace.workspaceFolders = null;
  });

  it('uses a workspace-relative path as the heading when workspaceFolders is set', async () => {
    vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: '/project' } }];
    mockReadFileAsText = async () => 'const x = 1;';
    const uri = makeUri('/project/src/index.js');
    await addFilesToContext([uri]);
    const result = await assemblePromptText();
    const expectedPath = path.join('src', 'index.js');
    assert.ok(result.includes(`### ${expectedPath}`), `heading should be "${expectedPath}"`);
  });
});
