'use strict';

const assert = require('node:assert/strict');
const Module = require('module');

const firedEvents = [];

const vscodeMock = {
  EventEmitter: class {
    constructor() {
      this._listeners = [];
    }
    get event() {
      return (listener) => { this._listeners.push(listener); };
    }
    fire(data) {
      firedEvents.push(data);
      for (const listener of this._listeners) listener(data);
    }
  },
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0 },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

delete require.cache[require.resolve('../src/buildPromptProvider')];
const { BuildPromptTreeProvider } = require('../src/buildPromptProvider');

describe('BuildPromptTreeProvider', () => {
  describe('getChildren', () => {
    it('returns exactly three items', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const children = provider.getChildren();
      assert.equal(children.length, 3);
    });

    it('first item has label "Model" and description from getModelLabel callback', () => {
      const provider = new BuildPromptTreeProvider(() => 'Claude 3.5 Sonnet', () => 'None');
      const [modelItem] = provider.getChildren();
      assert.equal(modelItem.label, 'Model');
      assert.equal(modelItem.description, 'Claude 3.5 Sonnet');
    });

    it('second item has label "Compression" and description from getCompressionLabel callback', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'Strip Comments');
      const [, compressionItem] = provider.getChildren();
      assert.equal(compressionItem.label, 'Compression');
      assert.equal(compressionItem.description, 'Strip Comments');
    });

    it('third item has label "Copy Prompt"', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const [, , copyItem] = provider.getChildren();
      assert.equal(copyItem.label, 'Copy Prompt');
    });

    it('model item has a non-empty tooltip', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const [modelItem] = provider.getChildren();
      assert.ok(modelItem.tooltip && modelItem.tooltip.length > 0);
    });

    it('compression item has a non-empty tooltip', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const [, compressionItem] = provider.getChildren();
      assert.ok(compressionItem.tooltip && compressionItem.tooltip.length > 0);
    });

    it('copy item has a non-empty tooltip', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const [, , copyItem] = provider.getChildren();
      assert.ok(copyItem.tooltip && copyItem.tooltip.length > 0);
    });

    it('model item fires selectModel command on click', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const [modelItem] = provider.getChildren();
      assert.equal(modelItem.command.command, 'token-budget-builder.selectModel');
    });

    it('compression item fires setCompressionMode command on click', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const [, compressionItem] = provider.getChildren();
      assert.equal(compressionItem.command.command, 'token-budget-builder.setCompressionMode');
    });

    it('copy item fires assemblePrompt command on click', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const [, , copyItem] = provider.getChildren();
      assert.equal(copyItem.command.command, 'token-budget-builder.assemblePrompt');
    });

    it('reflects updated label when callback returns a new value', () => {
      let modelName = 'GPT-4o';
      const provider = new BuildPromptTreeProvider(() => modelName, () => 'None');
      modelName = 'Claude 3.5 Sonnet';
      const [modelItem] = provider.getChildren();
      assert.equal(modelItem.description, 'Claude 3.5 Sonnet');
    });
  });

  describe('getTreeItem', () => {
    it('returns the element unchanged', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const [item] = provider.getChildren();
      assert.strictEqual(provider.getTreeItem(item), item);
    });
  });

  describe('refresh', () => {
    it('fires onDidChangeTreeData event', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      provider.refresh();
      assert.equal(fired, true);
    });

    it('fires with undefined as the event data', () => {
      const provider = new BuildPromptTreeProvider(() => 'GPT-4o', () => 'None');
      const received = [];
      provider.onDidChangeTreeData((data) => { received.push(data); });
      provider.refresh();
      assert.equal(received.length, 1);
      assert.equal(received[0], undefined);
    });
  });
});
