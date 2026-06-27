'use strict';

const assert = require('node:assert/strict');
const { buildTeamTrackerPanelHtml } = require('../../src/team-tracker/teamTrackerHtml');

const FAKE_NONCE = 'abc123def456';

describe('buildTeamTrackerPanelHtml — structure', () => {
  it('returns a string starting with <!DOCTYPE html>', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
  });

  it('includes the nonce in the CSP meta tag', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes('nonce-' + FAKE_NONCE));
  });

  it('applies the nonce to both style and script tags', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    const nonceAttrs = (html.match(new RegExp('nonce="' + FAKE_NONCE + '"', 'g')) || []).length;
    assert.ok(nonceAttrs >= 2, 'nonce should appear on at least the style and script tags');
  });

  it('includes acquireVsCodeApi call', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes('acquireVsCodeApi'));
  });

  it('includes the panel-title element', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes('class="panel-title"'));
  });

  it('includes the two-column app-layout', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes('class="app-layout"'));
    assert.ok(html.includes('class="left-panel"'));
    assert.ok(html.includes('right-panel'));
  });

  it('includes the member-detail element', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes('id="memberDetail"'));
  });

  it('includes the notes textarea', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes('id="memberNotes"'));
  });

  it('includes the global sprint links section', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes('id="globalLinksList"'));
  });

  it('includes the member links list', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes('id="memberLinksList"'));
  });

  it('includes openUrl message handling in the script', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes('openUrl'));
  });
});

describe('buildTeamTrackerPanelHtml — initial state injection', () => {
  it('handles null state without throwing', () => {
    assert.doesNotThrow(() => buildTeamTrackerPanelHtml(FAKE_NONCE, null));
  });

  it('embeds saved member names from initial state', () => {
    const savedState = {
      members: [{ id: 1, name: 'Alice', colorIndex: 0, links: [], notes: '', tasks: [] }],
      globalLinks: [],
      selectedMemberId: null,
    };
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, savedState);
    assert.ok(html.includes('"Alice"'));
  });

  it('embeds tasks from member state', () => {
    const savedState = {
      members: [{
        id: 1, name: 'Ben', colorIndex: 1, links: [], notes: '',
        tasks: [{ id: 1, text: 'Write tests', done: false }],
      }],
      globalLinks: [],
      selectedMemberId: null,
    };
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, savedState);
    assert.ok(html.includes('"Write tests"'));
    assert.ok(html.includes('"done":false'));
  });

  it('embeds member links from initial state', () => {
    const savedState = {
      members: [{
        id: 1, name: 'Sara', colorIndex: 2,
        links: [{ id: 1, label: 'Jira', url: 'https://example.atlassian.net' }],
        notes: '', tasks: [],
      }],
      globalLinks: [],
      selectedMemberId: null,
    };
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, savedState);
    assert.ok(html.includes('"Jira"'));
    assert.ok(html.includes('atlassian.net'));
  });

  it('embeds global sprint links from initial state', () => {
    const savedState = {
      members: [],
      globalLinks: [{ id: 1, label: 'Sprint Board', url: 'https://jira.example.com/sprint' }],
      selectedMemberId: null,
    };
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, savedState);
    assert.ok(html.includes('"Sprint Board"'));
  });

  it('embeds member notes from initial state', () => {
    const savedState = {
      members: [{
        id: 1, name: 'Max', colorIndex: 0, links: [],
        notes: 'Blocked on auth service', tasks: [],
      }],
      globalLinks: [],
      selectedMemberId: null,
    };
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, savedState);
    assert.ok(html.includes('Blocked on auth service'));
  });

  it('embeds selectedMemberId from initial state', () => {
    const savedState = {
      members: [{ id: 5, name: 'Dev', colorIndex: 0, links: [], notes: '', tasks: [] }],
      globalLinks: [],
      selectedMemberId: 5,
    };
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, savedState);
    assert.ok(html.includes('"selectedMemberId":5') || html.includes('"selectedMemberId": 5'));
  });
});

describe('buildTeamTrackerPanelHtml — script injection prevention', () => {
  it('does not allow </script> to appear in the output when a member name contains it', () => {
    const maliciousState = {
      members: [{
        id: 1,
        name: '</script><meta http-equiv="refresh" content="0;url=https://example.com"><script>',
        colorIndex: 0,
        links: [],
        notes: '',
        tasks: [],
      }],
      globalLinks: [],
      selectedMemberId: null,
    };
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, maliciousState);
    assert.ok(!html.includes('</script><meta'), 'injection sequence must not appear literally');
  });

  it('does not allow </script> to appear when a task text contains it', () => {
    const maliciousState = {
      members: [{
        id: 1,
        name: 'Safe Name',
        colorIndex: 0,
        links: [],
        notes: '',
        tasks: [{ id: 1, text: 'ok</script><b>pwned</b><script>', done: false }],
      }],
      globalLinks: [],
      selectedMemberId: null,
    };
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, maliciousState);
    assert.ok(!html.includes('</script><b>'), 'injection sequence must not appear literally');
  });
});

describe('buildTeamTrackerPanelHtml — CSP enforcement', () => {
  it('sets default-src to none', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(html.includes("default-src 'none'"));
  });

  it('does not load any external resources (no src= or href= pointing to http)', () => {
    const html = buildTeamTrackerPanelHtml(FAKE_NONCE, null);
    assert.ok(!html.includes('src="http'), 'no external script or img src');
    assert.ok(!html.includes("src='http"), 'no external script or img src (single-quoted)');
    assert.ok(!html.includes('href="http'), 'no external link href');
    assert.ok(!html.includes("href='http"), 'no external link href (single-quoted)');
  });
});
