import { describe, it, expect } from 'vitest';
import {
  inferLanguageFromFilename,
  getLanguageLabel,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE_ID,
} from './languages';

describe('inferLanguageFromFilename', () => {
  it('returns plaintext for null / undefined / empty names', () => {
    expect(inferLanguageFromFilename(null)).toBe(DEFAULT_LANGUAGE_ID);
    expect(inferLanguageFromFilename(undefined)).toBe(DEFAULT_LANGUAGE_ID);
    expect(inferLanguageFromFilename('')).toBe(DEFAULT_LANGUAGE_ID);
  });

  it('returns plaintext when there is no extension', () => {
    expect(inferLanguageFromFilename('Untitled')).toBe('plaintext');
    expect(inferLanguageFromFilename('README')).toBe('plaintext');
  });

  it('maps common extensions to Monaco ids', () => {
    expect(inferLanguageFromFilename('data.json')).toBe('json');
    expect(inferLanguageFromFilename('index.TS')).toBe('typescript');
    expect(inferLanguageFromFilename('script.js')).toBe('javascript');
    expect(inferLanguageFromFilename('notes.md')).toBe('markdown');
    expect(inferLanguageFromFilename('page.html')).toBe('html');
    expect(inferLanguageFromFilename('app.py')).toBe('python');
  });

  it('recognizes a Dockerfile by exact name (no extension)', () => {
    expect(inferLanguageFromFilename('Dockerfile')).toBe('dockerfile');
    expect(inferLanguageFromFilename('/repo/Dockerfile')).toBe('dockerfile');
  });

  it('works with full paths on both separators', () => {
    expect(inferLanguageFromFilename('/a/b/c/file.go')).toBe('go');
    expect(inferLanguageFromFilename('C:\\a\\b\\file.cs')).toBe('csharp');
  });

  it('maps new language extensions correctly', () => {
    expect(inferLanguageFromFilename('deploy.bat')).toBe('bat');
    expect(inferLanguageFromFilename('run.cmd')).toBe('bat');
    expect(inferLanguageFromFilename('main.bicep')).toBe('bicep');
    expect(inferLanguageFromFilename('core.clj')).toBe('clojure');
    expect(inferLanguageFromFilename('app.cljs')).toBe('clojure');
    expect(inferLanguageFromFilename('build.edn')).toBe('clojure');
    expect(inferLanguageFromFilename('app.coffee')).toBe('coffee');
    expect(inferLanguageFromFilename('widget.dart')).toBe('dart');
    expect(inferLanguageFromFilename('router.ex')).toBe('elixir');
    expect(inferLanguageFromFilename('test.exs')).toBe('elixir');
    expect(inferLanguageFromFilename('lib.fs')).toBe('fsharp');
    expect(inferLanguageFromFilename('script.fsx')).toBe('fsharp');
    expect(inferLanguageFromFilename('template.hbs')).toBe('handlebars');
    expect(inferLanguageFromFilename('template.handlebars')).toBe('handlebars');
    expect(inferLanguageFromFilename('main.tf')).toBe('hcl');
    expect(inferLanguageFromFilename('vars.tfvars')).toBe('hcl');
    expect(inferLanguageFromFilename('config.hcl')).toBe('hcl');
    expect(inferLanguageFromFilename('solve.jl')).toBe('julia');
    expect(inferLanguageFromFilename('AppDelegate.m')).toBe('objective-c');
    expect(inferLanguageFromFilename('AppDelegate.mm')).toBe('objective-c');
    expect(inferLanguageFromFilename('algo.pas')).toBe('pascal');
    expect(inferLanguageFromFilename('script.pl')).toBe('perl');
    expect(inferLanguageFromFilename('Module.pm')).toBe('perl');
    expect(inferLanguageFromFilename('api.proto')).toBe('protobuf');
    expect(inferLanguageFromFilename('index.pug')).toBe('pug');
    expect(inferLanguageFromFilename('layout.jade')).toBe('pug');
    expect(inferLanguageFromFilename('Index.cshtml')).toBe('razor');
    expect(inferLanguageFromFilename('Page.razor')).toBe('razor');
    expect(inferLanguageFromFilename('docs.rst')).toBe('restructuredtext');
    expect(inferLanguageFromFilename('Main.scala')).toBe('scala');
    expect(inferLanguageFromFilename('worksheet.sc')).toBe('scala');
    expect(inferLanguageFromFilename('lib.scm')).toBe('scheme');
    expect(inferLanguageFromFilename('util.ss')).toBe('scheme');
    expect(inferLanguageFromFilename('Token.sol')).toBe('solidity');
    expect(inferLanguageFromFilename('script.tcl')).toBe('tcl');
    expect(inferLanguageFromFilename('email.twig')).toBe('twig');
    expect(inferLanguageFromFilename('Module.vb')).toBe('vb');
  });

  it('falls back to plaintext for unknown extensions', () => {
    expect(inferLanguageFromFilename('mystery.xyz')).toBe('plaintext');
  });

  it('treats a trailing dot as no extension', () => {
    expect(inferLanguageFromFilename('weird.')).toBe('plaintext');
  });
});

describe('getLanguageLabel', () => {
  it('returns the label for a known id', () => {
    expect(getLanguageLabel('plaintext')).toBe('Plain Text');
    expect(getLanguageLabel('json')).toBe('JSON');
  });

  it('falls back to the id for unknown languages', () => {
    expect(getLanguageLabel('not-a-language')).toBe('not-a-language');
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  it('includes Plain Text as the default', () => {
    expect(SUPPORTED_LANGUAGES.some(l => l.id === DEFAULT_LANGUAGE_ID)).toBe(true);
  });

  it('contains only unique ids', () => {
    const ids = SUPPORTED_LANGUAGES.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes newly added languages', () => {
    const ids = new Set(SUPPORTED_LANGUAGES.map(l => l.id));
    for (const id of [
      'bat', 'bicep', 'clojure', 'coffee', 'dart', 'elixir', 'fsharp',
      'handlebars', 'hcl', 'julia', 'objective-c', 'pascal', 'perl',
      'protobuf', 'pug', 'razor', 'restructuredtext', 'scala', 'scheme',
      'solidity', 'tcl', 'twig', 'vb',
    ]) {
      expect(ids.has(id), `missing language: ${id}`).toBe(true);
    }
  });
});
