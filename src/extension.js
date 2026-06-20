const vscode = require('vscode');
const { SUPPORTED_MODELS, DEFAULT_MODEL_ID, getEncoderForModel, getModelById } = require('./models');
const { collectFileUris, countTokensInUris } = require('./folderCounter');
const {
  ContextFileTreeProvider,
  initialize: initializeContextBuilder,
  addFilesToContext,
  removeFileFromContext,
  clearAllContext,
  applyCompressionMode,
  applyNewEncoder,
  handleCheckboxStateChange,
  getTotalIncludedTokens,
  formatBudget,
  assemblePromptText,
  getCompressionModeId,
  getCompressionModeLabel,
} = require('./contextBuilder');
const { COMPRESSION_MODES } = require('./compressor');

const GLOBAL_STATE_MODEL_KEY = 'token-budget-builder.selectedModelId';
const STATUS_BAR_PRIORITY = 100;
const DEBOUNCE_DELAY_MS = 300;
const BUDGET_WARNING_THRESHOLD = 0.9;

let statusBarItem;
let debounceTimer;
let currentModelId;
let treeView;

function countTokensInText(text) {
  return getEncoderForModel(currentModelId)(text).length;
}

function refreshStatusBarFromActiveEditor() {
  const editor = vscode.window.activeTextEditor;
  const model = getModelById(currentModelId);
  if (!editor) {
    statusBarItem.hide();
    return;
  }
  const count = countTokensInText(editor.document.getText());
  statusBarItem.text = `$(symbol-numeric) ${count.toLocaleString()} tokens  •  ${model.label}`;
  statusBarItem.tooltip = `Active file token count`;
  statusBarItem.backgroundColor = undefined;
  statusBarItem.show();
}

function refreshContextDisplay() {
  if (!treeView) return;
  const model = getModelById(currentModelId);
  const total = getTotalIncludedTokens();
  const budgetText = formatBudget(total, model.contextWindow);
  const compressionLabel = getCompressionModeLabel();
  treeView.description = compressionLabel !== 'None'
    ? `${budgetText}  •  ${compressionLabel}`
    : budgetText;
  if (total > 0) {
    const contextWindowK = Math.round(model.contextWindow / 1000);
    statusBarItem.text = `$(symbol-numeric) ${total.toLocaleString()} / ${contextWindowK}K tokens  •  ${model.label}`;
    statusBarItem.tooltip = `Token budget: ${budgetText}`;
    if (total > model.contextWindow) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (total > model.contextWindow * BUDGET_WARNING_THRESHOLD) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.show();
  } else {
    refreshStatusBarFromActiveEditor();
  }
}

function activate(context) {
  currentModelId = context.globalState.get(GLOBAL_STATE_MODEL_KEY, DEFAULT_MODEL_ID);

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    STATUS_BAR_PRIORITY
  );
  statusBarItem.command = 'token-budget-builder.countTokens';
  context.subscriptions.push(statusBarItem);

  const contextFileTreeProvider = new ContextFileTreeProvider();
  treeView = vscode.window.createTreeView('token-budget-builder-files', {
    treeDataProvider: contextFileTreeProvider,
    showCollapseAll: false,
    manageCheckboxStateManually: false,
  });
  treeView.title = 'Context Files';
  context.subscriptions.push(treeView);

  initializeContextBuilder(getEncoderForModel(currentModelId));
  refreshContextDisplay();

  context.subscriptions.push(
    treeView.onDidChangeCheckboxState((event) => {
      handleCheckboxStateChange(event.items);
      refreshContextDisplay();
    })
  );

  const countTokensCommand = vscode.commands.registerCommand(
    'token-budget-builder.countTokens',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('No active file open.');
        return;
      }
      const count = countTokensInText(editor.document.getText());
      const model = getModelById(currentModelId);
      vscode.window.showInformationMessage(
        `Token count: ${count.toLocaleString()} (${model.label})`
      );
    }
  );
  context.subscriptions.push(countTokensCommand);

  const selectModelCommand = vscode.commands.registerCommand(
    'token-budget-builder.selectModel',
    async () => {
      const selected = await vscode.window.showQuickPick(SUPPORTED_MODELS, {
        placeHolder: 'Select model for token counting',
      });
      if (!selected) return;
      currentModelId = selected.id;
      await context.globalState.update(GLOBAL_STATE_MODEL_KEY, currentModelId);
      await applyNewEncoder(getEncoderForModel(currentModelId));
      refreshContextDisplay();
    }
  );
  context.subscriptions.push(selectModelCommand);

  const countFolderTokensCommand = vscode.commands.registerCommand(
    'token-budget-builder.countFolderTokens',
    async (uri, selectedUris) => {
      const targetUris = selectedUris && selectedUris.length > 0
        ? selectedUris
        : uri ? [uri] : [];
      if (targetUris.length === 0) {
        vscode.window.showInformationMessage('No files or folders selected.');
        return;
      }
      const encoderFn = getEncoderForModel(currentModelId);
      const model = getModelById(currentModelId);
      try {
        const { totalTokenCount, fileCount } = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Counting tokens...',
            cancellable: false,
          },
          () => countTokensInUris(targetUris, encoderFn)
        );
        vscode.window.showInformationMessage(
          `Total: ${totalTokenCount.toLocaleString()} tokens across ${fileCount} file${fileCount === 1 ? '' : 's'} (${model.label})`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Prompt Context Builder: failed to count tokens — ${error.message}`
        );
      }
    }
  );
  context.subscriptions.push(countFolderTokensCommand);

  const addToContextCommand = vscode.commands.registerCommand(
    'token-budget-builder.addToContext',
    async (uri, selectedUris) => {
      let targetUris;
      if (selectedUris && selectedUris.length > 0) {
        targetUris = selectedUris;
      } else if (uri) {
        targetUris = [uri];
      } else {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: true,
          canSelectFolders: true,
          openLabel: 'Add to Context',
        });
        if (!picked || picked.length === 0) return;
        targetUris = picked;
      }

      const allFileUris = (
        await Promise.all(targetUris.map((u) => collectFileUris(u)))
      ).flat();

      if (allFileUris.length === 0) {
        vscode.window.showInformationMessage('No files found in the selection.');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Adding files to context...',
          cancellable: false,
        },
        () => addFilesToContext(allFileUris)
      );
      refreshContextDisplay();
    }
  );
  context.subscriptions.push(addToContextCommand);

  const removeFromContextCommand = vscode.commands.registerCommand(
    'token-budget-builder.removeFromContext',
    (item) => {
      if (!item || !item.uriString) return;
      removeFileFromContext(item.uriString);
      refreshContextDisplay();
    }
  );
  context.subscriptions.push(removeFromContextCommand);

  const clearContextCommand = vscode.commands.registerCommand(
    'token-budget-builder.clearContext',
    () => {
      clearAllContext();
      refreshContextDisplay();
    }
  );
  context.subscriptions.push(clearContextCommand);

  const setCompressionModeCommand = vscode.commands.registerCommand(
    'token-budget-builder.setCompressionMode',
    async () => {
      const currentModeId = getCompressionModeId();
      const items = COMPRESSION_MODES.map((mode) => ({
        ...mode,
        picked: mode.id === currentModeId,
      }));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select compression mode for context assembly',
      });
      if (!selected) return;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Applying compression...',
          cancellable: false,
        },
        () => applyCompressionMode(selected.id)
      );
      refreshContextDisplay();
    }
  );
  context.subscriptions.push(setCompressionModeCommand);

  const assemblePromptCommand = vscode.commands.registerCommand(
    'token-budget-builder.assemblePrompt',
    async () => {
      const model = getModelById(currentModelId);
      const totalTokens = getTotalIncludedTokens();

      if (totalTokens === 0) {
        vscode.window.showInformationMessage(
          'No files are included in the context. Add files via right-click in the Explorer.'
        );
        return;
      }

      if (totalTokens > model.contextWindow) {
        const overage = (totalTokens - model.contextWindow).toLocaleString();
        const choice = await vscode.window.showWarningMessage(
          `Context is ${overage} tokens over the ${model.label} limit. Copy anyway?`,
          'Copy Anyway',
          'Cancel'
        );
        if (choice !== 'Copy Anyway') return;
      }

      const promptText = await assemblePromptText();
      if (!promptText) {
        vscode.window.showInformationMessage('All included files are empty.');
        return;
      }

      await vscode.env.clipboard.writeText(promptText);
      vscode.window.showInformationMessage(
        `Copied ${totalTokens.toLocaleString()} tokens to clipboard.`
      );
    }
  );
  context.subscriptions.push(assemblePromptCommand);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refreshContextDisplay())
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || event.document !== editor.document) return;
      if (getTotalIncludedTokens() > 0) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => refreshStatusBarFromActiveEditor(), DEBOUNCE_DELAY_MS);
    })
  );
}

function deactivate() {
  clearTimeout(debounceTimer);
}

module.exports = { activate, deactivate };
