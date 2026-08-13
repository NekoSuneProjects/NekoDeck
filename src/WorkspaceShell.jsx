import React, { useEffect, useState } from 'react';
import BaseApp from './App.jsx';
import AppV2 from './AppV2.jsx';
import {
  AppWindow, Bot, Box, ChevronRight, CircleDot, ExternalLink, Gamepad2, Github,
  Grid2X2, LayoutDashboard, Package, Plus, RefreshCw, Search, Settings,
  ShieldCheck, Wrench, X
} from 'lucide-react';
import './workspace.css';

const PROFILE_TYPES = ['trn', 'steam', 'rockstar', 'vrchat', 'lastfm', 'spotify', 'custom-stats'];

async function readJson(path) {
  const response = await fetch(path);
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function openTool(selector) {
  document.querySelector(selector)?.click();
}

function targets(item) {
  if (item?.templateId === 'bot-project') {
    return { discord: item.config?.platforms?.discord !== false, rootapp: Boolean(item.config?.platforms?.rootapp) };
  }
  if (PROFILE_TYPES.includes(item?.templateId)) return { discord: true, rootapp: Boolean(item.config?.rootApp?.enabled) };
  return {
    discord: item?.platforms?.discord ?? item?.config?.platformTargets?.discord ?? true,
    rootapp: item?.platforms?.rootapp ?? Boolean(item?.config?.rootApp?.enabled)
  };
}

function PlatformBadge({ type, enabled }) {
  return <span className={`ws-badge ${type} ${enabled ? 'on' : 'off'}`}><i>{type === 'discord' ? 'D' : 'R'}</i>{type === 'discord' ? 'Discord' : 'RootApp'}</span>;
}

function Empty({ icon: Icon = Box, title, text, action, label }) {
  return <div className="ws-empty"><div className="ws-empty-icon"><Icon size={24}/></div><h3>{title}</h3><p>{text}</p>{action && <button className="ws-primary" onClick={action}><Plus size={15}/>{label}</button>}</div>;
}

function ProjectCard({ item, kind, onOpen }) {
  const flags = targets(item);
  const Icon = kind === 'bot' ? Bot : kind === 'profile' ? Grid2X2 : Gamepad2;
  return <article className={`ws-project-card ${kind}`}>
    <div className="ws-project-top"><div className="ws-project-icon"><Icon size={20}/></div><div className="ws-badges"><PlatformBadge type="discord" enabled={flags.discord}/><PlatformBadge type="rootapp" enabled={flags.rootapp}/></div></div>
    <span className="ws-card-type">{kind === 'bot' ? 'BOT PROJECT' : kind === 'profile' ? 'PROFILE WIDGET' : 'APP / ACTIVITY'}</span>
    <h3>{item.name}</h3>
    <p>{kind === 'bot' ? (item.config?.description || `${item.config?.commands?.length || 0} commands`) : `${item.templateId} · ${item.id}`}</p>
    <footer><button onClick={onOpen}>Open <ChevronRight size={14}/></button>{kind === 'app' && <button onClick={() => openTool('.systems-launch')}>Platforms</button>}</footer>
  </article>;
}

function SettingsPage() {
  return <div className="ws-settings">
    <section><header><Settings size={19}/><div><h3>NekoDeck Settings</h3><p>Everything important is accessible from this page now.</p></div></header><div className="ws-action-grid"><button onClick={() => openTool('.activity-studio-launch')}><Gamepad2/>Activity settings</button><button onClick={() => openTool('.systems-launch')}><Package/>Discord / RootApp targets</button><button onClick={() => openTool('.bb-launch')}><Bot/>Bot Builder settings</button><button onClick={() => openTool('.profile-manager-launch')}><Grid2X2/>Profile Widget manager</button></div></section>
    <section><header><ShieldCheck size={19}/><div><h3>Deployment</h3><p>Public deployments should use HTTPS.</p></div></header><div className="ws-note"><ShieldCheck size={16}/><span>Opening NekoDeck through a raw HTTP IP can disable secure browser APIs. The new frontend also includes a UUID fallback so builders do not crash on plain HTTP.</span></div></section>
    <section className="wide"><header><Wrench size={19}/><div><h3>Classic Utilities</h3><p>Legacy utilities remain available, but they are no longer the gateway to the rest of NekoDeck.</p></div></header><p className="ws-muted">Use the Utilities sidebar item only for the original counters, notes, timers and legacy utility views.</p></section>
  </div>;
}

export default function WorkspaceShell() {
  const [page, setPage] = useState('dashboard');
  const [platform, setPlatform] = useState('all');
  const [query, setQuery] = useState('');
  const [apps, setApps] = useState([]);
  const [bots, setBots] = useState([]);
  const [instances, setInstances] = useState([]);
  const [system, setSystem] = useState(null);
  const [error, setError] = useState('');
  const [classic, setClassic] = useState(false);
  const [profileStudio, setProfileStudio] = useState(false);

  const refresh = async () => {
    setError('');
    const results = await Promise.allSettled([readJson('/api/app-systems'), readJson('/api/bots'), readJson('/api/instances'), readJson('/api/system')]);
    if (results[0].status === 'fulfilled') setApps(results[0].value.instances || []);
    if (results[1].status === 'fulfilled') setBots(results[1].value.bots || []);
    if (results[2].status === 'fulfilled') setInstances(results[2].value.instances || []);
    if (results[3].status === 'fulfilled') setSystem(results[3].value.system || null);
    const failed = results.find((item) => item.status === 'rejected');
    if (failed) setError(failed.reason?.message || 'Some workspace data could not be loaded.');
  };

  useEffect(() => { refresh(); }, []);
  if (location.pathname.startsWith('/activity/')) return <BaseApp/>;
  if (classic) return <div className="ws-classic"><BaseApp/><button className="ws-classic-return" onClick={() => setClassic(false)}>Back to Workspace</button></div>;
  if (profileStudio) return <div className="ws-profile-studio"><AppV2/><button className="ws-classic-return" onClick={() => setProfileStudio(false)}>Back to Workspace</button></div>;

  const profiles = instances.filter((item) => PROFILE_TYPES.includes(item.templateId));
  const filter = (item) => {
    const flags = targets(item);
    const platformOk = platform === 'all' || Boolean(flags[platform]);
    return platformOk && `${item.name || ''} ${item.templateId || ''}`.toLowerCase().includes(query.toLowerCase());
  };
  const shownApps = apps.filter(filter);
  const shownBots = bots.filter(filter);
  const shownProfiles = profiles.filter(filter);
  const everything = [...apps, ...bots, ...profiles];
  const discordCount = everything.filter((item) => targets(item).discord).length;
  const rootCount = everything.filter((item) => targets(item).rootapp).length;
  const title = { dashboard: 'Workspace', apps: 'Apps', bots: 'Bots', profiles: 'Profile Widgets', settings: 'Settings' }[page] || 'Workspace';
  const subtitle = { dashboard: 'Everything you build, in one place.', apps: 'Discord Activities and RootApp projects.', bots: 'Discord.js and Root community chatbots.', profiles: 'Discord Profile Board data sources and previews.', settings: 'NekoDeck, builder and platform preferences.' }[page] || '';

  return <div className="ws-shell">
    <aside className="ws-sidebar">
      <div className="ws-brand"><div className="ws-logo">N</div><div><strong>NekoDeck</strong><span>Creator Workspace</span></div></div>
      <div className="ws-mini-switch"><button className={platform === 'all' ? 'active' : ''} onClick={() => setPlatform('all')}>All</button><button className={platform === 'discord' ? 'active discord' : ''} onClick={() => setPlatform('discord')}>Discord</button><button className={platform === 'rootapp' ? 'active root' : ''} onClick={() => setPlatform('rootapp')}>Root</button></div>
      <nav className="ws-nav"><span>Workspace</span><button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}><LayoutDashboard/>Dashboard</button><button className={page === 'apps' ? 'active' : ''} onClick={() => setPage('apps')}><AppWindow/>Apps <b>{apps.length}</b></button><button className={page === 'bots' ? 'active' : ''} onClick={() => setPage('bots')}><Bot/>Bots <b>{bots.length}</b></button><button className={page === 'profiles' ? 'active' : ''} onClick={() => setPage('profiles')}><Grid2X2/>Profile Widgets <b>{profiles.length}</b></button><span>Create</span><button onClick={() => openTool('.activity-studio-launch')}><Plus/>Create App</button><button onClick={() => openTool('.bb-launch')}><Plus/>Create Bot</button><button onClick={() => setProfileStudio(true)}><Plus/>Profile Widget</button><span>System</span><button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><Settings/>Settings</button><button onClick={() => setClassic(true)}><Wrench/>Utilities</button></nav>
      <div className="ws-sidebar-bottom"><div className="ws-host"><CircleDot/><div><strong>{system?.hostname || 'NekoDeck'}</strong><span>{system ? `${system.platform} · ${system.arch}` : 'Connecting…'}</span></div></div><a href="https://github.com/NekoSuneProjects/NekoDeck" target="_blank" rel="noreferrer"><Github/>GitHub <ExternalLink/></a></div>
    </aside>
    <main className="ws-main"><header className="ws-topbar"><span>NekoDeck / {title}</span><div><div className="ws-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspace…"/></div><button onClick={refresh}><RefreshCw/></button><button className="ws-new" onClick={() => openTool('.activity-studio-launch')}><Plus/>New</button></div></header>
      <div className="ws-content">{error && <div className="ws-alert">{error}<button onClick={() => setError('')}><X/></button></div>}<div className="ws-page-title"><div><span>{platform === 'all' ? 'ALL PLATFORMS' : platform === 'discord' ? 'DISCORD' : 'ROOTAPP'}</span><h1>{title}</h1><p>{subtitle}</p></div><div className="ws-platform-switch"><button className={platform === 'all' ? 'active' : ''} onClick={() => setPlatform('all')}>All</button><button className={platform === 'discord' ? 'active discord' : ''} onClick={() => setPlatform('discord')}>Discord</button><button className={platform === 'rootapp' ? 'active root' : ''} onClick={() => setPlatform('rootapp')}>RootApp</button></div></div>
        {page === 'dashboard' && <><section className="ws-hero"><div><span>NEKODECK CREATOR WORKSPACE</span><h2>Build once. Keep every platform organised.</h2><p>Discord Activities, Profile Widgets, Discord.js bots, Root Apps and Root Bots now live in one workspace instead of disconnected floating panels.</p><div><button className="ws-primary" onClick={() => openTool('.activity-studio-launch')}><Gamepad2/>Create App</button><button onClick={() => openTool('.bb-launch')}><Bot/>Create Bot</button><button onClick={() => openTool('.systems-launch')}><Package/>Platform Manager</button></div></div><div className="ws-orbit"><i className="discord">D</i><b>N</b><i className="root">R</i></div></section><section className="ws-stats"><div><AppWindow/><span>Apps</span><strong>{apps.length}</strong><small>Activity + app projects</small></div><div><Bot/><span>Bots</span><strong>{bots.length}</strong><small>Discord.js + Root</small></div><div><Grid2X2/><span>Profile Widgets</span><strong>{profiles.length}</strong><small>Profile Board sources</small></div><div className="discord"><ShieldCheck/><span>Discord targets</span><strong>{discordCount}</strong><small>Enabled integrations</small></div><div className="root"><Package/><span>Root targets</span><strong>{rootCount}</strong><small>Enabled packages</small></div></section><section className="ws-dashboard-grid"><div className="ws-panel"><header><div><span>RECENT PROJECTS</span><h3>Apps & Bots</h3></div><button onClick={() => setPage('apps')}>View apps <ChevronRight/></button></header><div className="ws-recent">{[...apps.slice(0, 3), ...bots.slice(0, 2)].map((item) => <div key={item.id}><div className="ws-small-icon">{item.templateId === 'bot-project' ? <Bot/> : <AppWindow/>}</div><div><strong>{item.name}</strong><span>{item.templateId}</span></div><div><PlatformBadge type="discord" enabled={targets(item).discord}/><PlatformBadge type="rootapp" enabled={targets(item).rootapp}/></div></div>)}{!apps.length && !bots.length && <Empty title="Nothing built yet" text="Create your first app or bot."/>}</div></div><div className="ws-panel"><header><div><span>QUICK ACTIONS</span><h3>Build & configure</h3></div></header><div className="ws-quick"><button onClick={() => openTool('.activity-studio-launch')}><Gamepad2/><strong>Activity Studio</strong><span>HTML, Unity, ZIP, URL and web games.</span></button><button onClick={() => openTool('.bb-launch')}><Bot/><strong>Bot Builder</strong><span>Discord.js and Root chatbots.</span></button><button onClick={() => openTool('.systems-launch')}><Package/><strong>App Platforms</strong><span>Discord / Root targets and packages.</span></button><button onClick={() => setPage('settings')}><Settings/><strong>Settings</strong><span>Direct builder and workspace settings.</span></button></div></div></section></>}
        {page === 'apps' && <section className="ws-list-page"><div className="ws-list-toolbar"><div><strong>{shownApps.length} apps</strong><span>Filter by Discord, RootApp, or both.</span></div><div><button onClick={() => openTool('.systems-launch')}><Package/>Platforms</button><button className="ws-primary" onClick={() => openTool('.activity-studio-launch')}><Plus/>Create App</button></div></div>{shownApps.length ? <div className="ws-card-grid">{shownApps.map((item) => <ProjectCard key={item.id} item={item} kind="app" onOpen={() => openTool('.activity-studio-launch')}/>)}</div> : <Empty icon={AppWindow} title="No apps here" text="Change the platform filter or create a new app." action={() => openTool('.activity-studio-launch')} label="Create App"/>}</section>}
        {page === 'bots' && <section className="ws-list-page"><div className="ws-list-toolbar"><div><strong>{shownBots.length} bots</strong><span>Discord.js, Root Bot, or shared command models.</span></div><button className="ws-primary" onClick={() => openTool('.bb-launch')}><Plus/>Create Bot</button></div>{shownBots.length ? <div className="ws-card-grid">{shownBots.map((item) => <ProjectCard key={item.id} item={item} kind="bot" onOpen={() => openTool('.bb-launch')}/>)}</div> : <Empty icon={Bot} title="No bots here" text="Create a bot or change the platform filter." action={() => openTool('.bb-launch')} label="Create Bot"/>}</section>}
        {page === 'profiles' && <section className="ws-list-page"><div className="ws-list-toolbar"><div><strong>{shownProfiles.length} widgets</strong><span>Discord Profile Board data sources.</span></div><div><button onClick={() => openTool('.profile-manager-launch')}><Settings/>Manage</button><button className="ws-primary" onClick={() => setProfileStudio(true)}><Plus/>Add Widget</button></div></div>{shownProfiles.length ? <div className="ws-card-grid">{shownProfiles.map((item) => <ProjectCard key={item.id} item={item} kind="profile" onOpen={() => openTool('.profile-manager-launch')}/>)}</div> : <Empty icon={Grid2X2} title="No Profile Widgets" text="Create your first Profile Board data source." action={() => setProfileStudio(true)} label="Add Widget"/>}</section>}
        {page === 'settings' && <SettingsPage/>}
      </div>
    </main>
  </div>;
}
