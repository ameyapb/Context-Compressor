'use strict';

const TEMPLATES_STORAGE_KEY = 'token-budget-builder.promptTemplates';

function slugifyTemplateName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'template';
}

function getAllTemplates(storage) {
  return storage.get(TEMPLATES_STORAGE_KEY, {});
}

function saveTemplate(storage, name, body) {
  const id = slugifyTemplateName(name);
  const existing = getAllTemplates(storage);
  const createdAt = existing[id] ? existing[id].createdAt : Date.now();
  storage.update(TEMPLATES_STORAGE_KEY, {
    ...existing,
    [id]: { name, body, createdAt },
  });
  return id;
}

function deleteTemplate(storage, id) {
  const existing = getAllTemplates(storage);
  const updated = { ...existing };
  delete updated[id];
  storage.update(TEMPLATES_STORAGE_KEY, updated);
}

module.exports = {
  TEMPLATES_STORAGE_KEY,
  slugifyTemplateName,
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
};
