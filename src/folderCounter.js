'use strict';

const path = require('path');
const vscode = require('vscode');
const { readFileAsText } = require('./fileReader');
const { isIgnoredByGitignorePatterns } = require('./gitignoreFilter');

const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.vscode',
  '__pycache__', '.pytest_cache', 'coverage', '.nyc_output',
  '.cache', '.parcel-cache', '.next', '.nuxt', 'vendor',
  'venv', '.venv', '.sass-cache', '.turbo', '.gradle',
]);

const NOISE_FILE_SUFFIXES = ['.lock', '.min.js', '.min.css', '.pyc', '.pyo', '.pyd', '.map', '.log'];

const NOISE_FILE_NAMES = new Set(['package-lock.json', 'go.sum', 'pnpm-lock.yaml']);

function shouldExcludeFile(name) {
  if (NOISE_FILE_NAMES.has(name)) return true;
  return NOISE_FILE_SUFFIXES.some(suffix => name.endsWith(suffix));
}

async function collectFileUris(uri, visited = new Set(), gitignorePatterns = null, workspaceRootFsPath = null) {
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
        const childUri = vscode.Uri.joinPath(uri, name);
        const relativePath = workspaceRootFsPath
          ? path.relative(workspaceRootFsPath, childUri.fsPath).replace(/\\/g, '/')
          : null;

        if (type === vscode.FileType.Directory) {
          if (IGNORED_DIRECTORY_NAMES.has(name)) return Promise.resolve([]);
          if (gitignorePatterns && relativePath && isIgnoredByGitignorePatterns(gitignorePatterns, relativePath)) {
            return Promise.resolve([]);
          }
          return collectFileUris(childUri, visited, gitignorePatterns, workspaceRootFsPath);
        }

        if (type === vscode.FileType.File) {
          if (shouldExcludeFile(name)) return Promise.resolve([]);
          if (gitignorePatterns && relativePath && isIgnoredByGitignorePatterns(gitignorePatterns, relativePath)) {
            return Promise.resolve([]);
          }
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
  const text = await readFileAsText(uri);
  if (text === null) {
    console.warn(`token-budget-builder: skipping ${uri.fsPath}: binary or unreadable`);
    return 0;
  }
  return encoderFn(text).length;
}

async function countTokensInUris(uris, encoderFn, gitignorePatterns = null, workspaceRootFsPath = null) {
  const nestedUris = await Promise.all(
    uris.map((uri) => collectFileUris(uri, new Set(), gitignorePatterns, workspaceRootFsPath))
  );
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

module.exports = { collectFileUris, countTokensInUris, shouldExcludeFile };
