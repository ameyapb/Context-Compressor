'use strict';

const assert = require('node:assert/strict');
const {
  parseGitignoreContent,
  matchesGitignorePattern,
  isIgnoredByGitignorePatterns,
} = require('../src/gitignoreFilter');

describe('parseGitignoreContent', () => {
  it('strips comment lines', () => {
    const result = parseGitignoreContent('# this is a comment\nnode_modules');
    assert.deepEqual(result, ['node_modules']);
  });

  it('strips empty lines', () => {
    const result = parseGitignoreContent('\ndist\n\nbuild\n');
    assert.deepEqual(result, ['dist', 'build']);
  });

  it('strips negation lines', () => {
    const result = parseGitignoreContent('*.log\n!important.log');
    assert.deepEqual(result, ['*.log']);
  });

  it('strips trailing slash from directory patterns', () => {
    const result = parseGitignoreContent('node_modules/\ndist/');
    assert.deepEqual(result, ['node_modules', 'dist']);
  });

  it('preserves valid patterns', () => {
    const result = parseGitignoreContent('*.lock\n/build\nsrc/**/*.min.js');
    assert.deepEqual(result, ['*.lock', '/build', 'src/**/*.min.js']);
  });

  it('trims trailing whitespace from lines', () => {
    const result = parseGitignoreContent('dist   \nbuild\t');
    assert.deepEqual(result, ['dist', 'build']);
  });
});

describe('matchesGitignorePattern', () => {
  it('matches exact filename at root', () => {
    assert.equal(matchesGitignorePattern('debug.log', 'debug.log'), true);
  });

  it('matches exact filename in subdirectory when unanchored', () => {
    assert.equal(matchesGitignorePattern('debug.log', 'logs/debug.log'), true);
  });

  it('does not match partial filename suffix', () => {
    assert.equal(matchesGitignorePattern('debug.log', 'debug.log.bak'), false);
  });

  it('matches *.log pattern against any .log file at root', () => {
    assert.equal(matchesGitignorePattern('*.log', 'error.log'), true);
  });

  it('matches *.log pattern against .log file in subdirectory', () => {
    assert.equal(matchesGitignorePattern('*.log', 'logs/error.log'), true);
  });

  it('does not match *.log against files without .log extension', () => {
    assert.equal(matchesGitignorePattern('*.log', 'error.txt'), false);
  });

  it('matches directory name against paths inside that directory', () => {
    assert.equal(matchesGitignorePattern('node_modules', 'node_modules/lodash/index.js'), true);
  });

  it('matches directory name at root', () => {
    assert.equal(matchesGitignorePattern('node_modules', 'node_modules'), true);
  });

  it('does not match directory name as prefix of another name', () => {
    assert.equal(matchesGitignorePattern('dist', 'distribution/main.js'), false);
  });

  it('anchors pattern with leading slash to root only', () => {
    assert.equal(matchesGitignorePattern('/build', 'build'), true);
    assert.equal(matchesGitignorePattern('/build', 'build/output.js'), true);
    assert.equal(matchesGitignorePattern('/build', 'src/build'), false);
  });

  it('anchors pattern containing slash to root', () => {
    assert.equal(matchesGitignorePattern('src/*.js', 'src/index.js'), true);
    assert.equal(matchesGitignorePattern('src/*.js', 'lib/src/index.js'), false);
  });

  it('matches ** double-star across directories', () => {
    assert.equal(matchesGitignorePattern('**/*.test.js', 'src/components/Button.test.js'), true);
    assert.equal(matchesGitignorePattern('**/*.test.js', 'Button.test.js'), true);
  });

  it('matches ? wildcard for single character', () => {
    assert.equal(matchesGitignorePattern('file?.txt', 'fileA.txt'), true);
    assert.equal(matchesGitignorePattern('file?.txt', 'fileAB.txt'), false);
  });
});

describe('isIgnoredByGitignorePatterns', () => {
  it('returns true when any pattern matches', () => {
    assert.equal(isIgnoredByGitignorePatterns(['*.log', 'dist'], 'error.log'), true);
  });

  it('returns true on directory match', () => {
    assert.equal(isIgnoredByGitignorePatterns(['dist', '*.lock'], 'dist/bundle.js'), true);
  });

  it('returns false when no pattern matches', () => {
    assert.equal(isIgnoredByGitignorePatterns(['*.log', 'dist'], 'src/index.js'), false);
  });

  it('returns false for empty patterns array', () => {
    assert.equal(isIgnoredByGitignorePatterns([], 'anything.js'), false);
  });
});
