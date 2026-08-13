const test = require('node:test');
const assert = require('node:assert/strict');
const { packageArgs, uploadArgs, cleanHost } = require('../server/root-builds.cjs');

test('Root package command targets rootapp.pkg from project root', () => {
  assert.deepEqual(packageArgs(), [
    'rootsdk', 'build', 'package',
    '--output-file', './rootapp.pkg',
    '--project-folder', '.'
  ]);
});

test('Root upload command uses authToken and optional host', () => {
  assert.deepEqual(uploadArgs('secret-token'), [
    'rootsdk', 'upload', 'package',
    '--file', './rootapp.pkg',
    '--authToken', 'secret-token'
  ]);
  assert.deepEqual(uploadArgs('secret-token', 'https://dev.rootapp.com/'), [
    'rootsdk', 'upload', 'package',
    '--file', './rootapp.pkg',
    '--authToken', 'secret-token',
    '--host', 'dev.rootapp.com'
  ]);
});

test('Root host normalization rejects shell-like values', () => {
  assert.equal(cleanHost('dev.rootapp.com'), 'dev.rootapp.com');
  assert.equal(cleanHost(''), '');
  assert.throws(() => cleanHost('dev.rootapp.com;rm -rf /'), /hostname/);
});
