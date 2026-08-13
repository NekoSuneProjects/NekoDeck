const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildManifest, buildScaffoldZip } = require('../server/rootapp.cjs');

function instance(overrides = {}) {
  return {
    id: '12345678-abcd',
    templateId: 'web-activity',
    name: 'Neko Test Game',
    config: {
      activitySourceType: 'upload',
      activityEntry: 'Game/index.html',
      platformTargets: { discord: true, rootapp: true },
      rootApp: {
        enabled: true,
        projectId: 'root-project-123',
        version: '1.2.3',
        settings: { groups: [] },
        permissions: { channel: { createMessage: true } }
      }
    },
    credentialStatus: {},
    ...overrides
  };
}

test('builds a Root manifest with client/server package configuration', () => {
  const manifest = buildManifest(instance());
  assert.equal(manifest.id, 'root-project-123');
  assert.equal(manifest.version, '1.2.3');
  assert.equal(manifest.package.client.deploy, 'client/dist');
  assert.equal(manifest.package.server.launch, 'server/dist/main.js');
  assert.deepEqual(manifest.package.server.deploy, ['server/dist']);
  assert.deepEqual(manifest.package.server.nodeModules, ['server/node_modules']);
  assert.deepEqual(manifest.permissions, { channel: { createMessage: true } });
});

test('rejects invalid Root semantic versions', () => {
  assert.throws(() => buildManifest(instance({ config: { rootApp: { projectId: 'abc', version: 'v1' } } })), /semantic versioning/);
});

test('Root export bundles an uploaded Activity client and minimal Root server', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nekodeck-root-'));
  try {
    const base = path.join(dataDir, 'activity-content', '12345678-abcd', 'Game');
    fs.mkdirSync(path.join(base, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(base, 'index.html'), '<!doctype html><script src="assets/game.js"></script>');
    fs.writeFileSync(path.join(base, 'assets', 'game.js'), 'console.log("game")');
    const out = buildScaffoldZip(instance(), dataDir);
    assert.equal(out.bundledClient, true);
    const names = out.zip.getEntries().map((entry) => entry.entryName);
    assert.ok(names.includes('root-manifest.json'));
    assert.ok(names.includes('server/src/main.ts'));
    assert.ok(names.includes('server/package.json'));
    assert.ok(names.includes('client/dist/index.html'));
    assert.ok(names.includes('client/dist/assets/game.js'));
    assert.equal(names.some((name) => name.endsWith('.env')), false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
