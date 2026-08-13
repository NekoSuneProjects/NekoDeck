const fs = require('node:fs');
const path = require('node:path');
const { normalizeRelativePath, discoverEntry, injectBridge } = require('./activities.cjs');

const ROOT = path.resolve(__dirname, '..');

function activityRoot(dataDir, instanceId) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(instanceId || ''))) throw new Error('Invalid Activity instance ID');
  return path.join(dataDir, 'activity-content', instanceId);
}

function resolveInside(base, relative) {
  const resolved = path.resolve(base, ...String(relative).split('/'));
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error('Unsafe Activity path');
  return resolved;
}

function walkFiles(base, limit = 20000) {
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

function isUnityLoader(file) { return /(^|\/)Build\/[^/]+\.loader\.js$/i.test(file) || /\.loader\.js$/i.test(file); }
function isUnityWasm(file) { return /\.wasm(?:\.(?:br|gz|unityweb))?$/i.test(file); }
function isUnityData(file) { return /\.data(?:\.(?:br|gz|unityweb))?$/i.test(file); }
function isUnityFramework(file) { return /\.framework\.js(?:\.(?:br|gz|unityweb))?$/i.test(file); }

function detectBuildFromPaths(paths) {
  const normalized = (paths || []).map((value) => String(value).replaceAll('\\', '/'));
  const entry = normalized.find((file) => /(^|\/)index\.html?$/i.test(file)) || normalized.find((file) => /\.html?$/i.test(file)) || null;
  const unity = {
    loader: normalized.find(isUnityLoader) || null,
    wasm: normalized.find(isUnityWasm) || null,
    data: normalized.find(isUnityData) || null,
    framework: normalized.find(isUnityFramework) || null,
    templateData: normalized.some((file) => /(^|\/)TemplateData\//i.test(file))
  };
  const unityScore = [unity.loader, unity.wasm, unity.data, unity.framework].filter(Boolean).length;
  return {
    type: unityScore >= 3 ? 'unity-webgl' : 'web',
    entry,
    unity,
    fileCount: normalized.length
  };
}

function unityHeadersForPath(file) {
  const lower = String(file || '').toLowerCase();
  const headers = {};
  if (lower.endsWith('.br')) headers['Content-Encoding'] = 'br';
  else if (lower.endsWith('.gz')) headers['Content-Encoding'] = 'gzip';

  const withoutCompression = lower.replace(/\.(br|gz)$/i, '');
  if (/\.wasm(?:\.unityweb)?$/i.test(withoutCompression)) headers['Content-Type'] = 'application/wasm';
  else if (/\.js(?:\.unityweb)?$/i.test(withoutCompression)) headers['Content-Type'] = 'application/javascript; charset=utf-8';
  else if (/\.json(?:\.unityweb)?$/i.test(withoutCompression)) headers['Content-Type'] = 'application/json; charset=utf-8';
  else if (/\.(data|mem)(?:\.unityweb)?$/i.test(withoutCompression)) headers['Content-Type'] = 'application/octet-stream';
  else if (/\.unityweb$/i.test(lower)) headers['Content-Type'] = 'application/octet-stream';

  if (headers['Content-Encoding']) headers.Vary = 'Accept-Encoding';
  return headers;
}

function setCommonHeaders(res, isHtml = false) {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', isHtml ? 'no-cache' : 'public, max-age=300');
}

function applyAssetHeaders(res, relative) {
  setCommonHeaders(res, false);
  const headers = unityHeadersForPath(relative);
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
}

function externalPreviewUrl(instance) {
  try {
    const url = new URL(String(instance.config?.activityUrl || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function registerAdvancedActivityRoutes(app, store, options = {}) {
  const dataDir = options.dataDir || process.env.NEKODECK_DATA_DIR || path.join(ROOT, 'data');

  app.get('/api/activities/:id/build-info', (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance || instance.templateId !== 'web-activity') return res.status(404).json({ ok: false, error: 'Web Activity not found' });
    if (instance.config?.activitySourceType === 'url') {
      return res.json({ ok: true, build: { type: 'external-url', url: externalPreviewUrl(instance), fileCount: 0 } });
    }
    try {
      const base = activityRoot(dataDir, req.params.id);
      const build = detectBuildFromPaths(walkFiles(base));
      return res.json({ ok: true, build });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  const hostRoute = /^\/api\/activity-host\/([A-Za-z0-9_-]{8,100})(?:\/(.*))?$/;
  app.get(hostRoute, (req, res, next) => {
    const instanceId = req.params[0];
    const suffix = String(req.params[1] || '').replace(/^\/+/, '');
    const instance = store.getPublicInstance(instanceId);
    if (!instance || instance.templateId !== 'web-activity') return next();

    if (instance.config?.activitySourceType === 'url') {
      const url = externalPreviewUrl(instance);
      if (!url) {
        setCommonHeaders(res, true);
        return res.status(400).type('html').send('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#07120d;color:#effff5;padding:32px"><h1>External Activity URL is invalid</h1><p>Open NekoDeck Activity Studio and configure a valid HTTP/HTTPS URL.</p></body>');
      }
      // External production Activities should map Discord `/` directly to the upstream
      // directory. This redirect is only for NekoDeck/browser preview compatibility.
      if (!suffix) return res.redirect(302, url);
      try {
        const upstream = new URL(suffix, url.endsWith('/') ? url : `${url}/`);
        return res.redirect(302, upstream.toString());
      } catch {
        return res.redirect(302, url);
      }
    }

    let base;
    let entry;
    try {
      base = activityRoot(dataDir, instanceId);
      entry = normalizeRelativePath(instance.config?.activityEntry || discoverEntry(base) || 'index.html');
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    const entryDir = path.posix.dirname(entry);
    const relative = suffix ? (entryDir === '.' ? suffix : `${entryDir}/${suffix}`) : entry;
    let normalized;
    let file;
    try {
      normalized = normalizeRelativePath(relative);
      file = resolveInside(base, normalized);
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    // SPA history fallback: route-like paths without an extension return index.html.
    if ((!fs.existsSync(file) || !fs.statSync(file).isFile()) && suffix && !path.posix.extname(suffix)) {
      try {
        normalized = entry;
        file = resolveInside(base, entry);
      } catch {}
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return res.status(404).json({ ok: false, error: 'Activity file not found' });

    if (/\.html?$/i.test(file)) {
      setCommonHeaders(res, true);
      try {
        const stat = fs.statSync(file);
        if (stat.size <= 8 * 1024 * 1024) return res.type('html').send(injectBridge(fs.readFileSync(file, 'utf8'), instanceId));
      } catch {}
    }

    applyAssetHeaders(res, normalized);
    return res.sendFile(file);
  });
}

module.exports = {
  registerAdvancedActivityRoutes,
  detectBuildFromPaths,
  unityHeadersForPath
};
