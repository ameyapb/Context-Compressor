const vscode = require('vscode');

const IGNORED_DIRECTORY_NAMES = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.vscode']);

async function collectFileUris(uri, visited = new Set()) {
  const uriString = uri.toString();
  if (visited.has(uriString)) return [];
  visited.add(uriString);

  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.type === vscode.FileType.File) {
    return [uri];
  }
  if (stat.type === vscode.FileType.Directory) {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    const nested = await Promise.all(
      entries.map(([name, type]) => {
        if (type === vscode.FileType.Directory && IGNORED_DIRECTORY_NAMES.has(name)) {
          return Promise.resolve([]);
        }
        const childUri = vscode.Uri.joinPath(uri, name);
        if (type === vscode.FileType.Directory) {
          return collectFileUris(childUri, visited);
        }
        if (type === vscode.FileType.File) {
          return Promise.resolve([childUri]);
        }
        return Promise.resolve([]);
      })
    );
    return nested.flat();
  }
  return [];
}

async function countTokensInUri(uri, encoderFn) {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return encoderFn(text).length;
  } catch (e) {
    console.warn(`context-compressor: skipping ${uri.fsPath}: ${e.message}`);
    return 0;
  }
}

async function countTokensInUris(uris, encoderFn) {
  const nestedUris = await Promise.all(uris.map((uri) => collectFileUris(uri)));
  const allFileUris = nestedUris.flat();
  const uniqueFileUris = [
    ...new Map(allFileUris.map((u) => [u.toString(), u])).values(),
  ];
  const counts = await Promise.all(
    uniqueFileUris.map((uri) => countTokensInUri(uri, encoderFn))
  );
  const totalTokenCount = counts.reduce((sum, n) => sum + n, 0);
  return { totalTokenCount, fileCount: uniqueFileUris.length };
}

module.exports = { countTokensInUris };
