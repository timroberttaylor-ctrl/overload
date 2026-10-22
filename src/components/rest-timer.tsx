import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

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

/** Countdown driven by an end timestamp, so it stays correct if the app is backgrounded. */
export function RestTimer({ endsAt, onChange, onDone, sound = true }: { endsAt: number; onChange: (endsAt: number | null) => void; onDone: () => void; sound?: boolean }) {
  const t = useTheme();
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

  useEffect(() => {
    if (sound && left >= 1 && left <= 3 && lastBeep.current !== left) {
      lastBeep.current = left;
      beep(tick);
    }
    if (left === 0) {
      if (sound) beep(done);
      Vibration.vibrate([0, 250, 120, 250]);
      onDone();
    }
  }, [left, onDone, sound, tick, done]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <View style={[styles.bar, { backgroundColor: t.accent }]}>
      <Text style={[styles.time, { color: t.accentText }]}>
        Rest {mm}:{ss}
      </Text>
      <View style={styles.actions}>
        <Btn label="−15" onPress={() => onChange(endsAt - 15_000)} />
        <Btn label="+15" onPress={() => onChange(endsAt + 15_000)} />
        <Btn label="Skip" onPress={() => onChange(null)} />
      </View>
    </View>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.btn, { borderColor: t.accentText }]}>
      <Text style={{ color: t.accentText, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 6,
  },
  time: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
