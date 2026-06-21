const vscode = require('vscode');
const path = require('path');
const { compress, getLanguageTag, COMPRESSION_MODE_NONE, COMPRESSION_MODES } = require('./compressor');
const { readFileAsText } = require('./fileReader');

let contextFiles = [];
let compressionModeId = COMPRESSION_MODE_NONE;
let encoderFn = null;

const onDidChangeTreeDataEmitter = new vscode.EventEmitter();

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
  get onDidChangeTreeData() {
    return onDidChangeTreeDataEmitter.event;
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (element) return [];
    return contextFiles.map((fileEntry) => new ContextFileItem(fileEntry));
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
