const AdmZip = require('adm-zip');

const DISCORD_JS_VERSION = '^14.27.0';
const COMMAND_NAME = /^[a-z0-9_-]{1,32}$/;
const MATCH_MODES = new Set(['exact', 'startsWith', 'contains', 'regex']);

function jsonError(res, status, message) { return res.status(status).json({ ok: false, error: message }); }
function requireAdmin(req, res, next) {
  const token = process.env.NEKODECK_API_TOKEN || '';
  if (!token || req.get('X-NekoDeck-Token') === token) return next();
  return jsonError(res, 401, 'Admin token required');
}
function cleanText(value, max = 4000) { return String(value ?? '').replace(/\r/g, '').slice(0, max); }
function isSemver(value) { return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(value || '')); }
function cleanUploadHost(value) {
  const host = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!host) return '';
  if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) throw new Error('Root upload host must be a hostname such as dev.rootapp.com');
  return host;
}
function parseObject(value, label, fallback = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') throw new Error(`${label} must be a JSON object`);
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${label} contains invalid JSON`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
}

function normalizeCommand(command, index = 0) {
  const name = String(command?.name || '').trim().toLowerCase();
  if (!COMMAND_NAME.test(name)) throw new Error(`Command ${index + 1} name must use 1-32 lowercase letters, numbers, _ or -`);
  const description = cleanText(command?.description || `Run ${name}`, 100).trim();
  if (!description) throw new Error(`Command ${name} needs a description`);
  return {
    id: String(command?.id || `cmd-${index + 1}`), name, description,
    response: cleanText(command?.response || 'Done.', 4000),
    discord: command?.discord !== false, rootapp: command?.rootapp !== false,
    ephemeral: Boolean(command?.ephemeral)
  };
}

function normalizeAutoReply(rule, index = 0) {
  const trigger = cleanText(rule?.trigger, 500).trim();
  if (!trigger) throw new Error(`Auto reply ${index + 1} needs a trigger`);
  const mode = MATCH_MODES.has(rule?.mode) ? rule.mode : 'contains';
  if (mode === 'regex') {
    try { new RegExp(trigger, rule?.caseSensitive ? '' : 'i'); }
    catch { throw new Error(`Auto reply ${index + 1} has an invalid regex`); }
  }
  return {
    id: String(rule?.id || `reply-${index + 1}`), trigger,
    response: cleanText(rule?.response || 'Done.', 4000), mode,
    caseSensitive: Boolean(rule?.caseSensitive),
    discord: rule?.discord !== false, rootapp: rule?.rootapp !== false
  };
}

function normalizeBotConfig(input = {}, current = {}) {
  const commands = Array.isArray(input.commands) ? input.commands.map(normalizeCommand) : (current.commands || []);
  const autoReplies = Array.isArray(input.autoReplies) ? input.autoReplies.map(normalizeAutoReply) : (current.autoReplies || []);
  const discordInput = input.discord || {}, rootInput = input.rootapp || input.root || {};
  const currentDiscord = current.discord || {}, currentRoot = current.rootapp || {};
  const rootVersion = String(rootInput.version ?? currentRoot.version ?? '0.1.0').trim();
  if (!isSemver(rootVersion)) throw new Error('Root Bot version must use semantic versioning, for example 1.0.0');
  return {
    botBuilderVersion: 1,
    description: cleanText(input.description ?? current.description ?? '', 500),
    platforms: {
      discord: input.platforms?.discord ?? current.platforms?.discord ?? true,
      rootapp: input.platforms?.rootapp ?? current.platforms?.rootapp ?? true
    },
    discord: {
      clientId: cleanText(discordInput.clientId ?? currentDiscord.clientId ?? '', 40).trim(),
      guildId: cleanText(discordInput.guildId ?? currentDiscord.guildId ?? '', 40).trim(),
      statusText: cleanText(discordInput.statusText ?? currentDiscord.statusText ?? '', 128).trim()
    },
    rootapp: {
      projectId: cleanText(rootInput.projectId ?? currentRoot.projectId ?? '', 160).trim(),
      version: rootVersion,
      uploadHost: cleanUploadHost(rootInput.uploadHost ?? currentRoot.uploadHost ?? ''),
      settings: parseObject(rootInput.settings, 'Root Bot settings', currentRoot.settings || {}),
      permissions: parseObject(rootInput.permissions, 'Root Bot permissions', currentRoot.permissions || {})
    }, commands, autoReplies
  };
}

function publicBot(instance) { return { ...instance, bot: instance.config || {} }; }
function safePackageName(name, suffix = '') {
  const base = String(name || 'nekodeck-bot').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'nekodeck-bot';
  return `${base}${suffix}`;
}
function fillTemplate(text, user, command, args = '') {
  return String(text || '').replaceAll('{user}', user || 'user').replaceAll('{command}', command || '').replaceAll('{args}', args || '');
}

function discordSource(config) {
  const commands = (config.commands || []).filter(x => x.discord);
  const replies = (config.autoReplies || []).filter(x => x.discord);
  const needsMessages = replies.length > 0;
  return `import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';\n\nconst commands = ${JSON.stringify(commands, null, 2)};\nconst autoReplies = ${JSON.stringify(replies, null, 2)};\nconst client = new Client({ intents: [GatewayIntentBits.Guilds${needsMessages ? ', GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent' : ''}] });\n\nfunction render(text, vars = {}) { return String(text || '').replaceAll('{user}', vars.user || 'user').replaceAll('{command}', vars.command || '').replaceAll('{args}', vars.args || ''); }\nfunction ruleMatches(content, rule) {\n  const source = rule.caseSensitive ? content : content.toLowerCase();\n  const trigger = rule.caseSensitive ? rule.trigger : rule.trigger.toLowerCase();\n  if (rule.mode === 'exact') return source === trigger;\n  if (rule.mode === 'startsWith') return source.startsWith(trigger);\n  if (rule.mode === 'regex') { try { return new RegExp(rule.trigger, rule.caseSensitive ? '' : 'i').test(content); } catch { return false; } }\n  return source.includes(trigger);\n}\n\nclient.once(Events.ClientReady, ready => {\n  console.log(\`Logged in as \${ready.user.tag}\`);\n  const status = ${JSON.stringify(config.discord?.statusText || '')};\n  if (status) ready.user.setActivity(status);\n});\nclient.on(Events.InteractionCreate, async interaction => {\n  if (!interaction.isChatInputCommand()) return;\n  const command = commands.find(x => x.name === interaction.commandName);\n  if (!command) return;\n  const reply = { content: render(command.response, { user: interaction.user.globalName || interaction.user.username, command: command.name, args: '' }) };\n  if (command.ephemeral) reply.flags = MessageFlags.Ephemeral;\n  await interaction.reply(reply);\n});\n${needsMessages ? `client.on(Events.MessageCreate, async message => {\n  if (message.author.bot || !message.content) return;\n  const rule = autoReplies.find(x => ruleMatches(message.content, x));\n  if (!rule) return;\n  await message.reply(render(rule.response, { user: message.member?.displayName || message.author.globalName || message.author.username, args: message.content }));\n});\n` : ''}if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is missing');\nclient.login(process.env.DISCORD_TOKEN);\n`;
}

function discordRegisterSource(config) {
  const commands = (config.commands || []).filter(x => x.discord).map(({ name, description }) => ({ name, description }));
  return `import { REST, Routes } from 'discord.js';\n\nconst commands = ${JSON.stringify(commands, null, 2)};\nconst token = process.env.DISCORD_TOKEN;\nconst clientId = process.env.DISCORD_CLIENT_ID || ${JSON.stringify(config.discord?.clientId || '')};\nconst guildId = process.env.DISCORD_GUILD_ID || ${JSON.stringify(config.discord?.guildId || '')};\nif (!token) throw new Error('DISCORD_TOKEN is missing');\nif (!clientId) throw new Error('DISCORD_CLIENT_ID is missing');\nconst rest = new REST({ version: '10' }).setToken(token);\nconst route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);\nawait rest.put(route, { body: commands });\nconsole.log(\`Registered \${commands.length} command(s) \${guildId ? 'for guild ' + guildId : 'globally'}\`);\n`;
}

function buildDiscordZip(instance) {
  const config = instance.config || {};
  if (!config.platforms?.discord) throw new Error('Discord target is disabled for this bot');
  const zip = new AdmZip();
  const pkg = {
    name: safePackageName(instance.name, '-discord'), version: '1.0.0', private: true, type: 'module',
    engines: { node: '>=24.17.0' },
    scripts: { start: 'node src/index.mjs', 'register:commands': 'node src/register-commands.mjs' },
    dependencies: { 'discord.js': DISCORD_JS_VERSION }
  };
  zip.addFile('package.json', Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`));
  zip.addFile('src/index.mjs', Buffer.from(discordSource(config)));
  zip.addFile('src/register-commands.mjs', Buffer.from(discordRegisterSource(config)));
  zip.addFile('commands.json', Buffer.from(`${JSON.stringify((config.commands || []).filter(x => x.discord), null, 2)}\n`));
  zip.addFile('.env.example', Buffer.from(`DISCORD_TOKEN=replace-with-bot-token\nDISCORD_CLIENT_ID=${config.discord?.clientId || ''}\nDISCORD_GUILD_ID=${config.discord?.guildId || ''}\n`));
  zip.addFile('.gitignore', Buffer.from('node_modules/\n.env\n'));
  zip.addFile('README.md', Buffer.from(`# ${instance.name} — Discord.js bot\n\nGenerated by NekoDeck. Requires Node.js 24.17+ and discord.js ${DISCORD_JS_VERSION}.\n\nSet DISCORD_TOKEN, DISCORD_CLIENT_ID and optionally DISCORD_GUILD_ID in your environment, then run:\n\nnpm install\nnpm run register:commands\nnpm start\n\nThe real bot token stored in NekoDeck is never embedded in this export.\n`));
  return zip;
}

function rootManifest(config) {
  if (!config.rootapp?.projectId) throw new Error('Root Bot project ID is required');
  if (!isSemver(config.rootapp.version)) throw new Error('Root Bot version must use semantic versioning');
  const custom = config.rootapp.permissions || {};
  const manifest = {
    id: config.rootapp.projectId, version: config.rootapp.version,
    package: { server: { launch: 'dist/main.js', deploy: ['dist'], nodeModules: ['node_modules'] } },
    permissions: { ...custom, channel: { ...(custom.channel || {}), createMessage: true } }
  };
  if (config.rootapp.settings && Object.keys(config.rootapp.settings).length) manifest.settings = config.rootapp.settings;
  return manifest;
}

function rootSource(config) {
  const commands = (config.commands || []).filter(x => x.rootapp);
  const replies = (config.autoReplies || []).filter(x => x.rootapp);
  return `import { rootServer, ChannelMessageEvent, ChannelMessageCreatedEvent, ChannelMessageCreateRequest } from '@rootsdk/server-bot';\n\ntype AutoReply = { trigger: string; response: string; mode: 'exact' | 'startsWith' | 'contains' | 'regex'; caseSensitive: boolean };\nconst commands = ${JSON.stringify(commands, null, 2)};\nconst autoReplies: AutoReply[] = ${JSON.stringify(replies, null, 2)};\n\nfunction render(text: string, vars: { user?: string; command?: string; args?: string } = {}): string { return String(text || '').replaceAll('{user}', vars.user || 'user').replaceAll('{command}', vars.command || '').replaceAll('{args}', vars.args || ''); }\nfunction ruleMatches(content: string, rule: AutoReply): boolean {\n  const source = rule.caseSensitive ? content : content.toLowerCase();\n  const trigger = rule.caseSensitive ? rule.trigger : rule.trigger.toLowerCase();\n  if (rule.mode === 'exact') return source === trigger;\n  if (rule.mode === 'startsWith') return source.startsWith(trigger);\n  if (rule.mode === 'regex') { try { return new RegExp(rule.trigger, rule.caseSensitive ? '' : 'i').test(content); } catch { return false; } }\n  return source.includes(trigger);\n}\nasync function send(evt: ChannelMessageCreatedEvent, content: string): Promise<void> {\n  const request: ChannelMessageCreateRequest = { channelId: evt.channelId, content, parentMessageIds: [evt.id] };\n  await rootServer.community.channelMessages.create(request);\n}\nasync function onMessage(evt: ChannelMessageCreatedEvent): Promise<void> {\n  const content = evt.messageContent || '';\n  if (!content) return;\n  const command = commands.find(x => content === '/' + x.name || content.startsWith('/' + x.name + ' '));\n  if (command) {\n    const args = content.slice(command.name.length + 1).trim();\n    await send(evt, render(command.response, { user: String(evt.userId || 'user'), command: command.name, args }));\n    return;\n  }\n  const rule = autoReplies.find(x => ruleMatches(content, x));\n  if (rule) await send(evt, render(rule.response, { user: String(evt.userId || 'user'), args: content }));\n}\nrootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageCreated, onMessage);\n(async () => { await rootServer.lifecycle.start(); })();\n`;
}

function buildRootZip(instance) {
  const config = instance.config || {};
  if (!config.platforms?.rootapp) throw new Error('RootApp target is disabled for this bot');
  const manifest = rootManifest(config), zip = new AdmZip();
  const hostArg = config.rootapp?.uploadHost ? ` --host ${cleanUploadHost(config.rootapp.uploadHost)}` : '';
  const pkg = {
    name: safePackageName(instance.name, '-root'), version: manifest.version, private: true,
    scripts: {
      build: 'tsc',
      bot: 'rootsdk start devhost',
      'root:package': 'rootsdk build package --output-file ./rootapp.pkg --project-folder .',
      'root:upload': `rootsdk upload package --file ./rootapp.pkg --authToken $ROOT_AUTH_TOKEN${hostArg}`
    },
    dependencies: { '@rootsdk/server-bot': '*' }, devDependencies: { '@rootsdk/dev-tools': '*', typescript: '*' }
  };
  const tsconfig = { compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16', outDir: 'dist', rootDir: 'src', esModuleInterop: true, strict: true, skipLibCheck: true }, include: ['src/**/*.ts'] };
  zip.addFile('root-manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  zip.addFile('package.json', Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`));
  zip.addFile('tsconfig.json', Buffer.from(`${JSON.stringify(tsconfig, null, 2)}\n`));
  zip.addFile('src/main.ts', Buffer.from(rootSource(config)));
  zip.addFile('.env.example', Buffer.from('DEV_TOKEN=replace-with-root-developer-token\nROOT_AUTH_TOKEN=replace-with-root-upload-token\n'));
  zip.addFile('.gitignore', Buffer.from('node_modules/\n.env\ndist/\nrootapp.pkg\n'));
  zip.addFile('README.md', Buffer.from(`# ${instance.name} — Root Bot\n\nGenerated by NekoDeck. Root Bots are server-only and use @rootsdk/server-bot.\n\nBuild:\n\nnpm install && npm run build\n\nPackage:\n\nnpx rootsdk build package --output-file ./rootapp.pkg --project-folder .\n\nUpload:\n\nnpx rootsdk upload package --file ./rootapp.pkg --authToken $ROOT_AUTH_TOKEN${hostArg}\n\nStored Root credentials are never embedded in this export.\n`));
  return { zip, manifest };
}

function botCredentials(body = {}) {
  const out = {};
  if (typeof body.discordBotToken === 'string' && body.discordBotToken.trim()) out.discordBotToken = body.discordBotToken.trim();
  if (typeof body.rootBotDevToken === 'string' && body.rootBotDevToken.trim()) out.rootBotDevToken = body.rootBotDevToken.trim();
  if (typeof body.rootBotAuthToken === 'string' && body.rootBotAuthToken.trim()) out.rootBotAuthToken = body.rootBotAuthToken.trim();
  return out;
}

function registerBotBuilderRoutes(app, store) {
  app.get('/api/bots', (_req, res) => res.json({ ok: true, bots: store.listInstances().filter(x => x.templateId === 'bot-project').map(publicBot) }));
  app.post('/api/bots', requireAdmin, (req, res) => {
    try {
      const name = cleanText(req.body?.name || 'New Bot', 80).trim() || 'New Bot';
      const instance = store.createInstance({ templateId: 'bot-project', name, config: normalizeBotConfig(req.body || {}), credentials: botCredentials(req.body) });
      return res.status(201).json({ ok: true, bot: publicBot(instance) });
    } catch (error) { return jsonError(res, 400, error.message); }
  });
  app.get('/api/bots/:id', (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item || item.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    return res.json({ ok: true, bot: publicBot(item) });
  });
  app.put('/api/bots/:id', requireAdmin, (req, res) => {
    const current = store.getPublicInstance(req.params.id);
    if (!current || current.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    try {
      const config = normalizeBotConfig(req.body || {}, current.config || {});
      if (req.body?.name !== undefined) store.updateName(req.params.id, cleanText(req.body.name, 80));
      store.updateConfig(req.params.id, config);
      const secrets = botCredentials(req.body); if (Object.keys(secrets).length) store.mergeCredentials(req.params.id, secrets);
      return res.json({ ok: true, bot: publicBot(store.getPublicInstance(req.params.id)) });
    } catch (error) { return jsonError(res, 400, error.message); }
  });
  app.delete('/api/bots/:id', requireAdmin, (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item || item.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    store.deleteInstance(req.params.id); return res.json({ ok: true });
  });
  app.get('/api/bots/:id/root-manifest', (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item || item.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    try { return res.json({ ok: true, manifest: rootManifest(item.config || {}) }); } catch (error) { return jsonError(res, 400, error.message); }
  });
  app.get('/api/bots/:id/export/discord', requireAdmin, (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item || item.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    try {
      const zip = buildDiscordZip(item); res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="${safePackageName(item.name)}-DiscordBot.zip"`); return res.send(zip.toBuffer());
    } catch (error) { return jsonError(res, 400, error.message); }
  });
  app.get('/api/bots/:id/export/root', requireAdmin, (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item || item.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    try {
      const { zip } = buildRootZip(item); res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="${safePackageName(item.name)}-RootBot-${item.config.rootapp.version}.zip"`); return res.send(zip.toBuffer());
    } catch (error) { return jsonError(res, 400, error.message); }
  });
}

module.exports = {
  registerBotBuilderRoutes,
  normalizeCommand,
  normalizeAutoReply,
  normalizeBotConfig,
  rootManifest,
  buildDiscordZip,
  buildRootZip,
  fillTemplate,
  DISCORD_JS_VERSION,
  cleanUploadHost
};
