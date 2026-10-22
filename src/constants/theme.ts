/**
 * Overload design tokens. Dark-first athletic look with our own green accent.
 * Light mode is kept for daytime use and follows the system setting.
 */
import { Platform } from 'react-native';

export const Colors = {
  dark: {
    text: '#F3F6F4',
    textSecondary: '#8E9993',
    background: '#0A0C0B',
    backgroundElement: '#141816',
    backgroundSelected: '#1F2522',
    surfaceRaised: '#1A1F1C',
    border: '#252B28',
    accent: '#2EE07A',
    accentDim: '#2EE07A26',
    accentText: '#03140A',
    success: '#2EE07A',
    warning: '#F5C451',
    danger: '#FF5A5F',
    overlay: '#000000B3',
  },
  light: {
    text: '#0D1210',
    textSecondary: '#5E6A64',
    background: '#F4F6F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6EBE8',
    surfaceRaised: '#FFFFFF',
    border: '#DCE2DF',
    accent: '#12A150',
    accentDim: '#12A1501F',
    accentText: '#FFFFFF',
    success: '#12A150',
    warning: '#B7791F',
    danger: '#D64545',
    overlay: '#00000080',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 } as const;

export const MaxContentWidth = 800;
