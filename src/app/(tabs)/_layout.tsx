import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useState, type ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/client';
import { needsOnboarding } from '@/db/repositories/onboarding';
import { useTheme } from '@/hooks/use-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const ICONS: Record<string, [IconName, IconName]> = {
  index: ['barbell', 'barbell-outline'],
  programs: ['layers', 'layers-outline'],
  progress: ['stats-chart', 'stats-chart-outline'],
  library: ['library', 'library-outline'],
  settings: ['settings', 'settings-outline'],
};

export default function TabLayout() {
  const t = useTheme();
  // Respect the iPhone home indicator (and Android gesture bar) instead of a fixed height.
  const bottom = useSafeAreaInsets().bottom;
  // Brand-new users get first-run setup; checked once when the tabs mount.
  const [onboard] = useState(() => {
    try {
      return needsOnboarding(getDb());
    } catch {
      return false;
    }
  });
  if (onboard) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { backgroundColor: t.background, borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth, height: 56 + Math.max(bottom, 8), paddingTop: 6, paddingBottom: Math.max(bottom, 8) },
        tabBarIcon: ({ color, focused }) => <Ionicons name={(ICONS[route.name] ?? ['ellipse', 'ellipse-outline'])[focused ? 0 : 1]} size={22} color={color as string} />,
      })}>
      <Tabs.Screen name="index" options={{ title: 'Train' }} />
      <Tabs.Screen name="programs" options={{ title: 'Programs' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
