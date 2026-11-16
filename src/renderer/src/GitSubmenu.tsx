import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ThemeColors } from './theme/ThemeContext';
import { getGitMenuItems, type GitMenuAction, type GitTarget } from './gitMenu';

interface GitSubmenuProps {
  target: GitTarget;
  colors: ThemeColors;
  onPick: (action: GitMenuAction, target: GitTarget) => void;
}

const itemStyle = (colors: ThemeColors): React.CSSProperties => ({
  padding: '7px 14px',
  cursor: 'pointer',
  fontSize: '13px',
  color: colors.foreground,
  backgroundColor: 'transparent',
  whiteSpace: 'nowrap',
});

const hover = (colors: ThemeColors) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.backgroundColor = colors.tabHover;
  },
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
  },
});

/** "Git ▸" entry of the Explorer context menu with a TortoiseGit-style flyout. */
export const GitSubmenu: React.FC<GitSubmenuProps> = ({ target, colors, onPick }) => {
  const [open, setOpen] = useState(false);
  const [shiftUp, setShiftUp] = useState(0);
  const [openLeft, setOpenLeft] = useState(false);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const items = getGitMenuItems(target);

  // Keep the flyout inside the window when the menu opens near the bottom or right edge.
  useLayoutEffect(() => {
    if (!open || !flyoutRef.current) return;
    const rect = flyoutRef.current.getBoundingClientRect();
    const overflow = rect.bottom - window.innerHeight + 8;
    if (overflow > 0) setShiftUp(prev => prev + overflow);
    if (rect.right > window.innerWidth - 4) setOpenLeft(true);
  }, [open]);

  return (
    <div
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={open}
      data-testid="explorer-context-git"
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = colors.tabHover;
        setOpen(true);
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'transparent';
        setOpen(false);
        setShiftUp(0);
        setOpenLeft(false);
      }}
      onClick={() => setOpen(true)}
      style={{ ...itemStyle(colors), position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}
    >
      <span style={{ flex: 1 }}>Git</span>
      <ChevronRight size={14} style={{ opacity: 0.7 }} />
      {open && (
        <div
          ref={flyoutRef}
          role="menu"
          aria-label="Git"
          data-testid="explorer-git-submenu"
          style={{
            position: 'absolute',
            ...(openLeft ? { right: '100%' } : { left: '100%' }),
            top: -4 - shiftUp,
            zIndex: 10000,
            backgroundColor: colors.background,
            border: `1px solid ${colors.tabHover}`,
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            minWidth: '190px',
            padding: '4px 0',
          }}
        >
          {items.map((item, i) =>
            item === 'separator' ? (
              <div key={`sep-${i}`} style={{ height: '1px', margin: '4px 0', backgroundColor: colors.tabHover }} />
            ) : (
              <div
                key={item.action}
                role="menuitem"
                data-testid={`explorer-git-${item.action}`}
                onClick={e => {
                  e.stopPropagation();
                  onPick(item.action, target);
                }}
                {...hover(colors)}
                style={itemStyle(colors)}
              >
                {item.label}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
};

export default GitSubmenu;
