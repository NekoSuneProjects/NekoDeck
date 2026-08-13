import React from 'react';
import { createRoot } from 'react-dom/client';
import AppV2 from './AppV2.jsx';
import ActivityStudio from './ActivityStudio.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppV2 />
    <ActivityStudio />
  </React.StrictMode>
);
