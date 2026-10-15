import React from 'react';
import {
  resolveFileIconKind,
  resolveFolderIconKind,
  type FileIconKind,
  type FolderIconKind,
} from './fileIcons';

interface FileIconProps {
  filename: string;
  size?: number;
}

interface FolderIconProps {
  name: string;
  isOpen?: boolean;
  size?: number;
}

const FOLDER_COLORS: Record<FolderIconKind, { main: string; tab: string; badge?: string }> = {
  github: { main: '#546e7a', tab: '#37474f', badge: '#ffffff' },
  vscode: { main: '#42a5f5', tab: '#1e88e5', badge: '#e3f2fd' },
  build: { main: '#ffb300', tab: '#ffa000', badge: '#fff8e1' },
  docs: { main: '#ef5350', tab: '#d32f2f', badge: '#ffebee' },
  node_modules: { main: '#8bc34a', tab: '#689f38', badge: '#f1f8e9' },
  samples: { main: '#d4a359', tab: '#b8863b' },
  scripts: { main: '#78909c', tab: '#546e7a', badge: '#eceff1' },
  src: { main: '#4caf50', tab: '#388e3c', badge: '#e8f5e9' },
  test: { main: '#26a69a', tab: '#00897b', badge: '#e0f2f1' },
  public: { main: '#29b6f6', tab: '#0288d1', badge: '#e1f5fe' },
  config: { main: '#00acc1', tab: '#00838f', badge: '#e0f7fa' },
  default: { main: '#c09553', tab: '#9e7638' },
};

/**
 * Offline Material-style folder icon with closed/open states and folder-type badges.
 */
export const FolderIcon: React.FC<FolderIconProps> = ({ name, isOpen = false, size = 16 }) => {
  const kind = resolveFolderIconKind(name);
  const palette = FOLDER_COLORS[kind];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-testid="folder-icon"
      data-folder-kind={kind}
      data-folder-open={isOpen ? 'true' : 'false'}
      style={{ flexShrink: 0 }}
    >
      {/* Back tab of the folder */}
      <path
        d="M1.5 3.2C1.5 2.54 2.04 2 2.7 2H6.3L7.7 3.6H13.3C13.96 3.6 14.5 4.14 14.5 4.8V12.5C14.5 13.16 13.96 13.7 13.3 13.7H2.7C2.04 13.7 1.5 13.16 1.5 12.5V3.2Z"
        fill={palette.tab}
      />
      {/* Front flap (tilted open when expanded) */}
      {isOpen ? (
        <path
          d="M1.2 6.2C1.35 5.65 1.85 5.3 2.42 5.3H13.85C14.55 5.3 15.05 5.95 14.88 6.63L13.68 12.73C13.55 13.3 13.05 13.7 12.46 13.7H2.35C1.65 13.7 1.15 13.05 1.32 12.37L1.2 6.2Z"
          fill={palette.main}
        />
      ) : (
        <path
          d="M1.5 4.8C1.5 4.25 1.95 3.8 2.5 3.8H13.5C14.05 3.8 14.5 4.25 14.5 4.8V12.7C14.5 13.25 14.05 13.7 13.5 13.7H2.5C1.95 13.7 1.5 13.25 1.5 12.7V4.8Z"
          fill={palette.main}
        />
      )}
      {/* Optional Material-style badge overlay */}
      {kind === 'src' && (
        <text
          x="10.2"
          y="12.2"
          fontSize="5.2"
          fontWeight="700"
          fontFamily="monospace"
          textAnchor="middle"
          fill={palette.badge}
        >
          {'</>'}
        </text>
      )}
      {kind === 'github' && (
        <circle cx="11.2" cy="10.2" r="2.5" fill={palette.badge} />
      )}
      {kind === 'vscode' && (
        <rect x="9.2" y="8.2" width="4" height="4" rx="0.8" fill={palette.badge} />
      )}
      {kind === 'build' && (
        <rect x="9" y="8" width="4.4" height="4.2" rx="0.6" stroke={palette.badge} strokeWidth="1.1" />
      )}
      {kind === 'docs' && (
        <rect x="9.4" y="7.8" width="3.8" height="4.6" rx="0.5" fill={palette.badge} />
      )}
      {kind === 'node_modules' && (
        <polygon points="11.2,7.5 13.5,8.8 13.5,11.5 11.2,12.8 8.9,11.5 8.9,8.8" fill={palette.badge} />
      )}
      {kind === 'scripts' && (
        <text
          x="10.8"
          y="12.1"
          fontSize="5.5"
          fontWeight="700"
          fontFamily="monospace"
          textAnchor="middle"
          fill={palette.badge}
        >
          {'$_'}
        </text>
      )}
    </svg>
  );
};

/**
 * Offline Material-style file icon rendered as an inline SVG.
 */
export const FileIcon: React.FC<FileIconProps> = ({ filename, size = 16 }) => {
  const kind: FileIconKind = resolveFileIconKind(filename);

  const renderGlyph = () => {
    switch (kind) {
      case 'csharp':
        return (
          <>
            <text
              x="8"
              y="11.8"
              fontSize="9.2"
              fontWeight="800"
              fontFamily="sans-serif"
              textAnchor="middle"
              fill="#4caf50"
            >
              C#
            </text>
          </>
        );
      case 'csv':
        return (
          <>
            <rect x="2.5" y="1.8" width="11" height="12.4" rx="1.3" fill="none" stroke="#66bb6a" strokeWidth="1.3" />
            <line x1="4.5" y1="5.5" x2="11.5" y2="5.5" stroke="#66bb6a" strokeWidth="1.2" />
            <line x1="4.5" y1="8.3" x2="11.5" y2="8.3" stroke="#66bb6a" strokeWidth="1.2" />
            <line x1="4.5" y1="11.1" x2="11.5" y2="11.1" stroke="#66bb6a" strokeWidth="1.2" />
            <line x1="7.6" y1="4.5" x2="7.6" y2="12.2" stroke="#66bb6a" strokeWidth="1.1" />
          </>
        );
      case 'python':
        return (
          <>
            <path d="M5.5 2.2H9.8C10.8 2.2 11.5 2.9 11.5 3.9V7.2C11.5 8 10.8 8.6 10 8.6H6C4.7 8.6 3.5 7.7 3.5 6.3V4.4C3.5 3.1 4.4 2.2 5.5 2.2Z" fill="#387eb8" />
            <path d="M10.5 13.8H6.2C5.2 13.8 4.5 13.1 4.5 12.1V8.8C4.5 8 5.2 7.4 6 7.4H10C11.3 7.4 12.5 8.3 12.5 9.7V11.6C12.5 12.9 11.6 13.8 10.5 13.8Z" fill="#ffe052" />
            <circle cx="6.2" cy="4.2" r="0.8" fill="#ffffff" />
            <circle cx="9.8" cy="11.8" r="0.8" fill="#333333" />
          </>
        );
      case 'sql':
        return (
          <>
            <ellipse cx="8" cy="3.6" rx="4.8" ry="1.8" fill="#ffca28" />
            <path d="M3.2 5.4C3.2 6.4 5.35 7.2 8 7.2C10.65 7.2 12.8 6.4 12.8 5.4V7.8C12.8 8.8 10.65 9.6 8 9.6C5.35 9.6 3.2 8.8 3.2 7.8V5.4Z" fill="#ffc107" />
            <path d="M3.2 9.4C3.2 10.4 5.35 11.2 8 11.2C10.65 11.2 12.8 10.4 12.8 9.4V11.8C12.8 12.8 10.65 13.6 8 13.6C5.35 13.6 3.2 12.8 3.2 11.8V9.4Z" fill="#ffb300" />
          </>
        );
      case 'git':
        return (
          <>
            <rect
              x="8"
              y="1.8"
              width="8.8"
              height="8.8"
              rx="1.4"
              transform="rotate(45 8 1.8)"
              fill="#f05033"
            />
            <line x1="6.2" y1="5.2" x2="9.8" y2="8.8" stroke="#ffffff" strokeWidth="1.2" />
            <line x1="8" y1="7" x2="8" y2="10.8" stroke="#ffffff" strokeWidth="1.2" />
            <circle cx="8" cy="7" r="1.1" fill="#ffffff" />
            <circle cx="9.8" cy="8.8" r="1.1" fill="#ffffff" />
            <circle cx="8" cy="10.8" r="1.1" fill="#ffffff" />
          </>
        );
      case 'markdown':
        return (
          <>
            <rect x="1.5" y="3.2" width="13" height="9.6" rx="1.4" fill="none" stroke="#a1887f" strokeWidth="1.3" />
            <text
              x="8"
              y="10.4"
              fontSize="6.6"
              fontWeight="700"
              fontFamily="monospace"
              textAnchor="middle"
              fill="#bcaaa4"
            >
              M↓
            </text>
          </>
        );
      case 'license':
        return (
          <>
            <circle cx="6.2" cy="5.8" r="2.8" fill="none" stroke="#ffb300" strokeWidth="1.6" />
            <line x1="8.2" y1="7.8" x2="12.8" y2="12.4" stroke="#ffb300" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="11.2" y1="10.8" x2="12.8" y2="9.2" stroke="#ffb300" strokeWidth="1.4" strokeLinecap="round" />
          </>
        );
      case 'npm':
        return (
          <>
            <rect x="2" y="2" width="12" height="12" rx="1.2" fill="#cb3837" />
            <path d="M4.5 4.5H11.5V11.5H9.2V6.8H7.5V11.5H4.5V4.5Z" fill="#ffffff" />
          </>
        );
      case 'pnpm':
        return (
          <>
            <rect x="2" y="2" width="5.5" height="5.5" rx="0.6" fill="#f9ad00" />
            <rect x="8.5" y="2" width="5.5" height="5.5" rx="0.6" fill="#f9ad00" />
            <rect x="2" y="8.5" width="5.5" height="5.5" rx="0.6" fill="#f9ad00" />
            <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="0.6" fill="#e0e0e0" />
          </>
        );
      case 'tsconfig':
        return (
          <>
            <text x="7.2" y="11.8" fontSize="8.8" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" fill="#0288d1">
              TS
            </text>
            <circle cx="13.2" cy="4.2" r="1.5" fill="#4fc3f7" />
          </>
        );
      case 'vite':
        return (
          <>
            <text x="4.5" y="11.6" fontSize="9.5" fontWeight="700" fontFamily="monospace" textAnchor="middle" fill="#b388ff">
              (
            </text>
            <polygon points="8.6,3 6.2,8.4 8.2,8.4 7.2,13 10.4,7.4 8.3,7.4" fill="#ffd54f" />
            <text x="11.8" y="11.6" fontSize="9.5" fontWeight="700" fontFamily="monospace" textAnchor="middle" fill="#b388ff">
              )
            </text>
          </>
        );
      case 'typescript':
        return (
          <text x="8" y="11.8" fontSize="9.2" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" fill="#3178c6">
            TS
          </text>
        );
      case 'typescript-react':
      case 'javascript-react': {
        const color = kind === 'typescript-react' ? '#00bcd4' : '#26c6da';
        return (
          <>
            <circle cx="8" cy="8" r="1.5" fill={color} />
            <ellipse cx="8" cy="8" rx="6" ry="2.3" fill="none" stroke={color} strokeWidth="1.1" />
            <ellipse cx="8" cy="8" rx="6" ry="2.3" transform="rotate(60 8 8)" fill="none" stroke={color} strokeWidth="1.1" />
            <ellipse cx="8" cy="8" rx="6" ry="2.3" transform="rotate(120 8 8)" fill="none" stroke={color} strokeWidth="1.1" />
          </>
        );
      }
      case 'javascript':
        return (
          <text x="8" y="11.8" fontSize="9.2" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" fill="#f7df1e">
            JS
          </text>
        );
      case 'json':
        return (
          <text x="8" y="11.5" fontSize="9.5" fontWeight="700" fontFamily="monospace" textAnchor="middle" fill="#fbc02d">
            {'{}'}
          </text>
        );
      case 'yaml':
        return (
          <>
            <line x1="3" y1="5" x2="13" y2="5" stroke="#ef5350" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="6.5" cy="5" r="1.6" fill="#ef5350" />
            <line x1="3" y1="11" x2="13" y2="11" stroke="#42a5f5" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="10" cy="11" r="1.6" fill="#42a5f5" />
          </>
        );
      case 'html':
        return (
          <text x="8" y="11.5" fontSize="8.8" fontWeight="800" fontFamily="monospace" textAnchor="middle" fill="#e44d26">
            {'<>'}
          </text>
        );
      case 'css':
        return (
          <text x="8" y="11.8" fontSize="10" fontWeight="800" fontFamily="monospace" textAnchor="middle" fill="#42a5f5">
            #
          </text>
        );
      case 'shell':
        return (
          <>
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" fill="none" stroke="#90a4ae" strokeWidth="1.2" />
            <text x="8" y="10.4" fontSize="6.8" fontWeight="700" fontFamily="monospace" textAnchor="middle" fill="#81c784">
              {'$_'}
            </text>
          </>
        );
      case 'docker':
        return (
          <>
            <rect x="3.5" y="6" width="2.5" height="2.2" fill="#29b6f6" />
            <rect x="6.5" y="6" width="2.5" height="2.2" fill="#29b6f6" />
            <rect x="6.5" y="3.3" width="2.5" height="2.2" fill="#29b6f6" />
            <path d="M2 8.8H13.8C13.5 11.8 11.2 13.2 7.8 13.2C4.2 13.2 2.2 11.5 2 8.8Z" fill="#0288d1" />
          </>
        );
      case 'go':
        return (
          <text x="8" y="11.5" fontSize="8.5" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" fill="#00add8">
            GO
          </text>
        );
      case 'rust':
        return (
          <text x="8" y="11.5" fontSize="8.5" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" fill="#ff7043">
            RS
          </text>
        );
      case 'java':
        return (
          <text x="8" y="11.5" fontSize="8.2" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" fill="#f44336">
            JV
          </text>
        );
      case 'cpp':
        return (
          <text x="8" y="11.5" fontSize="8.2" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" fill="#5c6bc0">
            C+
          </text>
        );
      case 'ruby':
        return (
          <polygon points="8,2.2 13.2,6.5 8,13.8 2.8,6.5" fill="#e53935" />
        );
      case 'php':
        return (
          <text x="8" y="11.2" fontSize="6.8" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" fill="#9575cd">
            PHP
          </text>
        );
      case 'xml':
        return (
          <text x="8" y="11.4" fontSize="7.8" fontWeight="700" fontFamily="monospace" textAnchor="middle" fill="#ffb74d">
            {'</>'}
          </text>
        );
      case 'image':
        return (
          <>
            <rect x="2" y="2.5" width="12" height="11" rx="1.4" fill="none" stroke="#26a69a" strokeWidth="1.3" />
            <circle cx="5.5" cy="6" r="1.2" fill="#ffca28" />
            <polyline points="2.8,12.2 6.5,8.5 9.2,11 11.2,9.2 13.2,12.2" fill="none" stroke="#26a69a" strokeWidth="1.3" />
          </>
        );
      case 'pdf':
        return (
          <>
            <rect x="2.5" y="1.8" width="11" height="12.4" rx="1.3" fill="none" stroke="#ef5350" strokeWidth="1.3" />
            <text x="8" y="10.2" fontSize="5.4" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" fill="#ef5350">
              PDF
            </text>
          </>
        );
      case 'archive':
        return (
          <>
            <rect x="2.5" y="2" width="11" height="12" rx="1.4" fill="none" stroke="#ffa726" strokeWidth="1.3" />
            <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="#ffa726" strokeWidth="1.4" strokeDasharray="1.5 1.5" />
          </>
        );
      case 'text':
        return (
          <>
            <rect x="2.8" y="1.8" width="10.4" height="12.4" rx="1.2" fill="none" stroke="#90a4ae" strokeWidth="1.2" />
            <line x1="4.8" y1="5.2" x2="11.2" y2="5.2" stroke="#90a4ae" strokeWidth="1.1" />
            <line x1="4.8" y1="8" x2="11.2" y2="8" stroke="#90a4ae" strokeWidth="1.1" />
            <line x1="4.8" y1="10.8" x2="9.2" y2="10.8" stroke="#90a4ae" strokeWidth="1.1" />
          </>
        );
      case 'default':
      default:
        return (
          <path
            d="M3.5 2H9.8L12.8 5V13.2C12.8 13.64 12.44 14 12 14H3.5C3.06 14 2.7 13.64 2.7 13.2V2.8C2.7 2.36 3.06 2 3.5 2Z"
            fill="none"
            stroke="#90a4ae"
            strokeWidth="1.2"
          />
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-testid="file-icon"
      data-icon-kind={kind}
      style={{ flexShrink: 0 }}
    >
      {renderGlyph()}
    </svg>
  );
};
