const vscode = require('vscode');

async function collectFileUris(uri) {
  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.type === vscode.FileType.File) {
    return [uri];
  }
  if (stat.type === vscode.FileType.Directory) {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    const nested = await Promise.all(
      entries.map(([name, type]) => {
        const childUri = vscode.Uri.joinPath(uri, name);
        if (type === vscode.FileType.Directory) {
          return collectFileUris(childUri);
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
  } catch {
    return 0;
  }
}

async function countTokensInUris(uris, encoderFn) {
  const nestedUris = await Promise.all(uris.map(collectFileUris));
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
