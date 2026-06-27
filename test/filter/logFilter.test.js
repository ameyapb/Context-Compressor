'use strict';

const assert = require('node:assert/strict');
const {
  FILTER_HEADER_TAG,
  CONTEXT_SEPARATOR,
  filterLines,
  escapePatternLiteral,
  parseFilterHeader,
  buildFilterHeader,
} = require('../../src/filter/logFilter');

describe('FILTER_HEADER_TAG constant', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof FILTER_HEADER_TAG, 'string');
    assert.ok(FILTER_HEADER_TAG.length > 0);
  });

  it('contains no newline character', () => {
    assert.ok(!FILTER_HEADER_TAG.includes('\n'));
  });
});

describe('CONTEXT_SEPARATOR constant', () => {
  it('is a non-empty string with value ---', () => {
    assert.equal(CONTEXT_SEPARATOR, '---');
  });
});

describe('filterLines — basic matching', () => {
  const text = 'apple\nbanana\napricot\ncherry';

  it('returns only lines matching the pattern', () => {
    const { lines } = filterLines(text, 'ap', {});
    assert.deepEqual(lines, ['apple', 'apricot']);
  });

  it('matchedCount equals the number of matching lines', () => {
    const { matchedCount } = filterLines(text, 'ap', {});
    assert.equal(matchedCount, 2);
  });

  it('totalCount equals the total number of lines in the input', () => {
    const { totalCount } = filterLines(text, 'ap', {});
    assert.equal(totalCount, 4);
  });

  it('returns all lines when every line matches', () => {
    const { lines, matchedCount, totalCount } = filterLines(text, '.', {});
    assert.deepEqual(lines, ['apple', 'banana', 'apricot', 'cherry']);
    assert.equal(matchedCount, 4);
    assert.equal(totalCount, 4);
  });

  it('returns empty lines array when nothing matches', () => {
    const { lines, matchedCount } = filterLines(text, 'zzz', {});
    assert.deepEqual(lines, []);
    assert.equal(matchedCount, 0);
  });
});

describe('filterLines — regex patterns', () => {
  it('metacharacter . matches any character', () => {
    const { lines } = filterLines('abc\n123\n!@#', '.', {});
    assert.equal(lines.length, 3);
  });

  it('is case-sensitive by default', () => {
    const { lines } = filterLines('Error\nerror\nERROR', 'error', {});
    assert.deepEqual(lines, ['error']);
  });

  it('partial-line match works', () => {
    const { lines } = filterLines('start-middle-end\njust-middle\nno-match', 'middle', {});
    assert.deepEqual(lines, ['start-middle-end', 'just-middle']);
  });

  it('anchored regex works', () => {
    const { lines } = filterLines('hello world\nworld hello', '^hello', {});
    assert.deepEqual(lines, ['hello world']);
  });
});

describe('filterLines — empty input', () => {
  it('returns zero lines, zero matched, zero total for empty string', () => {
    const result = filterLines('', 'anything', {});
    assert.deepEqual(result.lines, []);
    assert.equal(result.matchedCount, 0);
    assert.equal(result.totalCount, 0);
  });

  it('all-matching pattern on multi-line text returns every line', () => {
    const text = 'line1\nline2\nline3';
    const { lines, matchedCount, totalCount } = filterLines(text, '.*', {});
    assert.deepEqual(lines, ['line1', 'line2', 'line3']);
    assert.equal(matchedCount, 3);
    assert.equal(totalCount, 3);
  });
});

describe('filterLines — invalid regex', () => {
  it('throws when pattern is an invalid regex', () => {
    assert.throws(() => filterLines('some text', '[invalid', {}), /SyntaxError|Invalid regular expression/i);
  });
});

describe('filterLines — flags option', () => {
  it('flags: "i" makes matching case-insensitive', () => {
    const { lines } = filterLines('Error\nerror\nERROR', 'error', { flags: 'i' });
    assert.deepEqual(lines, ['Error', 'error', 'ERROR']);
  });

  it('empty flags string uses case-sensitive matching', () => {
    const { lines } = filterLines('Error\nerror\nERROR', 'error', { flags: '' });
    assert.deepEqual(lines, ['error']);
  });

  it('flags default to "" when not provided, preserving existing case-sensitive behavior', () => {
    const { lines } = filterLines('Hello\nhello', 'hello', {});
    assert.deepEqual(lines, ['hello']);
  });
});

describe('filterLines — invert option', () => {
  const text = 'apple\nbanana\napricot\ncherry';

  it('invert: true keeps only lines that do not match the pattern', () => {
    const { lines } = filterLines(text, 'ap', { invert: true });
    assert.deepEqual(lines, ['banana', 'cherry']);
  });

  it('matchedCount equals the number of non-matching lines kept', () => {
    const { matchedCount } = filterLines(text, 'ap', { invert: true });
    assert.equal(matchedCount, 2);
  });

  it('totalCount still reflects the total number of input lines', () => {
    const { totalCount } = filterLines(text, 'ap', { invert: true });
    assert.equal(totalCount, 4);
  });

  it('two successive calls simulate grep | grep -v', () => {
    const firstPass = filterLines(text, 'ap', {});
    const secondPass = filterLines(firstPass.lines.join('\n'), 'apple', { invert: true });
    assert.deepEqual(secondPass.lines, ['apricot']);
  });
});

describe('filterLines — contextBefore/contextAfter', () => {
  const text = 'line0\nline1\nMATCH\nline3\nline4\nline5\nMATCH\nline7\nline8';

  it('contextBefore includes lines above the match', () => {
    const { lines } = filterLines(text, 'MATCH', { contextBefore: 2 });
    assert.ok(lines.includes('line1'));
    assert.ok(lines.includes('MATCH'));
  });

  it('contextAfter includes lines below the match', () => {
    const { lines } = filterLines(text, 'MATCH', { contextAfter: 2 });
    assert.ok(lines.includes('MATCH'));
    assert.ok(lines.includes('line3'));
    assert.ok(lines.includes('line4'));
  });

  it('non-contiguous groups are separated by CONTEXT_SEPARATOR', () => {
    const { lines } = filterLines(text, 'MATCH', { contextAfter: 1 });
    assert.ok(lines.includes(CONTEXT_SEPARATOR));
  });

  it('contiguous or touching groups are merged with no separator', () => {
    const closeText = 'line0\nMATCH\nMATCH\nline3';
    const { lines } = filterLines(closeText, 'MATCH', { contextAfter: 1 });
    assert.ok(!lines.includes(CONTEXT_SEPARATOR));
  });

  it('context does not extend below index 0', () => {
    const { lines } = filterLines('MATCH\nline1\nline2', 'MATCH', { contextBefore: 5 });
    assert.deepEqual(lines[0], 'MATCH');
  });

  it('matchedCount counts only matching lines, not context or separator lines', () => {
    const { matchedCount } = filterLines(text, 'MATCH', { contextBefore: 2, contextAfter: 2 });
    assert.equal(matchedCount, 2);
  });
});

describe('escapePatternLiteral', () => {
  it('escapes all regex metacharacters so the result compiles as a valid regex', () => {
    const metacharacters = '.*+?^${}()|[]\\';
    const escaped = escapePatternLiteral(metacharacters);
    assert.doesNotThrow(() => new RegExp(escaped));
  });

  it('plain alphanumeric strings pass through unchanged', () => {
    assert.equal(escapePatternLiteral('hello123'), 'hello123');
    assert.equal(escapePatternLiteral('ThreadID_42'), 'ThreadID_42');
  });

  it('escaped result used as filterLines pattern matches the original string literally', () => {
    const token = 'thread-42 [INFO]';
    const text = `prefix ${token} suffix\nother line`;
    const { lines, matchedCount } = filterLines(text, escapePatternLiteral(token), {});
    assert.equal(matchedCount, 1);
    assert.ok(lines[0].includes(token));
  });
});

describe('parseFilterHeader', () => {
  it('returns null for a plain text line', () => {
    assert.equal(parseFilterHeader('just a normal log line'), null);
  });

  it('returns null for an empty string', () => {
    assert.equal(parseFilterHeader(''), null);
  });

  it('parses a single-step pattern: header', () => {
    const header = `# ${FILTER_HEADER_TAG} pattern: "error" | source: app.log (47 of 1000 lines)`;
    const result = parseFilterHeader(header);
    assert.ok(result !== null);
    assert.deepEqual(result.chain, ['error']);
    assert.equal(result.source, 'app.log');
    assert.equal(result.matched, 47);
    assert.equal(result.total, 1000);
  });

  it('parses a single-step exclude: header', () => {
    const header = `# ${FILTER_HEADER_TAG} exclude: "debug" | source: server.log (200 of 500 lines)`;
    const result = parseFilterHeader(header);
    assert.ok(result !== null);
    assert.deepEqual(result.chain, ['debug']);
    assert.equal(result.source, 'server.log');
  });

  it('parses a two-entry chain: header and extracts both patterns', () => {
    const header = `# ${FILTER_HEADER_TAG} chain: "error" > "NullPointer" | source: app.log (5 of 1000 lines)`;
    const result = parseFilterHeader(header);
    assert.ok(result !== null);
    assert.deepEqual(result.chain, ['error', 'NullPointer']);
    assert.equal(result.source, 'app.log');
    assert.equal(result.matched, 5);
    assert.equal(result.total, 1000);
  });

  it('returns null for a malformed header missing the pipe marker', () => {
    const header = `# ${FILTER_HEADER_TAG} pattern: "error" source: app.log (5 of 100 lines)`;
    assert.equal(parseFilterHeader(header), null);
  });
});

describe('buildFilterHeader', () => {
  it('single entry produces a pattern: format string', () => {
    const header = buildFilterHeader(['error'], 'app.log', 47, 1000);
    assert.ok(header.includes(`# ${FILTER_HEADER_TAG} pattern: "error"`));
  });

  it('two entries produce a chain: format string', () => {
    const header = buildFilterHeader(['error', 'NullPointer'], 'app.log', 5, 1000);
    assert.ok(header.includes(`# ${FILTER_HEADER_TAG} chain: "error" > "NullPointer"`));
  });

  it('matchedCount and totalCount appear verbatim as integers in the output', () => {
    const header = buildFilterHeader(['foo'], 'test.log', 12, 345);
    assert.ok(header.includes('12 of 345 lines'));
  });

  it('round-trips through parseFilterHeader correctly', () => {
    const original = buildFilterHeader(['foo'], 'app.log', 5, 100);
    const parsed = parseFilterHeader(original);
    assert.ok(parsed !== null);
    assert.deepEqual(parsed.chain, ['foo']);
    assert.equal(parsed.source, 'app.log');
    assert.equal(parsed.matched, 5);
    assert.equal(parsed.total, 100);
  });
});
