import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Edit3, LayoutDashboard, RefreshCw, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import './profile-manager.css';

const PROFILE_TYPES = ['trn', 'steam', 'rockstar', 'vrchat', 'lastfm', 'spotify', 'custom-stats'];

function headers(extra = {}) {
  const token = localStorage.getItem('nekodeckAdminToken') || '';
  return { 'content-type': 'application/json', ...(token ? { 'X-NekoDeck-Token': token } : {}), ...extra };
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function statsText(config) { return Array.isArray(config?.stats) ? config.stats.map((item) => `${item.label || ''}=${item.value || ''}`).join('\n') : ''; }

function Editor({ instance, close, saved, error }) {
  const [form, setForm] = useState({
    name: instance.name || '',
    boardTitle: instance.config?.boardTitle || '', boardSubtitle: instance.config?.boardSubtitle || '', imageUrl: instance.config?.imageUrl || '',
    title: instance.config?.title || '', message: instance.config?.message || '', statsText: statsText(instance.config),
    discordClientId: '', discordClientSecret: '', botToken: '', providerApiKey: '', providerClientId: '', providerClientSecret: '', providerSession: ''
  });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true); error('');
    try {
      const config = { boardTitle: form.boardTitle, boardSubtitle: form.boardSubtitle, imageUrl: form.imageUrl };
      if (instance.templateId === 'custom-stats') {
        config.title = form.title; config.message = form.message;
        config.stats = form.statsText.split(/\n/).map((line) => { const [label, ...rest] = line.split('='); return { label: label.trim(), value: rest.join('=').trim() }; }).filter((item) => item.label);
      }
      const credentials = {};
      for (const key of ['discordClientId','discordClientSecret','botToken','providerApiKey','providerClientId','providerClientSecret','providerSession']) if (form[key].trim()) credentials[key] = form[key].trim();
      await api(`/api/instances/${instance.id}/manage`, { method: 'PUT', body: JSON.stringify({ name: form.name, config, credentials }) });
      await saved(); close();
    } catch (e) { error(e.message); } finally { setBusy(false); }
  };
  return <div className="profile-manager-editor"><div className="pm-grid"><label>Widget name<input value={form.name} onChange={(e) => set('name', e.target.value)}/></label><label>Board title<input value={form.boardTitle} onChange={(e) => set('boardTitle', e.target.value)}/></label></div><div className="pm-grid"><label>Subtitle<input value={form.boardSubtitle} onChange={(e) => set('boardSubtitle', e.target.value)}/></label><label>Image URL<input value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)}/></label></div>
    {instance.templateId === 'custom-stats' && <><label>Card title<input value={form.title} onChange={(e) => set('title', e.target.value)}/></label><label>Message<textarea value={form.message} onChange={(e) => set('message', e.target.value)}/></label><label>Stats <small>Label=Value</small><textarea value={form.statsText} onChange={(e) => set('statsText', e.target.value)}/></label></>}
    <details><summary>Update encrypted credentials <small>leave blank to keep existing values</small></summary><div className="pm-grid"><label>Discord Client ID<input value={form.discordClientId} onChange={(e) => set('discordClientId', e.target.value)}/></label><label>Discord Client Secret<input type="password" value={form.discordClientSecret} onChange={(e) => set('discordClientSecret', e.target.value)}/></label></div><label>Bot Token<input type="password" value={form.botToken} onChange={(e) => set('botToken', e.target.value)}/></label><div className="pm-grid"><label>Provider API Key<input type="password" value={form.providerApiKey} onChange={(e) => set('providerApiKey', e.target.value)}/></label><label>Provider Client ID<input value={form.providerClientId} onChange={(e) => set('providerClientId', e.target.value)}/></label></div><label>Provider Client Secret<input type="password" value={form.providerClientSecret} onChange={(e) => set('providerClientSecret', e.target.value)}/></label><label>Provider Session / Cookie<input type="password" value={form.providerSession} onChange={(e) => set('providerSession', e.target.value)}/></label></details>
    <div className="pm-actions"><button onClick={close}>Cancel</button><button className="pm-primary" disabled={busy} onClick={save}><Save size={14}/>{busy ? 'Saving…' : 'Save changes'}</button></div></div>;
}

export default function ProfileWidgetManager() {
  const [open, setOpen] = useState(false);
  const [instances, setInstances] = useState([]);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const profiles = useMemo(() => instances.filter((item) => PROFILE_TYPES.includes(item.templateId)), [instances]);
  const refresh = async () => { try { const data = await api('/api/instances'); setInstances(data.instances || []); } catch (e) { setMessage(e.message); } };
  useEffect(() => { if (open) refresh(); }, [open]);
  if (location.pathname.startsWith('/activity/')) return null;
  const remove = async (instance) => { if (!confirm(`Delete Profile Widget “${instance.name}”?`)) return; try { await api(`/api/instances/${instance.id}`, { method: 'DELETE' }); if (editing?.id === instance.id) setEditing(null); await refresh(); } catch (e) { setMessage(e.message); } };
  return <><button className="profile-manager-launch" onClick={() => setOpen(true)}><LayoutDashboard size={17}/><span>Manage Widgets</span>{profiles.length > 0 && <b>{profiles.length}</b>}</button>{open && <div className="profile-manager-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}><div className="profile-manager-window"><header><div><span>NekoDeck</span><h2>Profile Widget Manager</h2><p>Edit, rotate credentials, update card appearance or delete Profile Board data sources.</p></div><button onClick={() => setOpen(false)}><X/></button></header>{message && <div className="pm-error">{message}<button onClick={() => setMessage('')}><X size={13}/></button></div>}<div className="pm-toolbar"><span>{profiles.length} profile widget{profiles.length === 1 ? '' : 's'}</span><button onClick={refresh}><RefreshCw size={14}/>Refresh</button></div><main>{profiles.map((instance) => <article className="pm-item" key={instance.id}><div className="pm-item-head"><div><strong>{instance.name}</strong><span>{instance.templateId} · {instance.id}</span></div><div><button onClick={() => navigator.clipboard?.writeText(instance.id)} title="Copy ID"><Copy size={14}/></button><button onClick={() => setEditing(editing?.id === instance.id ? null : instance)}><Edit3 size={14}/>Edit</button><button className="danger" onClick={() => remove(instance)}><Trash2 size={14}/></button></div></div><div className="pm-status"><span><ShieldCheck size={12}/>Discord {instance.credentialStatus?.discordClientSecret ? 'linked' : 'missing'}</span><span>Updated {new Date(instance.updatedAt || instance.createdAt).toLocaleString()}</span></div>{editing?.id === instance.id && <Editor instance={instance} close={() => setEditing(null)} saved={refresh} error={setMessage}/>}</article>)}{!profiles.length && <div className="pm-empty"><LayoutDashboard/><h3>No Profile Widgets</h3><p>Create one from the main Profile Board screen first.</p></div>}</main></div></div>}</>;
}
