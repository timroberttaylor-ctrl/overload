import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Body, Button, Card, Display, Eyebrow, H1, H2, Icon, type IconName, Pill, Row, Screen, Small, Tag } from '@/components/ui';
import { isoDate } from '@/core/dates';
import { recommendPrograms, type Equipment, type Experience, type SetupAnswers, type TrainingGoal } from '@/core/recommend';
import type { WeightUnit } from '@/core/units';
import { getDb } from '@/db/client';
import { startProgram } from '@/db/repositories/enrolments';
import { finishOnboarding } from '@/db/repositories/onboarding';
import { listTemplates } from '@/db/repositories/programs';
import { updateSettings } from '@/db/repositories/settings';
import { useTheme } from '@/hooks/use-theme';

type Choice<T> = { value: T; label: string; detail: string; icon: IconName };

const EXPERIENCE: Choice<Experience>[] = [
  { value: 'new', label: 'New to lifting', detail: 'Under 6 months of regular training', icon: 'leaf-outline' },
  { value: 'some', label: 'Some experience', detail: '6 months to 2 years', icon: 'barbell-outline' },
  { value: 'experienced', label: 'Experienced', detail: '2+ years and you know your numbers', icon: 'flame-outline' },
];
const GOALS: Choice<TrainingGoal>[] = [
  { value: 'muscle', label: 'Build muscle', detail: 'Size and shape first', icon: 'body-outline' },
  { value: 'strength', label: 'Get stronger', detail: 'Bigger numbers on the main lifts', icon: 'trending-up' },
  { value: 'both', label: 'Both', detail: 'A bit of each', icon: 'git-merge-outline' },
];
const EQUIPMENT: Choice<Equipment>[] = [
  { value: 'gym', label: 'Full gym', detail: 'Barbells, machines and cables', icon: 'business-outline' },
  { value: 'dumbbells', label: 'Dumbbells only', detail: 'Home, hotel or a small gym', icon: 'home-outline' },
];
const STEPS = 4;

function Option<T>({ c, active, onPress }: { c: Choice<T>; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={`${c.label}. ${c.detail}`}>
      <Card style={active ? { borderColor: t.accent, borderWidth: 1.5 } : undefined}>
        <Row gap={12} style={{ flexWrap: 'nowrap' }}>
          <Icon name={c.icon} size={22} color={active ? t.accent : t.textSecondary} />
          <View style={{ flex: 1 }}>
            <H2>{c.label}</H2>
            <Small>{c.detail}</Small>
          </View>
          {active ? <Icon name="checkmark-circle" size={22} color={t.accent} /> : null}
        </Row>
      </Card>
    </Pressable>
  );
}

/** First-run setup: units, experience, schedule and goal, then a program suggestion. */
export default function WelcomeScreen() {
  const t = useTheme();
  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [a, setA] = useState<SetupAnswers>({ experience: 'some', days: 4, goal: 'muscle', equipment: 'gym' });
  const set = (patch: Partial<SetupAnswers>) => setA((x) => ({ ...x, ...patch }));

  const done = (to: '/' | '/programs') => {
    try {
      finishOnboarding(getDb());
    } catch {
      // Not being able to save the flag only means setup shows again next launch.
    }
    router.replace(to);
  };
  const skip = () => done('/');
  const saveUnits = () => {
    try {
      updateSettings(getDb(), { units: unit });
    } catch {
      // Units can still be changed in Settings.
    }
  };
  const next = () => {
    if (step === 1) saveUnits();
    setStep((s) => s + 1);
  };
  const start = (templateId: string) => {
    try {
      startProgram(getDb(), templateId, isoDate());
      done('/');
    } catch (e) {
      Alert.alert('Could not start the program', e instanceof Error ? e.message : String(e));
    }
  };

  const picks = step === STEPS ? recommendPrograms(listTemplates(getDb()), a) : [];

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6}>
          {Array.from({ length: STEPS + 1 }, (_, i) => (
            <View key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i <= step ? t.accent : t.backgroundSelected }} />
          ))}
        </Row>
        {step < STEPS ? (
          <Pressable onPress={skip} accessibilityRole="button" hitSlop={10}>
            <Small style={{ fontWeight: '700' }}>Skip</Small>
          </Pressable>
        ) : null}
      </Row>

      {step === 0 ? (
        <View style={{ gap: 16, paddingTop: 40 }}>
          <Eyebrow color={t.accent}>Welcome to OVRLD</Eyebrow>
          <Display>Train smarter. Lift more.</Display>
          <Body muted>Pick a program and every set comes with a target. Hit it, and the next one goes up. Each week, a short review adjusts the plan to how training is going.</Body>
          <Body muted>Everything stays on this phone. No account needed.</Body>
          <Small>Four quick questions and we&apos;ll suggest a program.</Small>
          <Button title="Get started" icon="arrow-forward" onPress={next} />
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: 12 }}>
          <H1>Kilograms or pounds?</H1>
          <Small>Used for every weight in the app. You can change it in Settings.</Small>
          <Row>
            <Pill label="Kilograms (kg)" active={unit === 'kg'} onPress={() => setUnit('kg')} />
            <Pill label="Pounds (lb)" active={unit === 'lb'} onPress={() => setUnit('lb')} />
          </Row>
          <Button title="Next" onPress={next} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: 12 }}>
          <H1>How long have you been lifting?</H1>
          {EXPERIENCE.map((c) => (
            <Option key={c.value} c={c} active={a.experience === c.value} onPress={() => set({ experience: c.value })} />
          ))}
          <Button title="Next" onPress={next} />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: 12 }}>
          <H1>Your week</H1>
          <Small>Days you can train most weeks</Small>
          <Row>
            {[2, 3, 4, 5, 6].map((d) => (
              <Pill key={d} label={`${d} days`} active={a.days === d} onPress={() => set({ days: d })} />
            ))}
          </Row>
          <Small>Main goal</Small>
          {GOALS.map((c) => (
            <Option key={c.value} c={c} active={a.goal === c.value} onPress={() => set({ goal: c.value })} />
          ))}
          <Small>Where you train</Small>
          {EQUIPMENT.map((c) => (
            <Option key={c.value} c={c} active={a.equipment === c.value} onPress={() => set({ equipment: c.value })} />
          ))}
          <Button title="Show my programs" onPress={next} />
        </View>
      ) : null}

      {step === STEPS ? (
        <View style={{ gap: 12 }}>
          <H1>Programs for you</H1>
          <Small>Best fit first. You can switch programs any time; your history comes with you.</Small>
          {picks.map((p, i) => (
            <Card key={p.id} raised style={i === 0 ? { borderColor: t.accent, borderWidth: 1.5 } : undefined}>
              <Row gap={6}>
                {i === 0 ? <Tag label="Best fit" tone="accent" /> : null}
                <Tag label={p.level} tone={p.level === 'advanced' ? 'warning' : 'neutral'} />
                <Tag label={`${p.daysPerWeek} days / wk`} />
              </Row>
              <H2 style={{ fontSize: 20 }}>{p.name}</H2>
              <Body muted>{p.summary}</Body>
              <Button title="Start this program" icon="play" variant={i === 0 ? 'primary' : 'secondary'} onPress={() => start(p.id)} />
            </Card>
          ))}
          <Button title="Browse all programs" variant="ghost" onPress={() => done('/programs')} />
          <Pressable onPress={() => setStep(3)} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
            <Small style={{ fontWeight: '700' }}>Change my answers</Small>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}
