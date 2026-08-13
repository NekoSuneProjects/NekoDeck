const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCommand,
  normalizeAutoReply,
  normalizeBotConfig,
  rootManifest,
  buildDiscordZip,
  buildRootZip,
  DISCORD_JS_VERSION
} = require('../server/bots.cjs');

function sampleConfig() {
  return normalizeBotConfig({
    description: 'Test bot',
    platforms: { discord: true, rootapp: true },
    discord: { clientId: '123456789012345678', guildId: '987654321098765432', statusText: 'Watching tests' },
    rootapp: { projectId: 'ACj4U-eThgmjXUOBAjk_jw', version: '1.2.3', uploadHost: 'dev.rootapp.com', settings: {}, permissions: { community: { manageRoles: true } } },
    commands: [{ name: 'ping', description: 'Replies with Pong!', response: 'Pong {user}', discord: true, rootapp: true, ephemeral: true }],
    autoReplies: [{ trigger: 'hello', response: 'Hi {user}', mode: 'contains', discord: true, rootapp: true }]
  });
}

test('command validation normalizes supported command names', () => {
  const command = normalizeCommand({ name: 'PING', description: 'Ping', response: 'pong' });
  assert.equal(command.name, 'ping');
  assert.equal(command.discord, true);
  assert.equal(command.rootapp, true);
  assert.throws(() => normalizeCommand({ name: 'Bad Command!', description: 'x' }), /lowercase letters/);
});

test('auto reply validates regex rules', () => {
  assert.equal(normalizeAutoReply({ trigger: '^hello', response: 'hi', mode: 'regex' }).mode, 'regex');
  assert.throws(() => normalizeAutoReply({ trigger: '[', response: 'x', mode: 'regex' }), /invalid regex/);
});

test('Root Bot config normalizes optional upload host', () => {
  assert.equal(sampleConfig().rootapp.uploadHost, 'dev.rootapp.com');
  assert.throws(() => normalizeBotConfig({ rootapp: { version: '1.0.0', uploadHost: 'bad host/path' } }), /hostname/);
});

test('Root Bot manifest is server-only and always requests createMessage', () => {
  const manifest = rootManifest(sampleConfig());
  assert.equal(manifest.id, 'ACj4U-eThgmjXUOBAjk_jw');
  assert.equal(manifest.version, '1.2.3');
  assert.deepEqual(manifest.package.server, { launch: 'dist/main.js', deploy: ['dist'], nodeModules: ['node_modules'] });
  assert.equal(manifest.package.client, undefined);
  assert.equal(manifest.permissions.channel.createMessage, true);
  assert.equal(manifest.permissions.community.manageRoles, true);
});

test('Discord export contains runnable source without stored secrets', () => {
  const instance = { id: 'bot-1', templateId: 'bot-project', name: 'Neko Test', config: sampleConfig() };
  const zip = buildDiscordZip(instance);
  const names = zip.getEntries().map(x => x.entryName);
  assert.ok(names.includes('src/index.mjs'));
  assert.ok(names.includes('src/register-commands.mjs'));
  assert.ok(names.includes('.env.example'));
  const pkg = JSON.parse(zip.readAsText('package.json'));
  assert.equal(pkg.dependencies['discord.js'], DISCORD_JS_VERSION);
  assert.equal(pkg.engines.node, '>=24.17.0');
  assert.match(zip.readAsText('src/index.mjs'), /GatewayIntentBits\.MessageContent/);
  assert.doesNotMatch(zip.toBuffer().toString('utf8'), /real-secret-token/);
});

test('Root export contains manifest, TypeScript source and pkg build scripts', () => {
  const instance = { id: 'bot-2', templateId: 'bot-project', name: 'Root Neko', config: sampleConfig() };
  const { zip, manifest } = buildRootZip(instance);
  const names = zip.getEntries().map(x => x.entryName);
  assert.ok(names.includes('root-manifest.json'));
  assert.ok(names.includes('src/main.ts'));
  assert.ok(names.includes('.env.example'));
  assert.equal(names.some(x => x.startsWith('client/')), false);
  assert.equal(manifest.package.server.launch, 'dist/main.js');
  assert.match(zip.readAsText('src/main.ts'), /@rootsdk\/server-bot/);
  assert.match(zip.readAsText('src/main.ts'), /ChannelMessageEvent\.ChannelMessageCreated/);

  const pkg = JSON.parse(zip.readAsText('package.json'));
  assert.equal(pkg.scripts['root:package'], 'rootsdk build package --output-file ./rootapp.pkg --project-folder .');
  assert.match(pkg.scripts['root:upload'], /--authToken \$ROOT_AUTH_TOKEN/);
  assert.match(pkg.scripts['root:upload'], /--host dev\.rootapp\.com/);
  assert.match(zip.readAsText('README.md'), /npm install && npm run build/);
  assert.match(zip.readAsText('README.md'), /rootapp\.pkg/);
});
