import React, { useEffect, useMemo, useState } from 'react';
import {
  AppWindow, Box, CheckCircle2, Copy, Download, ExternalLink, FileJson2,
  Gamepad2, Globe2, Package, RefreshCw, Save, Server, ShieldCheck, Upload, X
} from 'lucide-react';
import './app-systems.css';

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

function copy(value) { navigator.clipboard?.writeText(value); }
function pretty(value) { return JSON.stringify(value || {}, null, 2); }
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const ROOT_DEFAULTS = {
  enabled: false,
  discordEnabled: true,
  projectId: '',
  version: '0.1.0',
  devToken: '',
  authToken: '',
  uploadHost: '',
  settings: '{}',
  permissions: '{}'
};

function Badge({ children, kind = '' }) {
  return <span className={`systems-badge ${kind}`}>{children}</span>;
}

function Overview({ instances, select, setTab }) {
  return <div className="systems-overview">
    <section className="systems-summary">
      <div><span>Total apps</span><strong>{instances.length}</strong><small>Activities + widget/data apps</small></div>
      <div><span>Discord targets</span><strong>{instances.filter((x) => x.platforms?.discord).length}</strong><small>Activity / Profile integrations</small></div>
      <div><span>RootApp targets</span><strong>{instances.filter((x) => x.platforms?.rootapp).length}</strong><small>Root packaged applications</small></div>
    </section>
    <section className="systems-list">
      <header><div><h3>Your apps</h3><p>One NekoDeck project can target Discord, RootApp, or both.</p></div></header>
      {instances.map((item) => <article key={item.id}>
        <div className="systems-app-icon"><AppWindow size={19}/></div>
        <div className="systems-app-main"><strong>{item.name}</strong><span>{item.templateId} · {item.id}</span><div><Badge kind={item.platforms?.discord ? 'discord' : ''}>Discord {item.platforms?.discord ? 'on' : 'off'}</Badge><Badge kind={item.platforms?.rootapp ? 'root' : ''}>RootApp {item.platforms?.rootapp ? 'on' : 'off'}</Badge></div></div>
        <button onClick={() => { select(item.id); setTab('rootapp'); }}>Configure <ExternalLink size={13}/></button>
      </article>)}
      {!instances.length && <div className="systems-empty"><AppWindow/><h3>No apps yet</h3><p>Create an Activity or Profile Widget first.</p></div>}
    </section>
  </div>;
}

function DiscordPage({ instances }) {
  return <div className="systems-platform-page">
    <section className="systems-platform-hero discord">
      <div className="systems-platform-logo">D</div><div><span>NekoDeck App System</span><h2>Discord</h2><p>Discord Activities and Profile Board data stay managed as their own platform target.</p></div>
      <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Developer Portal <ExternalLink size={14}/></a>
    </section>
    <div className="systems-info-grid">
      <section><Gamepad2/><h3>Activities</h3><p>HTML/WebGL games, Unity, Godot and other browser builds use Discord Activity URL mappings and the Embedded App environment.</p></section>
      <section><ShieldCheck/><h3>Verification</h3><p>Discord controls Activity verification and the server-size restriction. NekoDeck tracks configuration but cannot bypass Discord verification.</p></section>
      <section><AppWindow/><h3>Profile Board</h3><p>Profile Widget integrations remain separate from Activities and can be managed from the Profile Widget Manager.</p></section>
    </div>
    <section className="systems-target-table"><header><h3>Discord targets</h3><Badge kind="discord">{instances.filter((x) => x.platforms?.discord).length} enabled</Badge></header>{instances.map((x) => <div key={x.id}><span>{x.name}</span><span>{x.templateId}</span><Badge kind={x.platforms?.discord ? 'discord' : ''}>{x.platforms?.discord ? 'Enabled' : 'Disabled'}</Badge></div>)}</section>
  </div>;
}

function RootPage({ selected, detail, form, setForm, save, busy, packageBusy, message, manifest, previewManifest, exportProject, buildPackage, publishPackage }) {
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  if (!selected) return <div className="systems-empty"><Box/><h3>Select an app</h3><p>Choose a NekoDeck app from Overview to configure its RootApp target.</p></div>;
  return <div className="systems-platform-page">
    <section className="systems-platform-hero root"><div className="systems-platform-logo">R</div><div><span>NekoDeck App System</span><h2>RootApp</h2><p>Package a browser client plus Root-hosted Node/TypeScript server for installation inside Root communities.</p></div><div className="systems-hero-links"><a href="https://dev.rootapp.com/" target="_blank" rel="noreferrer">Developer Portal <ExternalLink size={14}/></a><a href="https://docs.rootapp.com/docs/app-docs/app-home/" target="_blank" rel="noreferrer">Docs <ExternalLink size={14}/></a></div></section>

    <section className="systems-root-editor">
      <header><div><span>Selected app</span><h3>{selected.name}</h3><p>{selected.templateId} · {selected.id}</p></div><div><Badge kind={detail?.credentialStatus?.devToken ? 'root' : ''}>DEV_TOKEN {detail?.credentialStatus?.devToken ? 'stored' : 'missing'}</Badge><Badge kind={detail?.credentialStatus?.authToken ? 'root' : ''}>Publish token {detail?.credentialStatus?.authToken ? 'stored' : 'missing'}</Badge></div></header>

      <div className="systems-toggle-row"><label><input type="checkbox" checked={form.discordEnabled} onChange={(e) => set('discordEnabled', e.target.checked)}/><span><strong>Discord target</strong><small>Keep this app enabled for Discord too.</small></span></label><label><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)}/><span><strong>RootApp target</strong><small>Generate and manage a Root package for this app.</small></span></label></div>

      <div className="systems-form-grid"><label>Root project ID<input value={form.projectId} onChange={(e) => set('projectId', e.target.value)} placeholder="ID from Root Developer Portal"/></label><label>Version<input value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="1.0.0"/></label></div>
      <div className="systems-form-grid"><label>DEV_TOKEN <small>leave blank to keep stored token</small><input type="password" value={form.devToken} onChange={(e) => set('devToken', e.target.value)} placeholder="Encrypted by NekoDeck"/></label><label>Upload auth token <small>leave blank to keep stored token</small><input type="password" value={form.authToken} onChange={(e) => set('authToken', e.target.value)} placeholder="Encrypted by NekoDeck"/></label></div>
      <div className="systems-form-grid"><label>Advanced upload host <small>optional; current Root docs do not require this</small><input value={form.uploadHost} onChange={(e) => set('uploadHost', e.target.value)} placeholder="dev.rootapp.com"/></label><div className="systems-note"><Package size={16}/><span>Ready-package mode runs <code>npm install</code>, <code>npm run build</code>, then creates <code>rootapp.pkg</code> with the Root SDK.</span></div></div>

      <div className="systems-json-grid"><label>Manifest settings JSON<textarea value={form.settings} onChange={(e) => set('settings', e.target.value)} spellCheck="false"/></label><label>Manifest permissions JSON<textarea value={form.permissions} onChange={(e) => set('permissions', e.target.value)} spellCheck="false"/></label></div>
      <div className="systems-note"><ShieldCheck size={16}/><span>Root credentials stay encrypted in NekoDeck. Source ZIP files contain only <code>.env.example</code>; stored DEV_TOKEN and upload tokens are never embedded.</span></div>
      {selected.templateId === 'web-activity' && selected.config?.activitySourceType === 'upload' ? <div className="systems-note success"><CheckCircle2 size={16}/><span>This uploaded web game/app is copied directly into the Root export's <code>client/dist</code>, including JS, CSS, WASM and media assets.</span></div> : <div className="systems-note"><Globe2 size={16}/><span>This app has no locally uploaded web client. The exporter creates a Root client placeholder that you can replace with your React/Vite/HTML build.</span></div>}

      <div className="systems-actions">
        <button disabled={busy || packageBusy} onClick={save}><Save size={14}/>{busy ? 'Saving…' : 'Save RootApp config'}</button>
        <button disabled={packageBusy} onClick={previewManifest}><FileJson2 size={14}/>Preview manifest</button>
        <button disabled={packageBusy} onClick={exportProject}><Download size={14}/>Source ZIP</button>
        <button className="systems-primary" disabled={packageBusy || !form.enabled} onClick={buildPackage}><Package size={14}/>{packageBusy ? 'Building…' : 'Build .pkg'}</button>
        <button disabled={packageBusy || !form.enabled || !detail?.credentialStatus?.authToken} onClick={publishPackage}><Upload size={14}/>Build + Upload</button>
      </div>
      {message && <div className="systems-message">{message}</div>}
    </section>

    {detail?.commands && <section className="systems-commands"><header><div><h3>Root SDK workflow</h3><p>The source ZIP contains scripts for the same workflow NekoDeck uses for ready-package mode.</p></div></header>{Object.entries(detail.commands).map(([key, value]) => <div key={key}><span>{key}</span><code>{value}</code><button onClick={() => copy(value)}><Copy size={13}/></button></div>)}</section>}

    {manifest && <section className="systems-manifest"><header><h3>root-manifest.json</h3><button onClick={() => copy(pretty(manifest))}><Copy size={13}/>Copy</button></header><pre>{pretty(manifest)}</pre></section>}
  </div>;
}

export default function AppSystems() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('overview');
  const [instances, setInstances] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(ROOT_DEFAULTS);
  const [manifest, setManifest] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const selected = useMemo(() => instances.find((x) => x.id === selectedId) || null, [instances, selectedId]);

  const load = async () => {
    try { const data = await api('/api/app-systems'); setInstances(data.instances || []); }
    catch (error) { setMessage(error.message); }
  };

  const loadRoot = async (id) => {
    if (!id) return;
    try {
      const data = await api(`/api/rootapp/${id}`);
      setDetail(data);
      setForm({
        enabled: Boolean(data.rootApp?.enabled),
        discordEnabled: data.instance?.config?.platformTargets?.discord !== false,
        projectId: data.rootApp?.projectId || '',
        version: data.rootApp?.version || '0.1.0',
        devToken: '', authToken: '',
        uploadHost: data.rootApp?.uploadHost || '',
        settings: pretty(data.rootApp?.settings || {}), permissions: pretty(data.rootApp?.permissions || {})
      });
      setManifest(null);
    } catch (error) { setMessage(error.message); }
  };

  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => { if (open && selectedId) loadRoot(selectedId); }, [open, selectedId]);
  if (location.pathname.startsWith('/activity/')) return null;

  const save = async () => {
    if (!selectedId) return;
    setBusy(true); setMessage('');
    try {
      await api(`/api/rootapp/${selectedId}`, { method: 'PUT', body: JSON.stringify(form) });
      setMessage('RootApp configuration saved.');
      await Promise.all([load(), loadRoot(selectedId)]);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const previewManifest = async () => {
    try { const data = await api(`/api/rootapp/${selectedId}/manifest`); setManifest(data.manifest); setMessage(''); }
    catch (error) { setMessage(error.message); }
  };

  const exportProject = async () => {
    try {
      setMessage('Building Root project ZIP…');
      const response = await fetch(`/api/rootapp/${selectedId}/export`, { headers: tokenHeaders() });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `HTTP ${response.status}`); }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `${selected?.name || 'NekoDeck'}-RootApp.zip`;
      downloadBlob(blob, filename);
      setMessage('Root source project ZIP exported.');
    } catch (error) { setMessage(error.message); }
  };

  const buildPackage = async () => {
    if (!selectedId) return;
    setPackageBusy(true); setMessage('Installing Root dependencies, compiling and building rootapp.pkg. This can take a few minutes…');
    try {
      const response = await fetch(`/api/rootapp/${selectedId}/package`, { headers: tokenHeaders() });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `HTTP ${response.status}`); }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'rootapp.pkg';
      downloadBlob(blob, filename);
      setMessage(`Root package built successfully: ${filename}`);
    } catch (error) { setMessage(error.message); }
    finally { setPackageBusy(false); }
  };

  const publishPackage = async () => {
    if (!selectedId) return;
    setPackageBusy(true); setMessage('Building rootapp.pkg and uploading it to Root…');
    try {
      const data = await api(`/api/rootapp/${selectedId}/publish`, { method: 'POST', body: '{}' });
      setMessage(data.message || 'RootApp uploaded successfully.');
    } catch (error) { setMessage(error.message); }
    finally { setPackageBusy(false); }
  };

  return <>
    <button className="systems-launch" onClick={() => setOpen(true)}><Server size={17}/><span>App Systems</span><b>2</b></button>
    {open && <div className="systems-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}><div className="systems-window">
      <header><div><span>NekoDeck</span><h2>App Systems</h2><p>Build once, configure platform-specific delivery for Discord and RootApp.</p></div><button onClick={() => setOpen(false)}><X/></button></header>
      <nav><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><AppWindow size={15}/>Overview</button><button className={tab === 'discord' ? 'active' : ''} onClick={() => setTab('discord')}><Gamepad2 size={15}/>Discord</button><button className={tab === 'rootapp' ? 'active' : ''} onClick={() => setTab('rootapp')}><Box size={15}/>RootApp</button><button onClick={load}><RefreshCw size={15}/>Refresh</button></nav>
      <main>{tab === 'overview' && <Overview instances={instances} select={setSelectedId} setTab={setTab}/>} {tab === 'discord' && <DiscordPage instances={instances}/>} {tab === 'rootapp' && <RootPage selected={selected} detail={detail} form={form} setForm={setForm} save={save} busy={busy} packageBusy={packageBusy} message={message} manifest={manifest} previewManifest={previewManifest} exportProject={exportProject} buildPackage={buildPackage} publishPackage={publishPackage}/>}</main>
    </div></div>}
  </>;
}
