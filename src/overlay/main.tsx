import React from 'react';
import ReactDOM from 'react-dom/client';
import CaptureOverlay from './CaptureOverlay';
import CollectOverlay from './CollectOverlay';
import './style.css';

window.addEventListener('unhandledrejection', (e) => {
  console.error('[overlay unhandled rejection]', e.reason);
});
window.addEventListener('error', (e) => {
  console.error('[overlay window error]', e.error ?? e.message);
});

const root = document.getElementById('root');
if (!root) {
  throw new Error('overlay.html missing #root');
}

// v2.8 §20 Track B: both overlays render in the same window, but only one is mounted
// at a time (CaptureOverlay null-returns when there is no toast/notice; CollectOverlay
// null-returns when staging is closed). The overlay window's React root simply mounts
// both — whichever has content wins the visible card.
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <CaptureOverlay />
    <CollectOverlay />
  </React.StrictMode>,
);
