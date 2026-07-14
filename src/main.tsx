import React from 'react';
import ReactDOM from 'react-dom/client';
import { SiteApp } from './site/SiteApp';
import './site/site.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SiteApp />
  </React.StrictMode>
);
