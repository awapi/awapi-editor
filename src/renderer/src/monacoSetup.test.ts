import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loaderConfig, monacoStub } = vi.hoisted(() => ({
  loaderConfig: vi.fn(),
  monacoStub: {
    editor: {},
    languages: {
      register: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
    },
  },
}));

vi.mock('monaco-editor', () => monacoStub);
vi.mock('@monaco-editor/react', () => ({ loader: { config: loaderConfig } }));

function mockWorker(name: string) {
  return {
    default: class {
      readonly workerName = name;
    },
  };
}

vi.mock('monaco-editor/editor/editor.worker?worker', () => mockWorker('editor'));
vi.mock('monaco-editor/languages/features/json/json.worker?worker', () => mockWorker('json'));
vi.mock('monaco-editor/languages/features/css/css.worker?worker', () => mockWorker('css'));
vi.mock('monaco-editor/languages/features/html/html.worker?worker', () => mockWorker('html'));
vi.mock('monaco-editor/languages/features/typescript/ts.worker?worker', () => mockWorker('ts'));

import { createMonacoWorker, setupMonaco } from './monacoSetup';

const workerName = (worker: Worker) => (worker as unknown as { workerName: string }).workerName;

describe('createMonacoWorker', () => {
  it.each([
    ['json', 'json'],
    ['css', 'css'],
    ['scss', 'css'],
    ['less', 'css'],
    ['html', 'html'],
    ['handlebars', 'html'],
    ['razor', 'html'],
    ['typescript', 'ts'],
    ['javascript', 'ts'],
    ['editorWorkerService', 'editor'],
    ['plaintext', 'editor'],
  ])('returns the %s label a %s worker', (label, expected) => {
    expect(workerName(createMonacoWorker(label))).toBe(expected);
  });
});

describe('setupMonaco', () => {
  beforeEach(() => {
    loaderConfig.mockClear();
    monacoStub.languages.register.mockClear();
    monacoStub.languages.setMonarchTokensProvider.mockClear();
    delete (self as { MonacoEnvironment?: unknown }).MonacoEnvironment;
  });

  it('points @monaco-editor/react at the bundled monaco instance instead of the CDN', () => {
    setupMonaco();
    expect(loaderConfig).toHaveBeenCalledTimes(1);
    expect(loaderConfig).toHaveBeenCalledWith({ monaco: monacoStub });
  });

  it('registers a MonacoEnvironment that creates bundled workers by label', () => {
    setupMonaco();
    const env = self.MonacoEnvironment;
    expect(env?.getWorker).toBeTypeOf('function');
    expect(workerName(env!.getWorker!('id', 'json') as Worker)).toBe('json');
    expect(workerName(env!.getWorker!('id', 'markdown') as Worker)).toBe('editor');
  });

  it('registers the Just language and its tokenizer', () => {
    setupMonaco();
    expect(monacoStub.languages.register).toHaveBeenCalledWith({
      id: 'just',
      aliases: ['Just', 'justfile'],
    });
    expect(monacoStub.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
      'just',
      expect.objectContaining({
        tokenizer: expect.objectContaining({
          root: expect.arrayContaining([
            expect.arrayContaining([expect.any(RegExp), 'comment']),
            expect.arrayContaining([expect.any(RegExp), 'keyword']),
          ]),
        }),
      })
    );
  });
});
