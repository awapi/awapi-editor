import { describe, it, expect } from 'vitest';
import { resolveFileIconKind, resolveFolderIconKind } from './fileIcons';

describe('fileIcons classification', () => {
  it('classifies special filenames accurately (npm, pnpm, tsconfig, vite, git, license, docker)', () => {
    expect(resolveFileIconKind('package.json')).toBe('npm');
    expect(resolveFileIconKind('package-lock.json')).toBe('npm');
    expect(resolveFileIconKind('pnpm-lock.yaml')).toBe('pnpm');
    expect(resolveFileIconKind('pnpm-workspace.yaml')).toBe('pnpm');
    expect(resolveFileIconKind('tsconfig.json')).toBe('tsconfig');
    expect(resolveFileIconKind('tsconfig.node.json')).toBe('tsconfig');
    expect(resolveFileIconKind('vite.config.ts')).toBe('vite');
    expect(resolveFileIconKind('.gitignore')).toBe('git');
    expect(resolveFileIconKind('LICENSE')).toBe('license');
    expect(resolveFileIconKind('Dockerfile')).toBe('docker');
    expect(resolveFileIconKind('justfile')).toBe('shell');
  });

  it('classifies common programming and data file extensions', () => {
    expect(resolveFileIconKind('src/renderer/src/languages.test.ts')).toBe('typescript');
    expect(resolveFileIconKind('App.tsx')).toBe('typescript-react');
    expect(resolveFileIconKind('index.js')).toBe('javascript');
    expect(resolveFileIconKind('Component.jsx')).toBe('javascript-react');
    expect(resolveFileIconKind('sample.cs')).toBe('csharp');
    expect(resolveFileIconKind('sample.csv')).toBe('csv');
    expect(resolveFileIconKind('sample.py')).toBe('python');
    expect(resolveFileIconKind('sample.sql')).toBe('sql');
    expect(resolveFileIconKind('sample.txt')).toBe('text');
    expect(resolveFileIconKind('README.md')).toBe('markdown');
    expect(resolveFileIconKind('CODE_OF_CONDUCT.md')).toBe('markdown');
    expect(resolveFileIconKind('data.json')).toBe('json');
    expect(resolveFileIconKind('config.yaml')).toBe('yaml');
    expect(resolveFileIconKind('index.html')).toBe('html');
    expect(resolveFileIconKind('styles.css')).toBe('css');
    expect(resolveFileIconKind('main.go')).toBe('go');
    expect(resolveFileIconKind('lib.rs')).toBe('rust');
    expect(resolveFileIconKind('Main.java')).toBe('java');
    expect(resolveFileIconKind('main.cpp')).toBe('cpp');
    expect(resolveFileIconKind('app.rb')).toBe('ruby');
    expect(resolveFileIconKind('index.php')).toBe('php');
    expect(resolveFileIconKind('layout.xml')).toBe('xml');
    expect(resolveFileIconKind('logo.png')).toBe('image');
    expect(resolveFileIconKind('manual.pdf')).toBe('pdf');
    expect(resolveFileIconKind('bundle.zip')).toBe('archive');
    expect(resolveFileIconKind('Untitled')).toBe('default');
  });

  it('classifies special folder names accurately', () => {
    expect(resolveFolderIconKind('.github')).toBe('github');
    expect(resolveFolderIconKind('.vscode')).toBe('vscode');
    expect(resolveFolderIconKind('build')).toBe('build');
    expect(resolveFolderIconKind('dist')).toBe('build');
    expect(resolveFolderIconKind('docs')).toBe('docs');
    expect(resolveFolderIconKind('node_modules')).toBe('node_modules');
    expect(resolveFolderIconKind('samples')).toBe('samples');
    expect(resolveFolderIconKind('scripts')).toBe('scripts');
    expect(resolveFolderIconKind('src')).toBe('src');
    expect(resolveFolderIconKind('tests')).toBe('test');
    expect(resolveFolderIconKind('assets')).toBe('public');
    expect(resolveFolderIconKind('config')).toBe('config');
    expect(resolveFolderIconKind('my-custom-folder')).toBe('default');
  });
});
