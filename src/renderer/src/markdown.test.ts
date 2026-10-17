import { describe, it, expect } from 'vitest';
import {
  isMarkdownTab,
  isHtmlTab,
  isPreviewableTab,
  prepareHtmlForPreview,
  escapeHtml,
  sanitizeUrl,
  resolveRelativeFileUrl,
  slugifyHeading,
  renderInlineMarkdown,
  renderMarkdownToHtml,
} from './markdown';

describe('isMarkdownTab', () => {
  it('returns true for .md and .markdown filenames (case-insensitive)', () => {
    expect(isMarkdownTab('README.md')).toBe(true);
    expect(isMarkdownTab('notes.MD')).toBe(true);
    expect(isMarkdownTab('/path/to/guide.markdown')).toBe(true);
    expect(isMarkdownTab('C:\\docs\\SPEC.MARKDOWN')).toBe(true);
  });

  it('returns true when explicit languageId is markdown regardless of filename', () => {
    expect(isMarkdownTab('Untitled', 'markdown')).toBe(true);
    expect(isMarkdownTab(null, 'markdown')).toBe(true);
    expect(isMarkdownTab('notes.txt', 'markdown')).toBe(true);
  });

  it('returns false for non-markdown files without markdown languageId', () => {
    expect(isMarkdownTab('index.ts', 'typescript')).toBe(false);
    expect(isMarkdownTab('data.csv')).toBe(false);
    expect(isMarkdownTab(null)).toBe(false);
    expect(isMarkdownTab('')).toBe(false);
  });
});

describe('isHtmlTab & isPreviewableTab', () => {
  it('returns true for .html and .htm filenames (case-insensitive)', () => {
    expect(isHtmlTab('index.html')).toBe(true);
    expect(isHtmlTab('page.htm')).toBe(true);
    expect(isHtmlTab('/var/www/INDEX.HTML')).toBe(true);
    expect(isHtmlTab('C:\\site\\legacy.HTM')).toBe(true);
  });

  it('returns true when explicit languageId is html regardless of filename', () => {
    expect(isHtmlTab('Untitled-1', 'html')).toBe(true);
    expect(isHtmlTab(null, 'html')).toBe(true);
    expect(isHtmlTab('snippet.txt', 'html')).toBe(true);
  });

  it('returns false for non-html files without html languageId', () => {
    expect(isHtmlTab('README.md', 'markdown')).toBe(false);
    expect(isHtmlTab('app.tsx', 'typescript')).toBe(false);
    expect(isHtmlTab(null)).toBe(false);
    expect(isHtmlTab('')).toBe(false);
  });

  it('identifies both Markdown and HTML tabs as previewable', () => {
    expect(isPreviewableTab('README.md')).toBe(true);
    expect(isPreviewableTab('index.html')).toBe(true);
    expect(isPreviewableTab('landing.htm')).toBe(true);
    expect(isPreviewableTab('Untitled-1', 'html')).toBe(true);
    expect(isPreviewableTab('Untitled-1', 'markdown')).toBe(true);
    expect(isPreviewableTab('script.js', 'javascript')).toBe(false);
  });
});

describe('prepareHtmlForPreview', () => {
  it('returns raw HTML unchanged when baseFilePath is null or empty', () => {
    const raw = '<!doctype html><html><body><h1>Hello</h1></body></html>';
    expect(prepareHtmlForPreview(raw)).toBe(raw);
    expect(prepareHtmlForPreview(raw, { baseFilePath: null })).toBe(raw);
  });

  it('injects a <base> tag inside <head> when baseFilePath is provided', () => {
    const raw = '<!doctype html><html><head><title>Test</title></head><body><img src="logo.png"></body></html>';
    const prepared = prepareHtmlForPreview(raw, { baseFilePath: '/Users/alice/site/index.htm' });
    expect(prepared).toContain(
      '<head><base href="awapi-asset://local/Users/alice/site/"><title>Test</title>',
    );
  });

  it('prepends a <base> tag when the HTML fragment has no <head>', () => {
    const raw = '<h1>Fragment</h1><img src="./banner.png">';
    const prepared = prepareHtmlForPreview(raw, { baseFilePath: '/Users/alice/site/page.html' });
    expect(prepared).toBe(
      '<base href="awapi-asset://local/Users/alice/site/"><h1>Fragment</h1><img src="./banner.png">',
    );
  });

  it('does not inject a duplicate <base> tag if one already exists', () => {
    const raw = '<html><head><base href="https://example.com/"></head><body>Hi</body></html>';
    expect(prepareHtmlForPreview(raw, { baseFilePath: '/Users/alice/site/index.html' })).toBe(raw);
  });
});

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss" & \'ok\')</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;ok&#39;)&lt;/script&gt;',
    );
  });
});

describe('sanitizeUrl & resolveRelativeFileUrl', () => {
  it('allows https, http, mailto, and hash anchors', () => {
    expect(sanitizeUrl('https://github.com/awapi')).toBe('https://github.com/awapi');
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    expect(sanitizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
    expect(sanitizeUrl('#section-1')).toBe('#section-1');
  });

  it('blocks javascript:, vbscript:, and dangerous data: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('  JaVaScRiPt:alert(1)  ')).toBeNull();
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
  });

  it('allows safe base64 raster data: URLs for images only', () => {
    const pngData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    expect(sanitizeUrl(pngData, { isImage: true })).toBe(pngData);
    expect(sanitizeUrl(pngData, { isImage: false })).toBeNull();
  });

  it('resolves relative image paths against baseFilePath on POSIX and Windows', () => {
    expect(
      resolveRelativeFileUrl('./assets/logo.png', '/Users/alice/docs/README.md'),
    ).toBe('awapi-asset://local/Users/alice/docs/assets/logo.png');

    expect(
      resolveRelativeFileUrl('../shared/diagram.png', 'C:\\Projects\\awapi\\docs\\guide.md'),
    ).toBe('awapi-asset://local/C:/Projects/awapi/shared/diagram.png');
  });
});

describe('slugifyHeading', () => {
  it('converts heading text into a lowercase hyphenated slug', () => {
    expect(slugifyHeading('Getting Started & Installation!')).toBe('getting-started-installation');
    expect(slugifyHeading('  `Code` in **Heading**  ')).toBe('code-in-heading');
  });
});

describe('renderInlineMarkdown', () => {
  it('renders bold, italic, strikethrough, and inline code', () => {
    const html = renderInlineMarkdown('Hello **bold**, *italic*, ~~strike~~, and `const x = 1 < 2`.');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<del>strike</del>');
    expect(html).toContain('<code>const x = 1 &lt; 2</code>');
  });

  it('renders links and images and strips malicious URLs', () => {
    const safeLink = renderInlineMarkdown('[Awapi](https://github.com "Repo")');
    expect(safeLink).toBe(
      '<a href="https://github.com" title="Repo" rel="noopener noreferrer">Awapi</a>',
    );

    const xssLink = renderInlineMarkdown('[Click me](javascript:alert(1))');
    expect(xssLink).toBe('Click me');
    expect(xssLink).not.toContain('javascript:');

    const img = renderInlineMarkdown('![Logo](./img/logo.png)', {
      baseFilePath: '/home/user/project/README.md',
    });
    expect(img).toBe(
      '<img src="awapi-asset://local/home/user/project/img/logo.png" alt="Logo" loading="lazy" />',
    );
  });
});

describe('renderMarkdownToHtml', () => {
  it('renders ATX and Setext headings with slug ids', () => {
    const md = ['# Title One', '## Section Two ##', '', 'Setext H1', '=========', '', 'Setext H2', '---------'].join('\n');
    const html = renderMarkdownToHtml(md);
    expect(html).toContain('<h1 id="title-one">Title One</h1>');
    expect(html).toContain('<h2 id="section-two">Section Two</h2>');
    expect(html).toContain('<h1 id="setext-h1">Setext H1</h1>');
    expect(html).toContain('<h2 id="setext-h2">Setext H2</h2>');
  });

  it('renders fenced code blocks and escapes HTML inside them', () => {
    const md = ['```ts', 'const el = "<div onclick=alert(1)>";', '```'].join('\n');
    const html = renderMarkdownToHtml(md);
    expect(html).toContain('<pre data-language="ts"><code class="language-ts">const el = &quot;&lt;div onclick=alert(1)&gt;&quot;;</code></pre>');
  });

  it('renders unordered, ordered, and GFM task lists', () => {
    const md = [
      '- First item',
      '- Second item',
      '',
      '1. Step one',
      '2. Step two',
      '',
      '- [x] Done task',
      '- [ ] Pending task',
    ].join('\n');
    const html = renderMarkdownToHtml(md);
    expect(html).toContain('<ul><li>First item</li><li>Second item</li></ul>');
    expect(html).toContain('<ol><li>Step one</li><li>Step two</li></ol>');
    expect(html).toContain('<ul class="contains-task-list">');
    expect(html).toContain('<input type="checkbox" disabled checked /> Done task');
    expect(html).toContain('<input type="checkbox" disabled /> Pending task');
  });

  it('renders GFM tables with column alignments', () => {
    const md = [
      '| Name | Score | Role |',
      '| :--- | :---: | ---: |',
      '| Alice | 95 | Admin |',
      '| Bob | 82 | User |',
    ].join('\n');
    const html = renderMarkdownToHtml(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th style="text-align: left">Name</th>');
    expect(html).toContain('<th style="text-align: center">Score</th>');
    expect(html).toContain('<th style="text-align: right">Role</th>');
    expect(html).toContain('<td style="text-align: left">Alice</td>');
    expect(html).toContain('<td style="text-align: right">Admin</td>');
  });

  it('renders blockquotes and horizontal rules and escapes raw HTML tags', () => {
    const md = [
      '> Quoted **text**',
      '',
      '---',
      '',
      '<script>window.pwned = true;</script>',
    ].join('\n');
    const html = renderMarkdownToHtml(md);
    expect(html).toContain('<blockquote><p>Quoted <strong>text</strong></p></blockquote>');
    expect(html).toContain('<hr />');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;window.pwned = true;&lt;/script&gt;');
  });
});
