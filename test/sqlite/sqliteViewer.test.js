'use strict';

const assert = require('node:assert/strict');
const { buildSqliteViewerHtml, escapeHtml } = require('../../src/sqlite/sqliteViewer');

const MINIMAL_SCHEMA = [
  { name: 'id', type: 'INT' },
  { name: 'content', type: 'TEXT' },
];
const MINIMAL_ROWS = [[1, 'hello']];
const MINIMAL_TABLES = [{ name: 'items', rowCount: 1 }];

function buildHtml(overrides = {}) {
  return buildSqliteViewerHtml(
    overrides.fileName ?? 'test.db',
    overrides.tables ?? MINIMAL_TABLES,
    overrides.activeTable ?? 'items',
    overrides.schema ?? MINIMAL_SCHEMA,
    overrides.rows ?? MINIMAL_ROWS,
    overrides.totalRows ?? 1
  );
}

describe('escapeHtml', function () {
  it('escapes ampersands', function () {
    assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
  });
  it('escapes less-than and greater-than', function () {
    assert.strictEqual(escapeHtml('<b>'), '&lt;b&gt;');
  });
  it('escapes double quotes', function () {
    assert.strictEqual(escapeHtml('"hi"'), '&quot;hi&quot;');
  });
  it('leaves plain text unchanged', function () {
    assert.strictEqual(escapeHtml('hello world'), 'hello world');
  });
});

describe('buildSqliteViewerHtml', function () {
  it('returns a valid HTML document', function () {
    const html = buildHtml();
    assert.ok(html.startsWith('<!DOCTYPE html>'), 'must start with doctype');
    assert.ok(html.includes('</html>'), 'must close html tag');
  });

  it('includes the file name in the page', function () {
    const html = buildHtml({ fileName: 'mydb.db' });
    assert.ok(html.includes('mydb.db'));
  });

  it('escapes file names that contain HTML characters', function () {
    const html = buildHtml({ fileName: '<img onerror=alert(1)>.db' });
    assert.ok(!html.includes('<img onerror'), 'unescaped tag must not appear');
    assert.ok(html.includes('&lt;img'), 'tag must be escaped');
  });

  it('includes the active table name', function () {
    const html = buildHtml();
    assert.ok(html.includes('items'));
  });

  it('contains containsHtmlTags for detecting HTML cell values', function () {
    const html = buildHtml();
    assert.ok(html.includes('containsHtmlTags'), 'HTML detection function must be present in webview script');
  });

  it('contains attachHtmlRenderToggle for rendering HTML cell values', function () {
    const html = buildHtml();
    assert.ok(
      html.includes('attachHtmlRenderToggle'),
      'HTML render toggle function must be present — removing it breaks the Render HTML button feature'
    );
  });

  it('contains the Render HTML button label', function () {
    const html = buildHtml();
    assert.ok(html.includes('Render HTML'), '"Render HTML" button label must be present in webview script');
  });

  it('contains the Show raw button label for toggling back', function () {
    const html = buildHtml();
    assert.ok(html.includes('Show raw'), '"Show raw" button label must be present in webview script');
  });

  it('contains the html-preview CSS class for the rendered HTML container', function () {
    const html = buildHtml();
    assert.ok(html.includes('html-preview'), 'html-preview CSS class must be present');
  });

  it('renders with an empty table list without throwing', function () {
    assert.doesNotThrow(() => buildHtml({ tables: [], activeTable: null, schema: [], rows: [], totalRows: 0 }));
  });

  it('carries the current search term when switching tables instead of clearing it', function () {
    const html = buildHtml();
    assert.ok(
      html.includes("vscode.postMessage({ type: 'selectTable', tableName, search: state.search });"),
      'selectTable must forward the current search term to the extension host'
    );
    assert.ok(
      !html.includes("state.activeTable = tableName;\n        state.search = '';"),
      'selectTable must not reset the search term when switching tables'
    );
  });
});
