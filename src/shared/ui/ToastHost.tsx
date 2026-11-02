import { router } from 'expo-router';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '../store/toast';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

/** Affiche le message éphémère courant, par-dessus l'application. */
export function ToastHost() {
  const { t } = useTranslation();
  const toast = useToast((s) => s.current);
  const dismiss = useToast((s) => s.dismiss);
  const { colors, spacing, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();

  if (!toast) return null;

  const palette = {
    info: { fg: colors.primary, Icon: Info },
    success: { fg: colors.income, Icon: CircleCheck },
    warning: { fg: colors.warning, Icon: TriangleAlert },
    error: { fg: colors.danger, Icon: CircleAlert },
  }[toast.tone];

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.lg, right: spacing.lg }}>
      <Animated.View key={toast.id} entering={FadeInUp.duration(250)} exiting={FadeOutUp.duration(200)}>
        <Pressable
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          onPress={() => {
            dismiss();
            if (toast.href) router.push(toast.href);
          }}
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            alignItems: 'flex-start',
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            borderStartWidth: 4,
            borderStartColor: palette.fg,
            padding: spacing.md,
            boxShadow: mode === 'light' ? '0 8px 28px rgba(22,20,43,0.16)' : '0 8px 28px rgba(0,0,0,0.5)',
          }}
        >
          <palette.Icon size={20} color={palette.fg} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <AppText variant="bodyStrong">{toast.title}</AppText>
            <AppText variant="caption" color="textSecondary">
              {toast.message}
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={dismiss} hitSlop={10}>
            <X size={18} color={colors.textTertiary} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </View>
  );
}
