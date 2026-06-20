const vscode = require('vscode');
const path = require('path');
const { compress, getLanguageTag, COMPRESSION_MODE_NONE } = require('./compressor');
const { readFileAsText } = require('./fileReader');

let contextFiles = [];
let compressionModeId = COMPRESSION_MODE_NONE;
let encoderFn = null;

const onDidChangeTreeDataEmitter = new vscode.EventEmitter();

async function computeFileTokenCount(uri) {
  const text = await readFileAsText(uri);
  if (text === null) return 0;
  const compressed = compress(text, uri.fsPath, compressionModeId);
  return encoderFn(compressed).length;
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
    this.description = fileEntry.tokenCount.toLocaleString() + ' tokens';
    this.tooltip = fileEntry.uri.fsPath;
    this.contextValue = 'contextFile';
    this.checkboxState = fileEntry.included
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
  }
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
    contextFiles.map(async (f) => ({ ...f, tokenCount: await computeFileTokenCount(f.uri) }))
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
      tokenCount: await computeFileTokenCount(uri),
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

function formatBudget(totalTokens, contextWindow) {
  const percentage = contextWindow > 0
    ? ((totalTokens / contextWindow) * 100).toFixed(1)
    : '0.0';
  return `${totalTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens (${percentage}%)`;
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

function getCompressionModeId() {
  return compressionModeId;
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
  formatBudget,
  assemblePromptText,
  getCompressionModeId,
};
