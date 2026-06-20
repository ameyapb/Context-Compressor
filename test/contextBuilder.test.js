'use strict';

const assert = require('node:assert/strict');
const Module = require('module');

// Minimal vscode stub so contextBuilder can be required outside the Extension Host.
// Only the surface area actually used by contextBuilder is implemented.
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
  workspace: { workspaceFolders: null },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

delete require.cache[require.resolve('../src/contextBuilder')];
const {
  formatBudget,
  getCompressionModeLabel,
  getTotalIncludedTokens,
  initialize,
  clearAllContext,
  applyCompressionMode,
} = require('../src/contextBuilder');

Module._load = originalLoad;

// One token per 4 characters — simple and deterministic.
const mockEncoder = (text) =>
  Array.from({ length: Math.max(1, Math.ceil(text.length / 4)) }, (_, i) => i);

describe('formatBudget', () => {
  it('formats total and window with thousands separators and a percentage', () => {
    const result = formatBudget(1000, 10000);
    assert.ok(result.includes('1,000'), 'should format total with thousands separator');
    assert.ok(result.includes('10,000'), 'should format context window with thousands separator');
    assert.ok(result.includes('10.0%'), 'should include the percentage');
  });

  it('shows 0.0% when total is zero', () => {
    const result = formatBudget(0, 128000);
    assert.ok(result.startsWith('0 /'), 'total should be 0');
    assert.ok(result.includes('0.0%'));
  });

  it('shows 100.0% when total equals the context window', () => {
    const result = formatBudget(128000, 128000);
    assert.ok(result.includes('100.0%'));
  });

  it('shows a percentage above 100 when over budget', () => {
    const result = formatBudget(200000, 128000);
    const match = result.match(/([\d.]+)%/);
    assert.ok(match, 'result should contain a percentage value');
    assert.ok(parseFloat(match[1]) > 100, 'percentage should exceed 100 when over budget');
  });

  it('returns 0.0% without dividing by zero when context window is zero', () => {
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

describe('getTotalIncludedTokens', () => {
  before(() => {
    initialize(mockEncoder);
    clearAllContext();
  });

  it('returns 0 when no files are in context', () => {
    assert.equal(getTotalIncludedTokens(), 0);
  });
});
