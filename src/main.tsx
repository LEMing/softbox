import React from 'react';
import ReactDOM from 'react-dom/client';
import { SiteApp } from './site/SiteApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SiteApp />
  </React.StrictMode>
);
