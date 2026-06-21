'use strict';

const fs = require('fs').promises;
const path = require('path');

const GITIGNORE_FILENAME = '.gitignore';

function parseGitignoreContent(content) {
  return content
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
    .filter(line => !line.startsWith('#'))
    .filter(line => !line.startsWith('!'))
    .map(line => (line.endsWith('/') ? line.slice(0, -1) : line));
}

function matchesGitignorePattern(pattern, relativePath) {
  const anchored = pattern.startsWith('/') || pattern.includes('/');
  const cleanPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern;

  const regexPattern = cleanPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\x00')
    .replace(/\*\*/g, '\x01')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\x00/g, '(.*/)?')
    .replace(/\x01/g, '.*');

  if (anchored) {
    return new RegExp(`^${regexPattern}($|/)`).test(relativePath);
  }
  return new RegExp(`(^|/)${regexPattern}($|/)`).test(relativePath);
}

function isIgnoredByGitignorePatterns(patterns, relativePath) {
  return patterns.some(pattern => matchesGitignorePattern(pattern, relativePath));
}

async function loadGitignorePatterns(rootFsPath) {
  if (!rootFsPath) return [];
  try {
    const content = await fs.readFile(path.join(rootFsPath, GITIGNORE_FILENAME), 'utf8');
    return parseGitignoreContent(content);
  } catch {
    return [];
  }
}

module.exports = {
  parseGitignoreContent,
  matchesGitignorePattern,
  isIgnoredByGitignorePatterns,
  loadGitignorePatterns,
};
