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

delete require.cache[require.resolve('../../src/filter/filterPanelProvider')];
const {
  buildFilterState,
  FilterSourceItem, CONTEXT_VALUE_FILTER_SOURCE,
  FilterHistoryGroupItem, CONTEXT_VALUE_FILTER_HISTORY_GROUP,
} = require('../../src/filter/filterPanelProvider');

Module._load = originalLoad;

describe('FilterSourceItem', () => {
  const makeSourceUri = (fsPath) => ({
    toString: () => `file://${fsPath}`,
    fsPath,
  });

  it('sets label to the provided basename', () => {
    const item = new FilterSourceItem('server.log', null);
    assert.equal(item.label, 'server.log');
  });

  it('sets contextValue to CONTEXT_VALUE_FILTER_SOURCE', () => {
    const item = new FilterSourceItem('server.log', null);
    assert.equal(item.contextValue, CONTEXT_VALUE_FILTER_SOURCE);
  });

  it('has no command property when sourceUri is null', () => {
    const item = new FilterSourceItem('server.log', null);
    assert.equal(item.command, undefined);
  });

  it('has command.command set to vscode.open when sourceUri is provided', () => {
    const uri = makeSourceUri('/logs/server.log');
    const item = new FilterSourceItem('server.log', uri);
    assert.equal(item.command.command, 'vscode.open');
  });

  it('passes the sourceUri as the first command argument', () => {
    const uri = makeSourceUri('/logs/server.log');
    const item = new FilterSourceItem('server.log', uri);
    assert.equal(item.command.arguments[0], uri);
  });

  it('sets tooltip to sourceUri.fsPath when sourceUri is provided', () => {
    const uri = makeSourceUri('/logs/server.log');
    const item = new FilterSourceItem('server.log', uri);
    assert.equal(item.tooltip, '/logs/server.log');
  });
});

describe('FilterHistoryGroupItem', () => {
  const makeUri = (str) => ({ toString: () => str });
  const makeSourceUri = (fsPath) => ({ toString: () => `file://${fsPath}`, fsPath });

  const makeEntry = (overrides = {}) => ({
    uri: makeUri('line-filter://result/filter-1.log'),
    source: 'server.log',
    chain: ['ERROR'],
    matched: 42,
    total: 1000,
    sourceUri: makeSourceUri('/logs/server.log'),
    ...overrides,
  });

  it('sets label to chain patterns joined with " > "', () => {
    const item = new FilterHistoryGroupItem(makeEntry({ chain: ['ERROR', 'auth'] }));
    assert.equal(item.label, 'ERROR > auth');
  });

  it('sets label to the single pattern when chain has one entry', () => {
    const item = new FilterHistoryGroupItem(makeEntry({ chain: ['ERROR'] }));
    assert.equal(item.label, 'ERROR');
  });

  it('sets description to matched count with percentage', () => {
    const item = new FilterHistoryGroupItem(makeEntry({ matched: 42, total: 1000 }));
    assert.equal(item.description, '42 matched (4%)');
  });

  it('sets contextValue to CONTEXT_VALUE_FILTER_HISTORY_GROUP', () => {
    const item = new FilterHistoryGroupItem(makeEntry());
    assert.equal(item.contextValue, CONTEXT_VALUE_FILTER_HISTORY_GROUP);
  });

  it('stores the entry object on the item', () => {
    const entry = makeEntry();
    const item = new FilterHistoryGroupItem(entry);
    assert.equal(item.entry, entry);
  });

  it('sets command.command to vscode.open', () => {
    const item = new FilterHistoryGroupItem(makeEntry());
    assert.equal(item.command.command, 'vscode.open');
  });

  it('passes the entry uri as the first command argument', () => {
    const entry = makeEntry();
    const item = new FilterHistoryGroupItem(entry);
    assert.equal(item.command.arguments[0], entry.uri);
  });

  it('tooltip contains the source filename', () => {
    const item = new FilterHistoryGroupItem(makeEntry({ source: 'server.log' }));
    assert.ok(item.tooltip.includes('server.log'));
  });

  it('tooltip contains the matched count', () => {
    const item = new FilterHistoryGroupItem(makeEntry({ matched: 42, total: 1000 }));
    assert.ok(item.tooltip.includes('42'));
    assert.ok(item.tooltip.includes('1,000'));
  });

  it('uses filter icon when not active', () => {
    const item = new FilterHistoryGroupItem(makeEntry(), false);
    assert.equal(item.iconPath.id, 'filter');
  });

  it('uses eye icon when active', () => {
    const item = new FilterHistoryGroupItem(makeEntry(), true);
    assert.equal(item.iconPath.id, 'eye');
  });

  it('uses filter icon when isActive is not provided', () => {
    const item = new FilterHistoryGroupItem(makeEntry());
    assert.equal(item.iconPath.id, 'filter');
  });

  it('shows 0% when total is 0', () => {
    const item = new FilterHistoryGroupItem(makeEntry({ matched: 0, total: 0 }));
    assert.ok(item.description.includes('(0%)'));
  });

  it('appends step count to label when chainStepCounts is provided', () => {
    const item = new FilterHistoryGroupItem(makeEntry({ chain: ['ERROR'], chainStepCounts: [42] }));
    assert.equal(item.label, 'ERROR (42)');
  });

  it('annotates each step in a multi-step chain with its count', () => {
    const item = new FilterHistoryGroupItem(makeEntry({
      chain: ['ERROR', 'auth'],
      chainStepCounts: [100, 5],
    }));
    assert.equal(item.label, 'ERROR (100) > auth (5)');
  });

  it('omits count annotation for steps without a chainStepCounts entry', () => {
    const item = new FilterHistoryGroupItem(makeEntry({ chain: ['ERROR'], chainStepCounts: undefined }));
    assert.equal(item.label, 'ERROR');
  });
});

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
