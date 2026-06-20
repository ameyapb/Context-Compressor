const path = require('path');

const COMPRESSION_MODE_NONE = 'none';
const COMPRESSION_MODE_STRIP_COMMENTS = 'stripComments';
const COMPRESSION_MODE_COLLAPSE_WHITESPACE = 'collapseWhitespace';
const COMPRESSION_MODE_SIGNATURES_ONLY = 'signaturesOnly';

const COMPRESSION_MODES = [
  {
    id: COMPRESSION_MODE_NONE,
    label: 'None',
    description: 'No compression — include full file content',
  },
  {
    id: COMPRESSION_MODE_STRIP_COMMENTS,
    label: 'Strip Comments',
    description: 'Remove line and block comments (JS/TS/Python/Go/Rust/C)',
  },
  {
    id: COMPRESSION_MODE_COLLAPSE_WHITESPACE,
    label: 'Collapse Whitespace',
    description: 'Remove blank lines and trailing spaces',
  },
  {
    id: COMPRESSION_MODE_SIGNATURES_ONLY,
    label: 'Signatures Only',
    description: 'Keep function and class signatures only — 40–70% savings',
  },
];

const EXTENSION_TO_LANGUAGE = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'javascript',
  '.tsx': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'c',
  '.cc': 'c',
  '.h': 'c',
  '.hpp': 'c',
  '.java': 'java',
};

const EXTENSION_TO_LANGUAGE_TAG = {
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.java': 'java',
  '.json': 'json',
  '.md': 'md',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sh': 'sh',
  '.bash': 'sh',
  '.css': 'css',
  '.html': 'html',
  '.xml': 'xml',
  '.sql': 'sql',
};

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? 'unknown';
}

function getLanguageTag(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE_TAG[ext] ?? '';
}

function normalizeBlankLines(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripCommentsFromText(text, language) {
  let result = text;
  if (language === 'python') {
    result = result.replace(/#[^\n]*/g, '');
  } else if (language !== 'unknown') {
    result = result
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
  }
  return normalizeBlankLines(result);
}

function collapseWhitespaceInText(text) {
  return normalizeBlankLines(text);
}

const PYTHON_DEFINITION_PATTERN = /^\s*(def |async def |class )/;
const PYTHON_DOCSTRING_OPEN_PATTERN = /^\s*("""|''')/;

function extractPythonSignatures(text) {
  const lines = text.split('\n');
  const outputLines = [];
  let insideBody = false;
  let signatureIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trimStart();
    const currentIndent = line.length - stripped.length;

    if (PYTHON_DEFINITION_PATTERN.test(line)) {
      if (insideBody && currentIndent <= signatureIndent) {
        insideBody = false;
      }
      outputLines.push(line);
      signatureIndent = currentIndent;
      const nextLine = lines[i + 1];
      if (nextLine && PYTHON_DOCSTRING_OPEN_PATTERN.test(nextLine)) {
        outputLines.push(nextLine);
        i++;
      }
      insideBody = true;
      continue;
    }

    if (!insideBody) {
      outputLines.push(line);
    }
  }

  return outputLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const BRACE_SIGNATURE_PATTERNS = [
  /^\s*(export\s+)?(default\s+)?(async\s+)?function[\s*]/,
  /^\s*(export\s+)?(default\s+)?class\s+/,
  /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?(\([^)]*\)|[a-zA-Z_]\w*)\s*=>/,
  /^\s*(public|private|protected|static|async|override|abstract)(\s+(public|private|protected|static|async|override|abstract))*\s+\w+\s*\(/,
  /^\s*(func|fn)\s+\w+/,
  /^\s*(interface|type|struct|enum)\s+\w+/,
];

function looksLikeDeclaration(line) {
  return BRACE_SIGNATURE_PATTERNS.some((pattern) => pattern.test(line));
}

function extractBraceLanguageSignatures(text) {
  const lines = text.split('\n');
  const outputLines = [];
  let braceDepth = 0;
  let bodyStartDepth = -1;

  for (const line of lines) {
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;

    if (bodyStartDepth !== -1) {
      braceDepth += opens - closes;
      if (braceDepth <= bodyStartDepth) {
        outputLines.push(line);
        bodyStartDepth = -1;
      }
      continue;
    }

    if (braceDepth === 0 && looksLikeDeclaration(line)) {
      outputLines.push(line);
      braceDepth += opens - closes;
      if (opens > closes) {
        bodyStartDepth = braceDepth - (opens - closes);
        outputLines.push('  // ...');
      }
      continue;
    }

    outputLines.push(line);
    braceDepth += opens - closes;
  }

  return outputLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function compress(text, filePath, compressionModeId) {
  if (compressionModeId === COMPRESSION_MODE_NONE) {
    return text;
  }
  const language = detectLanguage(filePath);
  if (compressionModeId === COMPRESSION_MODE_STRIP_COMMENTS) {
    return stripCommentsFromText(text, language);
  }
  if (compressionModeId === COMPRESSION_MODE_COLLAPSE_WHITESPACE) {
    return collapseWhitespaceInText(text);
  }
  if (compressionModeId === COMPRESSION_MODE_SIGNATURES_ONLY) {
    if (language === 'python') {
      return extractPythonSignatures(text);
    }
    if (['javascript', 'go', 'rust', 'c', 'java'].includes(language)) {
      return extractBraceLanguageSignatures(text);
    }
    return collapseWhitespaceInText(text);
  }
  return text;
}

module.exports = {
  COMPRESSION_MODES,
  COMPRESSION_MODE_NONE,
  COMPRESSION_MODE_STRIP_COMMENTS,
  COMPRESSION_MODE_COLLAPSE_WHITESPACE,
  COMPRESSION_MODE_SIGNATURES_ONLY,
  compress,
  getLanguageTag,
};
