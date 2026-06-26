'use strict';

const MEMBER_COLORS = [
  '#4fc1ff',
  '#ce9178',
  '#4ec9b0',
  '#dcdcaa',
  '#c586c0',
  '#f48771',
  '#9cdcfe',
  '#b5cea8',
];

const DEFAULT_TEAM_STATE = {
  selectedMemberId: null,
  globalLinks: [],
  members: [],
};

function createMember(id, name, colorIndex) {
  return { id, name, colorIndex, links: [], notes: '', tasks: [] };
}

function createTask(id, text) {
  return { id, text, done: false };
}

function createLink(id, label, url) {
  return { id, label, url };
}

function nextIdFromCollection(items) {
  if (!items || items.length === 0) return 1;
  return Math.max(...items.map(item => item.id)) + 1;
}

function resolveInitialState(rawState) {
  if (!rawState || typeof rawState !== 'object') {
    return { selectedMemberId: null, globalLinks: [], members: [] };
  }

  const members = (rawState.members || []).map(m => ({
    id: m.id,
    name: m.name,
    colorIndex: m.colorIndex,
    links: m.links || [],
    notes: m.notes || '',
    tasks: m.tasks || [],
  }));

  const globalLinks = rawState.globalLinks || [];
  const rawSelectedId = rawState.selectedMemberId !== undefined ? rawState.selectedMemberId : null;
  const selectedMemberId = rawSelectedId !== null && members.some(m => m.id === rawSelectedId)
    ? rawSelectedId
    : null;

  return { selectedMemberId, globalLinks, members };
}

module.exports = {
  MEMBER_COLORS,
  DEFAULT_TEAM_STATE,
  createMember,
  createTask,
  createLink,
  nextIdFromCollection,
  resolveInitialState,
};
