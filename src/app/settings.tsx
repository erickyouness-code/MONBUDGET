import Constants from 'expo-constants';
import { LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency, useUpdateProfile } from '@/features/profile/api';
import { CURRENCY_CODES, type CurrencyCode } from '@/shared/config/currencies';
import { deviceLanguageCode } from '@/shared/i18n';
import { LANGUAGES, LANGUAGE_NATIVE_NAMES, resolveLanguage, type Language } from '@/shared/i18n/languages';
import { useChangeLanguage } from '@/shared/i18n/useChangeLanguage';
import { supabase } from '@/shared/lib/supabase';
import { usePreferences, type ThemePreference } from '@/shared/store/preferences';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Banner, Button, Card, Screen, SegmentedControl } from '@/shared/ui';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const { session } = useAuth();
  const { theme, language, demoMode, setTheme, setCurrency, setDemoMode } = usePreferences();
  const currency = useCurrency();
  const updateProfile = useUpdateProfile();
  const changeLanguage = useChangeLanguage();
  const [signingOut, setSigningOut] = useState(false);

  const onLanguage = (value: Language | 'auto') => {
    const choice = value === 'auto' ? null : value;
    // On enregistre d'abord dans le profil (un redémarrage peut suivre).
    updateProfile.mutate({ language: resolveLanguage(choice, deviceLanguageCode()) });
    void changeLanguage(choice);
  };

  const onCurrency = (value: CurrencyCode) => {
    setCurrency(value);
    updateProfile.mutate({ currency_code: value });
  };

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
  };

  return (
    <Screen safeTop={false}>
      {updateProfile.isError ? <Banner tone="error" message={t('errors.saveFailed')} /> : null}

      <Section title={t('settings.account')}>
        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xxs }}>
            <AppText variant="caption" color="textTertiary">
              {t('auth.email')}
            </AppText>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {session?.user.email ?? '—'}
            </AppText>
          </View>
          <Button label={t('settings.signOut')} icon={LogOut} variant="secondary" loading={signingOut} onPress={signOut} />
        </Card>
      </Section>

      <Section title={t('settings.language')}>
        <SegmentedControl<Language | 'auto'>
          accessibilityLabel={t('settings.language')}
          value={language ?? 'auto'}
          onChange={onLanguage}
          options={[
            { value: 'auto', label: t('settings.languageAuto') },
            ...LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NATIVE_NAMES[code] })),
          ]}
        />
      </Section>

      <Section title={t('settings.theme')}>
        <SegmentedControl<ThemePreference>
          accessibilityLabel={t('settings.theme')}
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
        />
      </Section>

      <Section title={t('settings.currency')} hint={t('settings.currencyHint')}>
        <SegmentedControl<CurrencyCode>
          accessibilityLabel={t('settings.currency')}
          value={currency}
          onChange={onCurrency}
          options={CURRENCY_CODES.map((code) => ({ value: code, label: t(`currency.${code}`) }))}
        />
        <Card tone="muted" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
          <AppText variant="caption" color="textSecondary">
            {t('settings.preview')}
          </AppText>
          <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
            <AmountText amountMinor={currency === 'MAD' ? 1250050 : 1250000} currency={currency} signDisplay="always" color="income" />
            <AmountText amountMinor={currency === 'MAD' ? -34575 : -34500} currency={currency} color="expense" />
          </View>
        </Card>
      </Section>

      <Section title={t('settings.demoMode')} hint={t('settings.demoHint')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md }}>
          <AppText variant="bodyStrong">{t('settings.demoMode')}</AppText>
          <Switch
            accessibilityLabel={t('settings.demoMode')}
            value={demoMode}
            onValueChange={setDemoMode}
            trackColor={{ true: colors.primary, false: colors.surfaceMuted }}
            thumbColor={colors.surface}
          />
        </Card>
      </Section>

      <AppText variant="caption" color="textTertiary" align="center">
        {t('settings.version', { version: Constants.expoConfig?.version ?? '—' })}
      </AppText>
    </Screen>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="overline" color="textSecondary">
        {title.toUpperCase()}
      </AppText>
      {children}
      {hint ? (
        <AppText variant="caption" color="textTertiary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
