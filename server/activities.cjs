const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_DISCOVERY_FILES = 10000;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function jsonError(res, status, message, details) {
  return res.status(status).json({ ok: false, error: message, details });
}

function requireAdmin(req, res, next) {
  const token = process.env.NEKODECK_API_TOKEN || '';
  if (!token || req.get('X-NekoDeck-Token') === token) return next();
  return jsonError(res, 401, 'Admin token required');
}

function normalizeRelativePath(value) {
  let raw = String(value || '');
  try { raw = decodeURIComponent(raw); } catch {}
  raw = raw.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!raw || raw.includes('\0') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw new Error('Invalid Activity file path');
  }
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('Activity file path escapes its content directory');
  }
  if (normalized.length > 500) throw new Error('Activity file path is too long');
  return normalized;
}

function activityRoot(dataDir, instanceId) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(instanceId || ''))) throw new Error('Invalid Activity instance ID');
  return path.join(dataDir, 'activity-content', instanceId);
}

function resolveInside(base, relative) {
  const resolved = path.resolve(base, ...relative.split('/'));
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error('Unsafe Activity path');
  return resolved;
}

function discoverEntry(base) {
  if (!fs.existsSync(base)) return null;
  const candidates = [];
  let seen = 0;
  const walk = (dir, relative = '') => {
    if (seen >= MAX_DISCOVERY_FILES) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (seen++ >= MAX_DISCOVERY_FILES) break;
      const rel = relative ? `${relative}/${item.name}` : item.name;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full, rel);
      else if (/\.html?$/i.test(item.name)) candidates.push(rel.replaceAll('\\', '/'));
    }
  };
  walk(base);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aIndex = /(^|\/)index\.html?$/i.test(a) ? 0 : 1;
    const bIndex = /(^|\/)index\.html?$/i.test(b) ? 0 : 1;
    return aIndex - bIndex || a.split('/').length - b.split('/').length || a.length - b.length;
  });
  return candidates[0];
}

function bridgeScript(instanceId) {
  const id = JSON.stringify(String(instanceId));
  return `<script data-nekodeck-activity-bridge>\n(()=>{\n  const instanceId=${id};\n  let context=null;\n  const listeners=new Set();\n  const emit=(next)=>{context=next;for(const fn of listeners){try{fn(next)}catch{}};try{window.dispatchEvent(new CustomEvent('nekodeck:discord-context',{detail:next}))}catch{}};\n  const resumeMedia=()=>{for(const media of document.querySelectorAll('audio,video')){if(media.autoplay||media.dataset.nekodeckAutoplay!==undefined){const p=media.play?.();if(p&&p.catch)p.catch(()=>{})}}};\n  window.NekoDeckActivity={version:1,instanceId,getDiscordContext:()=>context,onDiscordContext(fn){if(typeof fn!=='function')return()=>{};listeners.add(fn);if(context)fn(context);return()=>listeners.delete(fn)},resumeMedia,requestFullscreen(){return document.documentElement.requestFullscreen?.()}};\n  window.addEventListener('message',(event)=>{const msg=event.data;if(!msg||typeof msg!=='object')return;if(msg.type==='nekodeck:discord-context')emit(msg.context||null);if(msg.type==='nekodeck:resume-media')resumeMedia()});\n  window.addEventListener('pointerdown',resumeMedia,{once:true,capture:true});\n  try{parent.postMessage({type:'nekodeck:activity-ready',instanceId},'*')}catch{}\n})();\n</script>`;
}

function injectBridge(html, instanceId) {
  if (/data-nekodeck-activity-bridge/i.test(html)) return html;
  const bridge = bridgeScript(instanceId);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${bridge}`);
  return `${bridge}${html}`;
}

function registerActivityRoutes(app, store, options = {}) {
  const dataDir = options.dataDir || process.env.NEKODECK_DATA_DIR || path.join(ROOT, 'data');
  const maxFileBytes = Math.max(1024 * 1024, Number(process.env.NEKODECK_ACTIVITY_MAX_FILE_BYTES || DEFAULT_MAX_FILE_BYTES));
  ensureDir(path.join(dataDir, 'activity-content'));

  app.get('/api/activities/:id/content', (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance || instance.templateId !== 'web-activity') return jsonError(res, 404, 'Web Activity not found');
    let base;
    try { base = activityRoot(dataDir, req.params.id); } catch (error) { return jsonError(res, 400, error.message); }
    const entry = instance.config?.activityEntry || discoverEntry(base);
    return res.json({
      ok: true,
      content: {
        ready: Boolean(entry),
        entry,
        sourceType: instance.config?.activitySourceType || 'upload',
        maxFileBytes
      }
    });
  });

  app.put('/api/activities/:id/file', requireAdmin, (req, res) => {
    const instance = store.getPrivateInstance(req.params.id);
    if (!instance || instance.templateId !== 'web-activity') return jsonError(res, 404, 'Web Activity not found');
    let relative;
    let base;
    let target;
    try {
      relative = normalizeRelativePath(req.get('X-NekoDeck-File-Path'));
      base = activityRoot(dataDir, req.params.id);
      target = resolveInside(base, relative);
    } catch (error) {
      return jsonError(res, 400, error.message);
    }

    const declared = Number(req.get('content-length') || 0);
    if (declared > maxFileBytes) return jsonError(res, 413, `Activity file exceeds the ${maxFileBytes} byte limit`);

    ensureDir(path.dirname(target));
    const temp = `${target}.upload-${crypto.randomUUID()}`;
    const output = fs.createWriteStream(temp, { flags: 'wx' });
    let bytes = 0;
    let settled = false;

    const cleanup = () => {
      try { fs.rmSync(temp, { force: true }); } catch {}
    };
    const fail = (status, message) => {
      if (settled) return;
      settled = true;
      try { output.destroy(); } catch {}
      cleanup();
      if (!res.headersSent) jsonError(res, status, message);
    };

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxFileBytes) {
        req.destroy();
        fail(413, `Activity file exceeds the ${maxFileBytes} byte limit`);
      }
    });
    req.on('aborted', () => fail(499, 'Activity upload was aborted'));
    req.on('error', (error) => fail(500, `Activity upload failed: ${error.message}`));
    output.on('error', (error) => fail(500, `Unable to write Activity file: ${error.message}`));
    output.on('finish', () => {
      if (settled) return;
      try {
        fs.renameSync(temp, target);
        settled = true;
        res.json({ ok: true, file: { path: relative, bytes } });
      } catch (error) {
        fail(500, `Unable to finish Activity upload: ${error.message}`);
      }
    });
    req.pipe(output);
  });

  app.post('/api/activities/:id/finalize', requireAdmin, (req, res) => {
    const instance = store.getPrivateInstance(req.params.id);
    if (!instance || instance.templateId !== 'web-activity') return jsonError(res, 404, 'Web Activity not found');
    let base;
    try { base = activityRoot(dataDir, req.params.id); } catch (error) { return jsonError(res, 400, error.message); }
    let entry = null;
    if (req.body?.entryPath) {
      try {
        const relative = normalizeRelativePath(req.body.entryPath);
        const full = resolveInside(base, relative);
        if (fs.existsSync(full) && fs.statSync(full).isFile() && /\.html?$/i.test(relative)) entry = relative;
      } catch {}
    }
    if (!entry) entry = discoverEntry(base);
    if (!entry) return jsonError(res, 400, 'No HTML entry file was found. Upload index.html or another .html/.htm file.');
    const updated = store.updateConfig(req.params.id, {
      activitySourceType: 'upload',
      activityContentReady: true,
      activityEntry: entry,
      activityUploadedAt: new Date().toISOString()
    });
    return res.json({ ok: true, instance: updated, entry });
  });

  app.delete('/api/activities/:id/content', requireAdmin, (req, res) => {
    const instance = store.getPrivateInstance(req.params.id);
    if (!instance || instance.templateId !== 'web-activity') return jsonError(res, 404, 'Web Activity not found');
    try {
      const base = activityRoot(dataDir, req.params.id);
      fs.rmSync(base, { recursive: true, force: true });
      store.updateConfig(req.params.id, { activityContentReady: false, activityEntry: null, activityUploadedAt: null });
      return res.json({ ok: true });
    } catch (error) {
      return jsonError(res, 500, 'Unable to remove Activity content', error.message);
    }
  });

  const contentRoute = /^\/api\/activity-content\/([A-Za-z0-9_-]{8,100})(?:\/(.*))?$/;
  app.get(contentRoute, (req, res) => {
    const instanceId = req.params[0];
    const instance = store.getPublicInstance(instanceId);
    if (!instance || instance.templateId !== 'web-activity') return jsonError(res, 404, 'Web Activity not found');
    let base;
    let relative;
    let file;
    try {
      base = activityRoot(dataDir, instanceId);
      relative = normalizeRelativePath(req.params[1] || instance.config?.activityEntry || 'index.html');
      file = resolveInside(base, relative);
    } catch (error) {
      return jsonError(res, 400, error.message);
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return jsonError(res, 404, 'Activity file not found');

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (/\.html?$/i.test(file)) {
      try {
        const stat = fs.statSync(file);
        if (stat.size <= 8 * 1024 * 1024) {
          const html = fs.readFileSync(file, 'utf8');
          return res.type('html').send(injectBridge(html, instanceId));
        }
      } catch {}
    }
    return res.sendFile(file);
  });
}

module.exports = { registerActivityRoutes, normalizeRelativePath, discoverEntry, injectBridge };
