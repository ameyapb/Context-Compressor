'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function resolvedPath(relativePath) {
  return path.join(ROOT, relativePath);
}

function fileExists(relativePath) {
  return fs.existsSync(resolvedPath(relativePath));
}

describe('package.json — required top-level fields', () => {
  const requiredStringFields = ['name', 'displayName', 'description', 'version', 'publisher', 'license', 'main', 'icon'];

  for (const field of requiredStringFields) {
    it(`"${field}" is a non-empty string`, () => {
      assert.equal(typeof manifest[field], 'string', `"${field}" must be a string`);
      assert.ok(manifest[field].length > 0, `"${field}" must be non-empty`);
    });
  }

  it('"engines.vscode" is a non-empty string', () => {
    assert.equal(typeof manifest.engines?.vscode, 'string');
    assert.ok(manifest.engines.vscode.length > 0);
  });

  it('"repository.url" is a non-empty string', () => {
    assert.equal(typeof manifest.repository?.url, 'string');
    assert.ok(manifest.repository.url.length > 0);
  });
});

describe('package.json — referenced files exist on disk', () => {
  it('"main" entry point exists', () => {
    assert.ok(fileExists(manifest.main), `"main" file not found: ${manifest.main}`);
  });

  it('"icon" (Marketplace thumbnail) exists', () => {
    assert.ok(fileExists(manifest.icon), `"icon" file not found: ${manifest.icon}`);
  });

  it('"icon" (Marketplace thumbnail) is not an SVG (vsce publishing rule)', () => {
    assert.ok(!manifest.icon.endsWith('.svg'), `"icon" must not be SVG for Marketplace publishing, got: ${manifest.icon}`);
  });

  it('each viewsContainers activitybar icon exists on disk', () => {
    const containers = manifest.contributes?.viewsContainers?.activitybar ?? [];
    assert.ok(containers.length > 0, 'expected at least one activitybar viewsContainer');
    for (const container of containers) {
      assert.ok(typeof container.icon === 'string' && container.icon.length > 0, `container "${container.id}" is missing an icon field`);
      assert.ok(fileExists(container.icon), `activitybar icon not found: ${container.icon} (for container "${container.id}")`);
    }
  });

  it('each viewsContainers activitybar icon is SVG (required by VS Code)', () => {
    const containers = manifest.contributes?.viewsContainers?.activitybar ?? [];
    for (const container of containers) {
      assert.ok(container.icon?.endsWith('.svg'), `activitybar icon must be SVG, got: ${container.icon} (for container "${container.id}")`);
    }
  });

  it('each command icon that references a file path exists on disk', () => {
    const commands = manifest.contributes?.commands ?? [];
    for (const command of commands) {
      if (typeof command.icon === 'string' && !command.icon.startsWith('$(')) {
        assert.ok(fileExists(command.icon), `command icon file not found: ${command.icon} (for command "${command.command}")`);
      }
    }
  });
});

describe('required distribution files exist', () => {
  it('README.md exists at repo root', () => {
    assert.ok(fileExists('README.md'), 'README.md is required for the VS Code Marketplace listing');
  });

  it('LICENSE exists at repo root', () => {
    assert.ok(fileExists('LICENSE'), 'LICENSE file is required');
  });

  it('media/ directory exists', () => {
    const mediaPath = resolvedPath('media');
    assert.ok(fs.existsSync(mediaPath) && fs.statSync(mediaPath).isDirectory(), 'media/ directory must exist');
  });
});

describe('package.json — contributes structure', () => {
  it('has at least one viewsContainers activitybar entry', () => {
    const containers = manifest.contributes?.viewsContainers?.activitybar ?? [];
    assert.ok(containers.length > 0, 'at least one activitybar viewsContainer must be defined');
  });

  it('each viewsContainers entry has id, title, and icon fields', () => {
    const containers = manifest.contributes?.viewsContainers?.activitybar ?? [];
    for (const container of containers) {
      assert.equal(typeof container.id, 'string', 'container id must be a string');
      assert.ok(container.id.length > 0, 'container id must be non-empty');
      assert.equal(typeof container.title, 'string', 'container title must be a string');
      assert.ok(container.title.length > 0, 'container title must be non-empty');
      assert.equal(typeof container.icon, 'string', 'container icon must be a string');
      assert.ok(container.icon.length > 0, 'container icon must be non-empty');
    }
  });

  it('each view is registered under a known viewsContainer id', () => {
    const containerIds = new Set(
      (manifest.contributes?.viewsContainers?.activitybar ?? []).map((c) => c.id)
    );
    const views = manifest.contributes?.views ?? {};
    for (const containerId of Object.keys(views)) {
      assert.ok(containerIds.has(containerId), `view registered under unknown container id: "${containerId}"`);
    }
  });

  it('has at least one command', () => {
    const commands = manifest.contributes?.commands ?? [];
    assert.ok(commands.length > 0, 'at least one command must be contributed');
  });

  it('each command has non-empty command and title strings', () => {
    const commands = manifest.contributes?.commands ?? [];
    for (const command of commands) {
      assert.equal(typeof command.command, 'string');
      assert.ok(command.command.length > 0, 'command id must be non-empty');
      assert.equal(typeof command.title, 'string');
      assert.ok(command.title.length > 0, 'command title must be non-empty');
    }
  });

  it('all command ids are unique', () => {
    const commands = manifest.contributes?.commands ?? [];
    const ids = commands.map((c) => c.command);
    assert.equal(new Set(ids).size, ids.length, 'all command ids must be unique');
  });

  it('"activationEvents" is an empty array (VS Code 1.74+ infers events automatically)', () => {
    assert.ok(Array.isArray(manifest.activationEvents), '"activationEvents" must be an array');
    assert.equal(manifest.activationEvents.length, 0, '"activationEvents" must be empty — do not use "*" or explicit events');
  });
});
