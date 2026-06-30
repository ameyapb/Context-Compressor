'use strict';

const assert = require('node:assert/strict');
const { ACCENT_COLOR_ID, HIGHLIGHT_COLOR_ID } = require('../../src/shared/theme');

describe('theme color id constants', () => {
  it('ACCENT_COLOR_ID is a non-empty string', () => {
    assert.equal(typeof ACCENT_COLOR_ID, 'string');
    assert.ok(ACCENT_COLOR_ID.length > 0);
  });

  it('HIGHLIGHT_COLOR_ID is a non-empty string', () => {
    assert.equal(typeof HIGHLIGHT_COLOR_ID, 'string');
    assert.ok(HIGHLIGHT_COLOR_ID.length > 0);
  });

  it('ACCENT_COLOR_ID and HIGHLIGHT_COLOR_ID are distinct', () => {
    assert.notEqual(ACCENT_COLOR_ID, HIGHLIGHT_COLOR_ID);
  });

  it('both ids follow the tokenBudgetBuilder.* naming convention', () => {
    assert.ok(ACCENT_COLOR_ID.startsWith('tokenBudgetBuilder.'));
    assert.ok(HIGHLIGHT_COLOR_ID.startsWith('tokenBudgetBuilder.'));
  });

  it('both ids contain only letters, digits, and dots (VS Code contributes.colors.id constraint)', () => {
    const VALID_COLOR_ID_PATTERN = /^[A-Za-z0-9]+(\.[A-Za-z0-9]+)+$/;
    assert.ok(VALID_COLOR_ID_PATTERN.test(ACCENT_COLOR_ID));
    assert.ok(VALID_COLOR_ID_PATTERN.test(HIGHLIGHT_COLOR_ID));
  });
});
