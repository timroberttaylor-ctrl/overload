import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { KeyboardDoneBar } from '@/components/keyboard-done';
import { Body, H1, Screen } from '@/components/ui';
import { purgeExportCache } from '@/data/share';
import { getDb } from '@/db/client';
import { initDatabase } from '@/db/init';
import { getSettings } from '@/db/repositories/settings';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { useAppearance } from '@/state/appearance';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useSchemeName();
  const t = useTheme();
  const setAppearance = useAppearance((s) => s.setAppearance);
  const [state, setState] = useState<{ ready: boolean; error?: string }>({ ready: false });

  useEffect(() => {
    // Remove any export files (full data copies) left over from a previous run.
    purgeExportCache(0);
    initDatabase(getDb())
      .then(() => {
        setAppearance(getSettings(getDb()).appearance);
        setState({ ready: true });
      })
      .catch((e: unknown) => setState({ ready: false, error: e instanceof Error ? e.message : String(e) }))
      .finally(() => SplashScreen.hideAsync());
  }, [setAppearance]);

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme: Theme = {
    ...base,
    colors: { ...base.colors, primary: t.accent, background: t.background, card: t.background, text: t.text, border: t.border, notification: t.accent },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {state.error ? (
        <Screen>
          <H1>Could not open your data</H1>
          <Body muted>{state.error}</Body>
        </Screen>
      ) : state.ready ? (
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false, headerTintColor: t.text, headerTitleStyle: { fontWeight: '600' }, headerStyle: { backgroundColor: t.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'OVRLD' }} />
          <Stack.Screen name="program/[id]" options={{ title: '' }} />
          <Stack.Screen name="program/edit" options={{ title: 'Program' }} />
          <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
          <Stack.Screen name="exercise/edit" options={{ title: 'New exercise' }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Workout' }} />
          <Stack.Screen name="session/summary" options={{ title: '', headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="week-review" options={{ title: 'Week review' }} />
          <Stack.Screen name="program/complete" options={{ title: '' }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack>
      ) : null}
      <KeyboardDoneBar />
    </ThemeProvider>
  );
}
