import React from 'react';
import { createRoot } from 'react-dom/client';
import WorkspaceShell from './WorkspaceShell.jsx';
import ActivityStudioV3 from './ActivityStudioV3.jsx';
import ProfileWidgetManager from './ProfileWidgetManager.jsx';
import AppSystems from './AppSystems.jsx';
import BotBuilder from './BotBuilder.jsx';
import './styles.css';

// randomUUID() is restricted to secure contexts in browsers. NekoDeck can also
// be opened on a LAN/raw HTTP IP, so provide a standards-shaped fallback for UI
// row IDs instead of crashing the Bot Builder before the workspace loads.
if (globalThis.crypto && typeof globalThis.crypto.randomUUID !== 'function') {
  const makeUuid = () => {
    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  try { Object.defineProperty(globalThis.crypto, 'randomUUID', { value: makeUuid, configurable: true }); }
  catch { globalThis.crypto.randomUUID = makeUuid; }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WorkspaceShell />
    <ActivityStudioV3 />
    <ProfileWidgetManager />
    <AppSystems />
    <BotBuilder />
  </React.StrictMode>
);
