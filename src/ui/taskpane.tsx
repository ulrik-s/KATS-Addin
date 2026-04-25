import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

/**
 * Task pane entry. Office.js needs to fire its `onReady` before we
 * can call any Office API; React mounts as soon as the runtime is up.
 */
void Office.onReady(() => {
  const container = document.getElementById('root');
  if (!container) {
    console.error('[KATS] taskpane root element missing');
    return;
  }
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
