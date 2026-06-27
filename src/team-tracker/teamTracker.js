'use strict';

const vscode = require('vscode');
const crypto = require('crypto');
const { buildTeamTrackerPanelHtml } = require('./teamTrackerHtml');
const { isAllowedExternalUrl } = require('./teamTrackerState');

const TEAM_TRACKER_VIEW_ID = 'token-budget-builder-team';
const TEAM_STATE_GLOBAL_KEY = 'team-tracker.state';
const TEAM_TRACKER_WEBVIEW_TYPE = 'teamTrackerPanel';

let _openPanel = null;

function generateNonce() {
  return crypto.randomBytes(24).toString('hex');
}

function openTeamTrackerPanel(context) {
  if (_openPanel) {
    _openPanel.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    TEAM_TRACKER_WEBVIEW_TYPE,
    'Team Tracker',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
  );

  _openPanel = panel;

  const savedState = context.globalState.get(TEAM_STATE_GLOBAL_KEY, null);
  panel.webview.html = buildTeamTrackerPanelHtml(generateNonce(), savedState);

  panel.webview.onDidReceiveMessage(
    async (message) => {
      if (message.type === 'saveState') {
        await context.globalState.update(TEAM_STATE_GLOBAL_KEY, message.state);
      } else if (message.type === 'openUrl') {
        try {
          if (!isAllowedExternalUrl(message.url)) return;
          await vscode.env.openExternal(vscode.Uri.parse(message.url, true));
        } catch (_err) {
          // malformed URL
        }
      }
    },
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(() => { _openPanel = null; });
}

module.exports = { openTeamTrackerPanel, TEAM_TRACKER_VIEW_ID, TEAM_STATE_GLOBAL_KEY };
