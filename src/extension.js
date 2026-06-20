const vscode = require('vscode');
const { encode } = require('gpt-tokenizer');

let statusBarItem;
let debounceTimer;

function countTokens(text) {
  return encode(text).length;
}

function updateStatusBar(text) {
  const count = countTokens(text);
  statusBarItem.text = `$(symbol-numeric) ${count.toLocaleString()} tokens`;
  statusBarItem.tooltip = `GPT-4 token count (cl100k_base)`;
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
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'context-compressor.countTokens';
  context.subscriptions.push(statusBarItem);

  refreshFromActiveEditor();

  const command = vscode.commands.registerCommand(
    'context-compressor.countTokens',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('No active file open.');
        return;
      }
      const count = countTokens(editor.document.getText());
      vscode.window.showInformationMessage(
        `Token count: ${count.toLocaleString()} (cl100k_base / GPT-4)`
      );
    }
  );
  context.subscriptions.push(command);

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
      }, 300);
    })
  );
}

function deactivate() {
  clearTimeout(debounceTimer);
}

module.exports = { activate, deactivate };
