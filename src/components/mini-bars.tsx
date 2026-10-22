import { View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { Small } from './ui';

/** Tiny dependency-free bar chart (oldest → newest). Proper charts come with the UI pass. */
export function MiniBars({ values, labels, height = 80 }: { values: number[]; labels?: string[]; height?: number }) {
  const t = useTheme();
  if (!values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const floor = min - (max - min || max * 0.1) * 0.5;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        {values.map((v, i) => (
          <View
            key={i}
            accessibilityLabel={labels?.[i]}
            style={{ flex: 1, height: Math.max(4, ((v - floor) / (max - floor || 1)) * height), backgroundColor: i === values.length - 1 ? t.accent : t.backgroundSelected, borderRadius: 3 }}
          />
        ))}
      </View>
      {labels ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Small>{labels[0]}</Small>
          <Small>{labels[labels.length - 1]}</Small>
        </View>
      ) : null}
    </View>
  );
}
