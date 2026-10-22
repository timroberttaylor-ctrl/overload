import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Shared id: number fields set `inputAccessoryViewID={KEYBOARD_DONE_ID}`. */
export const KEYBOARD_DONE_ID = 'overload-keyboard-done';

/**
 * iOS number and decimal pads have no Return key, so without this bar the keyboard can't be
 * closed. Rendered once near the root; Android has its own back/close key, so nothing there.
 */
export function KeyboardDoneBar() {
  const t = useTheme();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={[styles.bar, { backgroundColor: t.backgroundElement, borderTopColor: t.border }]}>
        <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel="Close keyboard" hitSlop={8} style={styles.btn}>
          <Text style={{ color: t.accent, fontWeight: '700', fontSize: 16 }}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 8 },
  btn: { paddingHorizontal: 8, paddingVertical: 4 },
});
