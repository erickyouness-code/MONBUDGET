import { router } from 'expo-router';
import { Bell, User } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText } from '@/shared/ui';
import { Logo } from '@/shared/ui/Logo';

function RoundButton({ label, onPress, children }: { label: string; onPress?: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      {children}
    </Pressable>
  );
}

export function DashboardHeader() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Logo />
        <AppText variant="headline" style={{ letterSpacing: 0.3 }}>
          {t('common.appName')}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <RoundButton label={t('dashboard.notifications')}>
          <Bell size={19} color={colors.text} />
        </RoundButton>
        <RoundButton label={t('dashboard.openSettings')} onPress={() => router.push('/settings')}>
          <User size={19} color={colors.text} />
        </RoundButton>
      </View>
    </View>
  );
}
