const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { normalizeRelativePath, discoverEntry } = require('./activities.cjs');
const { detectBuildFromPaths } = require('./activity-web-host.cjs');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 20000;

function jsonError(res, status, message, details) {
  return res.status(status).json({ ok: false, error: message, details });
}

function requireAdmin(req, res, next) {
  const token = process.env.NEKODECK_API_TOKEN || '';
  if (!token || req.get('X-NekoDeck-Token') === token) return next();
  return jsonError(res, 401, 'Admin token required');
}

function activityRoot(dataDir, instanceId) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(instanceId || ''))) throw new Error('Invalid Activity instance ID');
  return path.join(dataDir, 'activity-content', instanceId);
}

function resolveInside(base, relative) {
  const resolved = path.resolve(base, ...String(relative).split('/'));
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error('Unsafe Activity path');
  return resolved;
}

function walkFiles(base, limit = DEFAULT_MAX_ENTRIES) {
  if (!fs.existsSync(base)) return [];
  const files = [];
  const walk = (dir, relative = '') => {
    if (files.length >= limit) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= limit) break;
      const rel = relative ? `${relative}/${item.name}` : item.name;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full, rel);
      else files.push(rel.replaceAll('\\', '/'));
    }
  };
  walk(base);
  return files;
}

function isSymlinkEntry(entry) {
  const mode = (Number(entry.attr || 0) >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

function sanitizeActivitySettings(input = {}) {
  const out = {};
  if (typeof input.name === 'string' && input.name.trim()) out.name = input.name.trim().slice(0, 100);
  if (typeof input.description === 'string') out.description = input.description.trim().slice(0, 1000);
  if (typeof input.activityUrl === 'string') {
    const raw = input.activityUrl.trim();
    if (!raw) out.activityUrl = '';
    else {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('External Activity URL must use HTTP or HTTPS');
      out.activityUrl = url.toString();
    }
  }
  if (input.maxParticipants === '' || input.maxParticipants === null) out.maxParticipants = null;
  else if (input.maxParticipants !== undefined) {
    const value = Number(input.maxParticipants);
    if (!Number.isInteger(value) || value < 1 || value > 1000) throw new Error('Max participants must be between 1 and 1000, or blank for unlimited');
    out.maxParticipants = value;
  }
  if (['development', 'staging', 'production'].includes(input.releaseChannel)) out.releaseChannel = input.releaseChannel;
  if (['unverified', 'submitted', 'verified'].includes(input.verificationStatus)) out.verificationStatus = input.verificationStatus;
  if (typeof input.guildInstall === 'boolean') out.guildInstall = input.guildInstall;
  if (typeof input.userInstall === 'boolean') out.userInstall = input.userInstall;
  if (typeof input.platformWeb === 'boolean') out.platformWeb = input.platformWeb;
  if (typeof input.platformIos === 'boolean') out.platformIos = input.platformIos;
  if (typeof input.platformAndroid === 'boolean') out.platformAndroid = input.platformAndroid;
  if (typeof input.requireDiscordInstance === 'boolean') out.requireDiscordInstance = input.requireDiscordInstance;
  if (typeof input.allowExternalAssets === 'boolean') out.allowExternalAssets = input.allowExternalAssets;
  if (typeof input.buildHint === 'string') out.buildHint = input.buildHint.trim().slice(0, 80);
  return out;
}

function publicActivitySettings(instance) {
  const config = instance?.config || {};
  return {
    name: instance?.name || '',
    description: config.description || '',
    activityUrl: config.activityUrl || '',
    maxParticipants: config.maxParticipants ?? null,
    releaseChannel: config.releaseChannel || 'development',
    verificationStatus: config.verificationStatus || 'unverified',
    guildInstall: config.guildInstall !== false,
    userInstall: config.userInstall !== false,
    platformWeb: config.platformWeb !== false,
    platformIos: Boolean(config.platformIos),
    platformAndroid: Boolean(config.platformAndroid),
    requireDiscordInstance: Boolean(config.requireDiscordInstance),
    allowExternalAssets: config.allowExternalAssets !== false,
    buildHint: config.activityBuildHint || config.buildHint || 'web'
  };
}

function streamRequestToFile(req, target, maxBytes) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(target, { flags: 'wx' });
    let bytes = 0;
    let done = false;
    const finishError = (error) => {
      if (done) return;
      done = true;
      try { output.destroy(); } catch {}
      try { fs.rmSync(target, { force: true }); } catch {}
      reject(error);
    };
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        try { req.unpipe(output); } catch {}
        try { req.resume(); } catch {}
        const error = new Error(`ZIP archive exceeds the ${maxBytes} byte upload limit`);
        error.status = 413;
        finishError(error);
      }
    });
    req.on('aborted', () => finishError(Object.assign(new Error('ZIP upload was aborted'), { status: 499 })));
    req.on('error', finishError);
    output.on('error', finishError);
    output.on('finish', () => {
      if (done) return;
      done = true;
      resolve(bytes);
    });
    req.pipe(output);
  });
}

function registerActivityManagementRoutes(app, store, options = {}) {
  const dataDir = options.dataDir || process.env.NEKODECK_DATA_DIR || path.join(ROOT, 'data');
  const maxArchiveBytes = Math.max(10 * 1024 * 1024, Number(process.env.NEKODECK_ACTIVITY_MAX_ARCHIVE_BYTES || DEFAULT_MAX_ARCHIVE_BYTES));
  const maxExtractedBytes = Math.max(10 * 1024 * 1024, Number(process.env.NEKODECK_ACTIVITY_MAX_EXTRACTED_BYTES || DEFAULT_MAX_EXTRACTED_BYTES));
  const maxFileBytes = Math.max(1024 * 1024, Number(process.env.NEKODECK_ACTIVITY_MAX_FILE_BYTES || DEFAULT_MAX_FILE_BYTES));
  const maxEntries = Math.max(100, Number(process.env.NEKODECK_ACTIVITY_MAX_ZIP_ENTRIES || DEFAULT_MAX_ENTRIES));
  fs.mkdirSync(path.join(dataDir, 'activity-content'), { recursive: true });

  app.get('/api/activity-settings', (_req, res) => {
    const settings = store.getSettings();
    res.json({ ok: true, settings: settings.activity || { defaultMaxParticipants: null, defaultReleaseChannel: 'development' } });
  });

  app.put('/api/activity-settings', requireAdmin, (req, res) => {
    try {
      const current = store.getSettings().activity || {};
      const next = { ...current };
      if (req.body?.defaultMaxParticipants === '' || req.body?.defaultMaxParticipants === null) next.defaultMaxParticipants = null;
      else if (req.body?.defaultMaxParticipants !== undefined) {
        const value = Number(req.body.defaultMaxParticipants);
        if (!Number.isInteger(value) || value < 1 || value > 1000) throw new Error('Default max participants must be 1-1000 or blank');
        next.defaultMaxParticipants = value;
      }
      if (['development', 'staging', 'production'].includes(req.body?.defaultReleaseChannel)) next.defaultReleaseChannel = req.body.defaultReleaseChannel;
      if (typeof req.body?.defaultGuildInstall === 'boolean') next.defaultGuildInstall = req.body.defaultGuildInstall;
      if (typeof req.body?.defaultUserInstall === 'boolean') next.defaultUserInstall = req.body.defaultUserInstall;
      if (typeof req.body?.defaultPlatformWeb === 'boolean') next.defaultPlatformWeb = req.body.defaultPlatformWeb;
      if (typeof req.body?.defaultPlatformIos === 'boolean') next.defaultPlatformIos = req.body.defaultPlatformIos;
      if (typeof req.body?.defaultPlatformAndroid === 'boolean') next.defaultPlatformAndroid = req.body.defaultPlatformAndroid;
      return res.json({ ok: true, settings: store.updateSettings({ activity: next }).activity });
    } catch (error) {
      return jsonError(res, 400, error.message);
    }
  });

  app.get('/api/activities/:id/settings', (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance) return jsonError(res, 404, 'Activity not found');
    return res.json({ ok: true, settings: publicActivitySettings(instance), discordClientId: instance.discordClientId });
  });

  app.put('/api/activities/:id/settings', requireAdmin, (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance) return jsonError(res, 404, 'Activity not found');
    try {
      const patch = sanitizeActivitySettings(req.body || {});
      if (patch.name) store.updateName(req.params.id, patch.name);
      delete patch.name;
      if (Object.prototype.hasOwnProperty.call(patch, 'buildHint')) {
        patch.activityBuildHint = patch.buildHint;
        delete patch.buildHint;
      }
      const updated = store.updateConfig(req.params.id, patch);
      return res.json({ ok: true, instance: updated, settings: publicActivitySettings(updated) });
    } catch (error) {
      return jsonError(res, 400, error.message);
    }
  });

  app.get('/api/activity-host/:id/nekodeck-settings.json', (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance) return jsonError(res, 404, 'Activity not found');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    return res.json({ ok: true, activity: publicActivitySettings(instance) });
  });

  app.put('/api/activities/:id/archive', requireAdmin, async (req, res) => {
    const instance = store.getPrivateInstance(req.params.id);
    if (!instance || instance.templateId !== 'web-activity') return jsonError(res, 404, 'Web Activity not found');
    const contentType = String(req.get('content-type') || '').toLowerCase();
    if (!contentType.includes('zip') && !contentType.includes('octet-stream')) return jsonError(res, 415, 'Upload a ZIP archive');
    const declared = Number(req.get('content-length') || 0);
    if (declared > maxArchiveBytes) return jsonError(res, 413, `ZIP archive exceeds the ${maxArchiveBytes} byte upload limit`);

    const tempDir = path.join(dataDir, '.uploads');
    fs.mkdirSync(tempDir, { recursive: true });
    const temp = path.join(tempDir, `${crypto.randomUUID()}.zip`);
    const replace = String(req.query.replace || '1') !== '0';
    try {
      await streamRequestToFile(req, temp, maxArchiveBytes);
      const zip = new AdmZip(temp);
      const entries = zip.getEntries();
      if (!entries.length) throw Object.assign(new Error('ZIP archive is empty'), { status: 400 });
      if (entries.length > maxEntries) throw Object.assign(new Error(`ZIP contains more than ${maxEntries} entries`), { status: 413 });

      const validated = [];
      let extractedBytes = 0;
      for (const entry of entries) {
        if (isSymlinkEntry(entry)) throw Object.assign(new Error(`ZIP contains a symbolic link: ${entry.entryName}`), { status: 400 });
        if (entry.isDirectory) continue;
        const relative = normalizeRelativePath(entry.entryName);
        const size = Number(entry.header?.size || 0);
        if (size > maxFileBytes) throw Object.assign(new Error(`ZIP entry exceeds per-file limit: ${relative}`), { status: 413 });
        extractedBytes += size;
        if (extractedBytes > maxExtractedBytes) throw Object.assign(new Error(`ZIP expands beyond the ${maxExtractedBytes} byte extracted limit`), { status: 413 });
        validated.push({ entry, relative, size });
      }

      const base = activityRoot(dataDir, req.params.id);
      if (replace) fs.rmSync(base, { recursive: true, force: true });
      fs.mkdirSync(base, { recursive: true });
      for (const item of validated) {
        const target = resolveInside(base, item.relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const data = item.entry.getData();
        if (data.length > maxFileBytes) throw Object.assign(new Error(`ZIP entry exceeds per-file limit after extraction: ${item.relative}`), { status: 413 });
        fs.writeFileSync(target, data);
      }

      const entry = discoverEntry(base);
      if (!entry) throw Object.assign(new Error('No HTML entry file found after ZIP extraction'), { status: 400 });
      const files = walkFiles(base, maxEntries);
      const build = detectBuildFromPaths(files);
      const updated = store.updateConfig(req.params.id, {
        activitySourceType: 'upload',
        activityContentReady: true,
        activityEntry: entry,
        activityBuildHint: build.type,
        activityUploadedAt: new Date().toISOString(),
        activityArchiveName: decodeURIComponent(String(req.get('X-NekoDeck-Archive-Name') || 'activity.zip')).slice(0, 200)
      });
      return res.json({ ok: true, instance: updated, entry, build, extracted: { files: validated.length, bytes: extractedBytes, replace } });
    } catch (error) {
      return jsonError(res, error.status || 500, error.message);
    } finally {
      try { fs.rmSync(temp, { force: true }); } catch {}
    }
  });

  app.put('/api/instances/:id/manage', requireAdmin, (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance) return jsonError(res, 404, 'Widget instance not found');
    try {
      if (typeof req.body?.name === 'string' && req.body.name.trim()) store.updateName(req.params.id, req.body.name.trim().slice(0, 100));
      if (req.body?.config && typeof req.body.config === 'object' && !Array.isArray(req.body.config)) store.updateConfig(req.params.id, req.body.config);
      if (req.body?.credentials && typeof req.body.credentials === 'object' && !Array.isArray(req.body.credentials)) {
        const allowed = ['discordClientId', 'discordClientSecret', 'botToken', 'providerApiKey', 'providerClientId', 'providerClientSecret', 'providerSession'];
        const patch = {};
        for (const key of allowed) if (typeof req.body.credentials[key] === 'string' && req.body.credentials[key].trim()) patch[key] = req.body.credentials[key].trim();
        if (Object.keys(patch).length) store.mergeCredentials(req.params.id, patch);
      }
      return res.json({ ok: true, instance: store.getPublicInstance(req.params.id) });
    } catch (error) {
      return jsonError(res, 400, error.message);
    }
  });
}

module.exports = { registerActivityManagementRoutes, sanitizeActivitySettings, publicActivitySettings };
