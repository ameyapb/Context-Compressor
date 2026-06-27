'use strict';

const path = require('path');

const JS_TS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx']);
const PYTHON_EXTENSIONS = new Set(['.py']);
const CSS_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);

const KNOWN_FILE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx',
  '.py', '.css', '.scss', '.sass', '.less',
  '.json', '.html', '.xml', '.yaml', '.yml', '.md',
  '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.java', '.rb', '.php',
]);

const JS_TS_IMPORT_REGEX = /(?:import\s[^'"]*from\s|import\s*\()\s*['"](\.[^'"]+)['"]/g;
const JS_TS_REQUIRE_REGEX = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const PYTHON_RELATIVE_IMPORT_REGEX = /^\s*from\s+(\.+[\w.]*)\s+import/gm;
const CSS_IMPORT_REGEX = /@import\s+(?:url\s*\(\s*)?['"](\.[^'"]+)['"]/g;

const RESOLUTION_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.mjs'];
const INDEX_FILENAMES = ['index.js', 'index.ts', 'index.jsx', 'index.tsx'];
const TEST_SUFFIXES = [
  '.test.js', '.test.ts', '.test.jsx', '.test.tsx',
  '.spec.js', '.spec.ts', '.spec.jsx', '.spec.tsx',
];
const TESTS_SUBDIRECTORY_NAME = '__tests__';

function collectMatches(text, regex) {
  const results = [];
  let match;
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    results.push(match[1]);
  }
  return results;
}

function convertPythonSpecifierToPath(specifier) {
  const leadingDots = specifier.match(/^\.+/)[0];
  const modulePart = specifier.slice(leadingDots.length);
  const dotCount = leadingDots.length;
  const prefix = dotCount === 1 ? './' : '../'.repeat(dotCount - 1);
  if (!modulePart) return null;
  return prefix + modulePart.replace(/\./g, '/');
}

function extractRelativeImportSpecifiers(text, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let rawSpecifiers = [];

  if (JS_TS_EXTENSIONS.has(ext)) {
    rawSpecifiers = [
      ...collectMatches(text, JS_TS_IMPORT_REGEX),
      ...collectMatches(text, JS_TS_REQUIRE_REGEX),
    ];
  } else if (PYTHON_EXTENSIONS.has(ext)) {
    const pythonSpecifiers = collectMatches(text, PYTHON_RELATIVE_IMPORT_REGEX);
    rawSpecifiers = pythonSpecifiers
      .map(convertPythonSpecifierToPath)
      .filter(Boolean);
  } else if (CSS_EXTENSIONS.has(ext)) {
    rawSpecifiers = collectMatches(text, CSS_IMPORT_REGEX);
  } else {
    return [];
  }

  return [...new Set(rawSpecifiers)];
}

function specifierHasKnownExtension(specifier) {
  return KNOWN_FILE_EXTENSIONS.has(path.extname(specifier).toLowerCase());
}

function buildCandidatePaths(specifier, importingFileDir) {
  const resolved = path.resolve(importingFileDir, specifier);

  if (specifierHasKnownExtension(specifier)) {
    return [resolved];
  }

  const extensionVariants = RESOLUTION_EXTENSIONS.map((ext) => resolved + ext);
  const indexVariants = INDEX_FILENAMES.map((name) => path.join(resolved, name));
  return [...extensionVariants, ...indexVariants];
}

function buildTestCandidatePaths(activeFilePath) {
  const dir = path.dirname(activeFilePath);
  const ext = path.extname(activeFilePath);
  const basename = path.basename(activeFilePath, ext);

  const adjacentCandidates = TEST_SUFFIXES.map((suffix) =>
    path.join(dir, basename + suffix)
  );

  const testsSubdirCandidates = TEST_SUFFIXES.map((suffix) =>
    path.join(dir, TESTS_SUBDIRECTORY_NAME, basename + suffix)
  );

  return [...adjacentCandidates, ...testsSubdirCandidates];
}

module.exports = {
  extractRelativeImportSpecifiers,
  buildCandidatePaths,
  buildTestCandidatePaths,
};
