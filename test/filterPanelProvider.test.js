'use strict';

const assert = require('node:assert/strict');
const Module = require('module');

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
  TreeItemCollapsibleState: { None: 0, Expanded: 2 },
  ThemeIcon: class { constructor(id) { this.id = id; } },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

delete require.cache[require.resolve('../src/filterPanelProvider')];
const { buildFilterState } = require('../src/filterPanelProvider');

Module._load = originalLoad;

describe('buildFilterState — no filter', () => {
  it('returns hasFilter false for null', () => {
    assert.deepEqual(buildFilterState(null), { hasFilter: false });
  });

  it('returns hasFilter false for empty string', () => {
    assert.deepEqual(buildFilterState(''), { hasFilter: false });
  });

  it('returns hasFilter false for a plain line with no tag', () => {
    assert.deepEqual(buildFilterState('hello world'), { hasFilter: false });
  });

  it('returns hasFilter false for a line that starts with # but has no tag', () => {
    assert.deepEqual(buildFilterState('# just a comment'), { hasFilter: false });
  });
});

describe('buildFilterState — single-pattern header', () => {
  const singleHeader = '# [line-filter] pattern: "error" | source: server.log (23 of 4521 lines)';

  it('returns hasFilter true', () => {
    assert.equal(buildFilterState(singleHeader).hasFilter, true);
  });

  it('returns chain with one element', () => {
    const state = buildFilterState(singleHeader);
    assert.deepEqual(state.chain, ['error']);
  });

  it('returns correct source', () => {
    assert.equal(buildFilterState(singleHeader).source, 'server.log');
  });

  it('returns correct matched count', () => {
    assert.equal(buildFilterState(singleHeader).matched, 23);
  });

  it('returns correct total count', () => {
    assert.equal(buildFilterState(singleHeader).total, 4521);
  });
});

describe('buildFilterState — chained header', () => {
  const chainHeader = '# [line-filter] chain: "error" > "auth" | source: server.log (5 of 4521 lines)';

  it('returns hasFilter true', () => {
    assert.equal(buildFilterState(chainHeader).hasFilter, true);
  });

  it('returns chain with two elements in order', () => {
    const state = buildFilterState(chainHeader);
    assert.deepEqual(state.chain, ['error', 'auth']);
  });

  it('returns correct matched count', () => {
    assert.equal(buildFilterState(chainHeader).matched, 5);
  });

  it('returns correct total count', () => {
    assert.equal(buildFilterState(chainHeader).total, 4521);
  });
});

describe('buildFilterState — malformed headers', () => {
  it('returns hasFilter false when pipe marker is missing', () => {
    const header = '# [line-filter] pattern: "error"';
    assert.deepEqual(buildFilterState(header), { hasFilter: false });
  });

  it('returns hasFilter false when source segment is malformed', () => {
    const header = '# [line-filter] pattern: "error" | source: server.log (no numbers here)';
    assert.deepEqual(buildFilterState(header), { hasFilter: false });
  });
});
