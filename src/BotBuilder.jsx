import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Box, Copy, Download, ExternalLink, FileJson2, MessageSquare, Plus, RefreshCw, Save, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import './bot-builder.css';

const emptyCommand = () => ({ id: crypto.randomUUID(), name: '', description: '', response: '', discord: true, rootapp: true, ephemeral: false });
const emptyReply = () => ({ id: crypto.randomUUID(), trigger: '', response: '', mode: 'contains', caseSensitive: false, discord: true, rootapp: true });
const blank = () => ({
  name: 'New Bot', description: '', platforms: { discord: true, rootapp: true },
  discord: { clientId: '', guildId: '', statusText: '' },
  rootapp: { projectId: '', version: '0.1.0', settings: '{}', permissions: '{}' },
  discordBotToken: '', rootBotDevToken: '', rootBotAuthToken: '',
  commands: [{ ...emptyCommand(), name: 'ping', description: 'Replies with Pong!', response: 'Pong! 🐾' }], autoReplies: []
});

function headers(extra = {}) {
  const token = localStorage.getItem('nekodeckAdminToken') || '';
  return { ...(token ? { 'X-NekoDeck-Token': token } : {}), ...extra };
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...headers(), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function pretty(value) { return JSON.stringify(value || {}, null, 2); }
function badge(on, label) { return <span className={on ? 'bb-badge on' : 'bb-badge'}>{label}</span>; }

function CommandRows({ rows, setRows }) {
  const patch = (index, key, value) => setRows(rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return <section className="bb-editor-section"><header><div><h3>Commands</h3><p>Discord uses real slash commands. Root uses text commands such as <code>/ping</code>.</p></div><button onClick={() => setRows([...rows, emptyCommand()])}><Plus size={14}/>Command</button></header>
    <div className="bb-stack">{rows.map((row, index) => <article className="bb-rule" key={row.id || index}>
      <div className="bb-rule-top"><strong>/{row.name || 'command'}</strong><button className="danger" onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 size={13}/></button></div>
      <div className="bb-grid"><label>Name<input value={row.name} onChange={e => patch(index, 'name', e.target.value.toLowerCase())} placeholder="ping"/></label><label>Description<input value={row.description} onChange={e => patch(index, 'description', e.target.value)} placeholder="Replies with Pong!"/></label></div>
      <label>Response<textarea value={row.response} onChange={e => patch(index, 'response', e.target.value)} placeholder="Pong!"/></label>
      <div className="bb-checks"><label><input type="checkbox" checked={row.discord} onChange={e => patch(index, 'discord', e.target.checked)}/>Discord</label><label><input type="checkbox" checked={row.rootapp} onChange={e => patch(index, 'rootapp', e.target.checked)}/>RootApp</label><label><input type="checkbox" checked={row.ephemeral} onChange={e => patch(index, 'ephemeral', e.target.checked)}/>Discord ephemeral</label></div>
    </article>)}</div>
  </section>;
}

function AutoReplyRows({ rows, setRows }) {
  const patch = (index, key, value) => setRows(rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return <section className="bb-editor-section"><header><div><h3>Auto replies</h3><p>Optional message triggers. Discord enables Message Content intent when these are present.</p></div><button onClick={() => setRows([...rows, emptyReply()])}><Plus size={14}/>Rule</button></header>
    <div className="bb-stack">{rows.map((row, index) => <article className="bb-rule" key={row.id || index}>
      <div className="bb-rule-top"><strong>{row.trigger || 'New trigger'}</strong><button className="danger" onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 size={13}/></button></div>
      <div className="bb-grid"><label>Trigger<input value={row.trigger} onChange={e => patch(index, 'trigger', e.target.value)} placeholder="hello neko"/></label><label>Match<select value={row.mode} onChange={e => patch(index, 'mode', e.target.value)}><option value="contains">Contains</option><option value="exact">Exact</option><option value="startsWith">Starts with</option><option value="regex">Regex</option></select></label></div>
      <label>Response<textarea value={row.response} onChange={e => patch(index, 'response', e.target.value)} placeholder="Hey {user}!"/></label>
      <div className="bb-checks"><label><input type="checkbox" checked={row.discord} onChange={e => patch(index, 'discord', e.target.checked)}/>Discord</label><label><input type="checkbox" checked={row.rootapp} onChange={e => patch(index, 'rootapp', e.target.checked)}/>RootApp</label><label><input type="checkbox" checked={row.caseSensitive} onChange={e => patch(index, 'caseSensitive', e.target.checked)}/>Case sensitive</label></div>
    </article>)}</div>
  </section>;
}

export default function BotBuilder() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('projects');
  const [bots, setBots] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [manifest, setManifest] = useState(null);
  const selected = useMemo(() => bots.find(x => x.id === selectedId) || null, [bots, selectedId]);

  const load = async () => {
    try { const data = await api('/api/bots'); setBots(data.bots || []); }
    catch (error) { setMessage(error.message); }
  };
  useEffect(() => { if (open) load(); }, [open]);
  if (location.pathname.startsWith('/activity/')) return null;

  const choose = (bot) => {
    setSelectedId(bot.id);
    setForm({
      name: bot.name, description: bot.config?.description || '', platforms: bot.config?.platforms || { discord: true, rootapp: true },
      discord: bot.config?.discord || { clientId: '', guildId: '', statusText: '' },
      rootapp: { projectId: bot.config?.rootapp?.projectId || '', version: bot.config?.rootapp?.version || '0.1.0', settings: pretty(bot.config?.rootapp?.settings), permissions: pretty(bot.config?.rootapp?.permissions) },
      discordBotToken: '', rootBotDevToken: '', rootBotAuthToken: '', commands: bot.config?.commands || [], autoReplies: bot.config?.autoReplies || []
    });
    setManifest(null); setTab('settings'); setMessage('');
  };
  const newBot = () => { setSelectedId(''); setForm(blank()); setManifest(null); setTab('settings'); setMessage(''); };
  const setTop = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const setDiscord = (key, value) => setForm(current => ({ ...current, discord: { ...current.discord, [key]: value } }));
  const setRoot = (key, value) => setForm(current => ({ ...current, rootapp: { ...current.rootapp, [key]: value } }));
  const setPlatform = (key, value) => setForm(current => ({ ...current, platforms: { ...current.platforms, [key]: value } }));

  const payload = () => ({ ...form, rootapp: { ...form.rootapp, settings: form.rootapp.settings, permissions: form.rootapp.permissions } });
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const path = selectedId ? `/api/bots/${selectedId}` : '/api/bots';
      const data = await api(path, { method: selectedId ? 'PUT' : 'POST', body: JSON.stringify(payload()) });
      setSelectedId(data.bot.id); setMessage(selectedId ? 'Bot updated.' : 'Bot created.'); await load(); choose(data.bot);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const remove = async (bot) => {
    if (!confirm(`Delete ${bot.name}?`)) return;
    try { await api(`/api/bots/${bot.id}`, { method: 'DELETE' }); if (selectedId === bot.id) newBot(); await load(); }
    catch (error) { setMessage(error.message); }
  };
  const download = async (platform) => {
    if (!selectedId) return setMessage('Save the bot first.');
    try {
      const response = await fetch(`/api/bots/${selectedId}/export/${platform}`, { headers: headers() });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `HTTP ${response.status}`); }
      const blob = await response.blob(); const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `${form.name}-${platform}.zip`;
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (error) { setMessage(error.message); }
  };
  const showManifest = async () => {
    if (!selectedId) return setMessage('Save the bot first.');
    try { const data = await api(`/api/bots/${selectedId}/root-manifest`); setManifest(data.manifest); }
    catch (error) { setMessage(error.message); }
  };

  return <>
    <button className="bb-launch" onClick={() => setOpen(true)}><Bot size={17}/><span>Bot Builder</span><b>{bots.length || '＋'}</b></button>
    {open && <div className="bb-backdrop" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}><div className="bb-window">
      <header><div><span>NekoDeck v0.6</span><h2>Bot Builder</h2><p>Build Discord.js bots and Root community chatbots from one command model.</p></div><button onClick={() => setOpen(false)}><X/></button></header>
      <nav><button className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}><Bot size={15}/>Projects</button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings2 size={15}/>Builder</button><button className={tab === 'commands' ? 'active' : ''} onClick={() => setTab('commands')}><MessageSquare size={15}/>Commands</button><button className={tab === 'replies' ? 'active' : ''} onClick={() => setTab('replies')}><MessageSquare size={15}/>Auto Replies</button><button className={tab === 'export' ? 'active' : ''} onClick={() => setTab('export')}><Download size={15}/>Export</button><button onClick={load}><RefreshCw size={15}/></button></nav>
      {message && <div className="bb-message">{message}<button onClick={() => setMessage('')}><X size={13}/></button></div>}
      <main>
        {tab === 'projects' && <section className="bb-projects"><header><div><h3>Your bot projects</h3><p>Discord only, Root only, or one definition exported to both.</p></div><button className="primary" onClick={newBot}><Plus size={14}/>New Bot</button></header>{bots.map(bot => <article key={bot.id}><div className="bb-boticon"><Bot/></div><div><strong>{bot.name}</strong><span>{bot.config?.description || 'No description'}</span><div>{badge(bot.config?.platforms?.discord, 'Discord.js')}{badge(bot.config?.platforms?.rootapp, 'Root Bot')}{badge(bot.credentialStatus?.discordBotToken, 'Discord token')}{badge(bot.credentialStatus?.rootBotDevToken, 'Root DEV_TOKEN')}</div></div><div className="bb-project-actions"><button onClick={() => choose(bot)}>Edit</button><button className="danger" onClick={() => remove(bot)}><Trash2 size={14}/></button></div></article>)}{!bots.length && <div className="bb-empty"><Bot/><h3>No bot projects</h3><p>Create one and add shared commands.</p></div>}</section>}

        {tab === 'settings' && <div className="bb-editor"><section className="bb-editor-section"><header><div><h3>Bot project</h3><p>{selected ? selected.id : 'New unsaved project'}</p></div></header><div className="bb-grid"><label>Name<input value={form.name} onChange={e => setTop('name', e.target.value)}/></label><label>Description<input value={form.description} onChange={e => setTop('description', e.target.value)}/></label></div><div className="bb-platforms"><label><input type="checkbox" checked={form.platforms.discord} onChange={e => setPlatform('discord', e.target.checked)}/><span><b>Discord.js</b><small>Slash commands + optional message auto replies</small></span></label><label><input type="checkbox" checked={form.platforms.rootapp} onChange={e => setPlatform('rootapp', e.target.checked)}/><span><b>Root Bot</b><small>Server-only chatbot inside Root communities</small></span></label></div></section>
          <section className="bb-editor-section discord"><header><div><h3>Discord.js</h3><p>Application IDs are configuration; bot token is encrypted.</p></div><a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Portal <ExternalLink size={13}/></a></header><div className="bb-grid"><label>Application / Client ID<input value={form.discord.clientId} onChange={e => setDiscord('clientId', e.target.value)}/></label><label>Development Guild ID <small>optional</small><input value={form.discord.guildId} onChange={e => setDiscord('guildId', e.target.value)}/></label></div><div className="bb-grid"><label>Status / activity<input value={form.discord.statusText} onChange={e => setDiscord('statusText', e.target.value)} placeholder="Watching NekoDeck"/></label><label>Bot token <small>{selected?.credentialStatus?.discordBotToken ? 'stored — leave blank to keep' : 'not stored'}</small><input type="password" value={form.discordBotToken} onChange={e => setTop('discordBotToken', e.target.value)}/></label></div></section>
          <section className="bb-editor-section root"><header><div><h3>Root Bot</h3><p>Server-only @rootsdk/server-bot project.</p></div><a href="https://docs.rootapp.com/docs/bot-docs/bot-home/" target="_blank" rel="noreferrer">Docs <ExternalLink size={13}/></a></header><div className="bb-grid"><label>Root Project ID<input value={form.rootapp.projectId} onChange={e => setRoot('projectId', e.target.value)}/></label><label>Version<input value={form.rootapp.version} onChange={e => setRoot('version', e.target.value)} placeholder="1.0.0"/></label></div><div className="bb-grid"><label>DEV_TOKEN <small>{selected?.credentialStatus?.rootBotDevToken ? 'stored — leave blank to keep' : 'not stored'}</small><input type="password" value={form.rootBotDevToken} onChange={e => setTop('rootBotDevToken', e.target.value)}/></label><label>Upload auth token <small>{selected?.credentialStatus?.rootBotAuthToken ? 'stored — leave blank to keep' : 'not stored'}</small><input type="password" value={form.rootBotAuthToken} onChange={e => setTop('rootBotAuthToken', e.target.value)}/></label></div><div className="bb-grid"><label>Manifest settings JSON<textarea value={form.rootapp.settings} onChange={e => setRoot('settings', e.target.value)}/></label><label>Additional permissions JSON<textarea value={form.rootapp.permissions} onChange={e => setRoot('permissions', e.target.value)}/></label></div><div className="bb-note"><ShieldCheck size={15}/>NekoDeck always adds <code>channel.createMessage</code> to generated Root Bot permissions because commands must be able to reply.</div></section>
          <div className="bb-save"><button className="primary" disabled={busy} onClick={save}><Save size={14}/>{busy ? 'Saving…' : selectedId ? 'Update Bot' : 'Create Bot'}</button></div></div>}

        {tab === 'commands' && <div className="bb-editor"><CommandRows rows={form.commands} setRows={rows => setTop('commands', rows)}/><div className="bb-save"><button className="primary" onClick={save}><Save size={14}/>Save commands</button></div></div>}
        {tab === 'replies' && <div className="bb-editor"><AutoReplyRows rows={form.autoReplies} setRows={rows => setTop('autoReplies', rows)}/><div className="bb-save"><button className="primary" onClick={save}><Save size={14}/>Save replies</button></div></div>}
        {tab === 'export' && <div className="bb-export"><section><div className="bb-export-icon discord">D</div><h3>Discord.js source</h3><p>Node.js 24.17+ project with slash-command registration, bot runtime and optional auto replies.</p><button disabled={!selectedId || !form.platforms.discord} onClick={() => download('discord')}><Download size={14}/>Download Discord Bot ZIP</button></section><section><div className="bb-export-icon root">R</div><h3>Root Bot source</h3><p>TypeScript server-only project with Root manifest, DevHost script and package/upload commands.</p><div className="bb-export-buttons"><button disabled={!selectedId || !form.platforms.rootapp} onClick={() => download('root')}><Download size={14}/>Download Root Bot ZIP</button><button disabled={!selectedId || !form.platforms.rootapp} onClick={showManifest}><FileJson2 size={14}/>Manifest</button></div></section>{manifest && <section className="bb-manifest"><header><h3>root-manifest.json</h3><button onClick={() => navigator.clipboard?.writeText(pretty(manifest))}><Copy size={13}/>Copy</button></header><pre>{pretty(manifest)}</pre></section>}</div>}
      </main>
    </div></div>}
  </>;
}
