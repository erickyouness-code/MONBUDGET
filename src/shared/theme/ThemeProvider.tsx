import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferences } from '../store/preferences';
import { themes, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(themes.light);

/** Fournit le thème (clair ou sombre) à toute l'application. */
export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const preference = usePreferences((s) => s.theme);
  const mode = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const theme = themes[mode];

  // Thème des barres de navigation, aligné sur nos couleurs.
  const navigationTheme = useMemo(() => {
    const base = mode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.danger,
      },
    };
  }, [mode, theme]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navigationTheme}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        {children}
      </NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
