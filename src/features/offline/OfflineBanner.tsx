import { onlineManager } from '@tanstack/react-query';
import { CloudOff } from 'lucide-react-native';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';

import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText } from '@/shared/ui';

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/** Petit bandeau en bas de l'écran quand le téléphone n'a plus de connexion. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const { session } = useAuth();
  if (online || !session) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: insets.bottom + 84, alignItems: 'center' }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.text,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          opacity: 0.94,
        }}
      >
        <CloudOff size={16} color={colors.background} />
        <AppText variant="small" style={{ color: colors.background, flexShrink: 1 }}>
          {t('offline.banner')}
        </AppText>
      </View>
    </View>
  );
}
