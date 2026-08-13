const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeActivitySettings } = require('../server/activity-management.cjs');

test('Activity settings accept participant metadata and deployment controls', () => {
  const result = sanitizeActivitySettings({
    name: 'My Game',
    maxParticipants: '8',
    releaseChannel: 'production',
    verificationStatus: 'verified',
    guildInstall: true,
    userInstall: true,
    platformWeb: true,
    platformIos: false,
    platformAndroid: true,
    buildHint: 'unity-webgl'
  });
  assert.deepEqual(result, {
    name: 'My Game',
    maxParticipants: 8,
    releaseChannel: 'production',
    verificationStatus: 'verified',
    guildInstall: true,
    userInstall: true,
    platformWeb: true,
    platformIos: false,
    platformAndroid: true,
    buildHint: 'unity-webgl'
  });
});

test('Activity settings allow blank max participants for unlimited', () => {
  assert.equal(sanitizeActivitySettings({ maxParticipants: '' }).maxParticipants, null);
});

test('Activity settings reject invalid participant limits', () => {
  assert.throws(() => sanitizeActivitySettings({ maxParticipants: 1001 }), /1 and 1000/);
});

test('Activity settings only allow HTTP(S) external app URLs', () => {
  assert.throws(() => sanitizeActivitySettings({ activityUrl: 'file:///tmp/game.html' }), /HTTP or HTTPS/);
  assert.equal(sanitizeActivitySettings({ activityUrl: 'https://example.com/game/' }).activityUrl, 'https://example.com/game/');
});
