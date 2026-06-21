const vscode = require('vscode');

const ITEM_ID_MODEL = 'model';
const ITEM_ID_COMPRESSION = 'compression';
const ITEM_ID_COPY = 'copy';

class BuildPromptItem extends vscode.TreeItem {
  constructor(id, label, description, commandId, tooltip) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = id;
    this.description = description;
    this.tooltip = tooltip;
    this.command = {
      command: commandId,
      title: label,
    };
  }
}

class BuildPromptTreeProvider {
  constructor(getModelLabel, getCompressionLabel) {
    this._getModelLabel = getModelLabel;
    this._getCompressionLabel = getCompressionLabel;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    return [
      new BuildPromptItem(
        ITEM_ID_MODEL,
        'Model',
        this._getModelLabel(),
        'token-budget-builder.selectModel',
        'The model used for token counting. Click to switch models.'
      ),
      new BuildPromptItem(
        ITEM_ID_COMPRESSION,
        'Compression',
        this._getCompressionLabel(),
        'token-budget-builder.setCompressionMode',
        'How files are compressed before copying. Click to change the compression mode.'
      ),
      new BuildPromptItem(
        ITEM_ID_COPY,
        'Copy Prompt',
        '',
        'token-budget-builder.assemblePrompt',
        'Assemble all checked files into a formatted prompt and copy it to the clipboard.'
      ),
    ];
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }
}

module.exports = { BuildPromptTreeProvider };
