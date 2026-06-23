'use strict';

const vscode = require('vscode');
const { parseFilterHeader } = require('./logFilter');

const GROUP_ID_ACTIVE_FILTER = 'active-filter';
const GROUP_ID_ACTIONS = 'actions';

const COMMAND_FILTER_LINES = 'token-budget-builder.filterLines';
const COMMAND_FILTER_LINES_INVERSE = 'token-budget-builder.filterLinesInverse';
const COMMAND_FILTER_FROM_SELECTION = 'token-budget-builder.filterLinesFromSelection';
const COMMAND_SET_CONTEXT_LINES = 'token-budget-builder.setContextLines';

const SELECTION_PREVIEW_MAX_LENGTH = 25;

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
  constructor(getContextLines) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._getContextLines = getContextLines;
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
        new FilterGroupItem(GROUP_ID_ACTIVE_FILTER, 'Active Filter', 'filter'),
        new FilterGroupItem(GROUP_ID_ACTIONS, 'Actions', 'zap'),
      ];
    }

    if (element.id === GROUP_ID_ACTIVE_FILTER) {
      return this._buildActiveFilterItems();
    }

    if (element.id === GROUP_ID_ACTIONS) {
      return this._buildActionItems();
    }

    return [];
  }

  _buildActiveFilterItems() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [new FilterInfoItem('No active editor', '', 'circle-slash')];
    }

    const firstLine = editor.document.lineAt(0).text;
    const state = buildFilterState(firstLine);

    if (!state.hasFilter) {
      return [new FilterInfoItem('No filtered document active', '', 'circle-slash')];
    }

    const items = [];
    items.push(new FilterInfoItem(state.source, '', 'file-text'));

    const stepCount = state.chain.length;
    state.chain.forEach((pattern, index) => {
      items.push(new FilterInfoItem(
        `"${pattern}"`,
        `step ${index + 1} of ${stepCount}`,
        'search'
      ));
    });

    items.push(new FilterInfoItem(
      `${state.matched.toLocaleString()} matched`,
      `of ${state.total.toLocaleString()} lines`,
      'check'
    ));

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

    return [
      new FilterActionItem(
        'Keep matching lines...',
        COMMAND_FILTER_LINES,
        'filter',
        'Keep only lines containing this text. Wrap in /slashes/ for regex, e.g. /\\bERROR\\b/i.'
      ),
      new FilterActionItem(
        'Remove matching lines...',
        COMMAND_FILTER_LINES_INVERSE,
        'filter-filled',
        'Remove all lines containing this text. Wrap in /slashes/ for regex.'
      ),
      new FilterActionItem(
        fromSelectionLabel,
        COMMAND_FILTER_FROM_SELECTION,
        'whole-word',
        'Keep only lines containing the selected text (literal match, case-insensitive).',
        fromSelectionDescription
      ),
      new FilterActionItem(
        contextLabel,
        COMMAND_SET_CONTEXT_LINES,
        'settings',
        'Set how many lines to include above and below each match. Click to change.'
      ),
    ];
  }
}

module.exports = { FilterPanelProvider, buildFilterState };
