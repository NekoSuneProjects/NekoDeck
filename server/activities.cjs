const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_DISCOVERY_FILES = 10000;
const BUILTIN_ACTIVITY_TYPES = new Set(['counter', 'notes', 'timer', 'random-picker', 'system-monitor', 'status-check']);

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
  return `<script data-nekodeck-activity-bridge>\n(()=>{\n  const instanceId=${id};\n  const resumeMedia=()=>{for(const media of document.querySelectorAll('audio,video')){if(media.autoplay||media.dataset.nekodeckAutoplay!==undefined){const p=media.play?.();if(p&&p.catch)p.catch(()=>{})}}};\n  window.NekoDeckActivity={version:1,instanceId,isDiscordProxy:/\\.discordsays\\.com$/i.test(location.hostname),resumeMedia,requestFullscreen(){return document.documentElement.requestFullscreen?.()}};\n  window.addEventListener('pointerdown',resumeMedia,{once:true,capture:true});\n})();\n</script>`;
}

function injectBridge(html, instanceId) {
  if (/data-nekodeck-activity-bridge/i.test(html)) return html;
  const bridge = bridgeScript(instanceId);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${bridge}`);
  return `${bridge}${html}`;
}

function setActivityHeaders(res) {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function shellStyle() {
  return `html,body{margin:0;width:100%;height:100%;background:#050a08;color:#effff5;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}button,input,textarea{font:inherit}.wrap{min-height:100%;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,#123d2566,transparent 35%),#050a08}.card{width:min(820px,96vw);border:1px solid #234734;background:#091610ed;border-radius:20px;padding:22px;box-shadow:0 24px 80px #000a}.brand{color:#45f58c;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}h1{margin:6px 0 5px;font-size:28px}p{color:#91af9c;line-height:1.55}.tool{display:grid;gap:12px;margin-top:18px}.row{display:flex;gap:9px;flex-wrap:wrap}.big{font-size:64px;font-weight:950;letter-spacing:-.05em}.btn{border:1px solid #2b563e;background:#0d2217;color:#eafff1;border-radius:11px;padding:10px 14px;font-weight:800}.btn.primary{background:#45f58c;color:#041008;border-color:#45f58c}input,textarea{width:100%;border:1px solid #285139;background:#050c08;color:#effff5;border-radius:10px;padding:10px 11px;outline:none}textarea{min-height:150px;resize:vertical}.result{white-space:pre-wrap;word-break:break-word;border:1px solid #203d2c;background:#050c08;border-radius:11px;padding:12px;max-height:320px;overflow:auto;color:#b7d5c2}.muted{font-size:12px;color:#789583}.media-shell{position:fixed;inset:0;background:#000}.media-shell iframe{border:0;width:100%;height:100%;display:block;background:#000}.media-help{position:fixed;left:12px;bottom:12px;z-index:4;background:#07120dda;border:1px solid #245039;color:#cce8d7;border-radius:10px;padding:8px 10px;font-size:11px;backdrop-filter:blur(12px)}`;
}

function externalUrlShell(instance) {
  const raw = String(instance.config?.activityUrl || '').trim();
  let target;
  try { target = new URL(raw); } catch { target = null; }
  if (!target || !['http:', 'https:'].includes(target.protocol)) {
    return `<!doctype html><meta charset="utf-8"><style>${shellStyle()}</style><div class="wrap"><div class="card"><div class="brand">NekoDeck Activity</div><h1>External URL not configured</h1><p>Open NekoDeck and set a valid HTTP/HTTPS URL for this Activity.</p></div></div>`;
  }
  const prefix = String(instance.config?.externalMappingPrefix || '/external').startsWith('/') ? String(instance.config?.externalMappingPrefix || '/external') : `/${instance.config?.externalMappingPrefix}`;
  const mapped = `${prefix.replace(/\/$/, '')}${target.pathname}${target.search}${target.hash}`;
  const direct = target.toString();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${shellStyle()}</style></head><body><div class="media-shell"><iframe id="app" allow="autoplay; fullscreen; picture-in-picture; clipboard-read; clipboard-write; gamepad" allowfullscreen referrerpolicy="no-referrer"></iframe></div><div class="media-help">NekoDeck external Activity · audio/video/fullscreen enabled</div><script>const isDiscord=/\\.discordsays\\.com$/i.test(location.hostname);document.getElementById('app').src=isDiscord?${JSON.stringify(mapped)}:${JSON.stringify(direct)};</script></body></html>`;
}

function builtinActivityHtml(instance) {
  const id = JSON.stringify(instance.id);
  const name = escapeHtml(instance.name || 'NekoDeck Activity');
  const type = instance.templateId;
  const header = `<div class="brand">NekoDeck Activity · ${escapeHtml(type)}</div><h1>${name}</h1>`;
  const baseScript = `<script>const instanceId=${id};const j=async(u,o={})=>{const r=await fetch(u,{...o,headers:{'content-type':'application/json',...(o.headers||{})}});const d=await r.json();if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d};</script>`;

  if (type === 'counter') return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${shellStyle()}</style><div class="wrap"><div class="card">${header}<div class="tool"><div id="value" class="big">0</div><div class="row"><button class="btn" onclick="change(-1)">−1</button><button class="btn primary" onclick="change(1)">+1</button></div></div></div></div>${baseScript}<script>let count=0;const draw=()=>value.textContent=count;async function load(){const d=await j('state');count=Number(d.state?.count||0);draw()}async function change(n){count+=n;draw();await j('state',{method:'PUT',body:JSON.stringify({count})})}load();</script>`;

  if (type === 'notes') return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${shellStyle()}</style><div class="wrap"><div class="card">${header}<p>Shared notes for everyone using this Activity instance.</p><div class="tool"><textarea id="notes" placeholder="Write notes…"></textarea><button class="btn primary" onclick="save()">Save notes</button><div id="msg" class="muted"></div></div></div></div>${baseScript}<script>async function load(){const d=await j('state');notes.value=d.state?.notes||''}async function save(){await j('state',{method:'PUT',body:JSON.stringify({notes:notes.value})});msg.textContent='Saved';setTimeout(()=>msg.textContent='',1400)}load();</script>`;

  if (type === 'timer') return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${shellStyle()}</style><div class="wrap"><div class="card">${header}<div class="tool"><div id="clock" class="big">05:00</div><input id="seconds" type="range" min="0" max="3600" value="300" oninput="setSeconds(Number(this.value))"><div class="row"><button class="btn primary" onclick="running=!running">Start / Pause</button><button class="btn" onclick="reset()">Reset</button></div></div></div></div>${baseScript}<script>let remaining=300,running=false,last=Date.now();const draw=()=>clock.textContent=Math.floor(remaining/60)+':'+String(Math.floor(remaining%60)).padStart(2,'0');async function load(){const d=await j('state');remaining=Number.isFinite(d.state?.seconds)?d.state.seconds:300;seconds.value=remaining;draw()}async function setSeconds(n){remaining=n;draw();await j('state',{method:'PUT',body:JSON.stringify({seconds:remaining})})}async function reset(){await setSeconds(Number(seconds.value))}setInterval(()=>{const now=Date.now();if(running&&remaining>0){remaining=Math.max(0,remaining-(now-last)/1000);draw()}last=now},250);load();</script>`;

  if (type === 'random-picker') return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${shellStyle()}</style><div class="wrap"><div class="card">${header}<p>One choice per line or separated by commas.</p><div class="tool"><textarea id="items">Karin\nChiffon\nPlum</textarea><button class="btn primary" onclick="pick()">Pick one</button><div id="picked" class="big"></div></div></div></div>${baseScript}<script>async function load(){const d=await j('state');if(d.state?.items)items.value=d.state.items}async function pick(){const raw=items.value;await j('state',{method:'PUT',body:JSON.stringify({items:raw})});const a=raw.split(/\n|,/).map(x=>x.trim()).filter(Boolean);picked.textContent=a.length?a[Math.floor(Math.random()*a.length)]:'—'}load();</script>`;

  if (type === 'system-monitor') return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${shellStyle()}</style><div class="wrap"><div class="card">${header}<p>Live information from the NekoDeck host.</p><div class="tool"><button class="btn primary" onclick="load()">Refresh</button><pre id="result" class="result">Loading…</pre></div></div></div>${baseScript}<script>async function load(){try{const d=await j('system');result.textContent=JSON.stringify(d.system,null,2)}catch(e){result.textContent=e.message}}load();</script>`;

  if (type === 'status-check') return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${shellStyle()}</style><div class="wrap"><div class="card">${header}<p>Check a HTTP/HTTPS endpoint from the NekoDeck server.</p><div class="tool"><input id="url" placeholder="https://example.com"><button class="btn primary" onclick="run()">Check status</button><pre id="result" class="result"></pre></div></div></div>${baseScript}<script>async function run(){try{const d=await j('status?url='+encodeURIComponent(url.value));result.textContent=JSON.stringify(d,null,2)}catch(e){result.textContent=e.message}}</script>`;

  return `<!doctype html><meta charset="utf-8"><style>${shellStyle()}</style><div class="wrap"><div class="card">${header}<p>This built-in Activity is managed by NekoDeck.</p></div></div>`;
}

async function fetchStatus(target) {
  let url;
  try { url = new URL(String(target || '')); } catch { throw Object.assign(new Error('A valid URL is required'), { status: 400 }); }
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('Only HTTP/HTTPS URLs are allowed'), { status: 400 });
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    return { url: url.toString(), status: response.status, statusText: response.statusText, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
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
    return res.json({ ok: true, content: { ready: Boolean(entry), entry, sourceType: instance.config?.activitySourceType || 'upload', maxFileBytes } });
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
    const cleanup = () => { try { fs.rmSync(temp, { force: true }); } catch {} };
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
        try { req.unpipe(output); } catch {}
        try { req.resume(); } catch {}
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
    const updated = store.updateConfig(req.params.id, { activitySourceType: 'upload', activityContentReady: true, activityEntry: entry, activityUploadedAt: new Date().toISOString() });
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

  app.get('/api/activity-host/:id/state', (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance || !BUILTIN_ACTIVITY_TYPES.has(instance.templateId)) return jsonError(res, 404, 'Built-in Activity not found');
    return res.json({ ok: true, state: store.getState(req.params.id) || {} });
  });

  app.put('/api/activity-host/:id/state', (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance || !BUILTIN_ACTIVITY_TYPES.has(instance.templateId)) return jsonError(res, 404, 'Built-in Activity not found');
    const patch = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (JSON.stringify(patch).length > 65536) return jsonError(res, 413, 'Activity state is too large');
    return res.json({ ok: true, state: store.updateState(req.params.id, patch) || {} });
  });

  app.get('/api/activity-host/:id/system', (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance || instance.templateId !== 'system-monitor') return jsonError(res, 404, 'System Monitor Activity not found');
    const total = os.totalmem();
    const free = os.freemem();
    return res.json({ ok: true, system: { hostname: os.hostname(), platform: os.platform(), release: os.release(), arch: os.arch(), cpuModel: os.cpus()[0]?.model || 'Unknown', cpuCores: os.cpus().length, loadAverage: os.loadavg(), totalMemory: total, usedMemory: total - free, freeMemory: free, uptime: os.uptime(), processMemory: process.memoryUsage().rss } });
  });

  app.get('/api/activity-host/:id/status', async (req, res) => {
    const instance = store.getPublicInstance(req.params.id);
    if (!instance || instance.templateId !== 'status-check') return jsonError(res, 404, 'Status Checker Activity not found');
    try { return res.json({ ok: true, result: await fetchStatus(req.query.url) }); }
    catch (error) { return jsonError(res, error.status || 502, 'Status check failed', error.message); }
  });

  const hostRoute = /^\/api\/activity-host\/([A-Za-z0-9_-]{8,100})(?:\/(.*))?$/;
  app.get(hostRoute, (req, res) => {
    const instanceId = req.params[0];
    const suffix = String(req.params[1] || '').replace(/^\/+/, '');
    const instance = store.getPublicInstance(instanceId);
    if (!instance) return jsonError(res, 404, 'Activity not found');
    setActivityHeaders(res);

    if (BUILTIN_ACTIVITY_TYPES.has(instance.templateId)) {
      if (suffix) return jsonError(res, 404, 'Activity path not found');
      return res.type('html').send(builtinActivityHtml(instance));
    }

    if (instance.templateId !== 'web-activity') return jsonError(res, 400, 'This widget is not configured as a standalone Activity');
    if (instance.config?.activitySourceType === 'url') {
      if (suffix) return jsonError(res, 404, 'Activity path not found');
      return res.type('html').send(externalUrlShell(instance));
    }

    let base;
    let entry;
    try {
      base = activityRoot(dataDir, instanceId);
      entry = normalizeRelativePath(instance.config?.activityEntry || discoverEntry(base) || 'index.html');
    } catch (error) {
      return jsonError(res, 400, error.message);
    }
    const entryDir = path.posix.dirname(entry);
    const relative = suffix ? (entryDir === '.' ? suffix : `${entryDir}/${suffix}`) : entry;
    let file;
    try { file = resolveInside(base, normalizeRelativePath(relative)); }
    catch (error) { return jsonError(res, 400, error.message); }

    if ((!fs.existsSync(file) || !fs.statSync(file).isFile()) && suffix && !path.posix.extname(suffix)) {
      try { file = resolveInside(base, entry); } catch {}
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return jsonError(res, 404, 'Activity file not found');

    if (/\.html?$/i.test(file)) {
      try {
        const stat = fs.statSync(file);
        if (stat.size <= 8 * 1024 * 1024) return res.type('html').send(injectBridge(fs.readFileSync(file, 'utf8'), instanceId));
      } catch {}
    }
    return res.sendFile(file);
  });
}

module.exports = { registerActivityRoutes, normalizeRelativePath, discoverEntry, injectBridge };
