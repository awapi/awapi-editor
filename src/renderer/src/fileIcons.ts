/**
 * Pure classification logic for offline Material-style file and folder icons.
 * Maps filenames, extensions, and directory names to semantic icon identifiers
 * rendered as inline SVGs by `<FileIcon />` and `<FolderIcon />`.
 */

export type FileIconKind =
  | 'typescript'
  | 'typescript-react'
  | 'tsconfig'
  | 'javascript'
  | 'javascript-react'
  | 'vite'
  | 'npm'
  | 'pnpm'
  | 'json'
  | 'csharp'
  | 'csv'
  | 'python'
  | 'sql'
  | 'markdown'
  | 'git'
  | 'license'
  | 'yaml'
  | 'html'
  | 'css'
  | 'shell'
  | 'docker'
  | 'go'
  | 'rust'
  | 'java'
  | 'cpp'
  | 'ruby'
  | 'php'
  | 'xml'
  | 'image'
  | 'pdf'
  | 'archive'
  | 'text'
  | 'default';

export type FolderIconKind =
  | 'github'
  | 'vscode'
  | 'build'
  | 'docs'
  | 'node_modules'
  | 'samples'
  | 'scripts'
  | 'src'
  | 'test'
  | 'public'
  | 'config'
  | 'default';

function extractBasename(filenameOrPath: string): string {
  if (!filenameOrPath) return '';
  const parts = filenameOrPath.split(/[\\/]/);
  return (parts[parts.length - 1] || filenameOrPath).trim();
}

/**
 * Resolves the icon kind for a file based on its exact filename or extension.
 */
export function resolveFileIconKind(filenameOrPath: string): FileIconKind {
  const base = extractBasename(filenameOrPath);
  const lower = base.toLowerCase();
  if (!lower) return 'default';

  // Exact or prefix filename matches (Material Icon Theme conventions)
  if (lower === 'package.json' || lower === 'package-lock.json' || lower === '.npmrc' || lower === '.npmignore') {
    return 'npm';
  }
  if (lower === 'pnpm-lock.yaml' || lower === 'pnpm-workspace.yaml' || lower === '.pnpmfile.cjs') {
    return 'pnpm';
  }
  if (lower === 'tsconfig.json' || /^tsconfig\..+\.json$/.test(lower) || lower === 'jsconfig.json') {
    return 'tsconfig';
  }
  if (/^vite\.config\.(ts|js|mjs|cjs|mts|cts)$/.test(lower) || /^vitest\.config\.(ts|js|mjs|cjs|mts|cts)$/.test(lower)) {
    return 'vite';
  }
  if (
    lower === '.gitignore' ||
    lower === '.gitattributes' ||
    lower === '.gitmodules' ||
    lower === '.gitkeep'
  ) {
    return 'git';
  }
  if (lower === 'license' || lower.startsWith('license.') || lower === 'copying' || lower.startsWith('copying.')) {
    return 'license';
  }
  if (
    lower === 'dockerfile' ||
    lower.startsWith('dockerfile.') ||
    lower === '.dockerignore' ||
    /^docker-compose(\..+)?\.ya?ml$/.test(lower)
  ) {
    return 'docker';
  }
  if (lower === 'justfile' || lower === 'makefile' || lower === 'gnumakefile') {
    return 'shell';
  }

  const dotIdx = lower.lastIndexOf('.');
  const ext = dotIdx > 0 ? lower.slice(dotIdx + 1) : '';

  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'tsx':
      return 'typescript-react';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'javascript-react';
    case 'json':
    case 'jsonc':
    case 'json5':
      return 'json';
    case 'cs':
    case 'csx':
      return 'csharp';
    case 'csv':
    case 'tsv':
      return 'csv';
    case 'py':
    case 'pyw':
    case 'pyi':
      return 'python';
    case 'sql':
    case 'ddl':
      return 'sql';
    case 'md':
    case 'mdx':
    case 'markdown':
      return 'markdown';
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'env':
      return 'yaml';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css';
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
    case 'ps1':
    case 'psm1':
    case 'bat':
    case 'cmd':
      return 'shell';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'java':
    case 'jar':
    case 'class':
      return 'java';
    case 'c':
    case 'h':
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx':
      return 'cpp';
    case 'rb':
    case 'erb':
      return 'ruby';
    case 'php':
      return 'php';
    case 'xml':
    case 'plist':
    case 'csproj':
    case 'sln':
    case 'xaml':
      return 'xml';
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'ico':
    case 'bmp':
      return 'image';
    case 'pdf':
      return 'pdf';
    case 'zip':
    case 'tar':
    case 'gz':
    case 'tgz':
    case '7z':
    case 'rar':
      return 'archive';
    case 'txt':
    case 'log':
    case 'out':
      return 'text';
    default:
      return 'default';
  }
}

/**
 * Resolves the icon kind for a folder based on its directory name.
 */
export function resolveFolderIconKind(folderNameOrPath: string): FolderIconKind {
  const base = extractBasename(folderNameOrPath);
  const lower = base.toLowerCase();
  switch (lower) {
    case '.github':
      return 'github';
    case '.vscode':
      return 'vscode';
    case 'build':
    case 'dist':
    case 'out':
    case 'release':
    case 'target':
      return 'build';
    case 'docs':
    case 'doc':
    case 'documentation':
      return 'docs';
    case 'node_modules':
      return 'node_modules';
    case 'samples':
    case 'sample':
    case 'examples':
    case 'example':
    case 'demos':
      return 'samples';
    case 'scripts':
    case 'script':
    case 'bin':
    case 'tools':
      return 'scripts';
    case 'src':
    case 'source':
    case 'lib':
    case 'app':
      return 'src';
    case 'test':
    case 'tests':
    case '__tests__':
    case 'spec':
    case 'specs':
      return 'test';
    case 'public':
    case 'assets':
    case 'static':
    case 'images':
    case 'icons':
      return 'public';
    case 'config':
    case 'configs':
    case '.config':
    case 'settings':
      return 'config';
    default:
      return 'default';
  }
}
