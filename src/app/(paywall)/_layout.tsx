import { Stack } from 'expo-router';

import { useTheme } from '@/shared/theme/ThemeProvider';

export default function PaywallGroupLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
