import React from 'react';
import ReactDOM from 'react-dom/client';
import CollectPanel from './CollectPanel';
import './style.css';

window.addEventListener('unhandledrejection', (e) => {
  console.error('[collect unhandled rejection]', e.reason);
});
window.addEventListener('error', (e) => {
  console.error('[collect window error]', e.error ?? e.message);
});

const root = document.getElementById('root');
if (!root) {
  throw new Error('collect.html missing #root');
}

// §20.9: the collect-mode staging panel lives in its own Tauri window (label "collect"),
// distinct from the capture overlay. This is its React root.
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <CollectPanel />
  </React.StrictMode>,
);
