const vscode = require('vscode');
const { SUPPORTED_MODELS, DEFAULT_MODEL_ID, getEncoderForModel, getModelById } = require('./models');

const GLOBAL_STATE_MODEL_KEY = 'context-compressor.selectedModelId';
const STATUS_BAR_PRIORITY = 100;
const DEBOUNCE_DELAY_MS = 300;

let statusBarItem;
let debounceTimer;
let currentModelId;

function countTokens(text) {
  return getEncoderForModel(currentModelId)(text).length;
}

function updateStatusBar(text) {
  const count = countTokens(text);
  const model = getModelById(currentModelId);
  statusBarItem.text = `$(symbol-numeric) ${count.toLocaleString()} tokens`;
  statusBarItem.tooltip = `Token count for ${model.label} (${model.encoding})`;
  statusBarItem.show();
}

function refreshFromActiveEditor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    statusBarItem.hide();
    return;
  }
  updateStatusBar(editor.document.getText());
}

function activate(context) {
  currentModelId = context.globalState.get(GLOBAL_STATE_MODEL_KEY, DEFAULT_MODEL_ID);

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    STATUS_BAR_PRIORITY
  );
  statusBarItem.command = 'context-compressor.countTokens';
  context.subscriptions.push(statusBarItem);

  refreshFromActiveEditor();

  const countTokensCommand = vscode.commands.registerCommand(
    'context-compressor.countTokens',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('No active file open.');
        return;
      }
      const count = countTokens(editor.document.getText());
      const model = getModelById(currentModelId);
      vscode.window.showInformationMessage(
        `Token count: ${count.toLocaleString()} (${model.label})`
      );
    }
  );
  context.subscriptions.push(countTokensCommand);

  const selectModelCommand = vscode.commands.registerCommand(
    'context-compressor.selectModel',
    async () => {
      const selected = await vscode.window.showQuickPick(SUPPORTED_MODELS, {
        placeHolder: 'Select model for token counting',
      });
      if (!selected) return;
      currentModelId = selected.id;
      await context.globalState.update(GLOBAL_STATE_MODEL_KEY, currentModelId);
      refreshFromActiveEditor();
    }
  );
  context.subscriptions.push(selectModelCommand);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refreshFromActiveEditor())
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || event.document !== editor.document) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updateStatusBar(event.document.getText());
      }, DEBOUNCE_DELAY_MS);
    })
  );
}

function deactivate() {
  clearTimeout(debounceTimer);
}

module.exports = { activate, deactivate };
