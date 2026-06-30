'use strict';

const assert = require('node:assert/strict');
const {
  ACCENT_COLOR_VAR,
  HIGHLIGHT_COLOR_VAR,
  ACCENT_TINT_SUBTLE,
  ACCENT_TINT_MEDIUM,
  ACCENT_TINT_STRONG,
  HIGHLIGHT_TINT_SUBTLE,
  HIGHLIGHT_TINT_MEDIUM,
  ACCENT_TEXT_ON_TINT,
  HIGHLIGHT_TEXT_ON_TINT,
  buildSharedWebviewStyleBlock,
} = require('../../src/shared/webviewTheme');

const RGBA_PATTERN = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, [0-9.]+\)$/;
const RGB_PATTERN = /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/;

describe('webviewTheme tint constants', () => {
  it('rgba tint constants are valid rgba() strings', () => {
    [ACCENT_TINT_SUBTLE, ACCENT_TINT_MEDIUM, ACCENT_TINT_STRONG, HIGHLIGHT_TINT_SUBTLE, HIGHLIGHT_TINT_MEDIUM].forEach(
      (value) => {
        assert.ok(RGBA_PATTERN.test(value), `${value} should match rgba() pattern`);
      }
    );
  });

  it('on-tint text color constants are valid rgb() strings', () => {
    [ACCENT_TEXT_ON_TINT, HIGHLIGHT_TEXT_ON_TINT].forEach((value) => {
      assert.ok(RGB_PATTERN.test(value), `${value} should match rgb() pattern`);
    });
  });

  it('accent tints increase in alpha from subtle to strong', () => {
    const extractAlpha = (rgba) => parseFloat(rgba.slice(rgba.lastIndexOf(',') + 1, -1));
    assert.ok(extractAlpha(ACCENT_TINT_SUBTLE) < extractAlpha(ACCENT_TINT_MEDIUM));
    assert.ok(extractAlpha(ACCENT_TINT_MEDIUM) < extractAlpha(ACCENT_TINT_STRONG));
    assert.ok(extractAlpha(HIGHLIGHT_TINT_SUBTLE) < extractAlpha(HIGHLIGHT_TINT_MEDIUM));
  });

  it('color var constants reference the contributed color ids with a hex fallback', () => {
    assert.match(ACCENT_COLOR_VAR, /^var\(--vscode-tokenBudgetBuilder-accentColor, #[0-9a-f]{6}\)$/);
    assert.match(HIGHLIGHT_COLOR_VAR, /^var\(--vscode-tokenBudgetBuilder-highlightColor, #[0-9a-f]{6}\)$/);
  });
});

describe('buildSharedWebviewStyleBlock', () => {
  it('returns a string', () => {
    assert.equal(typeof buildSharedWebviewStyleBlock(), 'string');
  });

  it('includes the spacing scale custom properties', () => {
    const block = buildSharedWebviewStyleBlock();
    assert.ok(block.includes('--cabin-space-xs'));
    assert.ok(block.includes('--cabin-space-sm'));
    assert.ok(block.includes('--cabin-space-md'));
    assert.ok(block.includes('--cabin-space-lg'));
  });

  it('includes a webkit scrollbar rule set', () => {
    const block = buildSharedWebviewStyleBlock();
    assert.ok(block.includes('::-webkit-scrollbar'));
    assert.ok(block.includes('::-webkit-scrollbar-thumb'));
  });

  it('is idempotent (pure function, no side effects)', () => {
    assert.equal(buildSharedWebviewStyleBlock(), buildSharedWebviewStyleBlock());
  });
});
