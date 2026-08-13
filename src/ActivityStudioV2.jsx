import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Box,
  CheckCircle2,
  Copy,
  FileCode2,
  FolderOpen,
  Gamepad2,
  Globe2,
  Layers3,
  Music2,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Video,
  Wrench,
  X
} from 'lucide-react';
import './activity-studio.css';
import './activity-studio-v2.css';

const ACTIVITY_TYPES = ['web-activity', 'counter', 'notes', 'timer', 'random-picker', 'system-monitor', 'status-check'];
const DEFAULT_FORM = {
  templateId: 'web-activity',
  name: '',
  discordClientId: '',
  discordClientSecret: '',
  botToken: '',
  sourceType: 'html',
  activityUrl: ''
};

function api(path, options = {}) {
  const token = localStorage.getItem('nekodeckAdminToken') || '';
  return fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'X-NekoDeck-Token': token } : {}),
      ...(options.headers || {})
    }
  }).then(async (response) => {
    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  });
}

async function uploadFile(instanceId, file, relativePath) {
  const token = localStorage.getItem('nekodeckAdminToken') || '';
  const response = await fetch(`/api/activities/${instanceId}/file`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/octet-stream',
      'X-NekoDeck-File-Path': encodeURIComponent(relativePath),
      ...(token ? { 'X-NekoDeck-Token': token } : {})
    },
    body: file
  });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error || `Upload failed: HTTP ${response.status}`);
  return data;
}

async function uploadFiles(instanceId, files, onProgress) {
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(4, Math.max(1, files.length)) }, async () => {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index];
      await uploadFile(instanceId, file, filePath(file));
      done += 1;
      onProgress?.(`Uploading ${done}/${files.length} · ${filePath(file)}`);
    }
  });
  await Promise.all(workers);
}

function filePath(file) {
  return String(file.webkitRelativePath || file.name || '').replaceAll('\\', '/');
}

function bytes(value) {
  const n = Number(value || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function validExternalUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function inspectUnity(files) {
  const paths = files.map(filePath);
  const find = (regex) => paths.find((value) => regex.test(value)) || null;
  const entry = find(/(^|\/)index\.html?$/i) || find(/\.html?$/i);
  const loader = find(/\.loader\.js$/i);
  const framework = find(/\.framework\.js(?:\.(?:br|gz|unityweb))?$/i);
  const wasm = find(/\.wasm(?:\.(?:br|gz|unityweb))?$/i);
  const data = find(/\.data(?:\.(?:br|gz|unityweb))?$/i);
  const templateData = paths.some((value) => /(^|\/)TemplateData\//i.test(value));
  const detected = Boolean(entry && loader && wasm && data);
  return { entry, loader, framework, wasm, data, templateData, detected };
}

function externalMapping(urlText) {
  try {
    const url = new URL(urlText);
    let pathname = url.pathname || '/';
    let warning = '';
    if (/\/index\.html?$/i.test(pathname)) pathname = pathname.replace(/index\.html?$/i, '');
    else if (!pathname.endsWith('/')) {
      const last = pathname.split('/').pop() || '';
      if (/\.[a-z0-9]{1,10}$/i.test(last)) {
        warning = 'Discord URL Mapping targets must be directories. Use a directory URL or index.html, not another HTML filename.';
        pathname = pathname.slice(0, pathname.lastIndexOf('/') + 1) || '/';
      } else pathname += '/';
    }
    if (url.search || url.hash) warning = `${warning ? `${warning} ` : ''}Query strings and fragments are not part of the Discord mapping target.`;
    return { target: `${url.host}${pathname}`, warning };
  } catch {
    return { target: '', warning: 'Invalid URL' };
  }
}

function hostedTarget(instance) {
  return `${location.host}/api/activity-host/${instance.id}/`;
}

function previewUrl(instance) {
  if (instance.templateId === 'web-activity' && instance.config?.activitySourceType === 'url') return instance.config?.activityUrl || '#';
  return `/api/activity-host/${instance.id}/`;
}

function copy(value) { navigator.clipboard?.writeText(value); }
function Badge({ children, kind = '' }) { return <span className={`activity-badge ${kind}`}>{children}</span>; }

function MappingBox({ instance }) {
  const external = instance.templateId === 'web-activity' && instance.config?.activitySourceType === 'url';
  if (external) {
    const mapping = externalMapping(instance.config?.activityUrl || '');
    return <div className="activity-mappings activity-direct-mapping">
      <div className="activity-mapping"><span>Prefix</span><code>/</code><span>Target directory</span><code>{mapping.target || 'Invalid URL'}</code><button onClick={() => copy(`/ → ${mapping.target}`)}><Copy size={14}/></button></div>
      <small><strong>Direct external mapping:</strong> Discord loads the external app itself, so its HTML, JS, CSS, images, fonts, audio, video and WASM share the same proxied app root.</small>
      {mapping.warning && <small className="activity-map-warning">{mapping.warning}</small>}
      <small>If that app loads resources from a different domain/CDN, add another Discord URL Mapping for that external origin.</small>
    </div>;
  }
  return <div className="activity-mappings">
    <div className="activity-mapping"><span>Prefix</span><code>/</code><span>Target directory</span><code>{hostedTarget(instance)}</code><button onClick={() => copy(hostedTarget(instance))}><Copy size={14}/></button></div>
    <small>Target has no <code>https://</code>. Keep the trailing <code>/</code> so Discord treats it as an application directory.</small>
  </div>;
}

function UploadPicker({ files, setFiles, unity = false }) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const html = files.find((file) => /(^|\/)index\.html?$/i.test(filePath(file))) || files.find((file) => /\.html?$/i.test(file.name));
  const unityInfo = inspectUnity(files);
  return <div className="activity-upload-picker">
    <div className="activity-upload-actions">
      {!unity && <label><FileCode2 size={18}/><strong>Choose files</strong><span>HTML + JS/CSS/assets</span><input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))}/></label>}
      <label><FolderOpen size={18}/><strong>{unity ? 'Choose Unity WebGL folder' : 'Choose app folder'}</strong><span>{unity ? 'index.html + Build + TemplateData' : 'Vite / React / HTML5 / Web build'}</span><input type="file" multiple webkitdirectory="" directory="" onChange={(event) => setFiles(Array.from(event.target.files || []))}/></label>
    </div>
    {files.length > 0 && <div className="activity-file-summary">
      <div><strong>{files.length}</strong><span>files selected</span></div>
      <div><strong>{bytes(total)}</strong><span>total upload</span></div>
      <div><strong>{html ? filePath(html) : 'Missing'}</strong><span>HTML entry</span></div>
    </div>}
    {unity && files.length > 0 && <div className="unity-check-grid">
      <UnityCheck ok={Boolean(unityInfo.entry)} label="index.html" value={unityInfo.entry}/>
      <UnityCheck ok={Boolean(unityInfo.loader)} label="loader.js" value={unityInfo.loader}/>
      <UnityCheck ok={Boolean(unityInfo.wasm)} label="WebAssembly" value={unityInfo.wasm}/>
      <UnityCheck ok={Boolean(unityInfo.data)} label="Game data" value={unityInfo.data}/>
      <UnityCheck ok={Boolean(unityInfo.framework)} label="Framework" value={unityInfo.framework || 'Optional / version-dependent'}/>
      <UnityCheck ok={unityInfo.templateData} label="TemplateData" value={unityInfo.templateData ? 'Detected' : 'Not detected'}/>
    </div>}
    <p>{unity ? <>Upload the complete Unity <strong>Web</strong> build output. NekoDeck serves <code>.wasm</code>, <code>.br</code>, <code>.gz</code> and <code>.unityweb</code> with Unity-compatible headers.</> : <>Select the complete built output so JS, CSS, modules, fonts, images, WASM, audio and video preserve their relative paths. SPA routes fall back to the detected HTML entry.</>}</p>
  </div>;
}

function UnityCheck({ ok, label, value }) {
  return <div className={ok ? 'unity-check ok' : 'unity-check'}><CheckCircle2 size={15}/><div><strong>{label}</strong><span>{value || 'Missing'}</span></div></div>;
}

function CreateActivity({ widgets, onCreated, onError }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const templates = widgets.filter((widget) => ACTIVITY_TYPES.includes(widget.id));
  const template = templates.find((widget) => widget.id === form.templateId);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    onError('');
    const web = form.templateId === 'web-activity';
    if (web && form.sourceType === 'url' && !validExternalUrl(form.activityUrl)) return onError('Enter a valid HTTP/HTTPS external Activity URL.');
    if (web && form.sourceType !== 'url' && !files.length) return onError('Choose the built web app/game folder before creating the Activity.');
    if (web && form.sourceType === 'unity') {
      const check = inspectUnity(files);
      if (!check.detected) return onError('Unity WebGL build is incomplete. NekoDeck needs index.html, *.loader.js, *.wasm (or compressed variant), and *.data (or compressed variant).');
    }
    setBusy(true);
    setProgress('Creating Activity…');
    try {
      const sourceType = web && form.sourceType === 'url' ? 'url' : web ? 'upload' : 'builtin';
      const config = {
        activity: true,
        delivery: 'discord-activity',
        activitySourceType: sourceType,
        activityBuildHint: form.sourceType === 'unity' ? 'unity-webgl' : form.sourceType === 'html' ? 'web' : sourceType,
        activityUrl: sourceType === 'url' ? form.activityUrl.trim() : '',
        activityContentReady: false
      };
      const created = await api('/api/v2/instances', {
        method: 'POST',
        body: JSON.stringify({
          templateId: form.templateId,
          name: form.name,
          discordClientId: form.discordClientId,
          discordClientSecret: form.discordClientSecret,
          botToken: form.botToken,
          config
        })
      });
      const instance = created.instance;
      if (web && sourceType === 'upload') {
        await uploadFiles(instance.id, files, setProgress);
        setProgress('Detecting app entry point…');
        await api(`/api/activities/${instance.id}/finalize`, { method: 'POST', body: '{}' });
      }
      setProgress('Activity ready');
      setForm(DEFAULT_FORM);
      setFiles([]);
      await onCreated(instance.id);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(''), 1600);
    }
  };

  return <form className="activity-create" onSubmit={submit}>
    <section>
      <div className="activity-section-title"><div><span>01</span><h3>Activity type</h3></div><Badge kind="ready">Discord Activity</Badge></div>
      <div className="activity-form-grid">
        <label>Template<select value={form.templateId} onChange={(event) => set('templateId', event.target.value)}>{templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Activity name<input required value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="My Discord Game / App"/></label>
      </div>
      <p className="activity-help">{template?.description}</p>
    </section>

    <section>
      <div className="activity-section-title"><div><span>02</span><h3>Discord application</h3></div><Badge>Encrypted</Badge></div>
      <div className="activity-form-grid">
        <label>Client / Application ID<input required value={form.discordClientId} onChange={(event) => set('discordClientId', event.target.value)} placeholder="Discord Application ID"/></label>
        <label>Client Secret<input required type="password" value={form.discordClientSecret} onChange={(event) => set('discordClientSecret', event.target.value)} placeholder="Stored encrypted"/></label>
      </div>
      <label>Bot token <small>optional</small><input type="password" value={form.botToken} onChange={(event) => set('botToken', event.target.value)} placeholder="Not required for normal Activities"/></label>
    </section>

    {form.templateId === 'web-activity' && <section>
      <div className="activity-section-title"><div><span>03</span><h3>Game / app source</h3></div><div className="activity-source-tabs triple">
        <button type="button" className={form.sourceType === 'html' ? 'active' : ''} onClick={() => { set('sourceType', 'html'); setFiles([]); }}><Upload size={14}/>Web App</button>
        <button type="button" className={form.sourceType === 'unity' ? 'active' : ''} onClick={() => { set('sourceType', 'unity'); setFiles([]); }}><Box size={14}/>Unity WebGL</button>
        <button type="button" className={form.sourceType === 'url' ? 'active' : ''} onClick={() => { set('sourceType', 'url'); setFiles([]); }}><Globe2 size={14}/>External URL</button>
      </div></div>
      {form.sourceType === 'html' && <UploadPicker files={files} setFiles={setFiles}/>}
      {form.sourceType === 'unity' && <><UploadPicker files={files} setFiles={setFiles} unity/><div className="activity-info unity-info"><Gamepad2 size={17}/><span>Unity target must be <strong>Web</strong> (WebGL/Web build), not Windows EXE. For maximum Discord compatibility, avoid relying on WebRTC and test threaded/SharedArrayBuffer builds carefully.</span></div></>}
      {form.sourceType === 'url' && <div className="activity-url-config">
        <label>External app directory URL<input required value={form.activityUrl} onChange={(event) => set('activityUrl', event.target.value)} placeholder="https://example.com/my-game/"/></label>
        {form.activityUrl && validExternalUrl(form.activityUrl) && <div className="external-map-preview"><span>Discord mapping</span><code>/ → {externalMapping(form.activityUrl).target}</code></div>}
        <div className="activity-info"><Globe2 size={17}/><span>External apps now use a <strong>direct Discord root mapping</strong>, not a raw-HTML iframe. That lets the page load its JS, CSS, modules, images, fonts, audio, video and WASM from the mapped app directory.</span></div>
      </div>}
    </section>}

    <div className="activity-create-footer">
      <div>{progress ? <><RefreshCw className={busy ? 'spin' : ''} size={16}/><span>{progress}</span></> : <><ShieldCheck size={16}/><span>Uploaded apps are persisted under NekoDeck <code>/data</code>.</span></>}</div>
      <button className="activity-primary" disabled={busy}><Plus size={16}/>{busy ? 'Working…' : 'Create Activity'}</button>
    </div>
  </form>;
}

function ActivityItem({ instance, widget, onRefresh, onError }) {
  const [showMappings, setShowMappings] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [build, setBuild] = useState(null);
  const isWeb = instance.templateId === 'web-activity';
  const external = isWeb && instance.config?.activitySourceType === 'url';
  const source = external ? 'External full web app' : isWeb ? (build?.type === 'unity-webgl' || instance.config?.activityBuildHint === 'unity-webgl' ? 'Unity WebGL upload' : 'Uploaded web app') : 'Built-in NekoDeck tool';

  useEffect(() => {
    if (isWeb) api(`/api/activities/${instance.id}/build-info`).then((data) => setBuild(data.build)).catch(() => {});
  }, [instance.id, isWeb]);

  const replace = async () => {
    if (!files.length) return;
    setBusy(true);
    onError('');
    try {
      await api(`/api/activities/${instance.id}/content`, { method: 'DELETE' });
      await uploadFiles(instance.id, files);
      await api(`/api/activities/${instance.id}/finalize`, { method: 'POST', body: '{}' });
      setReplacing(false);
      setFiles([]);
      await onRefresh();
      const info = await api(`/api/activities/${instance.id}/build-info`).catch(() => null);
      if (info) setBuild(info.build);
    } catch (error) { onError(error.message); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete Activity “${instance.name}”?`)) return;
    onError('');
    try {
      if (isWeb && !external) await api(`/api/activities/${instance.id}/content`, { method: 'DELETE' }).catch(() => {});
      await api(`/api/instances/${instance.id}`, { method: 'DELETE' });
      await onRefresh();
    } catch (error) { onError(error.message); }
  };

  return <article className="activity-item">
    <div className="activity-item-icon">{build?.type === 'unity-webgl' || instance.config?.activityBuildHint === 'unity-webgl' ? <Box/> : isWeb ? <Gamepad2/> : <Wrench/>}</div>
    <div className="activity-item-main">
      <div className="activity-item-title"><div><h3>{instance.name}</h3><p>{widget?.name || instance.templateId} · {source}</p></div><div><Badge kind="ready">Ready</Badge>{build?.type === 'unity-webgl' && <Badge kind="ready">Unity WebGL</Badge>}{isWeb && !external && <Badge kind={instance.config?.activityContentReady ? 'ready' : 'warn'}>{instance.config?.activityContentReady ? 'Files ready' : 'No files'}</Badge>}</div></div>
      <div className="activity-capabilities"><span><FileCode2 size={13}/>JS/CSS</span><span><Music2 size={13}/>Audio</span><span><Video size={13}/>Video</span><span><Gamepad2 size={13}/>Gamepad</span><span><Layers3 size={13}/>WASM</span></div>
      <div className="activity-item-actions">
        <button onClick={() => window.open(previewUrl(instance), '_blank', 'noopener')}><Play size={15}/>Preview</button>
        <button onClick={() => setShowMappings(!showMappings)}><Copy size={15}/>Discord Mapping</button>
        {isWeb && !external && <button onClick={() => setReplacing(!replacing)}><Upload size={15}/>Replace files</button>}
        <button className="danger" onClick={remove}><Trash2 size={15}/></button>
      </div>
      {showMappings && <MappingBox instance={instance}/>} 
      {replacing && <div className="activity-replace"><UploadPicker files={files} setFiles={setFiles} unity={build?.type === 'unity-webgl' || instance.config?.activityBuildHint === 'unity-webgl'}/><button className="activity-primary" disabled={busy || !files.length} onClick={replace}>{busy ? 'Uploading…' : 'Replace Activity files'}</button></div>}
    </div>
  </article>;
}

function ActivityList({ widgets, instances, refresh, onError }) {
  const activityInstances = instances.filter((instance) => ACTIVITY_TYPES.includes(instance.templateId));
  return <div className="activity-list">
    <div className="activity-list-heading"><div><h3>Created Activities</h3><p>HTML apps, Unity WebGL games, external URLs and NekoDeck tools.</p></div><button onClick={refresh}><RefreshCw size={15}/>Refresh</button></div>
    {activityInstances.length ? activityInstances.map((instance) => <ActivityItem key={instance.id} instance={instance} widget={widgets.find((widget) => widget.id === instance.templateId)} onRefresh={refresh} onError={onError}/>) : <div className="activity-empty"><Gamepad2 size={28}/><h3>No Activities yet</h3><p>Create a web app, Unity WebGL game, external URL Activity or built-in tool.</p></div>}
  </div>;
}

function DiscordGuide() {
  return <div className="activity-guide">
    <section><Badge kind="ready">Uploaded / built-in</Badge><h3>NekoDeck-hosted Activities</h3><p>In Discord Developer Portal → Activities → URL Mappings, map <code>/</code> to the NekoDeck target shown on the Activity card. The target is a directory and includes the trailing slash.</p></section>
    <section><Badge kind="ready">External apps</Badge><h3>Direct URL mapping</h3><p>For an external app, map <code>/</code> directly to its host + directory. Do not map it through NekoDeck's old <code>/external</code> iframe. This is what keeps JS/CSS/assets working through Discord's proxy.</p></section>
    <section><Badge>Unity WebGL</Badge><h3>Unity builds</h3><p>Build for Unity's Web/WebGL target and upload the complete output folder. NekoDeck handles WebAssembly MIME types plus Brotli/Gzip compressed build headers and <code>.unityweb</code> fallback files.</p></section>
    <section><Badge>Extra origins</Badge><h3>CDNs and APIs</h3><p>If your app loads scripts, media, APIs or sockets from another origin, add additional Discord URL Mappings for those origins. Discord Activities sandbox network requests through its proxy.</p></section>
  </div>;
}

export default function ActivityStudioV2() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('create');
  const [widgets, setWidgets] = useState([]);
  const [instances, setInstances] = useState([]);
  const [error, setError] = useState('');
  const activityCount = useMemo(() => instances.filter((instance) => ACTIVITY_TYPES.includes(instance.templateId)).length, [instances]);

  const refresh = async () => {
    try {
      const [widgetData, instanceData] = await Promise.all([api('/api/widgets'), api('/api/instances')]);
      setWidgets(widgetData.widgets || []);
      setInstances(instanceData.instances || []);
    } catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { if (open) refresh(); }, [open]);
  const created = async () => { await refresh(); setTab('created'); };

  if (location.pathname.startsWith('/activity/')) return null;
  return <>
    <button className="activity-studio-launch" onClick={() => setOpen(true)}><Gamepad2 size={18}/><span>Activities</span>{activityCount > 0 && <b>{activityCount}</b>}</button>
    {open && <div className="activity-studio-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <div className="activity-studio-window activity-studio-v2-window">
        <header><div><span className="activity-studio-kicker">NekoDeck</span><h2>Activity Studio</h2><p>Run complete web apps, Unity WebGL games, media experiences and built-in tools in Discord.</p></div><button onClick={() => setOpen(false)}><X/></button></header>
        <nav><button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}><Plus size={15}/>Create</button><button className={tab === 'created' ? 'active' : ''} onClick={() => setTab('created')}><Activity size={15}/>Created <b>{activityCount}</b></button><button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}><ShieldCheck size={15}/>Discord Setup</button></nav>
        {error && <div className="activity-error">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}
        <main>{tab === 'create' ? <CreateActivity widgets={widgets} onCreated={created} onError={setError}/> : tab === 'created' ? <ActivityList widgets={widgets} instances={instances} refresh={refresh} onError={setError}/> : <DiscordGuide/>}</main>
      </div>
    </div>}
  </>;
}
