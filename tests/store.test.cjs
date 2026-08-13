const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore, encryptJson, decryptJson } = require('../server/store.cjs');

test('AES encrypted payload round-trips', () => {
  const key = Buffer.alloc(32, 7);
  const payload = encryptJson({ secret: 'neko' }, key);
  assert.notEqual(payload.data, 'neko');
  assert.deepEqual(decryptJson(payload, key), { secret: 'neko' });
});

test('public instance never exposes secrets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nekodeck-'));
  const store = createStore(dir);
  const item = store.createInstance({
    templateId: 'hypixel', name: 'Test', config: {},
    credentials: { discordClientId: '123', discordClientSecret: 'secret', botToken: 'token', providerApiKey: 'api' }
  });
  assert.equal(item.discordClientId, '123');
  assert.equal(item.credentialStatus.discordClientSecret, true);
  assert.equal(JSON.stringify(item).includes('secret'), false);
  assert.equal(JSON.stringify(item).includes('token'), false);
  assert.equal(JSON.stringify(item).includes('api'), false);
});
