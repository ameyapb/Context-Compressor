'use strict';

const assert = require('node:assert/strict');
const {
  TEAM_TRACKER_VIEW_ID,
  TEAM_STATE_GLOBAL_KEY,
} = require('../src/teamTracker');

describe('TEAM_TRACKER_VIEW_ID', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof TEAM_TRACKER_VIEW_ID, 'string');
    assert.ok(TEAM_TRACKER_VIEW_ID.length > 0);
  });

  it('matches the contribution id in package.json', () => {
    assert.equal(TEAM_TRACKER_VIEW_ID, 'token-budget-builder-team');
  });
});

describe('TEAM_STATE_GLOBAL_KEY', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof TEAM_STATE_GLOBAL_KEY, 'string');
    assert.ok(TEAM_STATE_GLOBAL_KEY.length > 0);
  });
});
