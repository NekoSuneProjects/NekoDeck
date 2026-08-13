import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  ChevronRight,
  Copy,
  FileCode2,
  FolderOpen,
  Gamepad2,
  Globe2,
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

const ACTIVITY_TYPES = ['web-activity', 'counter', 'notes', 'timer', 'random-picker', 'system-monitor', 'status-check'];
const DEFAULT_FORM = {
  templateId: 'web-activity',
  name: '',
  discordClientId: '',
  discordClientSecret: '',
  botToken: '',
  sourceType: 'upload',
  activityUrl: '',
  externalMappingPrefix: '/external'
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

function targetFor(instance) {
  return `${location.host}/api/activity-host/${instance.id}/`;
}

function externalTarget(instance) {
  try { return new URL(instance.config?.activityUrl || '').host; } catch { return ''; }
}

function copy(value) {
  navigator.clipboard?.writeText(value);
}

function Badge({ children, kind = '' }) {
  return <span className={`activity-badge ${kind}`}>{children}</span>;
}

function MappingBox({ instance }) {
  const external = instance.templateId === 'web-activity' && instance.config?.activitySourceType === 'url' ? externalTarget(instance) : '';
  const externalPrefix = instance.config?.externalMappingPrefix || '/external';
  return <div className="activity-mappings">
    {external && <div className="activity-mapping"><span>1 · Prefix</span><code>{externalPrefix}</code><span>Target</span><code>{external}</code><button onClick={() => copy(`${externalPrefix} → ${external}`)}><Copy size={14}/></button></div>}
    <div className="activity-mapping"><span>{external ? '2' : '1'} · Prefix</span><code>/</code><span>Target</span><code>{targetFor(instance)}</code><button onClick={() => copy(targetFor(instance))}><Copy size={14}/></button></div>
    {external && <small>Keep the external mapping above <code>/</code>. Discord evaluates the more specific prefix first.</small>}
  </div>;
}

function UploadPicker({ files, setFiles }) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const html = files.find((file) => /(^|\/)index\.html?$/i.test(filePath(file))) || files.find((file) => /\.html?$/i.test(file.name));
  return <div className="activity-upload-picker">
    <div className="activity-upload-actions">
      <label><FileCode2 size={18}/><strong>Choose files</strong><span>HTML + assets/media</span><input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))}/></label>
      <label><FolderOpen size={18}/><strong>Choose folder</strong><span>HTML5 game / web build</span><input type="file" multiple webkitdirectory="" directory="" onChange={(event) => setFiles(Array.from(event.target.files || []))}/></label>
    </div>
    {files.length > 0 && <div className="activity-file-summary">
      <div><strong>{files.length}</strong><span>files selected</span></div>
      <div><strong>{bytes(total)}</strong><span>total upload</span></div>
      <div><strong>{html ? filePath(html) : 'Missing'}</strong><span>HTML entry candidate</span></div>
    </div>}
    <p>For game-engine web exports, select the complete output folder so JS, WASM, textures, music and video keep their relative paths. NekoDeck discovers <code>index.html</code> automatically.</p>
  </div>;
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
    if (form.templateId === 'web-activity' && form.sourceType === 'url' && !validExternalUrl(form.activityUrl)) {
      onError('Enter a valid HTTP/HTTPS external Activity URL.');
      return;
    }
    setBusy(true);
    setProgress('Creating Activity…');
    try {
      const config = {
        activity: true,
        delivery: 'discord-activity',
        activitySourceType: form.templateId === 'web-activity' ? form.sourceType : 'builtin',
        activityUrl: form.sourceType === 'url' ? form.activityUrl.trim() : '',
        externalMappingPrefix: form.externalMappingPrefix || '/external',
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
      if (form.templateId === 'web-activity' && form.sourceType === 'upload' && files.length) {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          setProgress(`Uploading ${index + 1}/${files.length} · ${filePath(file)}`);
          await uploadFile(instance.id, file, filePath(file));
        }
        setProgress('Finding HTML entry point…');
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
        <label>Activity name<input required value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="My Discord Game"/></label>
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
      <div className="activity-section-title"><div><span>03</span><h3>Web app / game source</h3></div><div className="activity-source-tabs"><button type="button" className={form.sourceType === 'upload' ? 'active' : ''} onClick={() => set('sourceType', 'upload')}><Upload size={14}/>Upload</button><button type="button" className={form.sourceType === 'url' ? 'active' : ''} onClick={() => set('sourceType', 'url')}><Globe2 size={14}/>URL</button></div></div>
      {form.sourceType === 'upload' ? <UploadPicker files={files} setFiles={setFiles}/> : <div className="activity-url-config">
        <label>External web app URL<input required value={form.activityUrl} onChange={(event) => set('activityUrl', event.target.value)} placeholder="https://example.com/game/"/></label>
        <label>Discord mapping prefix<input value={form.externalMappingPrefix} onChange={(event) => set('externalMappingPrefix', event.target.value)} placeholder="/external"/></label>
        <div className="activity-info"><Globe2 size={17}/><span>NekoDeck loads this through a separate Discord URL Mapping. Some sites block being embedded; your own hosted HTML5 app works best.</span></div>
      </div>}
    </section>}

    <div className="activity-create-footer">
      <div>{progress ? <><RefreshCw className={busy ? 'spin' : ''} size={16}/><span>{progress}</span></> : <><ShieldCheck size={16}/><span>Activity files are persisted under NekoDeck <code>/data</code>.</span></>}</div>
      <button className="activity-primary" disabled={busy}><Plus size={16}/>{busy ? 'Working…' : 'Create Activity'}</button>
    </div>
  </form>;
}

function ActivityItem({ instance, widget, onRefresh, onError }) {
  const [showMappings, setShowMappings] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const source = instance.templateId === 'web-activity' ? (instance.config?.activitySourceType === 'url' ? 'External URL' : 'Uploaded web app') : 'Built-in NekoDeck tool';

  const replace = async () => {
    if (!files.length) return;
    setBusy(true);
    onError('');
    try {
      await api(`/api/activities/${instance.id}/content`, { method: 'DELETE' });
      for (let index = 0; index < files.length; index += 1) await uploadFile(instance.id, files[index], filePath(files[index]));
      await api(`/api/activities/${instance.id}/finalize`, { method: 'POST', body: '{}' });
      setReplacing(false);
      setFiles([]);
      await onRefresh();
    } catch (error) { onError(error.message); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete Activity “${instance.name}”?`)) return;
    onError('');
    try {
      if (instance.templateId === 'web-activity') await api(`/api/activities/${instance.id}/content`, { method: 'DELETE' }).catch(() => {});
      await api(`/api/instances/${instance.id}`, { method: 'DELETE' });
      await onRefresh();
    } catch (error) { onError(error.message); }
  };

  return <article className="activity-item">
    <div className="activity-item-icon">{instance.templateId === 'web-activity' ? <Gamepad2/> : <Wrench/>}</div>
    <div className="activity-item-main">
      <div className="activity-item-title"><div><h3>{instance.name}</h3><p>{widget?.name || instance.templateId} · {source}</p></div><div><Badge kind="ready">Ready</Badge>{instance.templateId === 'web-activity' && instance.config?.activitySourceType === 'upload' && <Badge kind={instance.config?.activityContentReady ? 'ready' : 'warn'}>{instance.config?.activityContentReady ? 'Files ready' : 'No files'}</Badge>}</div></div>
      <div className="activity-capabilities"><span><Music2 size={13}/>Audio</span><span><Video size={13}/>Video</span><span><Gamepad2 size={13}/>Gamepad</span><span><Activity size={13}/>Discord iframe</span></div>
      <div className="activity-item-actions">
        <button onClick={() => window.open(`/api/activity-host/${instance.id}/`, '_blank', 'noopener')}><Play size={15}/>Preview</button>
        <button onClick={() => setShowMappings(!showMappings)}><Copy size={15}/>Discord Mapping</button>
        {instance.templateId === 'web-activity' && instance.config?.activitySourceType !== 'url' && <button onClick={() => setReplacing(!replacing)}><Upload size={15}/>Replace files</button>}
        <button className="danger" onClick={remove}><Trash2 size={15}/></button>
      </div>
      {showMappings && <MappingBox instance={instance}/>} 
      {replacing && <div className="activity-replace"><UploadPicker files={files} setFiles={setFiles}/><button className="activity-primary" disabled={busy || !files.length} onClick={replace}>{busy ? 'Uploading…' : 'Replace Activity files'}</button></div>}
    </div>
  </article>;
}

function ActivityList({ widgets, instances, refresh, onError }) {
  const activityInstances = instances.filter((instance) => ACTIVITY_TYPES.includes(instance.templateId));
  return <div className="activity-list">
    <div className="activity-list-heading"><div><h3>Created Activities</h3><p>Each Activity gets its own standalone Discord mapping target.</p></div><button onClick={refresh}><RefreshCw size={15}/>Refresh</button></div>
    {activityInstances.length ? activityInstances.map((instance) => <ActivityItem key={instance.id} instance={instance} widget={widgets.find((widget) => widget.id === instance.templateId)} onRefresh={refresh} onError={onError}/>) : <div className="activity-empty"><Gamepad2 size={28}/><h3>No Activities yet</h3><p>Create an uploaded HTML game, URL Activity or one of the built-in tools.</p></div>}
  </div>;
}

function DiscordGuide() {
  return <div className="activity-guide">
    <section><div className="activity-guide-icon"><Activity/></div><h3>1. Enable Activities</h3><p>In your Discord application, open <b>Activities → Settings</b> and enable Activities. Select the platforms you want to test on.</p></section>
    <section><div className="activity-guide-icon"><Globe2/></div><h3>2. Add URL Mapping</h3><p>Copy the mapping target from the Created tab. The main mapping prefix is <code>/</code>. For an external URL Activity, add its external prefix first.</p></section>
    <section><div className="activity-guide-icon"><Gamepad2/></div><h3>3. Launch in Discord</h3><p>Enable Developer Mode, enter a channel and launch your application from the Activity/App Launcher. Owned development Activities appear in the developer shelf.</p></section>
    <section><div className="activity-guide-icon"><FileCode2/></div><h3>HTML5 game builds</h3><p>Upload the complete exported web folder. Relative JS/CSS/WASM/media paths work from the Activity root. External API calls still require Discord URL Mappings.</p></section>
  </div>;
}

export default function ActivityStudio() {
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

  const created = async () => {
    await refresh();
    setTab('created');
  };

  if (location.pathname.startsWith('/activity/')) return null;
  return <>
    <button className="activity-studio-launch" onClick={() => setOpen(true)}><Gamepad2 size={18}/><span>Activities</span>{activityCount > 0 && <b>{activityCount}</b>}</button>
    {open && <div className="activity-studio-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <div className="activity-studio-window">
        <header><div><span className="activity-studio-kicker">NekoDeck</span><h2>Activity Studio</h2><p>Upload HTML5 games/apps, map URLs, or use built-in Discord tools.</p></div><button onClick={() => setOpen(false)}><X/></button></header>
        <nav><button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}><Plus size={15}/>Create</button><button className={tab === 'created' ? 'active' : ''} onClick={() => setTab('created')}><Activity size={15}/>Created <b>{activityCount}</b></button><button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}><ShieldCheck size={15}/>Discord Setup</button></nav>
        {error && <div className="activity-error">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}
        <main>{tab === 'create' ? <CreateActivity widgets={widgets} onCreated={created} onError={setError}/> : tab === 'created' ? <ActivityList widgets={widgets} instances={instances} refresh={refresh} onError={setError}/> : <DiscordGuide/>}</main>
      </div>
    </div>}
  </>;
}
