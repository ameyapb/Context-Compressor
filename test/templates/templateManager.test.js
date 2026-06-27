'use strict';

const assert = require('node:assert/strict');
const {
  TEMPLATES_STORAGE_KEY,
  slugifyTemplateName,
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
} = require('../../src/templates/templateManager');

function makeStorage(initial = {}) {
  let store = { ...initial };
  return {
    get(key, defaultValue) {
      return key in store ? store[key] : defaultValue;
    },
    update(key, value) {
      store[key] = value;
    },
    _store: () => store,
  };
}

describe('slugifyTemplateName', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    assert.equal(slugifyTemplateName('Plan Feature'), 'plan-feature');
  });

  it('removes characters outside a-z, 0-9, and hyphen', () => {
    assert.equal(slugifyTemplateName('Review (Security)!'), 'review-security');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    assert.equal(slugifyTemplateName('Write  Tests'), 'write-tests');
  });

  it('trims leading and trailing whitespace', () => {
    assert.equal(slugifyTemplateName('  plan  '), 'plan');
  });

  it('returns "template" when the result would be empty', () => {
    assert.equal(slugifyTemplateName('!!!'), 'template');
  });

  it('handles an already-valid slug unchanged', () => {
    assert.equal(slugifyTemplateName('plan-feature'), 'plan-feature');
  });

  it('returns "template" for an empty string', () => {
    assert.equal(slugifyTemplateName(''), 'template');
  });

  it('returns "template" for whitespace-only input', () => {
    assert.equal(slugifyTemplateName('   '), 'template');
  });

  it('handles numeric-only names correctly', () => {
    assert.equal(slugifyTemplateName('123'), '123');
  });

  it('converts uppercase letters to lowercase', () => {
    assert.equal(slugifyTemplateName('A B C'), 'a-b-c');
  });

  it('strips special characters that are not alphanumeric or hyphens', () => {
    assert.equal(slugifyTemplateName('hello@world!'), 'helloworld');
  });
});

describe('getAllTemplates', () => {
  it('returns empty object when nothing stored', () => {
    const storage = makeStorage();
    assert.deepEqual(getAllTemplates(storage), {});
  });

  it('returns stored templates', () => {
    const storage = makeStorage({
      [TEMPLATES_STORAGE_KEY]: { plan: { name: 'Plan', body: 'Plan it', createdAt: 1 } },
    });
    assert.deepEqual(getAllTemplates(storage), {
      plan: { name: 'Plan', body: 'Plan it', createdAt: 1 },
    });
  });
});

describe('saveTemplate', () => {
  it('creates a new template and returns its id', () => {
    const storage = makeStorage();
    const id = saveTemplate(storage, 'Plan Feature', 'Plan the impl...');
    assert.equal(id, 'plan-feature');
    const templates = getAllTemplates(storage);
    assert.equal(templates['plan-feature'].name, 'Plan Feature');
    assert.equal(templates['plan-feature'].body, 'Plan the impl...');
    assert.ok(typeof templates['plan-feature'].createdAt === 'number');
  });

  it('overwrites body and name when saving with the same slugified name', () => {
    const storage = makeStorage({
      [TEMPLATES_STORAGE_KEY]: { plan: { name: 'Plan', body: 'Old body', createdAt: 42 } },
    });
    saveTemplate(storage, 'Plan', 'New body');
    const templates = getAllTemplates(storage);
    assert.equal(templates['plan'].body, 'New body');
  });

  it('preserves the original createdAt when overwriting', () => {
    const storage = makeStorage({
      [TEMPLATES_STORAGE_KEY]: { plan: { name: 'Plan', body: 'Old', createdAt: 42 } },
    });
    saveTemplate(storage, 'Plan', 'New body');
    assert.equal(getAllTemplates(storage)['plan'].createdAt, 42);
  });

  it('preserves other templates when saving a new one', () => {
    const storage = makeStorage({
      [TEMPLATES_STORAGE_KEY]: { review: { name: 'Review', body: 'Review it', createdAt: 1 } },
    });
    saveTemplate(storage, 'Plan', 'Plan it');
    const templates = getAllTemplates(storage);
    assert.ok('review' in templates);
    assert.ok('plan' in templates);
  });

  it('saves a template with an empty body', () => {
    const storage = makeStorage();
    saveTemplate(storage, 'Empty', '');
    assert.equal(getAllTemplates(storage)['empty'].body, '');
  });

  it('uses the "template" fallback id when the name contains only special characters', () => {
    const storage = makeStorage();
    const id = saveTemplate(storage, '!!!', 'some body');
    assert.equal(id, 'template');
    assert.ok('template' in getAllTemplates(storage));
    assert.equal(getAllTemplates(storage)['template'].body, 'some body');
  });

  it('stores the original (un-slugified) name alongside the slug', () => {
    const storage = makeStorage();
    saveTemplate(storage, 'My Template', 'body text');
    const templates = getAllTemplates(storage);
    assert.equal(templates['my-template'].name, 'My Template');
  });
});

describe('deleteTemplate', () => {
  it('removes the template by id', () => {
    const storage = makeStorage({
      [TEMPLATES_STORAGE_KEY]: {
        plan: { name: 'Plan', body: 'Plan it', createdAt: 1 },
        review: { name: 'Review', body: 'Review it', createdAt: 2 },
      },
    });
    deleteTemplate(storage, 'plan');
    const templates = getAllTemplates(storage);
    assert.equal('plan' in templates, false);
    assert.ok('review' in templates);
  });

  it('does not throw when deleting a non-existent id', () => {
    const storage = makeStorage();
    assert.doesNotThrow(() => deleteTemplate(storage, 'nonexistent'));
  });

  it('leaves storage empty after deleting the last template', () => {
    const storage = makeStorage({
      [TEMPLATES_STORAGE_KEY]: { plan: { name: 'Plan', body: 'Plan it', createdAt: 1 } },
    });
    deleteTemplate(storage, 'plan');
    assert.deepEqual(getAllTemplates(storage), {});
  });
});
