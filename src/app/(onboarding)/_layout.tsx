import { Stack } from 'expo-router';

import { useTheme } from '@/shared/theme/ThemeProvider';

export default function OnboardingGroupLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
