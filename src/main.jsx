import React from 'react';
import { createRoot } from 'react-dom/client';
import AppV2 from './AppV2.jsx';
import ActivityStudioV2 from './ActivityStudioV2.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppV2 />
    <ActivityStudioV2 />
  </React.StrictMode>
);
