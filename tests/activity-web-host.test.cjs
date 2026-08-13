const test = require('node:test');
const assert = require('node:assert/strict');
const { detectBuildFromPaths, unityHeadersForPath } = require('../server/activity-web-host.cjs');

test('detects a Unity WebGL build folder', () => {
  const result = detectBuildFromPaths([
    'MyGame/index.html',
    'MyGame/Build/MyGame.loader.js',
    'MyGame/Build/MyGame.framework.js.br',
    'MyGame/Build/MyGame.data.br',
    'MyGame/Build/MyGame.wasm.br',
    'MyGame/TemplateData/style.css'
  ]);
  assert.equal(result.type, 'unity-webgl');
  assert.equal(result.entry, 'MyGame/index.html');
  assert.equal(result.unity.loader, 'MyGame/Build/MyGame.loader.js');
  assert.equal(result.unity.wasm, 'MyGame/Build/MyGame.wasm.br');
  assert.equal(result.unity.data, 'MyGame/Build/MyGame.data.br');
  assert.equal(result.unity.templateData, true);
});

test('sets correct Unity Brotli WebAssembly headers', () => {
  assert.deepEqual(unityHeadersForPath('Build/game.wasm.br'), {
    'Content-Encoding': 'br',
    'Content-Type': 'application/wasm',
    Vary: 'Accept-Encoding'
  });
});

test('sets correct Unity gzip JavaScript headers', () => {
  assert.deepEqual(unityHeadersForPath('Build/game.framework.js.gz'), {
    'Content-Encoding': 'gzip',
    'Content-Type': 'application/javascript; charset=utf-8',
    Vary: 'Accept-Encoding'
  });
});

test('serves decompression-fallback unityweb as binary without forcing encoding', () => {
  assert.deepEqual(unityHeadersForPath('Build/game.wasm.unityweb'), {
    'Content-Type': 'application/wasm'
  });
  assert.deepEqual(unityHeadersForPath('Build/game.data.unityweb'), {
    'Content-Type': 'application/octet-stream'
  });
});
