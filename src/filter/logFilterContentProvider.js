'use strict';

const vscode = require('vscode');

const LOG_FILTER_SCHEME = 'line-filter';

class LogFilterContentProvider {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
    this._contentMap = new Map();
    this._sourceUriMap = new Map();
  }

  static createUri(counter) {
    return vscode.Uri.parse(`${LOG_FILTER_SCHEME}://result/filter-${counter}.log`);
  }

  setContent(uri, content) {
    this._contentMap.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  setSourceUri(resultUri, sourceUri) {
    this._sourceUriMap.set(resultUri.toString(), sourceUri);
  }

  getSourceUri(resultUri) {
    return this._sourceUriMap.get(resultUri.toString()) ?? null;
  }

  clearAll() {
    this._contentMap.clear();
    this._sourceUriMap.clear();
  }

  provideTextDocumentContent(uri) {
    return this._contentMap.get(uri.toString()) ?? '';
  }
}

module.exports = { LogFilterContentProvider, LOG_FILTER_SCHEME };
