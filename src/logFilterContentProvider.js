'use strict';

const vscode = require('vscode');

const LOG_FILTER_SCHEME = 'line-filter';

class LogFilterContentProvider {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
    this._contentMap = new Map();
  }

  static createUri(counter) {
    return vscode.Uri.parse(`${LOG_FILTER_SCHEME}://result/filter-${counter}.log`);
  }

  setContent(uri, content) {
    this._contentMap.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  provideTextDocumentContent(uri) {
    return this._contentMap.get(uri.toString()) ?? '';
  }
}

module.exports = { LogFilterContentProvider, LOG_FILTER_SCHEME };
