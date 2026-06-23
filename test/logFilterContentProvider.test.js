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
  it('equals "log-filter"', () => {
    assert.equal(LOG_FILTER_SCHEME, 'log-filter');
  });
});

describe('LogFilterContentProvider.createUri', () => {
  it('returns an object whose string form starts with the log-filter scheme', () => {
    const uri = LogFilterContentProvider.createUri(0);
    assert.ok(uri.toString().startsWith('log-filter://'));
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

describe('LogFilterContentProvider — disposeUri', () => {
  it('returns empty string after the URI is disposed', () => {
    const provider = new LogFilterContentProvider();
    const uri = LogFilterContentProvider.createUri(0);
    provider.setContent(uri, 'data');
    provider.disposeUri(uri);
    assert.equal(provider.provideTextDocumentContent(uri), '');
  });

  it('does not throw when disposing a URI that was never set', () => {
    const provider = new LogFilterContentProvider();
    const uri = LogFilterContentProvider.createUri(99);
    assert.doesNotThrow(() => provider.disposeUri(uri));
  });

  it('disposing one URI does not affect content at another URI', () => {
    const provider = new LogFilterContentProvider();
    const uriA = LogFilterContentProvider.createUri(1);
    const uriB = LogFilterContentProvider.createUri(2);
    provider.setContent(uriA, 'a');
    provider.setContent(uriB, 'b');
    provider.disposeUri(uriA);
    assert.equal(provider.provideTextDocumentContent(uriB), 'b');
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
