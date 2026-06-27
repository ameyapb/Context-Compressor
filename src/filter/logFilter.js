'use strict';

const FILTER_HEADER_TAG = '[line-filter]';
const CONTEXT_SEPARATOR = '---';

function filterLines(text, pattern, options) {
  const { invert = false, contextBefore = 0, contextAfter = 0, flags = '' } = options || {};
  const regex = new RegExp(pattern, flags);
  const allLines = text === '' ? [] : text.split('\n');
  const totalCount = allLines.length;

  if (contextBefore === 0 && contextAfter === 0) {
    const lines = [];
    let matchedCount = 0;
    for (const line of allLines) {
      const matched = regex.test(line);
      if (invert ? !matched : matched) {
        lines.push(line);
        matchedCount++;
      }
    }
    return { lines, matchedCount, totalCount };
  }

  const matchIndices = [];
  for (let i = 0; i < allLines.length; i++) {
    const matched = regex.test(allLines[i]);
    if (invert ? !matched : matched) {
      matchIndices.push(i);
    }
  }

  const matchedCount = matchIndices.length;

  if (matchedCount === 0) {
    return { lines: [], matchedCount: 0, totalCount };
  }

  const ranges = matchIndices.map(i => [
    Math.max(0, i - contextBefore),
    Math.min(totalCount - 1, i + contextAfter),
  ]);

  const merged = [ranges[0].slice()];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1] + 1) {
      last[1] = Math.max(last[1], ranges[i][1]);
    } else {
      merged.push(ranges[i].slice());
    }
  }

  const lines = [];
  for (let g = 0; g < merged.length; g++) {
    if (g > 0) lines.push(CONTEXT_SEPARATOR);
    const [start, end] = merged[g];
    for (let i = start; i <= end; i++) {
      lines.push(allLines[i]);
    }
  }

  return { lines, matchedCount, totalCount };
}

function escapePatternLiteral(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PIPE_MARKER = ' | source: ';

function parseFilterHeader(firstLine) {
  const prefix = `# ${FILTER_HEADER_TAG} `;
  if (!firstLine || !firstLine.startsWith(prefix)) return null;

  const afterTag = firstLine.slice(prefix.length);
  const pipeIndex = afterTag.lastIndexOf(PIPE_MARKER);
  if (pipeIndex === -1) return null;

  const labelPart = afterTag.slice(0, pipeIndex);
  const sourcePart = afterTag.slice(pipeIndex + PIPE_MARKER.length);

  const sourceMatch = sourcePart.match(/^(.+) \((\d+) of (\d+) lines\)$/);
  if (!sourceMatch) return null;

  const source = sourceMatch[1];
  const matched = parseInt(sourceMatch[2], 10);
  const total = parseInt(sourceMatch[3], 10);

  let chain;
  if (labelPart.startsWith('pattern: "') || labelPart.startsWith('exclude: "')) {
    const m = labelPart.match(/^(?:pattern|exclude): "(.+)"$/);
    if (!m) return null;
    chain = [m[1]];
  } else if (labelPart.startsWith('chain: ')) {
    const chainStr = labelPart.slice('chain: '.length);
    chain = chainStr.split(' > ').map(entry => {
      const m = entry.match(/^"(.+)"$/);
      return m ? m[1] : entry;
    });
  } else {
    return null;
  }

  return { chain, source, matched, total };
}

function buildFilterHeader(chain, source, matchedCount, totalCount) {
  const labelPart = chain.length === 1
    ? `pattern: "${chain[0]}"`
    : `chain: ${chain.map(p => `"${p}"`).join(' > ')}`;
  return `# ${FILTER_HEADER_TAG} ${labelPart}${PIPE_MARKER}${source} (${matchedCount} of ${totalCount} lines)`;
}

module.exports = {
  FILTER_HEADER_TAG,
  CONTEXT_SEPARATOR,
  filterLines,
  escapePatternLiteral,
  parseFilterHeader,
  buildFilterHeader,
};
