import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeType = 'light' | 'dark' | string; // Built-in or custom UUID

export interface ThemeColors {
  background: string;
  foreground: string;
  tabBackground: string;
  tabActiveBackground: string;
  tabBorder: string;
  tabHover: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  type: 'light' | 'dark'; // Base Monaco theme type
  colors: ThemeColors;
}

const defaultDark: ThemeColors = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  tabBackground: '#252526',
  tabActiveBackground: '#1e1e1e',
  tabBorder: '#007acc',
  tabHover: '#2d2d2d'
};

const defaultLight: ThemeColors = {
  background: '#fffffe',
  foreground: '#333333',
  tabBackground: '#f3f3f3',
  tabActiveBackground: '#fffffe',
  tabBorder: '#007acc',
  tabHover: '#e8e8e8'
};

interface ThemeContextProps {
  currentTheme: ThemeType;
  colors: ThemeColors;
  setTheme: (theme: ThemeType) => void;
  importThemeFromMain: (newTheme: CustomTheme) => void;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('dark');
  const [customThemes, setCustomThemes] = useState<Record<string, CustomTheme>>({});

  const colors = currentTheme === 'light' 
    ? defaultLight 
    : currentTheme === 'dark' 
      ? defaultDark 
      : customThemes[currentTheme]?.colors || defaultDark;

  const applyNativeTheme = (theme: ThemeType, themes: Record<string, CustomTheme>) => {
    const w = window as any;
    if (!w.electronAPI?.applyNativeTheme) return;
    let mode: 'light' | 'dark';
    if (theme === 'light') mode = 'light';
    else if (theme === 'dark') mode = 'dark';
    else mode = themes[theme]?.type ?? 'dark';
    w.electronAPI.applyNativeTheme(mode);
  };

  const setTheme = (theme: ThemeType) => {
    setCurrentTheme(theme);
    applyNativeTheme(theme, customThemes);
  };

  const importThemeFromMain = (newTheme: CustomTheme) => {
    setCustomThemes(prev => {
      const updated = { ...prev, [newTheme.id]: newTheme };
      applyNativeTheme(newTheme.id, updated);
      return updated;
    });
    setCurrentTheme(newTheme.id);
  };

  useEffect(() => {
    const w = window as any;
    // Restore persisted theme from settings on startup
    if (w.electronAPI?.loadSettings) {
      w.electronAPI.loadSettings().then((settings: { theme?: string | null }) => {
        if (settings?.theme) {
          setCurrentTheme(settings.theme);
          applyNativeTheme(settings.theme, customThemes);
        }
      }).catch(() => {});
    }
    // Listen for theme changes sent via the menu (legacy path)
    if (w.electronAPI?.onThemeChange) {
      w.electronAPI.onThemeChange((themeName: string) => {
        setCurrentTheme(themeName);
        applyNativeTheme(themeName, customThemes);
      });
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ currentTheme, colors, setTheme, importThemeFromMain }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};