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

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <CaptureOverlay />
  </React.StrictMode>,
);
