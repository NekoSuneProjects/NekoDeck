import React, { useEffect, useMemo, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import {
  Activity, Blocks, Braces, Check, ChevronRight, CircleGauge, Copy, Crosshair,
  Dices, Eye, EyeOff, Gauge, Github, LayoutDashboard, MonitorCog, NotebookPen,
  Palette, Plus, PlusMinus, RefreshCw, Search, Settings, ShieldCheck, Sparkles,
  Timer, Trash2, Wifi, X
} from 'lucide-react';

const icons = { Activity, Blocks, Braces, Crosshair, Dices, NotebookPen, PlusMinus, Timer, Wifi };
const initialTheme = { accent: '#45f58c', density: 'comfortable', glass: true };

function api(path, options = {}) {
  const token = localStorage.getItem('nekodeckAdminToken') || '';
  return fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'X-NekoDeck-Token': token } : {}),
      ...(options.headers || {})
    }
  }).then(async (r) => {
    const data = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
}

function fmtBytes(bytes = 0) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, value = Number(bytes || 0);
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function fmtDuration(seconds = 0) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d ? `${d}d ` : ''}${h}h ${m}m`;
}

function Shell({ page, setPage, children, instanceCount }) {
  const items = [
    ['dashboard', LayoutDashboard, 'Dashboard'],
    ['library', Sparkles, 'Widget Library'],
    ['created', MonitorCog, 'Created Widgets'],
    ['settings', Settings, 'Settings']
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">N</div><div><strong>NekoDeck</strong><span>Discord Utility Suite</span></div></div>
      <nav>{items.map(([id, Icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={18}/><span>{label}</span>{id === 'created' && <b className="pill">{instanceCount}</b>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="secure-card"><ShieldCheck size={18}/><div><strong>Secrets protected</strong><span>AES-256-GCM at rest</span></div></div>
        <a className="github-link" href="https://github.com/NekoSuneProjects/NekoDeck" target="_blank" rel="noreferrer"><Github size={17}/> NekoSuneProjects</a>
      </div>
    </aside>
    <main>{children}</main>
  </div>;
}

function Header({ title, subtitle, onCreate }) {
  return <header className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{onCreate && <button className="primary" onClick={onCreate}><Plus size={17}/> Create Widget</button>}</header>;
}

function StatCard({ icon: Icon, title, value, meta }) {
  return <div className="stat-card panel"><div className="stat-icon"><Icon size={19}/></div><div><span>{title}</span><strong>{value}</strong><small>{meta}</small></div></div>;
}

function Dashboard({ widgets, instances, setPage, onCreate }) {
  const ready = widgets.filter(w => w.status === 'ready').length;
  return <>
    <Header title="Dashboard" subtitle="Your customizable Discord widget command centre." onCreate={onCreate}/>
    <section className="stats-grid">
      <StatCard icon={MonitorCog} title="Created widgets" value={instances.length} meta="Encrypted credential profiles"/>
      <StatCard icon={Sparkles} title="Templates" value={ready} meta="Ready to configure"/>
      <StatCard icon={ShieldCheck} title="Secret storage" value="AES-256" meta="Client secrets never returned"/>
      <StatCard icon={Gauge} title="Targets" value="3" meta="Windows · Linux · Docker"/>
    </section>
    <section className="dashboard-grid">
      <div className="panel feature-panel">
        <div className="section-title"><div><h2>Featured widgets</h2><p>Gaming trackers and useful Discord utilities.</p></div><button className="ghost" onClick={() => setPage('library')}>View all <ChevronRight size={16}/></button></div>
        <div className="featured-list">{widgets.slice(0,4).map(w => <WidgetRow key={w.id} widget={w} onCreate={onCreate}/>)}</div>
      </div>
      <SystemPanel />
    </section>
    <div className="panel recent-panel">
      <div className="section-title"><div><h2>Created widgets</h2><p>Your most recent configured Activity/widget instances.</p></div><button className="ghost" onClick={() => setPage('created')}>Manage <ChevronRight size={16}/></button></div>
      {instances.length ? <div className="instance-mini-grid">{instances.slice(0,4).map(i => <div className="instance-mini" key={i.id}><div className="status-dot"/><div><strong>{i.name}</strong><span>{widgets.find(w => w.id === i.templateId)?.name || i.templateId}</span></div></div>)}</div> : <Empty label="No widgets created yet" action="Create your first widget" onClick={onCreate}/>} 
    </div>
  </>;
}

function SystemPanel() {
  const [system, setSystem] = useState(null);
  const load = () => api('/api/system').then(d => setSystem(d.system)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);
  const memPct = system ? Math.round(system.usedMemory / system.totalMemory * 100) : 0;
  return <div className="panel system-panel"><div className="section-title"><div><h2>Host system</h2><p>Desktop/Docker runtime telemetry.</p></div><button className="icon-btn" onClick={load}><RefreshCw size={16}/></button></div>
    {system ? <div className="system-content"><div className="metric-ring" style={{'--pct': `${memPct * 3.6}deg`}}><strong>{memPct}%</strong><span>memory</span></div><div className="system-lines"><div><span>CPU</span><b>{system.cpuCores} threads</b></div><div><span>RAM</span><b>{fmtBytes(system.usedMemory)} / {fmtBytes(system.totalMemory)}</b></div><div><span>Host</span><b>{system.hostname}</b></div><div><span>Uptime</span><b>{fmtDuration(system.uptime)}</b></div></div></div> : <div className="loading">Reading system…</div>}
  </div>;
}

function WidgetRow({ widget, onCreate }) {
  const Icon = icons[widget.icon] || Braces;
  return <div className="widget-row"><div className="widget-icon"><Icon size={20}/></div><div className="widget-copy"><strong>{widget.name}</strong><span>{widget.description}</span></div><span className="category">{widget.category}</span><button className="small-primary" onClick={() => onCreate(widget.id)}>Create</button></div>;
}

function Library({ widgets, onCreate }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const cats = ['All', ...new Set(widgets.map(w => w.category))];
  const filtered = widgets.filter(w => (category === 'All' || w.category === category) && `${w.name} ${w.description}`.toLowerCase().includes(query.toLowerCase()));
  return <><Header title="Widget Library" subtitle="Pick a template, connect Discord credentials, then customize it." onCreate={onCreate}/>
    <div className="toolbar"><div className="searchbox"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search widgets…"/></div><div className="tabs">{cats.map(c => <button className={category===c?'active':''} onClick={() => setCategory(c)} key={c}>{c}</button>)}</div></div>
    <div className="widget-grid">{filtered.map(w => <WidgetCard key={w.id} widget={w} onCreate={onCreate}/>)}</div></>;
}

function WidgetCard({ widget, onCreate }) {
  const Icon = icons[widget.icon] || Braces;
  return <article className="panel widget-card"><div className="widget-card-top"><div className="widget-icon large"><Icon size={24}/></div><span className="ready"><span/>Ready</span></div><h3>{widget.name}</h3><p>{widget.description}</p><div className="credential-tags"><span>Client ID</span><span>Client Secret</span><span>{widget.botToken === 'optional' ? 'Bot optional' : 'Bot required'}</span>{widget.id==='hypixel'&&<span>Hypixel key</span>}</div><button className="outline-btn" onClick={() => onCreate(widget.id)}>Configure widget <ChevronRight size={16}/></button></article>;
}

function Created({ widgets, instances, reload, onCreate }) {
  const [error, setError] = useState('');
  const [runner, setRunner] = useState(null);
  const remove = async (id) => { if (!confirm('Delete this widget instance and its stored credentials?')) return; try { await api(`/api/instances/${id}`, {method:'DELETE'}); reload(); } catch(e){setError(e.message);} };
  return <><Header title="Created Widgets" subtitle="All configured widget instances and their credential status." onCreate={onCreate}/>{error&&<div className="alert error">{error}</div>}
    {instances.length ? <div className="created-list">{instances.map(i => { const w=widgets.find(x=>x.id===i.templateId); const Icon=icons[w?.icon]||Braces; return <div className="panel created-item" key={i.id}><div className="widget-icon"><Icon size={20}/></div><div className="created-main"><div><strong>{i.name}</strong><span>{w?.name || i.templateId}</span></div><div className="cred-status"><Credential ok={i.credentialStatus.discordClientId} label="Client ID"/><Credential ok={i.credentialStatus.discordClientSecret} label="Secret"/><Credential ok={i.credentialStatus.botToken} optional label="Bot"/><Credential ok={i.credentialStatus.providerApiKey} optional label="Provider"/></div></div><div className="created-actions"><code>{i.discordClientId || 'No client ID'}</code><button className="outline-mini" onClick={() => setRunner(i)}>Open</button><button className="danger-icon" onClick={() => remove(i.id)} title="Delete"><Trash2 size={17}/></button></div></div>})}</div> : <div className="panel"><Empty label="No widget instances" action="Create a widget" onClick={onCreate}/></div>}
    {runner && <RunnerModal instance={runner} widget={widgets.find(w=>w.id===runner.templateId)} onClose={()=>setRunner(null)}/>}
  </>;
}

function Credential({ok,label,optional}) { return <span className={ok?'cred-ok':optional?'cred-neutral':'cred-bad'}><Check size={12}/>{label}</span>; }
function Empty({label,action,onClick}) { return <div className="empty"><div className="empty-icon"><Plus size={22}/></div><strong>{label}</strong><button className="ghost" onClick={onClick}>{action}</button></div>; }

function RunnerModal({ instance, widget, onClose }) {
  const [query,setQuery]=useState(''), [game,setGame]=useState('bf2042'), [platform,setPlatform]=useState('pc'), [result,setResult]=useState(null), [error,setError]=useState(''), [loading,setLoading]=useState(false);
  const [count,setCount]=useState(0), [notes,setNotes]=useState(''), [items,setItems]=useState('Karin\nChiffon\nPlum'), [seconds,setSeconds]=useState(300);
  useEffect(()=>{
    if (!['counter','notes','timer','random-picker'].includes(instance.templateId)) return;
    api(`/api/instances/${instance.id}/state`).then(({state})=>{
      if (Number.isFinite(state.count)) setCount(state.count);
      if (typeof state.notes === 'string') setNotes(state.notes);
      if (Number.isFinite(state.seconds)) setSeconds(state.seconds);
      if (typeof state.items === 'string') setItems(state.items);
    }).catch(()=>{});
  },[instance.id,instance.templateId]);
  const saveState=(patch)=>api(`/api/instances/${instance.id}/state`,{method:'PUT',body:JSON.stringify(patch)}).catch(e=>setError(e.message));
  const run=async()=>{setLoading(true);setError('');setResult(null);try{
    let data;
    if(instance.templateId==='hypixel') data=await api(`/api/widgets/hypixel/${instance.id}/player?player=${encodeURIComponent(query)}`);
    else if(instance.templateId==='battlefield') data=await api(`/api/widgets/battlefield/${instance.id}/player?game=${encodeURIComponent(game)}&name=${encodeURIComponent(query)}&platform=${encodeURIComponent(platform)}`);
    else if(instance.templateId==='status-check') data=await api(`/api/status-check?url=${encodeURIComponent(query)}`);
    else if(instance.templateId==='system-monitor') data=await api('/api/system');
    else if(instance.templateId==='custom-api') { const r=await fetch(query); data=await r.json(); }
    setResult(data);
  }catch(e){setError(e.message)}finally{setLoading(false)}};
  const picker=()=>{saveState({items});const list=items.split(/\n|,/).map(x=>x.trim()).filter(Boolean);setResult(list.length?{picked:list[Math.floor(Math.random()*list.length)]}:null)};
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal panel runner-modal"><div className="modal-head"><div><h2>{instance.name}</h2><p>{widget?.description}</p></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    {error&&<div className="alert error">{error}</div>}
    {instance.templateId==='hypixel'&&<div className="runner-form"><label>Minecraft username or UUID<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Username or UUID"/></label><button className="primary" onClick={run} disabled={loading}>{loading?'Loading…':'Track player'}</button></div>}
    {instance.templateId==='battlefield'&&<div className="runner-form three"><label>Player name<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="EA / platform name"/></label><label>Game<select value={game} onChange={e=>setGame(e.target.value)}><option value="bf6">Battlefield 6</option><option value="bf2042">Battlefield 2042</option><option value="bfv">Battlefield V</option><option value="bf1">Battlefield 1</option><option value="bf4">Battlefield 4</option><option value="bf3">Battlefield 3</option></select></label><label>Platform<select value={platform} onChange={e=>setPlatform(e.target.value)}><option value="pc">PC</option><option value="ps4">PlayStation</option><option value="xboxone">Xbox</option></select></label><button className="primary" onClick={run} disabled={loading}>{loading?'Loading…':'Track player'}</button></div>}
    {['status-check','custom-api'].includes(instance.templateId)&&<div className="runner-form"><label>URL<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="https://example.com/api"/></label><button className="primary" onClick={run}>Run</button></div>}
    {instance.templateId==='system-monitor'&&<button className="primary" onClick={run}>Refresh system data</button>}
    {instance.templateId==='counter'&&<div className="social-tool"><strong className="big-counter">{count}</strong><div><button className="outline-btn" onClick={()=>setCount(c=>{const n=c-1;saveState({count:n});return n})}>-1</button><button className="primary" onClick={()=>setCount(c=>{const n=c+1;saveState({count:n});return n})}>+1</button></div></div>}
    {instance.templateId==='notes'&&<div className="runner-form"><label>Notes<textarea className="notes-area" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Type notes here…"/></label><button className="primary" onClick={()=>saveState({notes})}>Save notes</button></div>}
    {instance.templateId==='timer'&&<div className="social-tool"><strong className="big-counter">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong><input type="range" min="0" max="3600" value={seconds} onChange={e=>{const n=Number(e.target.value);setSeconds(n);saveState({seconds:n})}}/></div>}
    {instance.templateId==='random-picker'&&<div className="runner-form"><label>Choices<textarea className="notes-area" value={items} onChange={e=>setItems(e.target.value)}/></label><button className="primary" onClick={picker}>Pick one</button></div>}
    {result&&<pre className="result-box">{JSON.stringify(result,null,2)}</pre>}
    <div className="activity-link"><span>Discord Activity route</span><code>/activity/{instance.id}</code><button className="icon-btn" onClick={()=>navigator.clipboard?.writeText(`${location.origin}/activity/${instance.id}`)}><Copy size={15}/></button></div>
  </div></div>;
}

function ActivityTool({ instance }) {
  const [query,setQuery]=useState(''), [result,setResult]=useState(null), [error,setError]=useState(''), [game,setGame]=useState('bf2042');
  const [count,setCount]=useState(0), [notes,setNotes]=useState(''), [seconds,setSeconds]=useState(300), [items,setItems]=useState('Karin\nChiffon\nPlum');
  useEffect(()=>{api(`/api/instances/${instance.id}/state`).then(({state})=>{if(Number.isFinite(state.count))setCount(state.count);if(typeof state.notes==='string')setNotes(state.notes);if(Number.isFinite(state.seconds))setSeconds(state.seconds);if(typeof state.items==='string')setItems(state.items)}).catch(()=>{})},[instance.id]);
  const save=(patch)=>api(`/api/instances/${instance.id}/state`,{method:'PUT',body:JSON.stringify(patch)}).catch(e=>setError(e.message));
  const run=async()=>{setError('');try{let data;if(instance.templateId==='hypixel')data=await api(`/api/widgets/hypixel/${instance.id}/player?player=${encodeURIComponent(query)}`);else if(instance.templateId==='battlefield')data=await api(`/api/widgets/battlefield/${instance.id}/player?game=${game}&name=${encodeURIComponent(query)}&platform=pc`);else if(instance.templateId==='system-monitor')data=await api('/api/system');else if(instance.templateId==='status-check')data=await api(`/api/status-check?url=${encodeURIComponent(query)}`);setResult(data)}catch(e){setError(e.message)}};
  if(instance.templateId==='counter')return <div className="activity-tool social-tool"><strong className="big-counter">{count}</strong><div><button className="outline-btn" onClick={()=>setCount(c=>{const n=c-1;save({count:n});return n})}>-1</button><button className="primary" onClick={()=>setCount(c=>{const n=c+1;save({count:n});return n})}>+1</button></div></div>;
  if(instance.templateId==='notes')return <div className="activity-tool runner-form"><label>Shared notes<textarea className="notes-area" value={notes} onChange={e=>setNotes(e.target.value)}/></label><button className="primary" onClick={()=>save({notes})}>Save</button></div>;
  if(instance.templateId==='timer')return <div className="activity-tool social-tool"><strong className="big-counter">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong><input type="range" min="0" max="3600" value={seconds} onChange={e=>{const n=Number(e.target.value);setSeconds(n);save({seconds:n})}}/></div>;
  if(instance.templateId==='random-picker')return <div className="activity-tool runner-form"><label>Choices<textarea className="notes-area" value={items} onChange={e=>setItems(e.target.value)}/></label><button className="primary" onClick={()=>{save({items});const a=items.split(/\n|,/).map(x=>x.trim()).filter(Boolean);setResult(a.length?{picked:a[Math.floor(Math.random()*a.length)]}:null)}}>Pick one</button>{result&&<div className="picked">{result.picked}</div>}</div>;
  return <div className="activity-tool">{instance.templateId==='battlefield'&&<label>Game<select value={game} onChange={e=>setGame(e.target.value)}><option value="bf6">Battlefield 6</option><option value="bf2042">Battlefield 2042</option><option value="bfv">Battlefield V</option><option value="bf1">Battlefield 1</option><option value="bf4">Battlefield 4</option></select></label>}{['hypixel','battlefield','status-check'].includes(instance.templateId)&&<label>{instance.templateId==='status-check'?'URL':'Player'}<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={instance.templateId==='hypixel'?'Minecraft username or UUID':instance.templateId==='status-check'?'https://example.com':'Player name'}/></label>}<button className="primary" onClick={run}>Refresh</button>{error&&<div className="alert error">{error}</div>}{result&&<pre className="result-box">{JSON.stringify(result,null,2)}</pre>}</div>;
}

function ActivityMode({ instanceId }) {
  const [instance,setInstance]=useState(null), [status,setStatus]=useState('Connecting to Discord…'), [auth,setAuth]=useState(null), [error,setError]=useState('');
  useEffect(()=>{let cancelled=false;(async()=>{try{const data=await api(`/api/instances/${instanceId}/public`);if(cancelled)return;setInstance(data.instance);const sdk=new DiscordSDK(data.instance.discordClientId);await sdk.ready();setStatus('Discord connected');const {code}=await sdk.commands.authorize({client_id:data.instance.discordClientId,response_type:'code',state:'',prompt:'none',scope:['identify','applications.commands']});const token=await api('/api/discord/token',{method:'POST',body:JSON.stringify({instanceId,code})});const user=await sdk.commands.authenticate({access_token:token.access_token});if(!cancelled){setAuth(user);setStatus('Authenticated')}}catch(e){if(!cancelled){setError(e.message);setStatus('Activity setup incomplete')}}})();return()=>{cancelled=true}},[instanceId]);
  return <div className="activity-page"><div className="panel activity-card"><div className="brand activity-brand"><div className="brand-mark">N</div><div><strong>NekoDeck</strong><span>Discord Activity</span></div></div><h1>{instance?.name||'Loading widget…'}</h1><p>{status}</p>{auth?.user&&<div className="activity-user">Signed in as <strong>{auth.user.global_name||auth.user.username}</strong></div>}{error&&<div className="alert error">{error}</div>}<div className="info-box"><ShieldCheck size={17}/><span>This Activity uses the public Client ID in the Discord iframe. Client Secret and optional Bot Token remain on the NekoDeck server.</span></div>{auth&&instance&&<ActivityTool instance={instance}/>}</div></div>;
}

function SettingsPage({ theme, setTheme, saveTheme, tokenRequired }) {
  const [token, setToken] = useState(localStorage.getItem('nekodeckAdminToken') || '');
  return <><Header title="Settings" subtitle="Customize NekoDeck and protect browser/Docker administration."/>
    <div className="settings-grid"><section className="panel settings-card"><div className="settings-heading"><Palette size={19}/><div><h2>Appearance</h2><p>Stored server-side so web and desktop stay consistent.</p></div></div>
      <label>Accent colour<div className="color-row"><input type="color" value={theme.accent} onChange={e=>setTheme({...theme,accent:e.target.value})}/><input value={theme.accent} onChange={e=>setTheme({...theme,accent:e.target.value})}/></div></label>
      <label>Density<select value={theme.density} onChange={e=>setTheme({...theme,density:e.target.value})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      <label className="switch-row"><span><b>Glass panels</b><small>Use translucent panels and blur.</small></span><input type="checkbox" checked={theme.glass} onChange={e=>setTheme({...theme,glass:e.target.checked})}/></label>
      <button className="primary" onClick={()=>saveTheme(theme)}>Save appearance</button></section>
      <section className="panel settings-card"><div className="settings-heading"><ShieldCheck size={19}/><div><h2>Admin API token</h2><p>Recommended when exposing the Docker web UI beyond localhost.</p></div></div>
        <label>Token<input type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder={tokenRequired?'Required by server':'Server token is optional'}/></label>
        <button className="outline-btn" onClick={()=>{localStorage.setItem('nekodeckAdminToken',token); alert('Admin token saved in this browser.');}}>Save token locally</button>
        <div className="info-box"><ShieldCheck size={17}/><span>NekoDeck never sends the admin token anywhere except your own NekoDeck API.</span></div>
      </section></div>
  </>;
}

function CreateModal({ widgets, initialTemplate, onClose, onCreated }) {
  const [form, setForm] = useState({templateId:initialTemplate||widgets[0]?.id||'',name:'',discordClientId:'',discordClientSecret:'',botToken:'',providerApiKey:''});
  const [showSecret,setShowSecret]=useState(false), [showBot,setShowBot]=useState(false), [saving,setSaving]=useState(false), [error,setError]=useState('');
  const template = widgets.find(w=>w.id===form.templateId);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const submit=async(e)=>{e.preventDefault();setSaving(true);setError('');try{await api('/api/instances',{method:'POST',body:JSON.stringify(form)});onCreated();onClose();}catch(err){setError(err.message)}finally{setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="modal panel" onSubmit={submit}><div className="modal-head"><div><h2>Create Widget</h2><p>Secrets are encrypted locally and never shown again after save.</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button></div>{error&&<div className="alert error">{error}</div>}
    <div className="form-grid"><label>Widget template<select value={form.templateId} onChange={e=>set('templateId',e.target.value)}>{widgets.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select></label><label>Widget name<input required value={form.name} onChange={e=>set('name',e.target.value)} placeholder="My Hypixel Tracker"/></label></div>
    <div className="form-section"><div className="form-section-title"><span>Discord application</span><small>Required for every widget instance</small></div><label>Client ID<input required value={form.discordClientId} onChange={e=>set('discordClientId',e.target.value)} placeholder="Discord Application / Client ID"/></label><label>Client Secret<div className="password-field"><input required type={showSecret?'text':'password'} value={form.discordClientSecret} onChange={e=>set('discordClientSecret',e.target.value)} placeholder="Stored encrypted"/><button type="button" onClick={()=>setShowSecret(!showSecret)}>{showSecret?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label><label>Bot Token <em>optional</em><div className="password-field"><input type={showBot?'text':'password'} value={form.botToken} onChange={e=>set('botToken',e.target.value)} placeholder="Only needed for bot/gateway features"/><button type="button" onClick={()=>setShowBot(!showBot)}>{showBot?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label></div>
    {template?.id==='hypixel'&&<div className="form-section"><div className="form-section-title"><span>Hypixel provider</span><small>Official Hypixel Developer API</small></div><label>Hypixel API Key<input required type="password" value={form.providerApiKey} onChange={e=>set('providerApiKey',e.target.value)} placeholder="API-Key"/></label></div>}
    {template?.id==='battlefield'&&<div className="info-box"><Crosshair size={17}/><span>Battlefield uses the public GameTools community API, so no Battlefield API key is required by default.</span></div>}
    <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving?'Creating…':'Create Widget'}</button></div></form></div>;
}

export default function App() {
  const activityMatch = location.pathname.match(/^\/activity\/([^/]+)/);
  return activityMatch ? <ActivityMode instanceId={activityMatch[1]}/> : <DashboardApp/>;
}

function DashboardApp() {
  const [page,setPage]=useState('dashboard'), [widgets,setWidgets]=useState([]), [instances,setInstances]=useState([]), [theme,setTheme]=useState(initialTheme), [tokenRequired,setTokenRequired]=useState(false), [modal,setModal]=useState(null), [error,setError]=useState('');
  const reload=()=>Promise.all([api('/api/widgets'),api('/api/instances'),api('/api/settings')]).then(([w,i,s])=>{setWidgets(w.widgets);setInstances(i.instances);setTheme(s.settings||initialTheme);setTokenRequired(s.tokenRequired)}).catch(e=>setError(e.message));
  useEffect(()=>{reload()},[]);
  useEffect(()=>{document.documentElement.style.setProperty('--accent',theme.accent);document.body.dataset.density=theme.density;document.body.dataset.glass=String(theme.glass)},[theme]);
  const openCreate=(templateId)=>setModal(typeof templateId === 'string' ? templateId : '');
  const saveTheme=async(next)=>{try{const r=await api('/api/settings',{method:'PUT',body:JSON.stringify(next)});setTheme(r.settings)}catch(e){setError(e.message)}};
  const content=useMemo(()=>{
    if(page==='library')return <Library widgets={widgets} onCreate={openCreate}/>;
    if(page==='created')return <Created widgets={widgets} instances={instances} reload={reload} onCreate={openCreate}/>;
    if(page==='settings')return <SettingsPage theme={theme} setTheme={setTheme} saveTheme={saveTheme} tokenRequired={tokenRequired}/>;
    return <Dashboard widgets={widgets} instances={instances} setPage={setPage} onCreate={openCreate}/>;
  },[page,widgets,instances,theme,tokenRequired]);
  return <Shell page={page} setPage={setPage} instanceCount={instances.length}><div className="page-wrap">{error&&<div className="alert error global">{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}{content}</div>{modal!==null&&<CreateModal widgets={widgets} initialTemplate={modal} onClose={()=>setModal(null)} onCreated={reload}/>}</Shell>;
}
