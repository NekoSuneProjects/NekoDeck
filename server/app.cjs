const express = require('express');
const helmet = require('helmet');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { createStore } = require('./store.cjs');

const ROOT = path.resolve(__dirname, '..');
const WIDGETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'widgets.json'), 'utf8'));
const ALLOWED_BF_GAMES = new Set(['bf3', 'bf4', 'bfh', 'bf1', 'bfv', 'bf2042', 'bf6']);

function jsonError(res, status, message, details) {
  return res.status(status).json({ ok: false, error: message, details });
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 12000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': 'NekoDeck/0.1 (+https://github.com/NekoSuneProjects/NekoDeck)',
        accept: 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 1000) }; }
    if (!response.ok) {
      const error = new Error(`Upstream returned HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function createApp(options = {}) {
  const app = express();
  const dataDir = options.dataDir || process.env.NEKODECK_DATA_DIR || path.join(ROOT, 'data');
  const store = createStore(dataDir);

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: '512kb' }));

  const adminToken = process.env.NEKODECK_API_TOKEN || '';
  const requireAdmin = (req, res, next) => {
    if (!adminToken) return next();
    if (req.get('X-NekoDeck-Token') === adminToken) return next();
    return jsonError(res, 401, 'Admin token required. Configure it in NekoDeck Settings.');
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'NekoDeck', version: '0.1.0', mode: options.mode || 'web' });
  });

  app.get('/api/widgets', (_req, res) => res.json({ ok: true, widgets: WIDGETS }));
  app.get('/api/instances', (_req, res) => res.json({ ok: true, instances: store.listInstances() }));
  app.get('/api/instances/:id/public', (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item) return jsonError(res, 404, 'Widget instance not found');
    res.json({ ok: true, instance: item });
  });

  app.post('/api/instances', requireAdmin, (req, res) => {
    const { templateId, name, discordClientId, discordClientSecret, botToken, providerApiKey, config } = req.body || {};
    const template = WIDGETS.find((w) => w.id === templateId);
    if (!template) return jsonError(res, 400, 'Unknown widget template');
    if (!String(name || '').trim()) return jsonError(res, 400, 'Widget name is required');
    if (!String(discordClientId || '').trim()) return jsonError(res, 400, 'Discord Client ID is required');
    if (!String(discordClientSecret || '').trim()) return jsonError(res, 400, 'Discord Client Secret is required');
    if (templateId === 'hypixel' && !String(providerApiKey || '').trim()) {
      return jsonError(res, 400, 'Hypixel API key is required for the Hypixel Tracker');
    }
    const item = store.createInstance({
      templateId,
      name: String(name).trim(),
      config: config && typeof config === 'object' ? config : {},
      credentials: {
        discordClientId: String(discordClientId).trim(),
        discordClientSecret: String(discordClientSecret).trim(),
        botToken: String(botToken || '').trim(),
        providerApiKey: String(providerApiKey || '').trim()
      }
    });
    res.status(201).json({ ok: true, instance: item });
  });

  app.delete('/api/instances/:id', requireAdmin, (req, res) => {
    if (!store.deleteInstance(req.params.id)) return jsonError(res, 404, 'Widget instance not found');
    res.json({ ok: true });
  });

  app.get('/api/instances/:id/state', (req, res) => {
    const state = store.getState(req.params.id);
    if (state === null) return jsonError(res, 404, 'Widget instance not found');
    res.json({ ok: true, state });
  });

  app.put('/api/instances/:id/state', (req, res) => {
    const patch = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (JSON.stringify(patch).length > 65536) return jsonError(res, 413, 'Widget state is too large');
    const state = store.updateState(req.params.id, patch);
    if (state === null) return jsonError(res, 404, 'Widget instance not found');
    res.json({ ok: true, state });
  });

  app.get('/api/settings', (_req, res) => res.json({ ok: true, settings: store.getSettings(), tokenRequired: Boolean(adminToken) }));
  app.put('/api/settings', requireAdmin, (req, res) => {
    const allowed = {};
    if (/^#[0-9a-fA-F]{6}$/.test(req.body?.accent || '')) allowed.accent = req.body.accent;
    if (['compact', 'comfortable'].includes(req.body?.density)) allowed.density = req.body.density;
    if (typeof req.body?.glass === 'boolean') allowed.glass = req.body.glass;
    res.json({ ok: true, settings: store.updateSettings(allowed) });
  });

  app.get('/api/system', (_req, res) => {
    const total = os.totalmem();
    const free = os.freemem();
    res.json({
      ok: true,
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpuModel: os.cpus()[0]?.model || 'Unknown',
        cpuCores: os.cpus().length,
        loadAverage: os.loadavg(),
        totalMemory: total,
        usedMemory: total - free,
        freeMemory: free,
        uptime: os.uptime(),
        processMemory: process.memoryUsage().rss
      }
    });
  });

  app.get('/api/status-check', async (req, res) => {
    const target = String(req.query.url || '');
    let url;
    try { url = new URL(target); } catch { return jsonError(res, 400, 'A valid URL is required'); }
    if (!['http:', 'https:'].includes(url.protocol)) return jsonError(res, 400, 'Only HTTP/HTTPS URLs are allowed');
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
      clearTimeout(timer);
      res.json({ ok: true, result: { url: url.toString(), status: response.status, statusText: response.statusText, latencyMs: Date.now() - started } });
    } catch (error) {
      res.json({ ok: false, result: { url: url.toString(), latencyMs: Date.now() - started }, error: error.message });
    }
  });

  app.get('/api/widgets/hypixel/:instanceId/player', async (req, res) => {
    const instance = store.getPrivateInstance(req.params.instanceId);
    if (!instance || instance.templateId !== 'hypixel') return jsonError(res, 404, 'Hypixel widget instance not found');
    const playerInput = String(req.query.player || req.query.uuid || '').trim();
    if (!playerInput) return jsonError(res, 400, 'Minecraft username or UUID is required');
    try {
      let uuid = playerInput.replaceAll('-', '');
      if (!/^[0-9a-fA-F]{32}$/.test(uuid)) {
        const profile = await fetchJson(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(playerInput)}`);
        uuid = String(profile.id || '').replaceAll('-', '');
      }
      if (!/^[0-9a-fA-F]{32}$/.test(uuid)) return jsonError(res, 404, 'Minecraft profile not found');
      const data = await fetchJson(`https://api.hypixel.net/v2/player?uuid=${encodeURIComponent(uuid)}`, {
        headers: { 'API-Key': instance.credentials.providerApiKey }
      });
      const player = data.player;
      if (!player) return jsonError(res, 404, 'Hypixel player not found');
      const stats = {
        uuid: player.uuid,
        displayname: player.displayname,
        rank: player.rank || player.monthlyPackageRank || player.newPackageRank || player.packageRank || 'NONE',
        networkExp: player.networkExp || 0,
        karma: player.karma || 0,
        firstLogin: player.firstLogin || null,
        lastLogin: player.lastLogin || null,
        lastLogout: player.lastLogout || null,
        achievementPoints: player.achievementPoints || 0,
        achievements: player.achievements || {},
        stats: player.stats || {}
      };
      res.json({ ok: true, player: stats });
    } catch (error) {
      jsonError(res, error.status || 502, 'Hypixel API request failed', error.data || error.message);
    }
  });

  app.get('/api/widgets/battlefield/:instanceId/player', async (req, res) => {
    const instance = store.getPrivateInstance(req.params.instanceId);
    if (!instance || instance.templateId !== 'battlefield') return jsonError(res, 404, 'Battlefield widget instance not found');
    const game = String(req.query.game || 'bf2042').toLowerCase();
    const name = String(req.query.name || '').trim();
    const platform = String(req.query.platform || 'pc').trim();
    if (!ALLOWED_BF_GAMES.has(game)) return jsonError(res, 400, 'Unsupported Battlefield game');
    if (!name) return jsonError(res, 400, 'Player name is required');
    const params = new URLSearchParams({ name, platform, lang: 'en-us' });
    try {
      const data = await fetchJson(`https://api.gametools.network/${game}/stats/?${params}`);
      res.json({ ok: true, game, player: data });
    } catch (error) {
      jsonError(res, error.status || 502, 'Battlefield API request failed', error.data || error.message);
    }
  });

  app.post('/api/discord/token', async (req, res) => {
    const { instanceId, code } = req.body || {};
    const instance = store.getPrivateInstance(instanceId);
    if (!instance) return jsonError(res, 404, 'Widget instance not found');
    if (!code) return jsonError(res, 400, 'OAuth authorization code is required');
    const body = new URLSearchParams({
      client_id: instance.credentials.discordClientId,
      client_secret: instance.credentials.discordClientSecret,
      grant_type: 'authorization_code',
      code: String(code)
    });
    try {
      const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body
      });
      const data = await response.json();
      if (!response.ok) return jsonError(res, response.status, 'Discord OAuth token exchange failed', data);
      res.json({ ok: true, access_token: data.access_token, token_type: data.token_type, expires_in: data.expires_in, scope: data.scope });
    } catch (error) {
      jsonError(res, 502, 'Discord OAuth request failed', error.message);
    }
  });

  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: options.mode === 'desktop' ? 0 : '1h' }));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(dist, 'index.html'));
      next();
    });
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    jsonError(res, 500, 'Internal NekoDeck error');
  });

  return { app, store };
}

module.exports = { createApp };
