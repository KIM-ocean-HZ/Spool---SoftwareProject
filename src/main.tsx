import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import './styles/global.css';

// Surface unhandled promise rejections to the page so they don't get hidden inside
// async closures (capture path, store loads, tray invokes).
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled rejection]', e.reason);
  paintFatalIfRootEmpty('未捕获的 Promise 异常', e.reason);
});

window.addEventListener('error', (e) => {
  console.error('[window error]', e.error ?? e.message);
  paintFatalIfRootEmpty('未捕获的脚本错误', e.error ?? e.message);
});

function paintFatalIfRootEmpty(label: string, e: unknown): void {
  const root = document.getElementById('root');
  if (!root || root.childElementCount > 0) return;
  const msg = e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e);
  const safe = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  root.innerHTML = `
    <div style="padding:24px;background:#faf7f0;color:#1c1a16;font-family:ui-monospace,monospace;min-height:100vh;">
      <div style="font-size:20px;margin-bottom:12px;color:#b3402f;">${label}</div>
      <pre style="background:#f3eee2;border:1px solid #d6cdb3;border-radius:6px;padding:12px;max-height:60vh;overflow:auto;font-size:11px;white-space:pre-wrap;word-break:break-word;">${safe}</pre>
    </div>
  `;
}

const root = document.getElementById('root');
if (!root) {
  document.body.innerHTML =
    '<div style="padding:24px;font-family:ui-monospace,monospace">index.html 缺少 &lt;div id="root"&gt;</div>';
  throw new Error('root element missing');
}

// Pre-mount marker. If the user ever sees this stuck on screen it means React's
// createRoot/render is synchronously hanging. If they see blank instead — JS never
// reached this line and the Vite dev server is the problem.
root.textContent = '【启动中】JS 已加载，React 正在挂载…';

try {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
} catch (e) {
  paintFatalIfRootEmpty('React 挂载失败', e);
  throw e;
}
