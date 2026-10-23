/**
 * Lock-screen / Dynamic Island rest timer (iOS Live Activity).
 *
 * The 'widget' function is compiled into its own bundle and rendered natively by SwiftUI, so
 * the countdown keeps ticking while OVRLD is suspended. It can only use @expo/ui components
 * and what arrives in props; nothing else from the app is available inside it.
 * Requires an installed (development or store) build; Expo Go doesn't include the module.
 */
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type RestActivityProps = {
  /** When this rest started and ends, epoch ms */
  startedAt: number;
  endsAt: number;
  /** What's next, e.g. "Incline Barbell Bench Press · set 3" */
  next: string;
};

const RestActivity = (props: RestActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const green = environment.isLuminanceReduced ? '#FFFFFF' : '#2EE07A';
  const range = { lower: new Date(props.startedAt), upper: new Date(props.endsAt) };
  return {
    banner: (
      <HStack modifiers={[padding({ all: 16 })]}>
        <VStack alignment="leading">
          <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(green)]}>REST</Text>
          <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{props.next}</Text>
        </VStack>
        <Spacer />
        <Text timerInterval={range} countsDown modifiers={[font({ size: 36, weight: 'bold' }), monospacedDigit(), foregroundStyle(green)]} />
      </HStack>
    ),
    compactLeading: <Image systemName="timer" color={green} />,
    compactTrailing: <Text timerInterval={range} countsDown modifiers={[monospacedDigit(), foregroundStyle(green)]} />,
    minimal: <Image systemName="timer" color={green} />,
    expandedLeading: <Image systemName="timer" color={green} />,
    expandedTrailing: <Text timerInterval={range} countsDown modifiers={[font({ size: 28, weight: 'bold' }), monospacedDigit(), foregroundStyle(green)]} />,
    expandedBottom: <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{`Up next: ${props.next}`}</Text>,
  };
};

export default createLiveActivity('RestActivity', RestActivity);
