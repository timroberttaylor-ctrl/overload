import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

import { Icon } from './ui';

export type PrToastData = { key: number; title: string; detail: string };

/** Slides in at the top for a few seconds when a set beats your best. */
export function PrToast({ toast, onHide }: { toast: PrToastData | null; onHide: () => void }) {
  const t = useTheme();
  const top = useSafeAreaInsets().top;
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(`${toast.title}. ${toast.detail}`);
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7 }),
      Animated.delay(2600),
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => finished && onHide());
  }, [toast, anim, onHide]);

  if (!toast) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { top: top + 8, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] },
      ]}>
      <View style={[styles.card, { backgroundColor: t.warning }]}>
        <Icon name="trophy" size={22} color="#1A1300" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{toast.title}</Text>
          <Text style={styles.detail}>{toast.detail}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  title: { color: '#1A1300', fontWeight: '700', fontSize: 16 },
  detail: { color: '#1A1300', fontWeight: '600', fontSize: 13, opacity: 0.85 },
});
