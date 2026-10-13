/// <reference types="vite/client" />
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/languages/features/json/json.worker?worker';
import CssWorker from 'monaco-editor/languages/features/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/languages/features/html/html.worker?worker';
import TsWorker from 'monaco-editor/languages/features/typescript/ts.worker?worker';

/** Returns a bundled Monaco web worker for the given language label. */
export function createMonacoWorker(label: string): Worker {
  switch (label) {
    case 'json':
      return new JsonWorker();
    case 'css':
    case 'scss':
    case 'less':
      return new CssWorker();
    case 'html':
    case 'handlebars':
    case 'razor':
      return new HtmlWorker();
    case 'typescript':
    case 'javascript':
      return new TsWorker();
    default:
      return new EditorWorker();
  }
}

/**
 * Makes @monaco-editor/react use the locally bundled monaco-editor package
 * instead of downloading it from the jsDelivr CDN at runtime. Must run before
 * any <Editor> mounts.
 */
export function setupMonaco(): void {
  self.MonacoEnvironment = {
    getWorker: (_workerId: string, label: string) => createMonacoWorker(label),
  };
  loader.config({ monaco });
}
