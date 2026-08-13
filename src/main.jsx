import React from 'react';
import { createRoot } from 'react-dom/client';
import AppV2 from './AppV2.jsx';
import ActivityStudioV3 from './ActivityStudioV3.jsx';
import ProfileWidgetManager from './ProfileWidgetManager.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppV2 />
    <ActivityStudioV3 />
    <ProfileWidgetManager />
  </React.StrictMode>
);
