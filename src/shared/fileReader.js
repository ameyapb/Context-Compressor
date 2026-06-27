const vscode = require('vscode');

const UTF8_FATAL_DECODER = new TextDecoder('utf-8', { fatal: true });

async function readFileAsText(uri) {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return UTF8_FATAL_DECODER.decode(bytes);
  } catch {
    return null;
  }
}

module.exports = { readFileAsText };
