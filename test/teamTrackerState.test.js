'use strict';

const assert = require('node:assert/strict');
const {
  MEMBER_COLORS,
  DEFAULT_TEAM_STATE,
  createMember,
  createTask,
  createLink,
  nextIdFromCollection,
  resolveInitialState,
} = require('../src/teamTrackerState');

describe('MEMBER_COLORS', () => {
  it('is a non-empty array of hex color strings', () => {
    assert.ok(Array.isArray(MEMBER_COLORS));
    assert.ok(MEMBER_COLORS.length > 0);
    MEMBER_COLORS.forEach(function(c) {
      assert.ok(c.startsWith('#'), 'expected hex color, got: ' + c);
    });
  });
});

describe('DEFAULT_TEAM_STATE', () => {
  it('has selectedMemberId null', () => {
    assert.equal(DEFAULT_TEAM_STATE.selectedMemberId, null);
  });

  it('has empty members and globalLinks arrays', () => {
    assert.deepEqual(DEFAULT_TEAM_STATE.members, []);
    assert.deepEqual(DEFAULT_TEAM_STATE.globalLinks, []);
  });
});

describe('createMember', () => {
  it('returns an object with the expected shape', () => {
    const member = createMember(1, 'Alice', 2);
    assert.equal(member.id, 1);
    assert.equal(member.name, 'Alice');
    assert.equal(member.colorIndex, 2);
    assert.deepEqual(member.links, []);
    assert.equal(member.notes, '');
    assert.deepEqual(member.tasks, []);
  });
});

describe('createTask', () => {
  it('returns an object with the expected shape', () => {
    const task = createTask(5, 'Write tests');
    assert.equal(task.id, 5);
    assert.equal(task.text, 'Write tests');
    assert.equal(task.done, false);
  });
});

describe('createLink', () => {
  it('returns an object with the expected shape', () => {
    const link = createLink(3, 'Jira', 'https://example.atlassian.net');
    assert.equal(link.id, 3);
    assert.equal(link.label, 'Jira');
    assert.equal(link.url, 'https://example.atlassian.net');
  });
});

describe('nextIdFromCollection', () => {
  it('returns 1 for an empty array', () => {
    assert.equal(nextIdFromCollection([]), 1);
  });

  it('returns 1 for null or undefined', () => {
    assert.equal(nextIdFromCollection(null), 1);
    assert.equal(nextIdFromCollection(undefined), 1);
  });

  it('returns max id plus one for a populated array', () => {
    assert.equal(nextIdFromCollection([{ id: 1 }, { id: 3 }, { id: 2 }]), 4);
  });

  it('works when the array has a single item', () => {
    assert.equal(nextIdFromCollection([{ id: 7 }]), 8);
  });
});

describe('resolveInitialState', () => {
  it('returns default state for null input', () => {
    const result = resolveInitialState(null);
    assert.equal(result.selectedMemberId, null);
    assert.deepEqual(result.globalLinks, []);
    assert.deepEqual(result.members, []);
  });

  it('returns default state for undefined input', () => {
    const result = resolveInitialState(undefined);
    assert.equal(result.selectedMemberId, null);
  });

  it('passes through a valid state unchanged', () => {
    const input = {
      selectedMemberId: 1,
      globalLinks: [{ id: 1, label: 'Board', url: 'https://example.com' }],
      members: [{ id: 1, name: 'Alice', colorIndex: 0, links: [], notes: 'hi', tasks: [] }],
    };
    const result = resolveInitialState(input);
    assert.equal(result.selectedMemberId, 1);
    assert.equal(result.members[0].name, 'Alice');
    assert.equal(result.members[0].notes, 'hi');
    assert.equal(result.globalLinks[0].label, 'Board');
  });

  it('fills in missing optional member fields with defaults', () => {
    const input = {
      members: [{ id: 1, name: 'Bob', colorIndex: 1 }],
      globalLinks: [],
      selectedMemberId: null,
    };
    const result = resolveInitialState(input);
    assert.deepEqual(result.members[0].links, []);
    assert.equal(result.members[0].notes, '');
    assert.deepEqual(result.members[0].tasks, []);
  });

  it('sets selectedMemberId to null when the referenced member does not exist', () => {
    const input = {
      members: [{ id: 2, name: 'Carol', colorIndex: 0, links: [], notes: '', tasks: [] }],
      globalLinks: [],
      selectedMemberId: 99,
    };
    const result = resolveInitialState(input);
    assert.equal(result.selectedMemberId, null);
  });

  it('preserves selectedMemberId when the referenced member exists', () => {
    const input = {
      members: [{ id: 5, name: 'Dev', colorIndex: 0, links: [], notes: '', tasks: [] }],
      globalLinks: [],
      selectedMemberId: 5,
    };
    const result = resolveInitialState(input);
    assert.equal(result.selectedMemberId, 5);
  });
});
