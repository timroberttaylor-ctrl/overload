import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { Button, H2, Row, Small } from './ui';

/** Bottom sheet for writing a short note. `initial` pre-fills it; saving an empty note clears it. */
export function NoteSheet({
  visible,
  title,
  subtitle,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  initial: string | null;
  onSave: (note: string | null) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [text, setText] = useState(initial ?? '');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => setText(initial ?? '')}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: t.backgroundElement }]}>
          <H2>{title}</H2>
          {subtitle ? <Small>{subtitle}</Small> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="e.g. left shoulder felt off on the last rep"
            placeholderTextColor={t.textSecondary}
            multiline
            autoFocus
            maxLength={280}
            style={{ minHeight: 90, color: t.text, backgroundColor: t.backgroundSelected, borderRadius: 10, padding: 12, textAlignVertical: 'top', fontSize: 15 }}
          />
          <Small>{text.length}/280 · Notes show next time you do this exercise and in your week review.</Small>
          <Row>
            <Button title="Save note" icon="checkmark" onPress={() => onSave(text.trim() || null)} style={{ flex: 1 }} />
            {initial ? <Button title="Delete" variant="ghost" onPress={() => onSave(null)} /> : null}
            <Button title="Cancel" variant="secondary" onPress={onClose} />
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008' },
  sheet: { padding: 16, paddingBottom: 28, gap: 10, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
});
