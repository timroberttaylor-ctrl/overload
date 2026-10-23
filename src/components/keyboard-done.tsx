import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useKeyboardAction } from '@/state/keyboard-action';

/** Shared id: number fields set `inputAccessoryViewID={KEYBOARD_DONE_ID}`. */
export const KEYBOARD_DONE_ID = 'overload-keyboard-done';

/**
 * iOS number and decimal pads have no Return key, so this bar above the keyboard provides it:
 * "Done" closes the keyboard, and the focused field can add a primary action such as "Next"
 * (weight → reps → RPE) or "Log set". Rendered once near the root; on Android the keyboard's
 * own action key does the same job (returnKeyType + onSubmitEditing), so nothing here.
 */
export function KeyboardDoneBar() {
  const t = useTheme();
  const action = useKeyboardAction((s) => s.action);
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={[styles.bar, { backgroundColor: t.backgroundElement, borderTopColor: t.border }]}>
        <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel="Close keyboard" hitSlop={8} style={styles.btn}>
          <Text style={{ color: t.textSecondary, fontWeight: '700', fontSize: 16 }}>Done</Text>
        </Pressable>
        {action ? (
          <Pressable onPress={action.run} accessibilityRole="button" accessibilityLabel={action.label} hitSlop={8} style={[styles.primary, { backgroundColor: t.accent }]}>
            <Text style={{ color: t.accentText, fontWeight: '600', fontSize: 16 }}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 8 },
  btn: { paddingHorizontal: 8, paddingVertical: 6 },
  primary: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
});
