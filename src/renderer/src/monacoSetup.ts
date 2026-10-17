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
  monaco.languages.register({
    id: 'just',
    aliases: ['Just', 'justfile'],
  });
  monaco.languages.setMonarchTokensProvider('just', {
    tokenizer: {
      root: [
        [/^[ \t]*#[^\n]*/, 'comment'],
        [/^([ \t]*)([@-]*)([a-zA-Z_][\w-]*)(?=.*:)/, ['white', 'annotation', 'type.identifier']],
        [/\{\{|\}\}/, 'delimiter.bracket'],
        [/\b(?:set|export|alias|import|mod)\b/, 'keyword'],
        [/\b(?:true|false)\b/, 'constant'],
        [/\b[A-Za-z_][\w-]*(?=\s*:?=)/, 'variable'],
        [/[a-zA-Z_][\w-]*(?=\s*\()/, 'predefined'],
        [/[a-zA-Z_][\w-]*/, 'identifier'],
        [/[0-9]+/, 'number'],
        [/[{}()[\]]/, 'delimiter'],
        [/[:,=]/, 'delimiter'],
        [/[ \t\r\n]+/, 'white'],
        [/"/, { token: 'string.quote', next: '@doubleString' }],
        [/'/, { token: 'string.quote', next: '@singleString' }],
        [/`/, { token: 'string.backtick', next: '@command' }],
      ],
      doubleString: [
        [/[^"\\]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string.quote', next: '@pop' }],
      ],
      singleString: [
        [/[^'\\]+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, { token: 'string.quote', next: '@pop' }],
      ],
      command: [
        [/[^`\\]+/, 'string'],
        [/\\./, 'string.escape'],
        [/`/, { token: 'string.backtick', next: '@pop' }],
      ],
    },
  });
  self.MonacoEnvironment = {
    getWorker: (_workerId: string, label: string) => createMonacoWorker(label),
  };
  loader.config({ monaco });
}
