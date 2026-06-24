'use strict';

const assert = require('node:assert/strict');
const Module = require('module');

const firedUris = [];

const vscodeMock = {
  EventEmitter: class {
    constructor() {
      this._listeners = [];
    }
    get event() {
      return (listener) => { this._listeners.push(listener); };
    }
    fire(data) {
      firedUris.push(data);
      for (const listener of this._listeners) listener(data);
    }
  },
  Uri: {
    parse: (str) => ({ toString: () => str, _raw: str }),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

delete require.cache[require.resolve('../src/logFilterContentProvider')];
const { LogFilterContentProvider, LOG_FILTER_SCHEME } = require('../src/logFilterContentProvider');

describe('LOG_FILTER_SCHEME constant', () => {
  it('equals "line-filter"', () => {
    assert.equal(LOG_FILTER_SCHEME, 'line-filter');
  });
});

describe('LogFilterContentProvider.createUri', () => {
  it('returns an object whose string form starts with the line-filter scheme', () => {
    const uri = LogFilterContentProvider.createUri(0);
    assert.ok(uri.toString().startsWith('line-filter://'));
  });

  it('embeds the counter value in the URI string', () => {
    const uri = LogFilterContentProvider.createUri(7);
    assert.ok(uri.toString().includes('7'));
  });

  it('ends with .log so VS Code auto-detects the log language', () => {
    const uri = LogFilterContentProvider.createUri(1);
    assert.ok(uri.toString().endsWith('.log'));
  });

  it('produces distinct URIs for different counter values', () => {
    const a = LogFilterContentProvider.createUri(1);
    const b = LogFilterContentProvider.createUri(2);
    assert.notEqual(a.toString(), b.toString());
  });
});

describe('LogFilterContentProvider — setContent and provideTextDocumentContent', () => {
  it('returns empty string for an unknown URI', () => {
    const provider = new LogFilterContentProvider();
    const uri = LogFilterContentProvider.createUri(0);
    assert.equal(provider.provideTextDocumentContent(uri), '');
  });

  it('returns content after setContent is called with that URI', () => {
    const provider = new LogFilterContentProvider();
    const uri = LogFilterContentProvider.createUri(0);
    provider.setContent(uri, 'hello\nworld');
    assert.equal(provider.provideTextDocumentContent(uri), 'hello\nworld');
  });

  it('replaces content when setContent is called twice with the same URI', () => {
    const provider = new LogFilterContentProvider();
    const uri = LogFilterContentProvider.createUri(0);
    provider.setContent(uri, 'first');
    provider.setContent(uri, 'second');
    assert.equal(provider.provideTextDocumentContent(uri), 'second');
  });

  it('isolates content between different URIs', () => {
    const provider = new LogFilterContentProvider();
    const uriA = LogFilterContentProvider.createUri(1);
    const uriB = LogFilterContentProvider.createUri(2);
    provider.setContent(uriA, 'content-a');
    provider.setContent(uriB, 'content-b');
    assert.equal(provider.provideTextDocumentContent(uriA), 'content-a');
    assert.equal(provider.provideTextDocumentContent(uriB), 'content-b');
  });

  it('stores content with empty string correctly', () => {
    const provider = new LogFilterContentProvider();
    const uri = LogFilterContentProvider.createUri(0);
    provider.setContent(uri, '');
    assert.equal(provider.provideTextDocumentContent(uri), '');
  });
});

describe('LogFilterContentProvider — setSourceUri and getSourceUri', () => {
  const makeSourceUri = (path) => ({ toString: () => `file://${path}`, fsPath: path });

  it('returns null for an unknown result URI', () => {
    const provider = new LogFilterContentProvider();
    const resultUri = LogFilterContentProvider.createUri(0);
    assert.equal(provider.getSourceUri(resultUri), null);
  });

  it('returns the stored URI after setSourceUri is called', () => {
    const provider = new LogFilterContentProvider();
    const resultUri = LogFilterContentProvider.createUri(0);
    const sourceUri = makeSourceUri('/logs/server.log');
    provider.setSourceUri(resultUri, sourceUri);
    assert.equal(provider.getSourceUri(resultUri), sourceUri);
  });

  it('returns the most recent URI when setSourceUri is called twice for the same result URI', () => {
    const provider = new LogFilterContentProvider();
    const resultUri = LogFilterContentProvider.createUri(0);
    const firstSource = makeSourceUri('/logs/a.log');
    const secondSource = makeSourceUri('/logs/b.log');
    provider.setSourceUri(resultUri, firstSource);
    provider.setSourceUri(resultUri, secondSource);
    assert.equal(provider.getSourceUri(resultUri), secondSource);
  });

  it('isolates source URIs between different result URIs', () => {
    const provider = new LogFilterContentProvider();
    const uriA = LogFilterContentProvider.createUri(1);
    const uriB = LogFilterContentProvider.createUri(2);
    const sourceA = makeSourceUri('/logs/a.log');
    const sourceB = makeSourceUri('/logs/b.log');
    provider.setSourceUri(uriA, sourceA);
    provider.setSourceUri(uriB, sourceB);
    assert.equal(provider.getSourceUri(uriA), sourceA);
    assert.equal(provider.getSourceUri(uriB), sourceB);
  });

  it('source map and content map are independent', () => {
    const provider = new LogFilterContentProvider();
    const resultUri = LogFilterContentProvider.createUri(0);
    const sourceUri = makeSourceUri('/logs/server.log');
    provider.setSourceUri(resultUri, sourceUri);
    assert.equal(provider.provideTextDocumentContent(resultUri), '');
    provider.setContent(resultUri, 'some content');
    assert.equal(provider.getSourceUri(resultUri), sourceUri);
  });
});

describe('LogFilterContentProvider — clearAll', () => {
  const makeSourceUri = (path) => ({ toString: () => `file://${path}`, fsPath: path });

  it('does not throw when called on an empty provider', () => {
    const provider = new LogFilterContentProvider();
    assert.doesNotThrow(() => provider.clearAll());
  });

  it('makes provideTextDocumentContent return empty string after content was set', () => {
    const provider = new LogFilterContentProvider();
    const uri = LogFilterContentProvider.createUri(0);
    provider.setContent(uri, 'some data');
    provider.clearAll();
    assert.equal(provider.provideTextDocumentContent(uri), '');
  });

  it('makes getSourceUri return null after a source URI was set', () => {
    const provider = new LogFilterContentProvider();
    const resultUri = LogFilterContentProvider.createUri(0);
    provider.setSourceUri(resultUri, makeSourceUri('/logs/server.log'));
    provider.clearAll();
    assert.equal(provider.getSourceUri(resultUri), null);
  });

  it('clears content for all URIs not just the last one set', () => {
    const provider = new LogFilterContentProvider();
    const uriA = LogFilterContentProvider.createUri(1);
    const uriB = LogFilterContentProvider.createUri(2);
    provider.setContent(uriA, 'a');
    provider.setContent(uriB, 'b');
    provider.clearAll();
    assert.equal(provider.provideTextDocumentContent(uriA), '');
    assert.equal(provider.provideTextDocumentContent(uriB), '');
  });
});

describe('LogFilterContentProvider — onDidChange event', () => {
  it('fires after setContent is called', () => {
    const provider = new LogFilterContentProvider();
    const uri = LogFilterContentProvider.createUri(0);
    const received = [];
    provider.onDidChange((firedUri) => received.push(firedUri));
    provider.setContent(uri, 'data');
    assert.equal(received.length, 1);
  });

  it('fires with the URI that was updated', () => {
    const provider = new LogFilterContentProvider();
    const uri = LogFilterContentProvider.createUri(0);
    let lastFired = null;
    provider.onDidChange((firedUri) => { lastFired = firedUri; });
    provider.setContent(uri, 'data');
    assert.equal(lastFired.toString(), uri.toString());
  });
});
