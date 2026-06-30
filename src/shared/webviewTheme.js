'use strict';

const { ACCENT_COLOR_ID, HIGHLIGHT_COLOR_ID } = require('./theme');

const ACCENT_COLOR_DEFAULT_HEX = '#4a4e8f';
const HIGHLIGHT_COLOR_DEFAULT_HEX = '#a490c2';
const ACCENT_COLOR_DEFAULT_RGB = '74, 78, 143';
const HIGHLIGHT_COLOR_DEFAULT_RGB = '164, 144, 194';

function colorIdToCssVarName(colorId) {
  return `--vscode-${colorId.replace('.', '-')}`;
}

const ACCENT_COLOR_VAR = `var(${colorIdToCssVarName(ACCENT_COLOR_ID)}, ${ACCENT_COLOR_DEFAULT_HEX})`;
const HIGHLIGHT_COLOR_VAR = `var(${colorIdToCssVarName(HIGHLIGHT_COLOR_ID)}, ${HIGHLIGHT_COLOR_DEFAULT_HEX})`;

const ACCENT_TINT_SUBTLE = `rgba(${ACCENT_COLOR_DEFAULT_RGB}, 0.12)`;
const ACCENT_TINT_MEDIUM = `rgba(${ACCENT_COLOR_DEFAULT_RGB}, 0.24)`;
const ACCENT_TINT_STRONG = `rgba(${ACCENT_COLOR_DEFAULT_RGB}, 0.4)`;
const HIGHLIGHT_TINT_SUBTLE = `rgba(${HIGHLIGHT_COLOR_DEFAULT_RGB}, 0.16)`;
const HIGHLIGHT_TINT_MEDIUM = `rgba(${HIGHLIGHT_COLOR_DEFAULT_RGB}, 0.28)`;

const ACCENT_TEXT_ON_TINT = 'rgb(187, 190, 224)';
const HIGHLIGHT_TEXT_ON_TINT = 'rgb(214, 204, 230)';

const SHARED_WEBVIEW_STYLE_BLOCK = `
  :root {
    --cabin-space-xs: 4px;
    --cabin-space-sm: 6px;
    --cabin-space-md: 8px;
    --cabin-space-lg: 12px;
  }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.25); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.45); }
`;

function buildSharedWebviewStyleBlock() {
  return SHARED_WEBVIEW_STYLE_BLOCK;
}

module.exports = {
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
};
