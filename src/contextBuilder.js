const vscode = require('vscode');
const path = require('path');
const { compress, getLanguageTag, COMPRESSION_MODE_NONE, COMPRESSION_MODES } = require('./compressor');
const { readFileAsText } = require('./fileReader');

let contextFiles = [];
let compressionModeId = COMPRESSION_MODE_NONE;
let encoderFn = null;

const onDidChangeTreeDataEmitter = new vscode.EventEmitter();

const ACTION_ITEM_COPY_PROMPT_ID = 'copy-prompt';
const ACTION_ITEM_MODEL_ID = 'model';
const ACTION_ITEM_COMPRESSION_ID = 'compression';
const COMMAND_ASSEMBLE_PROMPT = 'token-budget-builder.assemblePrompt';
const COMMAND_SELECT_MODEL = 'token-budget-builder.selectModel';
const COMMAND_SET_COMPRESSION = 'token-budget-builder.setCompressionMode';

class ContextPanelActionItem extends vscode.TreeItem {
  constructor(itemId, label, description, commandId, iconId, tooltip) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = itemId;
    this.description = description;
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.command = { command: commandId, title: label };
  }
}

async function computeTokenCounts(uri) {
  const text = await readFileAsText(uri);
  if (text === null) return { tokenCount: 0, rawTokenCount: 0 };
  const rawTokenCount = encoderFn(text).length;
  if (compressionModeId === COMPRESSION_MODE_NONE) {
    return { tokenCount: rawTokenCount, rawTokenCount };
  }
  const compressed = compress(text, uri.fsPath, compressionModeId);
  return { tokenCount: encoderFn(compressed).length, rawTokenCount };
}

function getWorkspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

function getRelativePath(uri) {
  const root = getWorkspaceRoot();
  return root ? path.relative(root, uri.fsPath) : path.basename(uri.fsPath);
}

class ContextFileItem extends vscode.TreeItem {
  constructor(fileEntry) {
    const relativePath = getRelativePath(fileEntry.uri);
    super(relativePath, vscode.TreeItemCollapsibleState.None);
    this.uriString = fileEntry.uri.toString();
    this.resourceUri = fileEntry.uri;
    const savingsPercent = fileEntry.rawTokenCount > 0 && fileEntry.rawTokenCount !== fileEntry.tokenCount
      ? ` (-${Math.round((1 - fileEntry.tokenCount / fileEntry.rawTokenCount) * 100)}%)`
      : '';
    this.description = fileEntry.tokenCount.toLocaleString() + ' tokens' + savingsPercent;
    this.tooltip = buildFileItemTooltip(fileEntry);
    this.contextValue = 'contextFile';
    this.checkboxState = fileEntry.included
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [fileEntry.uri],
    };
  }
}

function buildFileItemTooltip(fileEntry) {
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**${path.basename(fileEntry.uri.fsPath)}**\n\n`);
  tooltip.appendText(fileEntry.uri.fsPath);
  if (fileEntry.rawTokenCount > 0 && fileEntry.rawTokenCount !== fileEntry.tokenCount) {
    const savingsPercent = Math.round((1 - fileEntry.tokenCount / fileEntry.rawTokenCount) * 100);
    tooltip.appendMarkdown(
      `\n\n${fileEntry.tokenCount.toLocaleString()} tokens after compression` +
      ` (${fileEntry.rawTokenCount.toLocaleString()} raw — ${savingsPercent}% saved)`
    );
  } else {
    tooltip.appendMarkdown(`\n\n${fileEntry.tokenCount.toLocaleString()} tokens`);
  }
  tooltip.appendMarkdown('\n\nUncheck to exclude from the assembled prompt.');
  return tooltip;
}

class ContextFileTreeProvider {
  constructor(getModelLabel, getCompressionLabel) {
    this._getModelLabel = getModelLabel || null;
    this._getCompressionLabel = getCompressionLabel || null;
  }

  get onDidChangeTreeData() {
    return onDidChangeTreeDataEmitter.event;
  }

  refresh() {
    onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (element) return [];
    const fileItems = contextFiles.map((fileEntry) => new ContextFileItem(fileEntry));
    if (!this._getModelLabel) return fileItems;
    const actionItems = [
      new ContextPanelActionItem(
        ACTION_ITEM_COPY_PROMPT_ID,
        'Copy Prompt',
        '',
        COMMAND_ASSEMBLE_PROMPT,
        'copy',
        'Assemble all checked files into a formatted prompt and copy it to the clipboard.'
      ),
      new ContextPanelActionItem(
        ACTION_ITEM_MODEL_ID,
        'Model',
        this._getModelLabel(),
        COMMAND_SELECT_MODEL,
        'list-selection',
        'The model used for token counting. Click to switch models.'
      ),
      new ContextPanelActionItem(
        ACTION_ITEM_COMPRESSION_ID,
        'Compression',
        this._getCompressionLabel(),
        COMMAND_SET_COMPRESSION,
        'settings-gear',
        'How files are compressed before copying. Click to change the compression mode.'
      ),
    ];
    return [...actionItems, ...fileItems];
  }
}

function notifyTreeChanged() {
  onDidChangeTreeDataEmitter.fire(undefined);
}

async function recomputeAllTokenCounts() {
  contextFiles = await Promise.all(
    contextFiles.map(async (f) => ({ ...f, ...(await computeTokenCounts(f.uri)) }))
  );
  notifyTreeChanged();
}

function initialize(encFn) {
  encoderFn = encFn;
  compressionModeId = COMPRESSION_MODE_NONE;
}

async function addFilesToContext(uris) {
  const newUris = uris.filter(
    (uri) => !contextFiles.some((f) => f.uri.toString() === uri.toString())
  );
  const newEntries = await Promise.all(
    newUris.map(async (uri) => ({
      uri,
      ...(await computeTokenCounts(uri)),
      included: true,
    }))
  );
  contextFiles = [...contextFiles, ...newEntries];
  notifyTreeChanged();
}

function removeFileFromContext(uriString) {
  contextFiles = contextFiles.filter((f) => f.uri.toString() !== uriString);
  notifyTreeChanged();
}

function clearAllContext() {
  contextFiles = [];
  notifyTreeChanged();
}

async function applyCompressionMode(newModeId) {
  compressionModeId = newModeId;
  await recomputeAllTokenCounts();
}

async function applyNewEncoder(newEncoderFn) {
  encoderFn = newEncoderFn;
  await recomputeAllTokenCounts();
}

function handleCheckboxStateChange(items) {
  for (const [item, state] of items) {
    const entry = contextFiles.find((f) => f.uri.toString() === item.uriString);
    if (entry) {
      entry.included = state === vscode.TreeItemCheckboxState.Checked;
    }
  }
  notifyTreeChanged();
}

function getTotalIncludedTokens() {
  return contextFiles
    .filter((f) => f.included)
    .reduce((sum, f) => sum + f.tokenCount, 0);
}

function formatBudget(totalTokens, practicalTokenLimit) {
  const percentage = practicalTokenLimit > 0
    ? ((totalTokens / practicalTokenLimit) * 100).toFixed(1)
    : '0.0';
  const practicalK = `${Math.round(practicalTokenLimit / 1000)}K`;
  return `${totalTokens.toLocaleString()} / ${practicalK} (${percentage}%)`;
}

async function assemblePromptText() {
  const includedFiles = contextFiles.filter((f) => f.included);
  const parts = [];
  for (const fileEntry of includedFiles) {
    const text = await readFileAsText(fileEntry.uri);
    if (!text || text.trim() === '') continue;
    const compressed = compress(text, fileEntry.uri.fsPath, compressionModeId);
    if (compressed.trim() === '') continue;
    const relativePath = getRelativePath(fileEntry.uri);
    const languageTag = getLanguageTag(fileEntry.uri.fsPath);
    parts.push(`### ${relativePath}\n\`\`\`${languageTag}\n${compressed}\n\`\`\``);
  }
  return parts.join('\n\n');
}

function getIncludedContextUris() {
  return contextFiles.filter((f) => f.included).map((f) => f.uri);
}

function getCompressionModeId() {
  return compressionModeId;
}

function getCompressionModeLabel() {
  return COMPRESSION_MODES.find((m) => m.id === compressionModeId)?.label ?? 'None';
}

function isFileInContext(uri) {
  return contextFiles.some((f) => f.uri.toString() === uri.toString());
}

module.exports = {
  ContextFileTreeProvider,
  initialize,
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
};
