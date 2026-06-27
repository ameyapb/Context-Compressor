const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { SUPPORTED_MODELS, DEFAULT_MODEL_ID, getEncoderForModel, getModelById } = require('./shared/models');
const { extractRelativeImportSpecifiers, buildCandidatePaths, buildTestCandidatePaths } = require('./context/relatedFilesResolver');
const { collectFileUris, countTokensInUris } = require('./context/folderCounter');
const { loadGitignorePatterns } = require('./shared/gitignoreFilter');
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
  getIncludedContextUris,
  formatBudget,
  assemblePromptText,
  getCompressionModeId,
  getCompressionModeLabel,
  isFileInContext,
} = require('./context/contextBuilder');
const { COMPRESSION_MODES } = require('./context/compressor');
const {
  getAllPresets,
  savePreset,
  deletePreset,
  derivePresetNameSuggestion,
} = require('./context/presetManager');
const {
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
  slugifyTemplateName,
} = require('./templates/templateManager');
const { FilterPanelProvider } = require('./filter/filterPanelProvider');
const { LogFilterContentProvider, LOG_FILTER_SCHEME } = require('./filter/logFilterContentProvider');
const { openSqliteViewer } = require('./sqlite/sqliteViewer');
const { openTeamTrackerPanel } = require('./team-tracker/teamTracker');
const {
  filterLines,
  FILTER_HEADER_TAG,
  CONTEXT_SEPARATOR,
  escapePatternLiteral,
  parseFilterHeader,
  buildFilterHeader,
} = require('./filter/logFilter');

const GLOBAL_STATE_MODEL_KEY = 'token-budget-builder.selectedModelId';
const GLOBAL_STATE_VERSION_KEY = 'token-budget-builder.installedVersion';
const TEMPLATE_DRAFT_FILENAME = 'template-draft.md';
const CONTEXT_LINES_STORAGE_KEY = 'log-filter-context-lines';
const RECENT_PATTERNS_STORAGE_KEY = 'filter-recent-patterns';
const RECENT_PATTERNS_MAX = 5;
const MAX_FILTER_PATTERN_LENGTH = 500;

class PromptTemplateItem extends vscode.TreeItem {
  constructor(templateId, name, body) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.templateId = templateId;
    this.iconPath = new vscode.ThemeIcon('note');
    this.contextValue = 'promptTemplate';
    const tooltip = new vscode.MarkdownString();
    tooltip.appendText(name);
    tooltip.appendText('\n\n');
    tooltip.appendText(body);
    this.tooltip = tooltip;
    this.command = {
      command: 'token-budget-builder.openTemplate',
      title: 'Open Template',
      arguments: [templateId],
    };
  }
}

class PromptTemplateTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._storage = null;
  }

  initialize(storage) {
    this._storage = storage;
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    if (!this._storage) return [];
    const templates = getAllTemplates(this._storage);
    return Object.entries(templates).map(
      ([id, { name, body }]) => new PromptTemplateItem(id, name, body)
    );
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }
}

const RELOAD_WINDOW_COMMAND = 'workbench.action.reloadWindow';
const RELOAD_NOW_LABEL = 'Reload Now';
const STATUS_BAR_PRIORITY = 100;
const DEBOUNCE_DELAY_MS = 300;
const TEMPLATE_PREVIEW_WEBVIEW_TYPE = 'token-budget-builder.templatePreview';
const TEMPLATE_PREVIEW_COPY_COMMAND = 'copy';

function generateNonce() {
  return crypto.randomBytes(24).toString('hex');
}

function buildTemplatePreviewHtml(templateName, templateBody) {
  const nonce = generateNonce();
  const escapedBody = templateBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      display: flex;
      flex-direction: column;
      height: 100vh;
      gap: 12px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    p {
      margin: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
    }
    textarea {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #454545));
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      padding: 8px;
      resize: none;
      outline: none;
      line-height: 1.5;
    }
    textarea:focus {
      border-color: var(--vscode-focusBorder);
    }
    button {
      align-self: flex-start;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      font-family: var(--vscode-font-family);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <p>Edit this copy to fill in placeholders, then copy. Changes here do not affect the saved template.</p>
  <textarea id="content" spellcheck="false">${escapedBody}</textarea>
  <button id="copyBtn">Copy to Clipboard</button>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('copyBtn').addEventListener('click', function() {
      vscode.postMessage({ command: '${TEMPLATE_PREVIEW_COPY_COMMAND}', text: document.getElementById('content').value });
    });
  </script>
</body>
</html>`;
}

function toK(n) {
  return `${Math.round(n / 1000)}K`;
}

function getWorkspaceRootFsPath() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

let statusBarItem;
let debounceTimer;
let currentModelId;
let treeView;
let contextFileTreeProvider;
let templateTreeView;
let promptTemplateTreeProvider;
let pendingTemplateSession = null;

async function closeDraftEditorTabs(draftUri) {
  const draftUriString = draftUri.toString();
  const draftTabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === draftUriString);
  if (draftTabs.length > 0) {
    await vscode.window.tabGroups.close(draftTabs);
  }
}

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
  const fileName = path.basename(editor.document.fileName);
  statusBarItem.text = `$(symbol-numeric) ${count.toLocaleString()} tokens  •  ${model.label}`;
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**${fileName}** — ${count.toLocaleString()} tokens\n\n`);
  tooltip.appendMarkdown(`Model: ${model.label}\n\n`);
  tooltip.appendMarkdown('Click to see the full count. Add files to the context panel to track your total budget.');
  statusBarItem.tooltip = tooltip;
  statusBarItem.backgroundColor = undefined;
  statusBarItem.show();
}

function refreshContextDisplay() {
  if (!treeView) return;
  if (contextFileTreeProvider) contextFileTreeProvider.refresh();
  const model = getModelById(currentModelId);
  const total = getTotalIncludedTokens();
  const budgetText = formatBudget(total, model.practicalTokenLimit);
  const compressionLabel = getCompressionModeLabel();
  treeView.description = compressionLabel !== 'None'
    ? `${budgetText}  •  ${compressionLabel}`
    : budgetText;
  if (pendingTemplateSession) return;
  if (total > 0) {
    const practicalK = toK(model.practicalTokenLimit);
    const contextWindowK = toK(model.contextWindow);
    const pct = ((total / model.practicalTokenLimit) * 100).toFixed(1);
    if (total > model.contextWindow) {
      statusBarItem.text = `$(symbol-numeric) ${total.toLocaleString()} / ${contextWindowK}  •  ${model.label}`;
      const tooltip = new vscode.MarkdownString();
      tooltip.appendMarkdown(`**Over the context window limit**\n\n`);
      tooltip.appendMarkdown(`${total.toLocaleString()} tokens — ${(total - model.contextWindow).toLocaleString()} over the ${contextWindowK} hard cap for ${model.label}.\n\n`);
      tooltip.appendMarkdown('Remove or compress files before copying.');
      statusBarItem.tooltip = tooltip;
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (total > model.practicalTokenLimit) {
      statusBarItem.text = `$(symbol-numeric) ${total.toLocaleString()} / ${practicalK}  •  ${model.label}`;
      const tooltip = new vscode.MarkdownString();
      tooltip.appendMarkdown(`**Above the recommended limit** (${pct}%)\n\n`);
      tooltip.appendMarkdown(`${total.toLocaleString()} tokens — models tend to miss details above ~${practicalK}.\n\n`);
      tooltip.appendMarkdown(`Compress files or remove some to improve response quality. Hard cap: ${contextWindowK}.`);
      statusBarItem.tooltip = tooltip;
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBarItem.text = `$(symbol-numeric) ${total.toLocaleString()} / ${practicalK}  •  ${model.label}`;
      const tooltip = new vscode.MarkdownString();
      tooltip.appendMarkdown(`**Context budget: ${pct}% used**\n\n`);
      tooltip.appendMarkdown(`${total.toLocaleString()} of ${model.practicalTokenLimit.toLocaleString()} recommended tokens for ${model.label}.\n\n`);
      tooltip.appendMarkdown(`Hard cap: ${contextWindowK} tokens.`);
      statusBarItem.tooltip = tooltip;
      statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.show();
  } else {
    refreshStatusBarFromActiveEditor();
  }
}

async function notifyIfUpdated(context) {
  const currentVersion = context.extension.packageJSON.version;
  const previousVersion = context.globalState.get(GLOBAL_STATE_VERSION_KEY);
  if (previousVersion === currentVersion) return;
  await context.globalState.update(GLOBAL_STATE_VERSION_KEY, currentVersion);
  const message = previousVersion === undefined
    ? `Token Budget Builder installed. Reload window to activate it.`
    : `Token Budget Builder updated to v${currentVersion}. Reload window to apply changes.`;
  const action = await vscode.window.showInformationMessage(message, RELOAD_NOW_LABEL);
  if (action === RELOAD_NOW_LABEL) {
    vscode.commands.executeCommand(RELOAD_WINDOW_COMMAND);
  }
}

function activate(context) {
  currentModelId = context.globalState.get(GLOBAL_STATE_MODEL_KEY, DEFAULT_MODEL_ID);
  notifyIfUpdated(context);

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    STATUS_BAR_PRIORITY
  );
  statusBarItem.command = 'token-budget-builder.countTokens';
  context.subscriptions.push(statusBarItem);

  contextFileTreeProvider = new ContextFileTreeProvider(
    () => getModelById(currentModelId).label,
    () => getCompressionModeLabel()
  );
  treeView = vscode.window.createTreeView('token-budget-builder-files', {
    treeDataProvider: contextFileTreeProvider,
    showCollapseAll: false,
    manageCheckboxStateManually: false,
  });
  treeView.title = 'Context Files';
  context.subscriptions.push(treeView);

  promptTemplateTreeProvider = new PromptTemplateTreeProvider();
  promptTemplateTreeProvider.initialize(context.globalState);
  templateTreeView = vscode.window.createTreeView('token-budget-builder-templates', {
    treeDataProvider: promptTemplateTreeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(templateTreeView);

  templateTreeView.title = 'Prompt Templates';

  const logFilterContentProvider = new LogFilterContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(LOG_FILTER_SCHEME, logFilterContentProvider)
  );
  let filterResultCounter = 0;

  const filterHistory = [];
  const openFilterUris = new Set();

  function getContextLines() {
    return context.workspaceState.get(CONTEXT_LINES_STORAGE_KEY, 0);
  }

  const filterPanelProvider = new FilterPanelProvider(
    getContextLines,
    () => filterHistory,
    () => vscode.window.activeTextEditor?.document?.uri,
    () => vscode.window.activeTextEditor?.document?.uri?.scheme === LOG_FILTER_SCHEME
  );
  const filterTreeView = vscode.window.createTreeView('token-budget-builder-filter', {
    treeDataProvider: filterPanelProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(filterTreeView);

  context.subscriptions.push(
    vscode.commands.registerCommand('token-budget-builder.openTeamTracker', () => {
      openTeamTrackerPanel(context);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.scheme !== LOG_FILTER_SCHEME) return;
      openFilterUris.delete(doc.uri.toString());
      if (openFilterUris.size === 0) {
        filterHistory.length = 0;
        logFilterContentProvider.clearAll();
        filterPanelProvider.refresh();
      }
    })
  );

  function refreshTemplateDisplay() {
    promptTemplateTreeProvider.refresh();
  }

  function persistDraftTemplate(docText) {
    const body = docText.trim();
    if (!body) {
      vscode.window.showInformationMessage('Template body is empty. Write your template content first.');
      return false;
    }
    const { name } = pendingTemplateSession;
    saveTemplate(context.globalState, name, body);
    refreshTemplateDisplay();
    refreshContextDisplay();
    vscode.window.showInformationMessage(`Template "${name}" saved.`);
    return true;
  }

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!pendingTemplateSession) return;
      if (doc.uri.toString() !== pendingTemplateSession.draftUri.toString()) return;
      if (!persistDraftTemplate(doc.getText())) return;
      const draftUri = pendingTemplateSession.draftUri;
      pendingTemplateSession = null;
      await closeDraftEditorTabs(draftUri);
      try {
        await vscode.workspace.fs.delete(draftUri);
      } catch (_) {}
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(async (doc) => {
      if (!pendingTemplateSession) return;
      if (doc.uri.toString() !== pendingTemplateSession.draftUri.toString()) return;
      const draftUri = pendingTemplateSession.draftUri;
      pendingTemplateSession = null;
      try {
        await vscode.workspace.fs.delete(draftUri);
      } catch (_) {}
      refreshContextDisplay();
    })
  );

  initializeContextBuilder(getEncoderForModel(currentModelId));
  setImmediate(() => refreshContextDisplay());

  function resolveFilterPattern(input) {
    const regexMatch = input.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
      return { pattern: regexMatch[1], flags: regexMatch[2] || '' };
    }
    return { pattern: escapePatternLiteral(input), flags: 'i' };
  }

  async function runFilterCommand(invert, preSuppliedPattern) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor.');
      return;
    }

    let resolvedPattern;
    let rawInput = null;
    if (preSuppliedPattern !== null) {
      resolvedPattern = { pattern: preSuppliedPattern, flags: 'i' };
    } else {
      const recentPatterns = context.workspaceState.get(RECENT_PATTERNS_STORAGE_KEY, []);
      const qp = vscode.window.createQuickPick();
      qp.title = invert ? 'Remove lines containing:' : 'Keep lines containing:';
      qp.placeholder = invert ? 'debug' : 'error';
      qp.items = recentPatterns.map(p => ({ label: p, description: 'recent' }));
      rawInput = await new Promise(resolve => {
        qp.onDidAccept(() => {
          const value = qp.selectedItems.length > 0 ? qp.selectedItems[0].label : qp.value;
          resolve(value || null);
          qp.hide();
        });
        qp.onDidHide(() => resolve(null));
        qp.show();
      });
      if (!rawInput || !rawInput.trim()) return;
      resolvedPattern = resolveFilterPattern(rawInput.trim());
    }

    if (resolvedPattern.pattern.length > MAX_FILTER_PATTERN_LENGTH) {
      vscode.window.showErrorMessage(`Filter pattern too long (max ${MAX_FILTER_PATTERN_LENGTH} chars).`);
      return;
    }

    const contextLines = getContextLines();
    const text = editor.document.getText();
    const rawLines = text.split('\n');
    const parsed = parseFilterHeader(rawLines[0]);

    let contentText, sourceForHeader, baseTotal, existingChain;
    if (parsed) {
      contentText = rawLines.slice(1).join('\n');
      sourceForHeader = parsed.source;
      baseTotal = parsed.total;
      existingChain = parsed.chain;
    } else {
      contentText = text;
      sourceForHeader = path.basename(editor.document.fileName);
      baseTotal = rawLines.length;
      existingChain = [];
    }

    const sourceHistoryEntry = filterHistory.find(
      h => h.uri.toString() === editor.document.uri.toString()
    );
    const existingStepCounts = sourceHistoryEntry?.chainStepCounts ?? [];

    const resolvedSourceUri = parsed
      ? (logFilterContentProvider.getSourceUri(editor.document.uri) ?? editor.document.uri)
      : editor.document.uri;

    let result;
    try {
      result = filterLines(contentText, resolvedPattern.pattern, {
        invert,
        contextBefore: contextLines,
        contextAfter: contextLines,
        flags: resolvedPattern.flags,
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Invalid regex: ${err.message}`);
      return;
    }

    const newChain = [...existingChain, resolvedPattern.pattern];
    const header = buildFilterHeader(newChain, sourceForHeader, result.matchedCount, baseTotal);
    const content = [header, ...result.lines].join('\n');
    const resultUri = LogFilterContentProvider.createUri(filterResultCounter++);
    logFilterContentProvider.setContent(resultUri, content);
    logFilterContentProvider.setSourceUri(resultUri, resolvedSourceUri);
    filterHistory.unshift({
      uri: resultUri,
      source: sourceForHeader,
      chain: newChain,
      matched: result.matchedCount,
      total: baseTotal,
      sourceUri: resolvedSourceUri,
      chainStepCounts: [...existingStepCounts, result.matchedCount],
    });
    openFilterUris.add(resultUri.toString());
    const doc = await vscode.workspace.openTextDocument(resultUri);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

    if (preSuppliedPattern === null) {
      const existing = context.workspaceState.get(RECENT_PATTERNS_STORAGE_KEY, []);
      const updated = [rawInput, ...existing.filter(p => p !== rawInput)].slice(0, RECENT_PATTERNS_MAX);
      await context.workspaceState.update(RECENT_PATTERNS_STORAGE_KEY, updated);
    }

    filterPanelProvider.refresh();
  }

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
      const items = SUPPORTED_MODELS.map((model) => ({
        ...model,
        label: model.id === currentModelId ? `$(check) ${model.label}` : model.label,
        description: model.id === currentModelId
          ? `${model.description}  — currently selected`
          : model.description,
      }));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select model for token counting',
        title: 'Select Model',
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
      const workspaceRootFsPath = getWorkspaceRootFsPath();
      const gitignorePatterns = await loadGitignorePatterns(workspaceRootFsPath);
      try {
        const { totalTokenCount, fileCount } = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Counting tokens...',
            cancellable: false,
          },
          () => countTokensInUris(targetUris, encoderFn, gitignorePatterns, workspaceRootFsPath)
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

      const workspaceRootFsPath = getWorkspaceRootFsPath();
      const gitignorePatterns = await loadGitignorePatterns(workspaceRootFsPath);
      const allFileUris = (
        await Promise.all(targetUris.map((u) => collectFileUris(u, new Set(), gitignorePatterns, workspaceRootFsPath)))
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
        label: mode.id === currentModeId ? `$(check) ${mode.label}` : mode.label,
      }));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select compression mode for context assembly',
        title: 'Set Compression Mode',
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
          'No files checked in the context panel. Use the + button or right-click a file in the Explorer to add files.'
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
      } else if (totalTokens > model.practicalTokenLimit) {
        const practicalK = toK(model.practicalTokenLimit);
        const choice = await vscode.window.showWarningMessage(
          `Context is ${totalTokens.toLocaleString()} tokens — above the ~${practicalK} threshold where model quality tends to drop. Compress or remove files for best results.`,
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
      vscode.window.showInformationMessage(`Copied ${totalTokens.toLocaleString()} tokens to clipboard.`);
    }
  );
  context.subscriptions.push(assemblePromptCommand);

  const managePresetsCommand = vscode.commands.registerCommand(
    'token-budget-builder.managePresets',
    async () => {
      const SAVE_ACTION = 'save';
      const LOAD_ACTION = 'load';
      const DELETE_ACTION = 'delete';

      const topLevel = await vscode.window.showQuickPick(
        [
          { label: '$(save) Save current selection as preset...', action: SAVE_ACTION },
          { label: '$(files) Load preset...', action: LOAD_ACTION },
          { label: '$(trash) Delete preset...', action: DELETE_ACTION },
        ],
        { title: 'Manage Presets', placeHolder: 'What would you like to do?' }
      );
      if (!topLevel) return;

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (topLevel.action === SAVE_ACTION) {
        const includedUris = getIncludedContextUris();
        if (includedUris.length === 0) {
          vscode.window.showInformationMessage(
            'Add files to the context panel before saving a preset.'
          );
          return;
        }
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('Open a folder in VS Code to use presets.');
          return;
        }
        const relativePaths = includedUris.map((u) =>
          vscode.workspace.asRelativePath(u, false)
        );
        const suggestion = derivePresetNameSuggestion(relativePaths);
        const name = await vscode.window.showInputBox({
          prompt: 'Name this preset',
          value: suggestion,
          placeHolder: 'e.g. auth flow, API layer',
        });
        if (!name) return;

        const presets = getAllPresets(context.workspaceState);
        if (name in presets) {
          const overwrite = await vscode.window.showWarningMessage(
            `A preset named "${name}" already exists. Overwrite it?`,
            'Overwrite',
            'Cancel'
          );
          if (overwrite !== 'Overwrite') return;
        }

        savePreset(context.workspaceState, name, relativePaths);
        vscode.window.showInformationMessage(
          `Preset "${name}" saved (${relativePaths.length} file${relativePaths.length === 1 ? '' : 's'}).`
        );
        return;
      }

      if (topLevel.action === LOAD_ACTION) {
        const presets = getAllPresets(context.workspaceState);
        const presetNames = Object.keys(presets);
        if (presetNames.length === 0) {
          vscode.window.showInformationMessage(
            'No presets saved yet. Add files and save a preset first.'
          );
          return;
        }
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('Open a folder in VS Code to use presets.');
          return;
        }

        function buildPresetPickItems(isMerge) {
          const detailText = isMerge
            ? '$(add) Merges into current selection'
            : '$(files) Replaces current selection';
          return presetNames.map((presetName) => {
            const filePaths = presets[presetName];
            const fileNames = filePaths.slice(0, 3).map((p) => path.basename(p));
            const overflowCount = filePaths.length - fileNames.length;
            const description = overflowCount > 0
              ? `${fileNames.join(', ')}  +${overflowCount} more`
              : fileNames.join(', ');
            return {
              label: presetName,
              description,
              detail: detailText,
              kind: vscode.QuickPickItemKind.Default,
              presetName,
              isMerge,
            };
          });
        }

        const allItems = [
          ...buildPresetPickItems(false),
          { label: 'Merge into current context', kind: vscode.QuickPickItemKind.Separator },
          ...buildPresetPickItems(true),
        ];

        const selected = await vscode.window.showQuickPick(allItems, {
          title: 'Load Preset',
          placeHolder: 'Select a preset',
        });
        if (!selected || selected.kind === vscode.QuickPickItemKind.Separator) return;

        const paths = presets[selected.presetName];
        const workspaceRootFsPath = workspaceFolder.uri.fsPath;
        const resolvedUris = paths.flatMap((relativePath) => {
          if (relativePath.split(/[/\\]/).some((segment) => segment === '..')) return [];
          const resolvedUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
          if (!resolvedUri.fsPath.startsWith(workspaceRootFsPath)) return [];
          return [resolvedUri];
        });

        if (!selected.isMerge) {
          clearAllContext();
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Loading preset "${selected.presetName}"...`,
            cancellable: false,
          },
          () => addFilesToContext(resolvedUris)
        );
        refreshContextDisplay();
        return;
      }

      if (topLevel.action === DELETE_ACTION) {
        const presets = getAllPresets(context.workspaceState);
        const presetNames = Object.keys(presets);
        if (presetNames.length === 0) {
          vscode.window.showInformationMessage('No presets saved yet.');
          return;
        }
        const selected = await vscode.window.showQuickPick(presetNames, {
          title: 'Delete Preset',
          placeHolder: 'Select a preset to delete',
        });
        if (!selected) return;
        deletePreset(context.workspaceState, selected);
        vscode.window.showInformationMessage(`Preset "${selected}" deleted.`);
      }
    }
  );
  context.subscriptions.push(managePresetsCommand);

  const openTemplateCommand = vscode.commands.registerCommand(
    'token-budget-builder.openTemplate',
    (templateId) => {
      if (!templateId) return;
      const templates = getAllTemplates(context.globalState);
      const template = templates[templateId];
      if (!template) return;
      const panel = vscode.window.createWebviewPanel(
        TEMPLATE_PREVIEW_WEBVIEW_TYPE,
        `Preview: ${template.name}`,
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [] }
      );
      panel.webview.html = buildTemplatePreviewHtml(template.name, template.body);
      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command !== TEMPLATE_PREVIEW_COPY_COMMAND) return;
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.showInformationMessage('Copied to clipboard.');
      }, undefined, context.subscriptions);
    }
  );
  context.subscriptions.push(openTemplateCommand);

  const newTemplateCommand = vscode.commands.registerCommand(
    'token-budget-builder.newTemplate',
    async () => {
      if (pendingTemplateSession) {
        vscode.window.showInformationMessage('Save or close the current template draft first.');
        return;
      }
      const name = await vscode.window.showInputBox({
        prompt: 'Template name',
        placeHolder: 'e.g. Plan, Review, Write Tests',
      });
      if (!name || !name.trim()) return;
      const existingSlug = slugifyTemplateName(name.trim());
      const existingTemplates = getAllTemplates(context.globalState);
      if (existingSlug in existingTemplates) {
        const confirmReplace = await vscode.window.showWarningMessage(
          `A template named "${existingTemplates[existingSlug].name}" already exists. Replace it?`,
          { modal: true },
          'Replace'
        );
        if (confirmReplace !== 'Replace') return;
      }
      await vscode.workspace.fs.createDirectory(context.globalStorageUri);
      const draftUri = vscode.Uri.joinPath(context.globalStorageUri, TEMPLATE_DRAFT_FILENAME);
      await vscode.workspace.fs.writeFile(draftUri, new TextEncoder().encode(''));
      pendingTemplateSession = { name: name.trim(), draftUri };
      const doc = await vscode.workspace.openTextDocument(draftUri);
      await vscode.window.showTextDocument(doc);
      statusBarItem.text = `$(note) Editing "${name.trim()}" — Ctrl+S to save  |  use {{FILES}} as context placeholder`;
      statusBarItem.show();
    }
  );
  context.subscriptions.push(newTemplateCommand);

  const saveActiveDocumentAsTemplateCommand = vscode.commands.registerCommand(
    'token-budget-builder.saveActiveDocumentAsTemplate',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Open a document first, then run Save as Template.');
        return;
      }
      if (!pendingTemplateSession) {
        vscode.window.showInformationMessage('Use "New Template" or "Edit Template" to start editing a template.');
        return;
      }
      if (!persistDraftTemplate(editor.document.getText())) return;
      const draftUri = pendingTemplateSession.draftUri;
      pendingTemplateSession = null;
      await closeDraftEditorTabs(draftUri);
      try {
        await vscode.workspace.fs.delete(draftUri);
      } catch (_) {}
    }
  );
  context.subscriptions.push(saveActiveDocumentAsTemplateCommand);

  const editTemplateCommand = vscode.commands.registerCommand(
    'token-budget-builder.editTemplate',
    async (item) => {
      if (!item || !item.templateId) return;
      if (pendingTemplateSession) {
        vscode.window.showInformationMessage('Save or close the current template draft first.');
        return;
      }
      const templates = getAllTemplates(context.globalState);
      const template = templates[item.templateId];
      if (!template) return;
      await vscode.workspace.fs.createDirectory(context.globalStorageUri);
      const draftUri = vscode.Uri.joinPath(context.globalStorageUri, TEMPLATE_DRAFT_FILENAME);
      await vscode.workspace.fs.writeFile(draftUri, new TextEncoder().encode(template.body));
      pendingTemplateSession = { name: template.name, draftUri };
      const doc = await vscode.workspace.openTextDocument(draftUri);
      await vscode.window.showTextDocument(doc);
      statusBarItem.text = `$(note) Editing "${template.name}" — Ctrl+S to save  |  use {{FILES}} as context placeholder`;
      statusBarItem.show();
    }
  );
  context.subscriptions.push(editTemplateCommand);

  const renameTemplateCommand = vscode.commands.registerCommand(
    'token-budget-builder.renameTemplate',
    async (item) => {
      if (!item || !item.templateId) return;
      const templates = getAllTemplates(context.globalState);
      const template = templates[item.templateId];
      if (!template) return;
      const newName = await vscode.window.showInputBox({
        prompt: 'New template name',
        value: template.name,
      });
      if (!newName || !newName.trim() || newName.trim() === template.name) return;
      const newSlug = slugifyTemplateName(newName.trim());
      const isNewSlug = newSlug !== item.templateId;
      if (isNewSlug && newSlug in templates) {
        const confirmReplace = await vscode.window.showWarningMessage(
          `A template named "${templates[newSlug].name}" already exists. Replace it?`,
          { modal: true },
          'Replace'
        );
        if (confirmReplace !== 'Replace') return;
      }
      if (isNewSlug) {
        deleteTemplate(context.globalState, item.templateId);
      }
      saveTemplate(context.globalState, newName.trim(), template.body);
      refreshTemplateDisplay();
    }
  );
  context.subscriptions.push(renameTemplateCommand);

  const removeTemplateCommand = vscode.commands.registerCommand(
    'token-budget-builder.removeTemplate',
    async (item) => {
      if (!item || !item.templateId) return;
      const templates = getAllTemplates(context.globalState);
      const templateToRemove = templates[item.templateId];
      if (!templateToRemove) return;
      const confirmRemove = await vscode.window.showWarningMessage(
        `Remove template "${templateToRemove.name}"?`,
        { modal: true },
        'Remove'
      );
      if (confirmRemove !== 'Remove') return;
      deleteTemplate(context.globalState, item.templateId);
      refreshTemplateDisplay();
    }
  );
  context.subscriptions.push(removeTemplateCommand);

  const addActiveFileToContextCommand = vscode.commands.registerCommand(
    'token-budget-builder.addActiveFileToContext',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          'No file open. Click a file in the editor first, then add it.'
        );
        return;
      }
      const uri = editor.document.uri;
      const fileName = path.basename(uri.fsPath);
      if (isFileInContext(uri)) {
        vscode.window.showInformationMessage(
          `${fileName} is already in the context panel.`
        );
        return;
      }
      await addFilesToContext([uri]);
      refreshContextDisplay();
      vscode.window.showInformationMessage(`Added ${fileName} to context.`);
    }
  );
  context.subscriptions.push(addActiveFileToContextCommand);

  const suggestRelatedFilesCommand = vscode.commands.registerCommand(
    'token-budget-builder.suggestRelatedFiles',
    async () => {
      const IMPORT_DETAIL_LABEL = 'Imported by this file';
      const TEST_DETAIL_LABEL = 'Test file for this module';
      const SUGGEST_TITLE = 'Suggest Related Files';
      const SUGGEST_PLACEHOLDER = 'Choose files to add to context';
      const NO_FILES_MESSAGE =
        'No imports or test files found. This works with JS, TS, Python, and CSS files that have relative imports.';

      async function filterToExistingUris(absPaths, seen) {
        return (
          await Promise.all(
            absPaths.map(async (absPath) => {
              if (seen.has(absPath)) return null;
              seen.add(absPath);
              const uri = vscode.Uri.file(absPath);
              try {
                await vscode.workspace.fs.stat(uri);
                return uri;
              } catch {
                return null;
              }
            })
          )
        ).filter(Boolean);
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('No active file open.');
        return;
      }

      const activeFilePath = editor.document.uri.fsPath;
      const activeFileDir = path.dirname(activeFilePath);
      const text = editor.document.getText();

      const specifiers = extractRelativeImportSpecifiers(text, activeFilePath);
      const importCandidates = specifiers.flatMap((s) => buildCandidatePaths(s, activeFileDir));
      const testCandidates = buildTestCandidatePaths(activeFilePath);

      const seen = new Set();
      const importUris = await filterToExistingUris(importCandidates, seen);
      const testUris = await filterToExistingUris(testCandidates, seen);

      if (importUris.length === 0 && testUris.length === 0) {
        vscode.window.showInformationMessage(NO_FILES_MESSAGE);
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      function toPickItem(uri, detail) {
        return {
          label: workspaceRoot
            ? path.relative(workspaceRoot, uri.fsPath)
            : path.basename(uri.fsPath),
          detail,
          uri,
          picked: true,
        };
      }

      const items = [];
      if (importUris.length > 0) {
        items.push({ label: 'Imports', kind: vscode.QuickPickItemKind.Separator });
        items.push(...importUris.map((uri) => toPickItem(uri, IMPORT_DETAIL_LABEL)));
      }
      if (testUris.length > 0) {
        items.push({ label: 'Test files', kind: vscode.QuickPickItemKind.Separator });
        items.push(...testUris.map((uri) => toPickItem(uri, TEST_DETAIL_LABEL)));
      }

      const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        title: SUGGEST_TITLE,
        placeHolder: SUGGEST_PLACEHOLDER,
      });
      if (!selected || selected.length === 0) return;

      await addFilesToContext(selected.map((item) => item.uri));
      refreshContextDisplay();
      vscode.window.showInformationMessage(`Added ${selected.length} file(s) to context.`);
    }
  );
  context.subscriptions.push(suggestRelatedFilesCommand);

  const filterLinesCommand = vscode.commands.registerCommand(
    'token-budget-builder.filterLines',
    () => runFilterCommand(false, null)
  );
  context.subscriptions.push(filterLinesCommand);

  const filterLinesInverseCommand = vscode.commands.registerCommand(
    'token-budget-builder.filterLinesInverse',
    () => runFilterCommand(true, null)
  );
  context.subscriptions.push(filterLinesInverseCommand);

  const filterLinesFromSelectionCommand = vscode.commands.registerCommand(
    'token-budget-builder.filterLinesFromSelection',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      let raw;
      if (!editor.selection.isEmpty) {
        raw = editor.document.getText(editor.selection);
      } else {
        const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
        raw = wordRange ? editor.document.getText(wordRange) : null;
      }
      if (!raw || !raw.trim()) {
        vscode.window.showInformationMessage('Select text or place cursor on a word to filter by it.');
        return;
      }
      await runFilterCommand(false, escapePatternLiteral(raw.trim()));
    }
  );
  context.subscriptions.push(filterLinesFromSelectionCommand);

  const setContextLinesCommand = vscode.commands.registerCommand(
    'token-budget-builder.setContextLines',
    async () => {
      const current = getContextLines();
      const input = await vscode.window.showInputBox({
        title: 'Context lines around each match',
        prompt: 'Enter a number (0 = matched lines only)',
        value: String(current),
        validateInput: val => {
          const n = parseInt(val, 10);
          return (!Number.isInteger(n) || n < 0) ? 'Enter a whole number 0 or greater' : null;
        },
      });
      if (input === undefined) return;
      const lines = parseInt(input, 10);
      await context.workspaceState.update(CONTEXT_LINES_STORAGE_KEY, lines);
      filterPanelProvider.refresh();
    }
  );
  context.subscriptions.push(setContextLinesCommand);

  const saveFilterResultCommand = vscode.commands.registerCommand(
    'token-budget-builder.saveFilterResult',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.scheme !== LOG_FILTER_SCHEME) {
        vscode.window.showInformationMessage('Open a filter result tab first.');
        return;
      }
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('filter-result.log'),
        filters: { 'Log files': ['log', 'txt'], 'All files': ['*'] },
      });
      if (!saveUri) return;
      const content = editor.document.getText();
      await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
      vscode.window.showInformationMessage(`Saved to ${path.basename(saveUri.fsPath)}`);
    }
  );
  context.subscriptions.push(saveFilterResultCommand);

  const openSqliteViewerCommand = vscode.commands.registerCommand(
    'token-budget-builder.openSqliteViewer',
    async (fileUri) => {
      let resolvedUri = fileUri;
      if (!resolvedUri) {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'SQLite Databases': ['sqlite', 'db'] },
          title: 'Open Database File',
        });
        if (!picked || picked.length === 0) return;
        resolvedUri = picked[0];
      }
      await openSqliteViewer(context, resolvedUri);
    }
  );
  context.subscriptions.push(openSqliteViewerCommand);

  const clearFilterHistoryCommand = vscode.commands.registerCommand(
    'token-budget-builder.clearFilterHistory',
    () => {
      filterHistory.length = 0;
      logFilterContentProvider.clearAll();
      filterPanelProvider.refresh();
    }
  );
  context.subscriptions.push(clearFilterHistoryCommand);

  let selectionRefreshTimer;
  let editorSwitchTimer;
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      clearTimeout(selectionRefreshTimer);
      selectionRefreshTimer = setTimeout(() => filterPanelProvider.refresh(), 150);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      clearTimeout(editorSwitchTimer);
      editorSwitchTimer = setTimeout(() => {
        refreshContextDisplay();
        filterPanelProvider.refresh();
      }, DEBOUNCE_DELAY_MS);
    })
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
