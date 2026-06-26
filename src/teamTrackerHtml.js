'use strict';

const { MEMBER_COLORS, resolveInitialState } = require('./teamTrackerState');

function buildTeamStyles(nonce) {
  return `<style nonce="${nonce}">
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family, -apple-system, 'Segoe UI', system-ui, sans-serif);
  font-size: 13px;
  line-height: 1.4;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.25); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.45); }

.app-layout { display: flex; flex: 1; overflow: hidden; }

.left-panel {
  width: 220px;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  overflow: hidden;
  flex-shrink: 0;
}

.left-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
  flex-shrink: 0;
  user-select: none;
}

.panel-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-descriptionForeground));
}

.btn-add-member {
  background: none;
  border: 1px solid rgba(128,128,128,0.25);
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  font-size: 11px;
  font-family: var(--vscode-font-family, inherit);
  padding: 2px 8px;
  border-radius: 3px;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
}

.btn-add-member:hover {
  background: rgba(128,128,128,0.12);
  color: var(--vscode-foreground);
}

.add-member-form {
  padding: 8px 10px;
  border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
  display: none;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.add-member-form.visible { display: flex; }

.form-input {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
  border-radius: 3px;
  color: var(--vscode-input-foreground);
  font-size: 12px;
  font-family: var(--vscode-font-family, inherit);
  padding: 5px 8px;
  outline: none;
  transition: border-color 0.12s;
  width: 100%;
}

.form-input:focus { border-color: var(--vscode-focusBorder, rgba(0,122,204,0.8)); }
.form-input::placeholder { color: var(--vscode-input-placeholderForeground); }

.form-actions {
  display: flex;
  gap: 5px;
  justify-content: flex-end;
}

.btn-sm {
  background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2));
  border: none;
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  font-size: 11px;
  font-family: var(--vscode-font-family, inherit);
  padding: 3px 9px;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.1s;
}

.btn-sm:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.3)); }
.btn-sm.confirm { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.btn-sm.confirm:hover { background: var(--vscode-button-hoverBackground); }

.member-list { flex: 1; overflow-y: auto; padding: 4px 0; }

.member-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 6px 0;
  cursor: pointer;
  transition: background 0.1s;
  border-left: 3px solid transparent;
  user-select: none;
}

.member-row:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.08)); }

.member-row.active {
  background: var(--vscode-list-activeSelectionBackground, rgba(0,122,204,0.18));
  border-left-color: var(--row-color, #4fc1ff);
}

.member-row-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  color: var(--row-color, #4fc1ff);
  margin-left: 8px;
}

.member-row-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.member-row-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--vscode-badge-foreground, #fff);
  background: var(--vscode-badge-background, rgba(100,100,100,0.5));
  border-radius: 10px;
  padding: 1px 5px;
  flex-shrink: 0;
  display: none;
  min-width: 18px;
  text-align: center;
  margin-right: 6px;
}

.member-row-badge.visible { display: block; }

.left-panel-empty {
  padding: 16px 14px;
  font-size: 11px;
  color: rgba(128,128,128,0.5);
  font-style: italic;
  text-align: center;
}

.global-links-section {
  border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
  flex-shrink: 0;
  overflow-y: auto;
  max-height: 42%;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px 5px 14px;
  user-select: none;
}

.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--vscode-descriptionForeground);
}

.btn-section-add {
  background: none;
  border: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 4px;
  border-radius: 2px;
  transition: color 0.1s, background 0.1s;
}

.btn-section-add:hover { color: var(--vscode-foreground); background: rgba(128,128,128,0.12); }

.global-link-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 14px;
  transition: background 0.08s;
}

.global-link-item:hover { background: rgba(128,128,128,0.06); }

.link-label-chip {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.btn-open-link {
  background: none;
  border: none;
  color: var(--vscode-textLink-foreground, #4fc1ff);
  cursor: pointer;
  font-size: 11px;
  padding: 1px 3px;
  border-radius: 2px;
  flex-shrink: 0;
  font-family: var(--vscode-font-family, inherit);
  transition: color 0.1s;
}

.btn-open-link:hover { text-decoration: underline; }

.btn-delete-link {
  background: none;
  border: none;
  color: rgba(128,128,128,0.4);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
}

.global-link-item:hover .btn-delete-link,
.member-link-item:hover .btn-delete-link { opacity: 1; }

.btn-delete-link:hover { color: #f48771; }

.add-link-form {
  padding: 6px 10px;
  display: none;
  flex-direction: column;
  gap: 5px;
}

.add-link-form.visible { display: flex; }

.global-links-empty {
  padding: 2px 14px 8px;
  font-size: 11px;
  color: rgba(128,128,128,0.45);
  font-style: italic;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--vscode-editor-background);
}

.empty-detail {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  line-height: 1.7;
}

.member-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.member-detail.hidden { display: none; }

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
  flex-shrink: 0;
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
}

.detail-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  color: var(--member-color, #4fc1ff);
}

.detail-name {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-delete-member {
  background: none;
  border: 1px solid rgba(128,128,128,0.22);
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  font-family: var(--vscode-font-family, inherit);
  padding: 4px 10px;
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}

.btn-delete-member:hover {
  background: rgba(244,135,113,0.1);
  border-color: rgba(244,135,113,0.4);
  color: #f48771;
}

.detail-body { flex: 1; overflow-y: auto; }

.detail-section {
  padding: 14px 20px;
  border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.1));
}

.detail-section:last-child { border-bottom: none; }

.detail-section .section-header-row { padding: 0 0 10px; }

.member-links-list { display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; }

.member-link-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 4px;
  background: rgba(128,128,128,0.05);
  border: 1px solid rgba(128,128,128,0.1);
  transition: background 0.08s;
}

.member-link-item:hover { background: rgba(128,128,128,0.09); }

.member-link-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-foreground);
  flex-shrink: 0;
  min-width: 50px;
}

.member-link-url {
  flex: 1;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  cursor: pointer;
  transition: color 0.1s;
}

.member-link-url:hover { color: var(--vscode-textLink-foreground, #4fc1ff); text-decoration: underline; }

.member-add-link-form {
  display: none;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  padding: 10px;
  background: rgba(128,128,128,0.04);
  border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  border-radius: 4px;
}

.member-add-link-form.visible { display: flex; }

.btn-add-link {
  background: none;
  border: 1px dashed rgba(128,128,128,0.28);
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  font-family: var(--vscode-font-family, inherit);
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}

.btn-add-link:hover {
  background: rgba(128,128,128,0.07);
  border-color: rgba(128,128,128,0.45);
  color: var(--vscode-foreground);
}

.notes-area {
  width: 100%;
  min-height: 80px;
  background: rgba(128,128,128,0.04);
  border: 1px solid rgba(128,128,128,0.15);
  border-radius: 4px;
  color: var(--vscode-foreground);
  font-size: 12px;
  font-family: var(--vscode-font-family, inherit);
  line-height: 1.6;
  padding: 8px 10px;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}

.notes-area:focus { border-color: var(--member-color, var(--vscode-focusBorder, rgba(0,122,204,0.8))); }
.notes-area::placeholder { color: var(--vscode-input-placeholderForeground); font-style: italic; }

.task-list { margin-bottom: 2px; }

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 4px;
  border-radius: 3px;
  transition: background 0.08s;
}

.task-item:hover { background: rgba(128,128,128,0.06); }

.task-checkbox {
  width: 14px;
  height: 14px;
  border: 1.5px solid rgba(128,128,128,0.4);
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
  transition: border-color 0.1s, background 0.1s;
}

.task-checkbox:hover { border-color: var(--member-color, #4fc1ff); }

.task-checkbox.checked {
  background: var(--member-color, #4fc1ff);
  border-color: var(--member-color, #4fc1ff);
}

.task-checkbox.checked::after {
  content: '';
  width: 4px;
  height: 7px;
  border: 1.5px solid #1e1e1e;
  border-top: none;
  border-left: none;
  transform: rotate(45deg) translate(-0.5px, -1px);
  display: block;
}

.task-text {
  flex: 1;
  font-size: 12px;
  color: var(--vscode-foreground);
  line-height: 1.5;
  word-break: break-word;
  cursor: pointer;
  user-select: none;
  min-width: 0;
  transition: color 0.12s;
}

.task-text.done { color: rgba(128,128,128,0.4); text-decoration: line-through; }

.btn-delete-task {
  background: none;
  border: none;
  color: rgba(128,128,128,0.35);
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
  flex-shrink: 0;
  margin-top: 1px;
}

.task-item:hover .btn-delete-task { opacity: 1; }
.btn-delete-task:hover { color: #f48771; }

.add-task-row { margin-top: 4px; }

.add-task-input {
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid transparent;
  color: rgba(128,128,128,0.5);
  font-size: 12px;
  font-family: var(--vscode-font-family, inherit);
  padding: 4px 2px;
  outline: none;
  transition: border-color 0.15s, color 0.15s;
}

.add-task-input::placeholder { color: rgba(128,128,128,0.4); font-style: italic; }

.add-task-input:focus {
  border-bottom-color: var(--member-color, var(--vscode-focusBorder, rgba(0,122,204,0.8)));
  color: var(--vscode-foreground);
}

@keyframes taskIn {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: translateY(0); }
}

.task-item.entering { animation: taskIn 0.14s ease-out both; }

@media (prefers-reduced-motion: reduce) { .task-item.entering { animation: none; } }
</style>`;
}

function buildTeamLayout() {
  return `<div class="app-layout">
  <div class="left-panel">
    <div class="left-header">
      <span class="panel-title">Team Tracker</span>
      <button class="btn-add-member" id="btnAddMember">+ Add</button>
    </div>
    <div class="add-member-form" id="addMemberForm">
      <input type="text" class="form-input" id="newMemberInput" placeholder="Name" autocomplete="off" spellcheck="false" />
      <div class="form-actions">
        <button class="btn-sm" id="btnCancelAddMember">Cancel</button>
        <button class="btn-sm confirm" id="btnConfirmAddMember">Add</button>
      </div>
    </div>
    <div class="member-list" id="memberList"></div>
    <div class="global-links-section">
      <div class="section-header-row">
        <span class="section-label">Sprint Links</span>
        <button class="btn-section-add" id="btnAddGlobalLink" title="Add link">+</button>
      </div>
      <div id="globalLinksList"></div>
      <div class="add-link-form" id="globalAddLinkForm">
        <input type="text" class="form-input" id="globalLinkLabel" placeholder="Label (e.g. Sprint Board)" autocomplete="off" spellcheck="false" />
        <input type="url" class="form-input" id="globalLinkUrl" placeholder="https://..." autocomplete="off" spellcheck="false" />
        <div class="form-actions">
          <button class="btn-sm" id="btnGlobalLinkCancel">Cancel</button>
          <button class="btn-sm confirm" id="btnGlobalLinkConfirm">Add</button>
        </div>
      </div>
    </div>
  </div>

  <div class="right-panel">
    <div class="empty-detail" id="emptyDetail">
      Select a team member to see their links, notes, and tasks.
    </div>
    <div class="member-detail hidden" id="memberDetail">
      <div class="detail-header" id="detailHeader"></div>
      <div class="detail-body">
        <div class="detail-section">
          <div class="section-header-row">
            <span class="section-label">Links</span>
          </div>
          <div class="member-links-list" id="memberLinksList"></div>
          <div class="member-add-link-form" id="memberAddLinkForm">
            <input type="text" class="form-input" id="memberLinkLabel" placeholder="Label (e.g. Jira Board)" autocomplete="off" spellcheck="false" />
            <input type="url" class="form-input" id="memberLinkUrl" placeholder="https://..." autocomplete="off" spellcheck="false" />
            <div class="form-actions">
              <button class="btn-sm" id="btnMemberLinkCancel">Cancel</button>
              <button class="btn-sm confirm" id="btnMemberLinkConfirm">Add</button>
            </div>
          </div>
          <button class="btn-add-link" id="btnAddMemberLink">+ Add link</button>
        </div>
        <div class="detail-section">
          <div class="section-header-row">
            <span class="section-label">Notes</span>
          </div>
          <textarea class="notes-area" id="memberNotes" placeholder="Blockers, context, sprint goals..." rows="3"></textarea>
        </div>
        <div class="detail-section">
          <div class="section-header-row">
            <span class="section-label">Tasks</span>
          </div>
          <div class="task-list" id="memberTaskList"></div>
          <div class="add-task-row">
            <input type="text" class="add-task-input" id="addTaskInput" placeholder="+ Add task..." autocomplete="off" spellcheck="false" />
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function buildTeamScript(nonce, state) {
  const stateJson = JSON.stringify(state);
  const colorsJson = JSON.stringify(MEMBER_COLORS);

  return `<script nonce="${nonce}">
'use strict';

const vscode = acquireVsCodeApi();
const MEMBER_COLORS = ${colorsJson};

var state = ${stateJson};

var nextMemberId = 1;
var nextTaskId = 1;
var nextLinkId = 1;

state.members.forEach(function(m) {
  if (m.id >= nextMemberId) nextMemberId = m.id + 1;
  m.tasks.forEach(function(t) { if (t.id >= nextTaskId) nextTaskId = t.id + 1; });
  m.links.forEach(function(l) { if (l.id >= nextLinkId) nextLinkId = l.id + 1; });
});
state.globalLinks.forEach(function(l) { if (l.id >= nextLinkId) nextLinkId = l.id + 1; });

function getMemberColor(colorIndex) {
  return MEMBER_COLORS[colorIndex % MEMBER_COLORS.length];
}

function getInitials(name) {
  return name.trim().split(/\s+/).map(function(w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
}

function hexToRgba(hex, alpha) {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function persistState() {
  vscode.postMessage({ type: 'saveState', state: state });
}

function getSelectedMember() {
  if (state.selectedMemberId === null) return null;
  return state.members.find(function(m) { return m.id === state.selectedMemberId; }) || null;
}

function savePendingNotes() {
  var member = getSelectedMember();
  if (!member) return;
  var textarea = document.getElementById('memberNotes');
  if (textarea) member.notes = textarea.value;
}

var memberListEl     = document.getElementById('memberList');
var addMemberForm    = document.getElementById('addMemberForm');
var newMemberInput   = document.getElementById('newMemberInput');
var globalLinksListEl = document.getElementById('globalLinksList');
var globalAddForm    = document.getElementById('globalAddLinkForm');
var emptyDetailEl    = document.getElementById('emptyDetail');
var memberDetailEl   = document.getElementById('memberDetail');
var detailHeaderEl   = document.getElementById('detailHeader');
var memberLinksListEl = document.getElementById('memberLinksList');
var memberAddLinkForm = document.getElementById('memberAddLinkForm');
var memberNotesEl    = document.getElementById('memberNotes');
var memberTaskListEl = document.getElementById('memberTaskList');
var addTaskInputEl   = document.getElementById('addTaskInput');

function renderMemberList() {
  memberListEl.innerHTML = '';

  if (state.members.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'left-panel-empty';
    empty.textContent = 'No members yet.';
    memberListEl.appendChild(empty);
    return;
  }

  state.members.forEach(function(member) {
    var color = getMemberColor(member.colorIndex);
    var pending = member.tasks.filter(function(t) { return !t.done; }).length;

    var row = document.createElement('div');
    row.className = 'member-row' + (member.id === state.selectedMemberId ? ' active' : '');
    row.id = 'member-row-' + member.id;
    row.style.setProperty('--row-color', color);
    row.onclick = (function(mid) { return function() { selectMember(mid); }; })(member.id);

    var avatar = document.createElement('div');
    avatar.className = 'member-row-avatar';
    avatar.textContent = getInitials(member.name);
    avatar.style.background = hexToRgba(color, 0.15);

    var nameEl = document.createElement('span');
    nameEl.className = 'member-row-name';
    nameEl.textContent = member.name;

    var badge = document.createElement('span');
    badge.className = 'member-row-badge' + (pending > 0 ? ' visible' : '');
    badge.id = 'member-row-badge-' + member.id;
    if (pending > 0) badge.textContent = String(pending);

    row.appendChild(avatar);
    row.appendChild(nameEl);
    row.appendChild(badge);
    memberListEl.appendChild(row);
  });
}

function renderGlobalLinksList() {
  globalLinksListEl.innerHTML = '';

  if (state.globalLinks.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'global-links-empty';
    empty.textContent = 'No sprint links yet.';
    globalLinksListEl.appendChild(empty);
    return;
  }

  state.globalLinks.forEach(function(link) {
    var item = document.createElement('div');
    item.className = 'global-link-item';

    var labelEl = document.createElement('span');
    labelEl.className = 'link-label-chip';
    labelEl.textContent = link.label;

    var openBtn = document.createElement('button');
    openBtn.className = 'btn-open-link';
    openBtn.textContent = 'Open';
    openBtn.title = link.url;
    openBtn.onclick = (function(url) { return function() { openLink(url); }; })(link.url);

    var delBtn = document.createElement('button');
    delBtn.className = 'btn-delete-link';
    delBtn.textContent = '\xd7';
    delBtn.title = 'Remove';
    delBtn.onclick = (function(lid) { return function() { deleteGlobalLink(lid); }; })(link.id);

    item.appendChild(labelEl);
    item.appendChild(openBtn);
    item.appendChild(delBtn);
    globalLinksListEl.appendChild(item);
  });
}

function renderMemberLinksList(member) {
  memberLinksListEl.innerHTML = '';

  (member.links || []).forEach(function(link) {
    var item = document.createElement('div');
    item.className = 'member-link-item';

    var labelEl = document.createElement('span');
    labelEl.className = 'member-link-label';
    labelEl.textContent = link.label;

    var urlEl = document.createElement('span');
    urlEl.className = 'member-link-url';
    urlEl.textContent = link.url;
    urlEl.title = link.url;
    urlEl.onclick = (function(url) { return function() { openLink(url); }; })(link.url);

    var openBtn = document.createElement('button');
    openBtn.className = 'btn-open-link';
    openBtn.textContent = 'Open';
    openBtn.title = link.url;
    openBtn.onclick = (function(url) { return function() { openLink(url); }; })(link.url);

    var delBtn = document.createElement('button');
    delBtn.className = 'btn-delete-link';
    delBtn.textContent = '\xd7';
    delBtn.title = 'Remove';
    delBtn.onclick = (function(mid, lid) { return function() { deleteMemberLink(mid, lid); }; })(member.id, link.id);

    item.appendChild(labelEl);
    item.appendChild(urlEl);
    item.appendChild(openBtn);
    item.appendChild(delBtn);
    memberLinksListEl.appendChild(item);
  });
}

function renderRightPanel() {
  hideMemberAddLinkForm();

  var member = getSelectedMember();

  if (!member) {
    emptyDetailEl.style.display = '';
    memberDetailEl.classList.add('hidden');
    return;
  }

  emptyDetailEl.style.display = 'none';
  memberDetailEl.classList.remove('hidden');

  var color = getMemberColor(member.colorIndex);
  memberDetailEl.style.setProperty('--member-color', color);

  detailHeaderEl.innerHTML = '';

  var avatar = document.createElement('div');
  avatar.className = 'detail-avatar';
  avatar.textContent = getInitials(member.name);
  avatar.style.background = hexToRgba(color, 0.15);

  var nameEl = document.createElement('span');
  nameEl.className = 'detail-name';
  nameEl.textContent = member.name;

  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-delete-member';
  deleteBtn.textContent = 'Remove member';
  deleteBtn.onclick = (function(mid) { return function() { deleteMember(mid); }; })(member.id);

  detailHeaderEl.appendChild(avatar);
  detailHeaderEl.appendChild(nameEl);
  detailHeaderEl.appendChild(deleteBtn);

  renderMemberLinksList(member);

  memberNotesEl.value = member.notes;

  memberTaskListEl.innerHTML = '';
  member.tasks.forEach(function(task) {
    memberTaskListEl.appendChild(buildTaskElement(member.id, task, false));
  });

  addTaskInputEl.value = '';
  addTaskInputEl.onkeydown = function(e) {
    if (e.key === 'Enter') addTask(member.id);
    if (e.key === 'Escape') addTaskInputEl.blur();
  };
}

function renderAll() {
  renderMemberList();
  renderGlobalLinksList();
  renderRightPanel();
}

function selectMember(memberId) {
  savePendingNotes();
  state.selectedMemberId = memberId;
  persistState();

  document.querySelectorAll('.member-row').forEach(function(row) { row.classList.remove('active'); });
  var activeRow = document.getElementById('member-row-' + memberId);
  if (activeRow) activeRow.classList.add('active');

  renderRightPanel();
}

function showAddMemberForm() {
  addMemberForm.classList.add('visible');
  newMemberInput.focus();
}

function hideAddMemberForm() {
  addMemberForm.classList.remove('visible');
  newMemberInput.value = '';
}

function commitAddMember() {
  var name = newMemberInput.value.trim();
  if (!name) return;

  var member = {
    id: nextMemberId++,
    name: name,
    colorIndex: state.members.length % MEMBER_COLORS.length,
    links: [],
    notes: '',
    tasks: [],
  };
  state.members.push(member);
  state.selectedMemberId = member.id;
  hideAddMemberForm();
  persistState();
  renderAll();
}

function deleteMember(memberId) {
  state.members = state.members.filter(function(m) { return m.id !== memberId; });
  if (state.selectedMemberId === memberId) {
    state.selectedMemberId = state.members.length > 0 ? state.members[0].id : null;
  }
  persistState();
  renderAll();
}

function showGlobalAddLinkForm() {
  globalAddForm.classList.add('visible');
  document.getElementById('globalLinkLabel').focus();
}

function hideGlobalAddLinkForm() {
  globalAddForm.classList.remove('visible');
  document.getElementById('globalLinkLabel').value = '';
  document.getElementById('globalLinkUrl').value = '';
}

function commitAddGlobalLink() {
  var label = document.getElementById('globalLinkLabel').value.trim();
  var url   = document.getElementById('globalLinkUrl').value.trim();
  if (!label || !url) return;
  state.globalLinks.push({ id: nextLinkId++, label: label, url: url });
  hideGlobalAddLinkForm();
  persistState();
  renderGlobalLinksList();
}

function deleteGlobalLink(linkId) {
  state.globalLinks = state.globalLinks.filter(function(l) { return l.id !== linkId; });
  persistState();
  renderGlobalLinksList();
}

function showMemberAddLinkForm() {
  memberAddLinkForm.classList.add('visible');
  document.getElementById('btnAddMemberLink').style.display = 'none';
  document.getElementById('memberLinkLabel').focus();
}

function hideMemberAddLinkForm() {
  memberAddLinkForm.classList.remove('visible');
  var addBtn = document.getElementById('btnAddMemberLink');
  if (addBtn) addBtn.style.display = '';
  var lbl = document.getElementById('memberLinkLabel');
  if (lbl) lbl.value = '';
  var urlInput = document.getElementById('memberLinkUrl');
  if (urlInput) urlInput.value = '';
}

function commitAddMemberLink() {
  var label = document.getElementById('memberLinkLabel').value.trim();
  var url   = document.getElementById('memberLinkUrl').value.trim();
  if (!label || !url) return;
  var member = getSelectedMember();
  if (!member) return;
  member.links.push({ id: nextLinkId++, label: label, url: url });
  hideMemberAddLinkForm();
  persistState();
  renderMemberLinksList(member);
}

function deleteMemberLink(memberId, linkId) {
  var member = state.members.find(function(m) { return m.id === memberId; });
  if (!member) return;
  member.links = member.links.filter(function(l) { return l.id !== linkId; });
  persistState();
  renderMemberLinksList(member);
}

function openLink(url) {
  vscode.postMessage({ type: 'openUrl', url: url });
}

memberNotesEl.addEventListener('blur', function() {
  var member = getSelectedMember();
  if (!member) return;
  member.notes = this.value;
  persistState();
});

function addTask(memberId) {
  var text = addTaskInputEl.value.trim();
  if (!text) return;
  var member = state.members.find(function(m) { return m.id === memberId; });
  if (!member) return;
  var task = { id: nextTaskId++, text: text, done: false };
  member.tasks.push(task);
  addTaskInputEl.value = '';
  memberTaskListEl.appendChild(buildTaskElement(memberId, task, true));
  updateBadge(memberId);
  persistState();
}

function toggleTask(memberId, taskId) {
  var member = state.members.find(function(m) { return m.id === memberId; });
  if (!member) return;
  var task = member.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  task.done = !task.done;
  var checkEl = document.getElementById('task-check-' + taskId);
  var textEl  = document.getElementById('task-text-'  + taskId);
  if (checkEl) checkEl.classList.toggle('checked', task.done);
  if (textEl)  textEl.classList.toggle('done', task.done);
  updateBadge(memberId);
  persistState();
}

function deleteTask(memberId, taskId) {
  var member = state.members.find(function(m) { return m.id === memberId; });
  if (!member) return;
  member.tasks = member.tasks.filter(function(t) { return t.id !== taskId; });
  var el = document.getElementById('task-item-' + taskId);
  if (el) el.remove();
  updateBadge(memberId);
  persistState();
}

function updateBadge(memberId) {
  var member = state.members.find(function(m) { return m.id === memberId; });
  if (!member) return;
  var badge = document.getElementById('member-row-badge-' + memberId);
  if (!badge) return;
  var pending = member.tasks.filter(function(t) { return !t.done; }).length;
  badge.textContent = pending > 0 ? String(pending) : '';
  badge.classList.toggle('visible', pending > 0);
}

function buildTaskElement(memberId, task, isNew) {
  var item = document.createElement('div');
  item.className = 'task-item' + (isNew ? ' entering' : '');
  item.id = 'task-item-' + task.id;

  var check = document.createElement('div');
  check.className = 'task-checkbox' + (task.done ? ' checked' : '');
  check.id = 'task-check-' + task.id;
  check.onclick = (function(mid, tid) { return function() { toggleTask(mid, tid); }; })(memberId, task.id);

  var text = document.createElement('span');
  text.className = 'task-text' + (task.done ? ' done' : '');
  text.id = 'task-text-' + task.id;
  text.textContent = task.text;
  text.onclick = (function(mid, tid) { return function() { toggleTask(mid, tid); }; })(memberId, task.id);

  var del = document.createElement('button');
  del.className = 'btn-delete-task';
  del.textContent = '\xd7';
  del.title = 'Remove';
  del.onclick = (function(mid, tid) { return function() { deleteTask(mid, tid); }; })(memberId, task.id);

  item.appendChild(check);
  item.appendChild(text);
  item.appendChild(del);
  return item;
}

document.getElementById('btnAddMember').onclick = showAddMemberForm;
document.getElementById('btnCancelAddMember').onclick = hideAddMemberForm;
document.getElementById('btnConfirmAddMember').onclick = commitAddMember;

newMemberInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter')  commitAddMember();
  if (e.key === 'Escape') hideAddMemberForm();
});

document.getElementById('btnAddGlobalLink').onclick = showGlobalAddLinkForm;
document.getElementById('btnGlobalLinkCancel').onclick = hideGlobalAddLinkForm;
document.getElementById('btnGlobalLinkConfirm').onclick = commitAddGlobalLink;

document.getElementById('globalLinkLabel').addEventListener('keydown', function(e) {
  if (e.key === 'Enter')  document.getElementById('globalLinkUrl').focus();
  if (e.key === 'Escape') hideGlobalAddLinkForm();
});

document.getElementById('globalLinkUrl').addEventListener('keydown', function(e) {
  if (e.key === 'Enter')  commitAddGlobalLink();
  if (e.key === 'Escape') hideGlobalAddLinkForm();
});

document.getElementById('btnAddMemberLink').onclick = showMemberAddLinkForm;
document.getElementById('btnMemberLinkCancel').onclick = hideMemberAddLinkForm;
document.getElementById('btnMemberLinkConfirm').onclick = commitAddMemberLink;

document.getElementById('memberLinkLabel').addEventListener('keydown', function(e) {
  if (e.key === 'Enter')  document.getElementById('memberLinkUrl').focus();
  if (e.key === 'Escape') hideMemberAddLinkForm();
});

document.getElementById('memberLinkUrl').addEventListener('keydown', function(e) {
  if (e.key === 'Enter')  commitAddMemberLink();
  if (e.key === 'Escape') hideMemberAddLinkForm();
});

renderAll();
</script>`;
}

function buildTeamTrackerPanelHtml(nonce, rawState) {
  const state = resolveInitialState(rawState);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
${buildTeamStyles(nonce)}
</head>
<body>
${buildTeamLayout()}
${buildTeamScript(nonce, state)}
</body>
</html>`;
}

module.exports = { buildTeamTrackerPanelHtml };
