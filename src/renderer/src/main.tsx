import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MarkdownPreviewWindow from './MarkdownPreviewWindow';
import DiagramWindow from './DiagramWindow';
import GitDialogWindow from './GitDialogWindow';
import { ThemeProvider } from './theme/ThemeContext';
import { setupMonaco } from './monacoSetup';

const isMarkdownPreviewMode =
  typeof window !== 'undefined' && window.location.hash === '#markdown-preview';
const isDiagramMode =
  typeof window !== 'undefined' && window.location.hash === '#mermaid-diagram';
const isGitDialogMode =
  typeof window !== 'undefined' && window.location.hash === '#git-dialog';

if (!isMarkdownPreviewMode && !isDiagramMode) {
  setupMonaco();
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {isGitDialogMode ? (
        <GitDialogWindow />
      ) : isDiagramMode ? (
        <DiagramWindow />
      ) : isMarkdownPreviewMode ? (
        <MarkdownPreviewWindow />
      ) : (
        <App />
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
