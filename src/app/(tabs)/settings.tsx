import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';

import { RecoveryDataCard } from '@/components/recovery-data-card';
import { appleHealthAvailable, connectAppleHealth } from '@/integrations/apple-health';
import { checkAndApplyUpdate, updateInfo } from '@/integrations/app-updates';
import { feedbackUrl, PRIVACY_URL, SUPPORT_URL } from '@/constants/links';
import { Body, Button, Card, Eyebrow, H1, H2, Pill, Row, Screen, Small, Toggle } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAppearance } from '@/state/appearance';
import { pickBackup, restoreBackup, shareBackup, shareCsv } from '@/data/share';
import { getDb } from '@/db/client';
import { MEDIA_CREDIT } from '@/db/seed/exercise-media';
import { getSettings, updateSettings, type AppSettings } from '@/db/repositories/settings';
import { useDbQuery } from '@/hooks/use-db-query';

const PLATE_STEPS = [1, 1.25, 2.5, 5];
const CHANGEOVER_STEPS = [0, 10, 15, 20, 30];

export default function SettingsScreen() {
  const t = useTheme();
  const setAppearance = useAppearance((a) => a.setAppearance);
  const [s, refresh] = useDbQuery((db) => getSettings(db));
  const [busy, setBusy] = useState(false);
  if (!s) return null;

  const set = (patch: Partial<AppSettings>) => {
    updateSettings(getDb(), patch);
    refresh();
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(label, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = () =>
    run('Restore', async () => {
      const backup = await pickBackup();
      if (!backup) return;
      const sessions = backup.tables.sessions.length;
      Alert.alert('Replace all data?', `This backup is from ${backup.exportedAt.slice(0, 10)} and contains ${sessions} sessions. Everything currently in the app will be replaced.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => {
            try {
              const { rows } = restoreBackup(getDb(), backup);
              refresh();
              Alert.alert('Restored', `${rows} records restored.`);
            } catch (e) {
              Alert.alert('Restore failed, nothing was changed', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]);
    });

  return (
    <Screen>
      <View>
        <Eyebrow color={t.accent}>Settings</Eyebrow>
        <H1>Preferences</H1>
      </View>

      <RecoveryDataCard />

      {appleHealthAvailable() ? (
        <Card>
          <H2>Apple Health</H2>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <Body style={{ flex: 1 }}>Save finished workouts to Apple Health</Body>
            <Toggle
              value={s.appleHealth}
              onValueChange={(v) => {
                if (!v) return set({ appleHealth: false });
                connectAppleHealth().then((ok) => {
                  if (ok) set({ appleHealth: true });
                  else Alert.alert('Apple Health', 'OVRLD isn’t allowed to save workouts. Turn it on in the Health app: Profile → Apps → OVRLD.');
                });
              }}
            />
          </Row>
          <Small>Each workout is saved as Traditional Strength Training with its start and end time, so it counts toward your Activity rings. OVRLD never reads your Health data.</Small>
        </Card>
      ) : null}

      <Card>
        <H2>Appearance</H2>
        <Row>
          {(['dark', 'light', 'system'] as const).map((a) => (
            <Pill
              key={a}
              label={a === 'system' ? 'Match phone' : a[0].toUpperCase() + a.slice(1)}
              active={s.appearance === a}
              onPress={() => {
                set({ appearance: a });
                setAppearance(a);
              }}
            />
          ))}
        </Row>
      </Card>

      <Card>
        <H2>Units</H2>
        <Row>
          <Pill label="Kilograms" active={s.units === 'kg'} onPress={() => set({ units: 'kg' })} />
          <Pill label="Pounds" active={s.units === 'lb'} onPress={() => set({ units: 'lb' })} />
        </Row>
        <Small>Everything is stored in kg and converted for display, so switching is safe.</Small>
        <Body>Smallest load jump</Body>
        <Row>
          {PLATE_STEPS.map((p) => (
            <Pill key={p} label={`${p} kg`} active={s.plateIncrementKg === p} onPress={() => set({ plateIncrementKg: p })} />
          ))}
        </Row>
      </Card>

      <Card>
        <H2>Workout player</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body style={{ flex: 1 }}>Jump to the next exercise as soon as one is finished</Body>
          <Toggle value={s.autoAdvanceAfterLog} onValueChange={(v) => set({ autoAdvanceAfterLog: v })} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body style={{ flex: 1 }}>Otherwise jump when the rest timer ends</Body>
          <Toggle value={s.autoAdvanceAfterRest} onValueChange={(v) => set({ autoAdvanceAfterRest: v })} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body style={{ flex: 1 }}>Count down the last 5 seconds of rest (the final beep means go)</Body>
          <Toggle value={s.restCountdownSound} onValueChange={(v) => set({ restCountdownSound: v })} />
        </Row>
        <Body>Changeover between superset exercises</Body>
        <Row>
          {CHANGEOVER_STEPS.map((c) => (
            <Pill key={c} label={c ? `${c} s` : 'Off'} active={s.supersetChangeoverS === c} onPress={() => set({ supersetChangeoverS: c })} />
          ))}
        </Row>
        <Small>A short countdown from one superset exercise to the next; the full rest comes after the round.</Small>
      </Card>

      <Card>
        <H2>Your data</H2>
        <Small>Everything lives on this phone. Back up regularly; a backup restores everything.</Small>
        <Button title="Export backup (JSON)" icon="cloud-download-outline" onPress={() => run('Export', () => shareBackup(getDb()))} disabled={busy} />
        <Button title="Export workout log (CSV)" variant="secondary" onPress={() => run('Export', () => shareCsv(getDb()))} disabled={busy} />
        <Button title="Export body weight (CSV)" variant="secondary" onPress={() => run('Export', () => shareCsv(getDb(), 'bodyweights.csv'))} disabled={busy} />
        <Button title="Restore from backup…" variant="ghost" icon="refresh" onPress={restore} disabled={busy} />
      </Card>

      <Card>
        <H2>About</H2>
        <Small>OVRLD doesn’t collect anything: no account, no analytics, no ads. Your training data never leaves this phone unless you export it.</Small>
        <Row>
          <Button compact variant="secondary" icon="shield-checkmark-outline" title="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => Alert.alert('Could not open the privacy policy'))} />
          <Button compact variant="ghost" icon="help-circle-outline" title="Help & support" onPress={() => Linking.openURL(SUPPORT_URL).catch(() => Alert.alert('Could not open the support page'))} />
        </Row>
        <Button
          compact
          variant="secondary"
          icon="chatbubble-ellipses-outline"
          title="Send feedback or report a bug"
          onPress={() =>
            Linking.openURL(feedbackUrl(Constants.expoConfig?.version ?? '', `${Platform.OS} ${Platform.Version}`)).catch(() => Alert.alert('Could not open the feedback page'))
          }
        />
      </Card>

      {updateInfo().enabled ? (
        <Button
          compact
          variant="ghost"
          icon="cloud-download-outline"
          title="Check for updates"
          onPress={() =>
            checkAndApplyUpdate().then((r) => {
              if (r === 'none') Alert.alert('Up to date', 'You have the latest version of OVRLD.');
              else if (r === 'error') Alert.alert('Could not check for updates', 'Check your connection and try again.');
            })
          }
        />
      ) : null}
      <Small>
        OVRLD {Constants.expoConfig?.version ?? ''} · {updateInfo().label} · your data stays on this phone
      </Small>
      <Small>{MEDIA_CREDIT}</Small>
    </Screen>
  );
}
