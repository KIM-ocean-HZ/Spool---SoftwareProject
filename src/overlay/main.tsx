import React from 'react';
import ReactDOM from 'react-dom/client';
import CaptureOverlay from './CaptureOverlay';
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

// The overlay window hosts the capture toast / failure notice / undo confirmation.
// Collect mode (§20.9) moved to its own dedicated window (collect.html) in Phase 11.5
// step 5 — it no longer shares the overlay.
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <CaptureOverlay />
  </React.StrictMode>,
);
