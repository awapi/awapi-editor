/**
 * Curated list of Monaco-supported languages exposed in the language selector.
 * The `id` matches Monaco's built-in language identifiers so it can be passed
 * directly to the Editor's `language` prop.
 */
export interface LanguageOption {
  id: string;
  label: string;
}

/** Default language id used when no language is selected and no extension matches. */
export const DEFAULT_LANGUAGE_ID = 'plaintext';

/**
 * Curated list of common languages. The selector renders them alphabetically
 * by label for easier scanning.
 */
export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'json', label: 'JSON' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'less', label: 'Less' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
  { id: 'ini', label: 'INI' },
  { id: 'sql', label: 'SQL' },
  { id: 'shell', label: 'Shell Script' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'csharp', label: 'C#' },
  { id: 'cpp', label: 'C++' },
  { id: 'c', label: 'C' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'php', label: 'PHP' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'swift', label: 'Swift' },
  { id: 'lua', label: 'Lua' },
  { id: 'r', label: 'R' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'bat', label: 'Batch' },
  { id: 'bicep', label: 'Bicep' },
  { id: 'clojure', label: 'Clojure' },
  { id: 'coffee', label: 'CoffeeScript' },
  { id: 'dart', label: 'Dart' },
  { id: 'elixir', label: 'Elixir' },
  { id: 'fsharp', label: 'F#' },
  { id: 'handlebars', label: 'Handlebars' },
  { id: 'hcl', label: 'HCL / Terraform' },
  { id: 'julia', label: 'Julia' },
  { id: 'objective-c', label: 'Objective-C' },
  { id: 'pascal', label: 'Pascal' },
  { id: 'perl', label: 'Perl' },
  { id: 'protobuf', label: 'Protocol Buffers' },
  { id: 'pug', label: 'Pug' },
  { id: 'razor', label: 'Razor' },
  { id: 'restructuredtext', label: 'reStructuredText' },
  { id: 'scala', label: 'Scala' },
  { id: 'scheme', label: 'Scheme' },
  { id: 'solidity', label: 'Solidity' },
  { id: 'tcl', label: 'Tcl' },
  { id: 'twig', label: 'Twig' },
  { id: 'vb', label: 'Visual Basic' },
];

/** Extension (without leading dot, lowercase) -> Monaco language id. */
const EXTENSION_MAP: Record<string, string> = {
  json: 'json',
  jsonc: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  md: 'markdown',
  markdown: 'markdown',
  xml: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  ini: 'ini',
  toml: 'ini',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  dockerfile: 'dockerfile',
  py: 'python',
  java: 'java',
  cs: 'csharp',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  h: 'cpp',
  c: 'c',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  lua: 'lua',
  r: 'r',
  graphql: 'graphql',
  gql: 'graphql',
  bat: 'bat',
  cmd: 'bat',
  bicep: 'bicep',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  edn: 'clojure',
  coffee: 'coffee',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  fs: 'fsharp',
  fsx: 'fsharp',
  hbs: 'handlebars',
  handlebars: 'handlebars',
  tf: 'hcl',
  tfvars: 'hcl',
  hcl: 'hcl',
  jl: 'julia',
  m: 'objective-c',
  mm: 'objective-c',
  pas: 'pascal',
  pl: 'perl',
  pm: 'perl',
  proto: 'protobuf',
  pug: 'pug',
  jade: 'pug',
  cshtml: 'razor',
  razor: 'razor',
  rst: 'restructuredtext',
  scala: 'scala',
  sc: 'scala',
  scm: 'scheme',
  ss: 'scheme',
  sol: 'solidity',
  tcl: 'tcl',
  twig: 'twig',
  vb: 'vb',
};

/**
 * Infer a Monaco language id from a filename (or path). Returns
 * `DEFAULT_LANGUAGE_ID` when no extension matches or the filename has no
 * extension (e.g. unsaved "Untitled" tabs).
 */
export function inferLanguageFromFilename(filename: string | null | undefined): string {
  if (!filename) return DEFAULT_LANGUAGE_ID;
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const lower = base.toLowerCase();
  // Dockerfile has no extension
  if (lower === 'dockerfile') return 'dockerfile';
  const dot = lower.lastIndexOf('.');
  if (dot < 0 || dot === lower.length - 1) return DEFAULT_LANGUAGE_ID;
  const ext = lower.slice(dot + 1);
  return EXTENSION_MAP[ext] ?? DEFAULT_LANGUAGE_ID;
}

/** Look up the user-facing label for a language id. */
export function getLanguageLabel(id: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.id === id)?.label ?? id;
}
