import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MarkdownPreviewWindow from './MarkdownPreviewWindow';
import { ThemeProvider } from './theme/ThemeContext';
import { setupMonaco } from './monacoSetup';

const isMarkdownPreviewMode =
  typeof window !== 'undefined' && window.location.hash === '#markdown-preview';

if (!isMarkdownPreviewMode) {
  setupMonaco();
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {isMarkdownPreviewMode ? <MarkdownPreviewWindow /> : <App />}
    </ThemeProvider>
  </React.StrictMode>,
);
