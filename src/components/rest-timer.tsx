import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { endRestActivity, startRestActivity, updateRestActivity } from '@/integrations/live-activity';
import { cancelRestAlert, scheduleRestAlert } from '@/integrations/rest-alert';

const TICK = require('../../assets/sounds/rest-tick.wav');
const DONE = require('../../assets/sounds/rest-done.wav');

function beep(p: AudioPlayer) {
  try {
    p.seekTo(0);
    p.play();
  } catch {
    // Sound is a nicety; never break the timer over it.
  }
}

/**
 * Countdown driven by an end timestamp, so it stays correct if the app is backgrounded.
 * A local notification covers the locked-phone case, where the in-app beep can't play.
 */
export function RestTimer({
  endsAt,
  onChange,
  onDone,
  sound = true,
  nextLabel,
}: {
  endsAt: number;
  onChange: (endsAt: number | null) => void;
  onDone: () => void;
  sound?: boolean;
  /** What comes next, for the locked-phone alert ("Bench press · set 3") */
  nextLabel?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const tick = useAudioPlayer(TICK);
  const done = useAudioPlayer(DONE);
  const lastBeep = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    // Mix with (and briefly duck) the lifter's music instead of stopping it.
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      interruptionModeAndroid: 'duckOthers',
    }).catch(() => {});
    return () => clearInterval(id);
  }, []);

  // One alert per end time: re-scheduled on ±15, cancelled on Skip, finish or leaving the workout.
  useEffect(() => {
    const id = scheduleRestAlert(endsAt, nextLabel ? `Up next: ${nextLabel}` : 'Time for your next set.');
    return () => cancelRestAlert(id);
  }, [endsAt, nextLabel]);

  // Lock-screen / Dynamic Island countdown (installed iOS builds): starts with the rest,
  // follows ±15, and disappears when the rest ends, is skipped or the workout closes.
  const [startedAt] = useState(() => Date.now());
  const activity = useRef<ReturnType<typeof startRestActivity>>(null);
  useEffect(() => {
    activity.current = startRestActivity({ startedAt, endsAt, next: nextLabel ?? 'Next set' });
    const handle = activity;
    return () => endRestActivity(handle.current);
    // Start once per rest; later changes go through the update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    updateRestActivity(activity.current, { startedAt, endsAt, next: nextLabel ?? 'Next set' });
  }, [startedAt, endsAt, nextLabel]);

  useEffect(() => {
    if (sound && left >= 1 && left <= 3 && lastBeep.current !== left) {
      lastBeep.current = left;
      beep(tick);
    }
    if (left === 0) {
      if (sound) beep(done);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDone();
    }
  }, [left, onDone, sound, tick, done]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <View style={[styles.bar, { backgroundColor: t.accent, bottom: 12 + insets.bottom }]}>
      <Text style={[styles.time, { color: t.accentText }]} accessibilityRole="timer" accessibilityLabel={`Rest, ${mm} minutes ${left % 60} seconds left`}>
        Rest {mm}:{ss}
      </Text>
      <View style={styles.actions}>
        <Btn label="−15" a11y="Remove 15 seconds" onPress={() => onChange(endsAt - 15_000)} />
        <Btn label="+15" a11y="Add 15 seconds" onPress={() => onChange(endsAt + 15_000)} />
        <Btn label="Skip" a11y="Skip rest" onPress={() => onChange(null)} />
      </View>
    </View>
  );
}

function Btn({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={4} style={[styles.btn, { borderColor: t.accentText }]}>
      <Text style={{ color: t.accentText, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  time: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
