import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Archive, CheckCircle2, Copy, FileCode2, FolderOpen, Gamepad2, Globe2,
  RefreshCw, Save, Settings, ShieldCheck, Trash2, Upload, Users, Wrench, X, Zap
} from 'lucide-react';
import './activity-studio.css';
import './activity-studio-v3.css';

const ACTIVITY_TYPES = ['web-activity', 'counter', 'notes', 'timer', 'random-picker', 'system-monitor', 'status-check'];
const ENGINE_PRESETS = [
  ['generic-web', 'Generic HTML / Web App', 'HTML, CSS, JS, WASM, audio, video, SPA builds'],
  ['unity-webgl', 'Unity WebGL', 'Unity Web/WebGL build folder or ZIP'],
  ['unreal-web', 'Unreal Web Export', 'Legacy/community HTML/WASM export; Pixel Streaming is not Activity-compatible'],
  ['godot-web', 'Godot Web', 'Godot HTML5/Web export'],
  ['construct', 'Construct 3', 'Construct web export'],
  ['gdevelop', 'GDevelop', 'GDevelop HTML5 export'],
  ['phaser', 'Phaser', 'Phaser/Vite static build'],
  ['pixi', 'PixiJS', 'PixiJS static build'],
  ['threejs', 'Three.js', 'Three.js/Vite static build'],
  ['babylon', 'Babylon.js', 'Babylon.js static build'],
  ['gamemaker-html5', 'GameMaker HTML5', 'GameMaker HTML5 target output'],
  ['rpg-maker', 'RPG Maker MV/MZ', 'Browser export folder'],
  ['renpy-web', 'Ren’Py Web', 'Ren’Py web export'],
  ['pyodide', 'Python in Browser', 'Pyodide/PyScript/browser-compatible Python build'],
  ['node-external', 'Node.js Backend App', 'Hosted Node/Express app with browser frontend'],
  ['python-external', 'Python Backend App', 'Hosted Flask/FastAPI/Django app with browser frontend']
];

const DEFAULT_FORM = {
  templateId: 'web-activity', name: '', discordClientId: '', discordClientSecret: '', botToken: '',
  sourceMode: 'folder', engine: 'generic-web', activityUrl: '', files: [], archive: null
};

function tokenHeaders(extra = {}) {
  const token = localStorage.getItem('nekodeckAdminToken') || '';
  return { ...(token ? { 'X-NekoDeck-Token': token } : {}), ...extra };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...tokenHeaders(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function relativePath(file) { return String(file.webkitRelativePath || file.name || '').replaceAll('\\', '/'); }
function bytes(value) { const n = Number(value || 0); if (n < 1024) return `${n} B`; if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`; if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`; return `${(n / 1024 ** 3).toFixed(2)} GB`; }
function validUrl(value) { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } }
function copy(value) { navigator.clipboard?.writeText(value); }

async function uploadFile(instanceId, file) {
  const response = await fetch(`/api/activities/${instanceId}/file`, {
    method: 'PUT',
    headers: tokenHeaders({ 'content-type': 'application/octet-stream', 'X-NekoDeck-File-Path': encodeURIComponent(relativePath(file)) }),
    body: file
  });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error || `Upload failed: HTTP ${response.status}`);
  return data;
}

async function uploadFiles(instanceId, files, progress) {
  const queue = [...files];
  let completed = 0;
  const concurrency = Math.min(4, Math.max(1, queue.length));
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const file = queue.shift();
      await uploadFile(instanceId, file);
      completed += 1;
      progress?.(`Uploading ${completed}/${files.length} · ${relativePath(file)}`);
    }
  });
  await Promise.all(workers);
}

async function uploadArchive(instanceId, file, replace = true, progress) {
  progress?.(`${replace ? 'Replacing' : 'Patching'} from ${file.name}…`);
  const response = await fetch(`/api/activities/${instanceId}/archive?replace=${replace ? '1' : '0'}`, {
    method: 'PUT',
    headers: tokenHeaders({ 'content-type': 'application/zip', 'X-NekoDeck-Archive-Name': encodeURIComponent(file.name) }),
    body: file
  });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error || `ZIP upload failed: HTTP ${response.status}`);
  return data;
}

function externalTarget(urlText) {
  try {
    const url = new URL(urlText);
    let pathname = url.pathname || '/';
    if (/\/index\.html?$/i.test(pathname)) pathname = pathname.replace(/index\.html?$/i, '');
    else if (!pathname.endsWith('/')) pathname = `${pathname}/`;
    return `${url.host}${pathname}`;
  } catch { return ''; }
}

function mappingTarget(instance) {
  if (instance.templateId === 'web-activity' && instance.config?.activitySourceType === 'url') return externalTarget(instance.config.activityUrl || '');
  return `${location.host}/api/activity-host/${instance.id}/`;
}

function engineLabel(id) { return ENGINE_PRESETS.find(([key]) => key === id)?.[1] || id || 'Web App'; }
function Badge({ children, kind = '' }) { return <span className={`activity-badge ${kind}`}>{children}</span>; }

function UploadSource({ mode, files, archive, setFiles, setArchive, engine }) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (mode === 'zip') return <div className="activity-upload-picker">
    <div className="activity-upload-actions one"><label><Archive size={18}/><strong>Choose ZIP build</strong><span>Complete exported game/app</span><input type="file" accept=".zip,application/zip" onChange={(event) => setArchive(event.target.files?.[0] || null)}/></label></div>
    {archive && <div className="activity-file-summary"><div><strong>{archive.name}</strong><span>archive</span></div><div><strong>{bytes(archive.size)}</strong><span>upload size</span></div><div><strong>{engineLabel(engine)}</strong><span>engine preset</span></div></div>}
    <p>ZIP extraction is protected against path traversal/symlink entries and has configurable archive, extracted-size and entry-count limits.</p>
  </div>;
  return <div className="activity-upload-picker">
    <div className="activity-upload-actions one"><label><FolderOpen size={18}/><strong>Choose exported build folder</strong><span>Keep every asset and subfolder</span><input type="file" multiple webkitdirectory="" directory="" onChange={(event) => setFiles(Array.from(event.target.files || []))}/></label></div>
    {files.length > 0 && <div className="activity-file-summary"><div><strong>{files.length}</strong><span>files</span></div><div><strong>{bytes(total)}</strong><span>total</span></div><div><strong>{relativePath(files.find((file) => /(^|\/)index\.html?$/i.test(relativePath(file))) || files[0])}</strong><span>entry candidate</span></div></div>}
    <p>Upload the built/exported output, not Unity/Unreal/Godot/Vite source code. NekoDeck preserves relative JS/CSS/WASM/media paths.</p>
  </div>;
}

function CreateActivity({ widgets, defaults, refresh, onError }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const templates = widgets.filter((widget) => ACTIVITY_TYPES.includes(widget.id));
  const selectedEngine = ENGINE_PRESETS.find(([id]) => id === form.engine);
  const needsExternal = ['node-external', 'python-external'].includes(form.engine);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => { if (needsExternal && form.sourceMode !== 'url') set('sourceMode', 'url'); }, [needsExternal]);

  const submit = async (event) => {
    event.preventDefault();
    onError('');
    const web = form.templateId === 'web-activity';
    if (web && form.sourceMode === 'url' && !validUrl(form.activityUrl)) return onError('Enter a valid HTTP/HTTPS URL.');
    if (web && form.sourceMode === 'folder' && !form.files.length) return onError('Choose an exported build folder.');
    if (web && form.sourceMode === 'zip' && !form.archive) return onError('Choose a ZIP build.');
    setBusy(true);
    try {
      setProgress('Creating Activity…');
      const config = {
        activity: true,
        delivery: 'discord-activity',
        activitySourceType: web && form.sourceMode === 'url' ? 'url' : web ? 'upload' : 'builtin',
        activityBuildHint: web ? form.engine : 'builtin',
        activityUrl: web && form.sourceMode === 'url' ? form.activityUrl.trim() : '',
        activityContentReady: false,
        maxParticipants: defaults.defaultMaxParticipants ?? null,
        releaseChannel: defaults.defaultReleaseChannel || 'development',
        verificationStatus: 'unverified',
        guildInstall: defaults.defaultGuildInstall !== false,
        userInstall: defaults.defaultUserInstall !== false,
        platformWeb: defaults.defaultPlatformWeb !== false,
        platformIos: Boolean(defaults.defaultPlatformIos),
        platformAndroid: Boolean(defaults.defaultPlatformAndroid)
      };
      const created = await api('/api/v2/instances', {
        method: 'POST',
        body: JSON.stringify({ templateId: form.templateId, name: form.name, discordClientId: form.discordClientId, discordClientSecret: form.discordClientSecret, botToken: form.botToken, config })
      });
      const instance = created.instance;
      if (web && form.sourceMode === 'folder') {
        await uploadFiles(instance.id, form.files, setProgress);
        setProgress('Detecting build…');
        await api(`/api/activities/${instance.id}/finalize`, { method: 'POST', body: '{}' });
      } else if (web && form.sourceMode === 'zip') {
        await uploadArchive(instance.id, form.archive, true, setProgress);
      }
      setProgress('Ready');
      setForm(DEFAULT_FORM);
      await refresh();
    } catch (error) { onError(error.message); }
    finally { setBusy(false); setTimeout(() => setProgress(''), 1500); }
  };

  return <form className="activity-create" onSubmit={submit}>
    <section><div className="activity-section-title"><div><span>01</span><h3>Activity</h3></div><Badge kind="ready">Web iframe</Badge></div>
      <div className="activity-form-grid"><label>Template<select value={form.templateId} onChange={(e) => set('templateId', e.target.value)}>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Name<input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="My Game / App"/></label></div>
    </section>
    <section><div className="activity-section-title"><div><span>02</span><h3>Discord application</h3></div><Badge>Encrypted</Badge></div>
      <div className="activity-form-grid"><label>Application / Client ID<input required value={form.discordClientId} onChange={(e) => set('discordClientId', e.target.value)}/></label><label>Client Secret<input required type="password" value={form.discordClientSecret} onChange={(e) => set('discordClientSecret', e.target.value)}/></label></div>
      <label>Bot Token <small>optional; useful for Activity Instance verification</small><input type="password" value={form.botToken} onChange={(e) => set('botToken', e.target.value)}/></label>
    </section>
    {form.templateId === 'web-activity' && <section><div className="activity-section-title"><div><span>03</span><h3>Game/App build</h3></div><Badge>{engineLabel(form.engine)}</Badge></div>
      <label>Builder / engine<select value={form.engine} onChange={(e) => set('engine', e.target.value)}>{ENGINE_PRESETS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <p className="activity-help">{selectedEngine?.[2]}</p>
      <div className="activity-source-tabs wide"><button type="button" className={form.sourceMode === 'folder' ? 'active' : ''} disabled={needsExternal} onClick={() => set('sourceMode', 'folder')}><FolderOpen size={14}/>Folder</button><button type="button" className={form.sourceMode === 'zip' ? 'active' : ''} disabled={needsExternal} onClick={() => set('sourceMode', 'zip')}><Archive size={14}/>ZIP</button><button type="button" className={form.sourceMode === 'url' ? 'active' : ''} onClick={() => set('sourceMode', 'url')}><Globe2 size={14}/>External URL</button></div>
      {form.sourceMode === 'url' ? <div className="activity-url-config"><label>Hosted browser app URL<input required value={form.activityUrl} onChange={(e) => set('activityUrl', e.target.value)} placeholder="https://games.example.com/my-game/"/></label><div className="activity-info"><Globe2 size={17}/><span>Discord maps <code>/</code> directly to this app directory so relative JS, CSS and assets work. Node/Python backends must already be hosted and expose a browser frontend.</span></div></div> : <UploadSource mode={form.sourceMode} files={form.files} archive={form.archive} setFiles={(files) => set('files', files)} setArchive={(archive) => set('archive', archive)} engine={form.engine}/>} 
      {form.engine === 'unreal-web' && <div className="activity-info warning"><ShieldCheck size={17}/><span>Static Unreal HTML/WASM exports can be hosted. Unreal Pixel Streaming uses WebRTC; Discord Activities currently do not support WebRTC.</span></div>}
    </section>}
    <div className="activity-create-footer"><div>{progress || 'Build files persist under /data.'}</div><button className="activity-primary" disabled={busy}>{busy ? 'Working…' : 'Create Activity'}</button></div>
  </form>;
}

function UpdateBuild({ instance, close, refresh, onError }) {
  const [mode, setMode] = useState('zip-replace');
  const [archive, setArchive] = useState(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const run = async () => {
    onError(''); setBusy(true);
    try {
      if (mode === 'folder-replace') {
        if (!files.length) throw new Error('Choose an updated build folder.');
        await api(`/api/activities/${instance.id}/content`, { method: 'DELETE' });
        await uploadFiles(instance.id, files, setProgress);
        await api(`/api/activities/${instance.id}/finalize`, { method: 'POST', body: '{}' });
      } else {
        if (!archive) throw new Error('Choose a ZIP file.');
        await uploadArchive(instance.id, archive, mode === 'zip-replace', setProgress);
      }
      await refresh(); close();
    } catch (error) { onError(error.message); }
    finally { setBusy(false); }
  };
  return <div className="activity-inline-editor"><div className="activity-source-tabs wide"><button type="button" className={mode === 'zip-replace' ? 'active' : ''} onClick={() => setMode('zip-replace')}>ZIP replace</button><button type="button" className={mode === 'zip-patch' ? 'active' : ''} onClick={() => setMode('zip-patch')}>ZIP patch</button><button type="button" className={mode === 'folder-replace' ? 'active' : ''} onClick={() => setMode('folder-replace')}>Folder replace</button></div>
    {mode === 'folder-replace' ? <UploadSource mode="folder" files={files} setFiles={setFiles} engine={instance.config?.activityBuildHint}/> : <UploadSource mode="zip" files={[]} archive={archive} setArchive={setArchive} engine={instance.config?.activityBuildHint}/>}<div className="activity-editor-actions"><span>{progress}</span><button className="activity-primary" disabled={busy} onClick={run}>{busy ? 'Updating…' : 'Update build'}</button></div></div>;
}

function ActivitySettings({ instance, close, refresh, onError }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/api/activities/${instance.id}/settings`).then((data) => setForm(data.settings)).catch((e) => onError(e.message)); }, [instance.id]);
  if (!form) return <div className="activity-inline-editor">Loading settings…</div>;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true); onError('');
    try { await api(`/api/activities/${instance.id}/settings`, { method: 'PUT', body: JSON.stringify(form) }); await refresh(); close(); }
    catch (error) { onError(error.message); } finally { setBusy(false); }
  };
  const portal = `https://discord.com/developers/applications/${instance.discordClientId || ''}`;
  return <div className="activity-inline-editor settings-editor">
    <div className="activity-form-grid"><label>Name<input value={form.name} onChange={(e) => set('name', e.target.value)}/></label><label>Max Participants <small>blank = unlimited</small><input type="number" min="1" max="1000" value={form.maxParticipants ?? ''} onChange={(e) => set('maxParticipants', e.target.value)}/></label></div>
    {instance.config?.activitySourceType === 'url' && <label>External App URL<input value={form.activityUrl} onChange={(e) => set('activityUrl', e.target.value)}/></label>}
    <label>Description<textarea value={form.description} onChange={(e) => set('description', e.target.value)}/></label>
    <div className="activity-form-grid"><label>Release channel<select value={form.releaseChannel} onChange={(e) => set('releaseChannel', e.target.value)}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></label><label>Discord verification status<select value={form.verificationStatus} onChange={(e) => set('verificationStatus', e.target.value)}><option value="unverified">Unverified</option><option value="submitted">Submitted</option><option value="verified">Verified</option></select></label></div>
    <div className="activity-setting-checks"><label><input type="checkbox" checked={form.guildInstall} onChange={(e) => set('guildInstall', e.target.checked)}/>Guild Install</label><label><input type="checkbox" checked={form.userInstall} onChange={(e) => set('userInstall', e.target.checked)}/>User Install</label><label><input type="checkbox" checked={form.platformWeb} onChange={(e) => set('platformWeb', e.target.checked)}/>Desktop / Web</label><label><input type="checkbox" checked={form.platformIos} onChange={(e) => set('platformIos', e.target.checked)}/>iOS</label><label><input type="checkbox" checked={form.platformAndroid} onChange={(e) => set('platformAndroid', e.target.checked)}/>Android</label></div>
    {form.verificationStatus !== 'verified' && <div className="activity-verification-warning"><ShieldCheck/><div><strong>Discord restriction: under 25-member servers only</strong><span>This is not controlled by NekoDeck. Submit the Discord application for verification to remove the server-size restriction.</span><button onClick={() => window.open(portal, '_blank', 'noopener')}>Open Discord Developer Portal</button></div></div>}
    <div className="activity-info"><Users size={17}/><span>Max Participants is stored by NekoDeck and should be mirrored in Discord Developer Portal → General Information → Max Participants. Discord documents it as Activity metadata, not a bypass for verification.</span></div>
    <div className="activity-editor-actions"><button onClick={close}>Cancel</button><button className="activity-primary" disabled={busy} onClick={save}><Save size={14}/>{busy ? 'Saving…' : 'Save settings'}</button></div>
  </div>;
}

function ActivityCard({ instance, widget, refresh, onError }) {
  const [editor, setEditor] = useState('');
  const source = instance.templateId === 'web-activity' ? (instance.config?.activitySourceType === 'url' ? 'External URL' : engineLabel(instance.config?.activityBuildHint)) : 'NekoDeck utility';
  const target = mappingTarget(instance);
  const remove = async () => {
    if (!confirm(`Delete “${instance.name}”?`)) return;
    try { if (instance.templateId === 'web-activity' && instance.config?.activitySourceType !== 'url') await api(`/api/activities/${instance.id}/content`, { method: 'DELETE' }).catch(() => {}); await api(`/api/instances/${instance.id}`, { method: 'DELETE' }); await refresh(); }
    catch (error) { onError(error.message); }
  };
  const preview = () => window.open(instance.config?.activitySourceType === 'url' ? instance.config.activityUrl : `/api/activity-host/${instance.id}/`, '_blank', 'noopener');
  return <article className="activity-item"><div className="activity-item-icon">{instance.templateId === 'web-activity' ? <Gamepad2/> : <Wrench/>}</div><div className="activity-item-main">
    <div className="activity-item-title"><div><h3>{instance.name}</h3><p>{widget?.name || instance.templateId} · {source}</p></div><div><Badge kind="ready">{instance.config?.releaseChannel || 'development'}</Badge><Badge kind={instance.config?.verificationStatus === 'verified' ? 'ready' : 'warn'}>{instance.config?.verificationStatus || 'unverified'}</Badge></div></div>
    <div className="activity-capabilities"><span><FileCode2 size={13}/>HTML/JS</span><span><Zap size={13}/>WASM</span><span><Users size={13}/>{instance.config?.maxParticipants || 'Unlimited'} participants</span></div>
    <div className="activity-item-actions"><button onClick={preview}>Preview</button><button onClick={() => { setEditor(editor === 'mapping' ? '' : 'mapping'); }}>Discord Mapping</button>{instance.templateId === 'web-activity' && instance.config?.activitySourceType !== 'url' && <button onClick={() => setEditor(editor === 'update' ? '' : 'update')}><Upload size={14}/>Update build</button>}<button onClick={() => setEditor(editor === 'settings' ? '' : 'settings')}><Settings size={14}/>Settings</button><button className="danger" onClick={remove}><Trash2 size={14}/></button></div>
    {editor === 'mapping' && <div className="activity-mappings"><div className="activity-mapping"><span>Prefix</span><code>/</code><span>Target directory</span><code>{target}</code><button onClick={() => copy(`/ → ${target}`)}><Copy size={14}/></button></div>{instance.config?.activitySourceType === 'url' && <small>Map Discord <code>/</code> directly to this external directory so its JS/CSS/assets remain under the same Activity root.</small>}</div>}
    {editor === 'update' && <UpdateBuild instance={instance} close={() => setEditor('')} refresh={refresh} onError={onError}/>} 
    {editor === 'settings' && <ActivitySettings instance={instance} close={() => setEditor('')} refresh={refresh} onError={onError}/>} 
  </div></article>;
}

function Defaults({ settings, setSettings, onError }) {
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(settings), [settings]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => { setBusy(true); try { const result = await api('/api/activity-settings', { method: 'PUT', body: JSON.stringify(form) }); setSettings(result.settings); } catch (e) { onError(e.message); } finally { setBusy(false); } };
  return <div className="activity-create"><section><div className="activity-section-title"><div><span>01</span><h3>Default Activity settings</h3></div><Badge>New Activities</Badge></div><div className="activity-form-grid"><label>Default Max Participants<input type="number" min="1" max="1000" value={form.defaultMaxParticipants ?? ''} onChange={(e) => set('defaultMaxParticipants', e.target.value)}/></label><label>Release channel<select value={form.defaultReleaseChannel || 'development'} onChange={(e) => set('defaultReleaseChannel', e.target.value)}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></label></div><div className="activity-setting-checks"><label><input type="checkbox" checked={form.defaultGuildInstall !== false} onChange={(e) => set('defaultGuildInstall', e.target.checked)}/>Guild Install</label><label><input type="checkbox" checked={form.defaultUserInstall !== false} onChange={(e) => set('defaultUserInstall', e.target.checked)}/>User Install</label><label><input type="checkbox" checked={form.defaultPlatformWeb !== false} onChange={(e) => set('defaultPlatformWeb', e.target.checked)}/>Desktop/Web</label><label><input type="checkbox" checked={Boolean(form.defaultPlatformIos)} onChange={(e) => set('defaultPlatformIos', e.target.checked)}/>iOS</label><label><input type="checkbox" checked={Boolean(form.defaultPlatformAndroid)} onChange={(e) => set('defaultPlatformAndroid', e.target.checked)}/>Android</label></div><button className="activity-primary" disabled={busy} onClick={save}><Save size={14}/>{busy ? 'Saving…' : 'Save defaults'}</button></section>
    <section><div className="activity-section-title"><div><span>02</span><h3>Upload limits</h3></div></div><p className="activity-help">Folder files: <code>NEKODECK_ACTIVITY_MAX_FILE_BYTES</code>. ZIP archives: <code>NEKODECK_ACTIVITY_MAX_ARCHIVE_BYTES</code>. Expanded ZIP: <code>NEKODECK_ACTIVITY_MAX_EXTRACTED_BYTES</code>. ZIP entry count: <code>NEKODECK_ACTIVITY_MAX_ZIP_ENTRIES</code>.</p></section></div>;
}

function VerificationGuide() {
  return <div className="activity-guide v3-guide"><section><div className="activity-guide-icon"><ShieldCheck/></div><h3>Why Discord blocks >25-member servers</h3><p>Unverified Activities are intended for developers/testers and Discord restricts them to servers with fewer than 25 members. NekoDeck cannot override that platform restriction.</p></section><section><div className="activity-guide-icon"><CheckCircle2/></div><h3>Remove the restriction</h3><p>Open your application in Discord Developer Portal → App Verification, complete the qualification criteria and submit it. Verified Activities can be played in servers regardless of server size.</p><button className="activity-primary" onClick={() => window.open('https://discord.com/developers/applications', '_blank', 'noopener')}>Open Developer Portal</button></section><section><div className="activity-guide-icon"><Users/></div><h3>Testing before verification</h3><p>Use a test server with fewer than 25 members, DMs/GDMs where applicable, and add trusted App Testers or development-team members for private testing.</p></section><section><div className="activity-guide-icon"><Settings/></div><h3>Max Participants ≠ server member count</h3><p>Max Participants tells users how many people the Activity itself is designed for. It does not change the Discord verification limit on the total server membership.</p></section></div>;
}

export default function ActivityStudioV3() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('created');
  const [widgets, setWidgets] = useState([]);
  const [instances, setInstances] = useState([]);
  const [defaults, setDefaults] = useState({ defaultMaxParticipants: null, defaultReleaseChannel: 'development' });
  const [error, setError] = useState('');
  const activities = useMemo(() => instances.filter((item) => ACTIVITY_TYPES.includes(item.templateId)), [instances]);
  const refresh = async () => { try { const [w, i, s] = await Promise.all([api('/api/widgets'), api('/api/instances'), api('/api/activity-settings')]); setWidgets(w.widgets || []); setInstances(i.instances || []); setDefaults(s.settings || {}); } catch (e) { setError(e.message); } };
  useEffect(() => { if (open) refresh(); }, [open]);
  if (location.pathname.startsWith('/activity/')) return null;
  return <><button className="activity-studio-launch" onClick={() => setOpen(true)}><Gamepad2 size={18}/><span>Activities</span>{activities.length > 0 && <b>{activities.length}</b>}</button>{open && <div className="activity-studio-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}><div className="activity-studio-window"><header><div><span className="activity-studio-kicker">NekoDeck 0.4</span><h2>Activity Studio</h2><p>HTML games, Unity WebGL, engine exports, ZIP updates, external apps and Discord controls.</p></div><button onClick={() => setOpen(false)}><X/></button></header><nav><button className={tab === 'created' ? 'active' : ''} onClick={() => setTab('created')}><Activity size={15}/>Created <b>{activities.length}</b></button><button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}><Gamepad2 size={15}/>Create</button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings size={15}/>Settings</button><button className={tab === 'verification' ? 'active' : ''} onClick={() => setTab('verification')}><ShieldCheck size={15}/>Verification</button></nav>{error && <div className="activity-error">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}<main>{tab === 'create' ? <CreateActivity widgets={widgets} defaults={defaults} refresh={async () => { await refresh(); setTab('created'); }} onError={setError}/> : tab === 'settings' ? <Defaults settings={defaults} setSettings={setDefaults} onError={setError}/> : tab === 'verification' ? <VerificationGuide/> : <div className="activity-list"><div className="activity-list-heading"><div><h3>Created Activities</h3><p>Update builds without creating a new Discord application.</p></div><button onClick={refresh}><RefreshCw size={15}/>Refresh</button></div>{activities.length ? activities.map((instance) => <ActivityCard key={instance.id} instance={instance} widget={widgets.find((widget) => widget.id === instance.templateId)} refresh={refresh} onError={setError}/>) : <div className="activity-empty"><Gamepad2 size={28}/><h3>No Activities yet</h3><p>Create a web game/app or one of NekoDeck's built-in tools.</p></div>}</div>}</main></div></div>}</>;
}
