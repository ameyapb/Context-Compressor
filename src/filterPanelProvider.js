'use strict';

const vscode = require('vscode');
const { parseFilterHeader } = require('./logFilter');

const GROUP_ID_ACTIVE_FILTER = 'active-filter';
const GROUP_ID_ACTIONS = 'actions';

const COMMAND_FILTER_LINES = 'token-budget-builder.filterLines';
const COMMAND_FILTER_LINES_INVERSE = 'token-budget-builder.filterLinesInverse';
const COMMAND_FILTER_FROM_SELECTION = 'token-budget-builder.filterLinesFromSelection';
const COMMAND_SET_CONTEXT_LINES = 'token-budget-builder.setContextLines';
const COMMAND_SAVE_FILTER_RESULT = 'token-budget-builder.saveFilterResult';
const COMMAND_CLEAR_FILTER_HISTORY = 'token-budget-builder.clearFilterHistory';

const SELECTION_PREVIEW_MAX_LENGTH = 25;
const CONTEXT_VALUE_FILTER_SOURCE = 'filterSource';
const CONTEXT_VALUE_FILTER_HISTORY_GROUP = 'filterHistoryGroup';

function buildFilterState(firstLine) {
  const parsed = parseFilterHeader(firstLine);
  if (!parsed) return { hasFilter: false };
  return {
    hasFilter: true,
    chain: parsed.chain,
    source: parsed.source,
    matched: parsed.matched,
    total: parsed.total,
  };
}

class FilterGroupItem extends vscode.TreeItem {
  constructor(id, label, iconId) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.id = id;
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.contextValue = 'filterGroup';
  }
}

class FilterInfoItem extends vscode.TreeItem {
  constructor(label, description, iconId) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.contextValue = 'filterInfo';
  }
}

class FilterSourceItem extends vscode.TreeItem {
  constructor(sourceBasename, sourceUri) {
    super(sourceBasename, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('file-text');
    this.contextValue = CONTEXT_VALUE_FILTER_SOURCE;
    if (sourceUri) {
      this.command = { command: 'vscode.open', title: 'Open source file', arguments: [sourceUri] };
      this.tooltip = sourceUri.fsPath;
    }
  }
}

class FilterHistoryGroupItem extends vscode.TreeItem {
  constructor(entry, isActive) {
    const chainLabel = entry.chain.map((pattern, i) => {
      const count = entry.chainStepCounts?.[i];
      return count !== undefined ? `${pattern} (${count.toLocaleString()})` : pattern;
    }).join(' > ');
    super(chainLabel, vscode.TreeItemCollapsibleState.Collapsed);
    this.entry = entry;
    const pct = entry.total > 0 ? Math.round((entry.matched / entry.total) * 100) : 0;
    this.description = `${entry.matched.toLocaleString()} matched (${pct}%)`;
    this.iconPath = new vscode.ThemeIcon(isActive ? 'eye' : 'filter');
    this.contextValue = CONTEXT_VALUE_FILTER_HISTORY_GROUP;
    this.command = { command: 'vscode.open', title: 'Open filter result', arguments: [entry.uri] };
    this.tooltip = `Source: ${entry.source}\nMatched: ${entry.matched.toLocaleString()} of ${entry.total.toLocaleString()} lines`;
  }
}

class FilterActionItem extends vscode.TreeItem {
  constructor(label, commandId, iconId, tooltip, description) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.tooltip = tooltip;
    this.description = description || '';
    this.command = { command: commandId, title: label };
    this.contextValue = 'filterAction';
  }
}

class FilterPanelProvider {
  constructor(getContextLines, getFilterHistory, getActiveEditorUri, getIsActiveEditorFilterResult) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._getContextLines = getContextLines;
    this._getFilterHistory = getFilterHistory;
    this._getActiveEditorUri = getActiveEditorUri;
    this._getIsActiveEditorFilterResult = getIsActiveEditorFilterResult;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      return [
        new FilterGroupItem(GROUP_ID_ACTIVE_FILTER, 'Filter Summary', 'history'),
        new FilterGroupItem(GROUP_ID_ACTIONS, 'Actions', 'list-unordered'),
      ];
    }

    if (element.id === GROUP_ID_ACTIVE_FILTER) {
      return this._buildHistoryItems();
    }

    if (element.id === GROUP_ID_ACTIONS) {
      return this._buildActionItems();
    }

    if (element instanceof FilterHistoryGroupItem) {
      return this._buildHistoryGroupChildren(element.entry);
    }

    return [];
  }

  _buildHistoryItems() {
    const history = this._getFilterHistory();
    if (history.length === 0) {
      return [new FilterInfoItem('Open a file and use an action below', '', 'info')];
    }
    const activeUriStr = this._getActiveEditorUri?.()?.toString();
    const items = history.map((entry) =>
      new FilterHistoryGroupItem(entry, entry.uri.toString() === activeUriStr)
    );
    items.push(new FilterActionItem('Clear history', COMMAND_CLEAR_FILTER_HISTORY, 'clear-all', 'Reset all filter history.'));
    return items;
  }

  _buildHistoryGroupChildren(entry) {
    const items = [];
    items.push(new FilterSourceItem(entry.source, entry.sourceUri));
    entry.chain.forEach((pattern, index) => {
      const stepCount = entry.chainStepCounts?.[index];
      const denominator = index === 0
        ? entry.total
        : entry.chainStepCounts?.[index - 1];
      const countStr = (stepCount !== undefined && denominator !== undefined)
        ? `${stepCount.toLocaleString()} of ${denominator.toLocaleString()}`
        : `step ${index + 1} of ${entry.chain.length}`;
      items.push(new FilterInfoItem(`"${pattern}"`, countStr, 'search'));
    });
    return items;
  }

  _buildActionItems() {
    const editor = vscode.window.activeTextEditor;
    const hasSelection = editor && !editor.selection.isEmpty;
    const rawSelectionText = hasSelection
      ? editor.document.getText(editor.selection).trim()
      : null;
    const selectionPreview = rawSelectionText
      ? rawSelectionText.slice(0, SELECTION_PREVIEW_MAX_LENGTH)
      : null;

    const fromSelectionLabel = selectionPreview
      ? `From selection: "${selectionPreview}"`
      : 'From selection';
    const fromSelectionDescription = selectionPreview ? '' : '(select text first)';

    const contextLines = this._getContextLines();
    const contextLabel = contextLines === 0
      ? 'Context: none'
      : `Context: ${contextLines} line${contextLines === 1 ? '' : 's'} around matches`;

    const onResult = this._getIsActiveEditorFilterResult?.();
    const keepLabel = onResult ? 'Keep matching lines in result...' : 'Keep matching lines...';
    const removeLabel = onResult ? 'Remove matching lines in result...' : 'Remove matching lines...';

    const items = [
      new FilterActionItem(
        keepLabel,
        COMMAND_FILTER_LINES,
        'check',
        'Keep only lines containing this text. Wrap in /slashes/ for regex, e.g. /\\bERROR\\b/i.'
      ),
      new FilterActionItem(
        removeLabel,
        COMMAND_FILTER_LINES_INVERSE,
        'close',
        'Remove all lines containing this text. Wrap in /slashes/ for regex.'
      ),
      new FilterActionItem(
        fromSelectionLabel,
        COMMAND_FILTER_FROM_SELECTION,
        'selection',
        'Keep only lines containing the selected text (literal match, case-insensitive).',
        fromSelectionDescription
      ),
      new FilterActionItem(
        contextLabel,
        COMMAND_SET_CONTEXT_LINES,
        'unfold',
        'Set how many lines to include above and below each match. Click to change.'
      ),
    ];

    if (onResult) {
      items.push(new FilterActionItem(
        'Save result to file...',
        COMMAND_SAVE_FILTER_RESULT,
        'save',
        'Save this filter result as a file on disk.'
      ));
    }

    return items;
  }
}

module.exports = {
  FilterPanelProvider,
  buildFilterState,
  FilterSourceItem,
  CONTEXT_VALUE_FILTER_SOURCE,
  FilterHistoryGroupItem,
  CONTEXT_VALUE_FILTER_HISTORY_GROUP,
};
