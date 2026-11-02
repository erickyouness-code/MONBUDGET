import { router } from 'expo-router';
import { ChartPie, ShieldCheck, Sparkles, Target, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLanguage } from '@/shared/i18n';
import { LANGUAGES, LANGUAGE_NATIVE_NAMES } from '@/shared/i18n/languages';
import { useChangeLanguage } from '@/shared/i18n/useChangeLanguage';
import { isSupabaseConfigured } from '@/shared/lib/supabase';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Banner, Button } from '@/shared/ui';
import { Logo } from '@/shared/ui/Logo';

/** Premier écran : présentation, choix de la langue, inscription ou connexion. */
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const changeLanguage = useChangeLanguage();

  const features: { icon: LucideIcon; text: string }[] = [
    { icon: ChartPie, text: t('welcome.feature1') },
    { icon: Target, text: t('welcome.feature2') },
    { icon: Sparkles, text: t('welcome.feature3') },
    { icon: ShieldCheck, text: t('welcome.feature4') },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingHorizontal: spacing.xl,
        gap: spacing.xxl,
      }}
    >
      {/* Choix de la langue, avant même de créer un compte */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xs }} accessibilityRole="radiogroup">
        {LANGUAGES.map((code) => {
          const selected = code === language;
          return (
            <Pressable
              key={code}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => void changeLanguage(code)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.primarySoft : 'transparent',
              }}
            >
              <AppText variant="caption" color={selected ? 'primary' : 'textTertiary'}>
                {LANGUAGE_NATIVE_NAMES[code]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <Animated.View entering={FadeInDown.duration(450)} style={{ gap: spacing.lg, marginTop: spacing.xl }}>
        <Logo size={56} />
        <AppText variant="display">{t('welcome.title')}</AppText>
        <AppText variant="body" color="textSecondary">
          {t('welcome.subtitle')}
        </AppText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(450)} style={{ gap: spacing.md }}>
        {features.map(({ icon: Icon, text }) => (
          <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.md,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={18} color={colors.primary} />
            </View>
            <AppText variant="body" style={{ flex: 1 }}>
              {text}
            </AppText>
          </View>
        ))}
      </Animated.View>

      <View style={{ flex: 1 }} />

      <Animated.View entering={FadeInDown.delay(200).duration(450)} style={{ gap: spacing.md }}>
        {!isSupabaseConfigured ? <Banner tone="info" message={t('auth.errors.notConfigured')} /> : null}
        <Button label={t('welcome.createAccount')} fullWidth onPress={() => router.push('/sign-up')} />
        <Button label={t('welcome.haveAccount')} variant="secondary" fullWidth onPress={() => router.push('/sign-in')} />
      </Animated.View>
    </ScrollView>
  );
}
