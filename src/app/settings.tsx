import Constants from 'expo-constants';
import { router } from 'expo-router';
import { LogOut, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Switch, View } from 'react-native';

import { useAccounts } from '@/features/accounts/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency, useUpdateProfile } from '@/features/profile/api';
import { useEntitlement, useSyncEntitlement } from '@/features/subscription/api';
import { statusLine } from '@/features/subscription/logic';
import { openManageSubscription, restore } from '@/features/subscription/purchases';
import { useLanguage , deviceLanguageCode } from '@/shared/i18n';
import { formatDayShort } from '@/shared/lib/dates';
import { CURRENCY_CODES, type CurrencyCode } from '@/shared/config/currencies';
import { LANGUAGES, LANGUAGE_NATIVE_NAMES, resolveLanguage, type Language } from '@/shared/i18n/languages';
import { useChangeLanguage } from '@/shared/i18n/useChangeLanguage';
import { getNotificationAccess, requestNotificationAccess, type NotificationAccess } from '@/shared/lib/notifications';
import { supabase } from '@/shared/lib/supabase';
import { usePreferences, type ThemePreference } from '@/shared/store/preferences';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Banner, Button, Card, ListRow, Screen, SegmentedControl } from '@/shared/ui';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const { session } = useAuth();
  const { theme, language, demoMode, setTheme, setCurrency, setDemoMode } = usePreferences();
  const currency = useCurrency();
  const accounts = useAccounts();
  // Version 1 : une seule devise. Elle est figée dès qu'un compte existe,
  // pour que tous les montants restent cohérents.
  const currencyLocked = (accounts.data?.length ?? 0) > 0;
  const updateProfile = useUpdateProfile();
  const changeLanguage = useChangeLanguage();
  const [signingOut, setSigningOut] = useState(false);
  const uiLanguage = useLanguage();
  const entitlement = useEntitlement();
  const syncEntitlement = useSyncEntitlement();
  const [restoring, setRestoring] = useState(false);
  const status = entitlement.data ? statusLine(entitlement.data) : null;
  const statusText = !status
    ? '…'
    : status.key === 'trial'
      ? t(status.willRenew ? 'settings.subTrial' : 'settings.subTrialCancelled', { date: formatDayShort(status.date, uiLanguage) })
      : status.key === 'renews'
        ? t('settings.subRenews', { date: formatDayShort(status.date, uiLanguage) })
        : status.key === 'endsOn'
          ? t('settings.subEndsOn', { date: formatDayShort(status.date, uiLanguage) })
          : status.key === 'expired'
            ? t('settings.subExpired')
            : t('settings.subNone');
  const notificationsOn = usePreferences((s) => s.notifications);
  const setNotifications = usePreferences((s) => s.setNotifications);
  const [access, setAccess] = useState<NotificationAccess>('undetermined');

  useEffect(() => {
    void getNotificationAccess().then(setAccess);
  }, []);

  const toggleNotifications = async (value: boolean) => {
    setNotifications(value);
    if (value) setAccess(await requestNotificationAccess());
  };

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

      <Section title={t('settings.subscription')}>
        <Card style={{ gap: spacing.md }}>
          <AppText variant="bodyStrong">{statusText}</AppText>
          {entitlement.data?.billingIssue ? <Banner tone="error" message={t('settings.billingIssue')} /> : null}
          {entitlement.data?.active ? (
            <Button label={t('settings.manageSubscription')} variant="secondary" onPress={() => void openManageSubscription()} />
          ) : (
            <Button label={t('settings.seeOffer')} variant="secondary" onPress={() => router.back()} />
          )}
          <Button
            label={t('premium.restore')}
            variant="ghost"
            loading={restoring}
            onPress={async () => {
              setRestoring(true);
              await restore();
              await syncEntitlement();
              setRestoring(false);
            }}
          />
          <AppText variant="small" color="textTertiary">
            {t('settings.cancelHint')}
          </AppText>
        </Card>
      </Section>

      <Card style={{ paddingVertical: spacing.xs }}>
        <ListRow icon={Wallet} title={t('accounts.title')} description={t('accounts.subtitle')} onPress={() => router.push('/accounts')} />
      </Card>

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

      <Section title={t('settings.currency')} hint={currencyLocked ? t('settings.currencyLocked') : t('settings.currencyHint')}>
        <SegmentedControl<CurrencyCode>
          accessibilityLabel={t('settings.currency')}
          value={currency}
          onChange={(value) => {
            if (!currencyLocked) onCurrency(value);
          }}
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

      <Section title={t('settings.notifications')} hint={t('settings.notificationsHint')}>
        <Card style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="bodyStrong">{t('settings.reminders')}</AppText>
            <Switch
              accessibilityLabel={t('settings.reminders')}
              value={notificationsOn && access !== 'unsupported'}
              disabled={access === 'unsupported'}
              onValueChange={(v) => void toggleNotifications(v)}
              trackColor={{ true: colors.primary, false: colors.surfaceMuted }}
              thumbColor={colors.surface}
            />
          </View>
          {access === 'unsupported' ? (
            <AppText variant="small" color="textTertiary">
              {t('settings.notificationsWeb')}
            </AppText>
          ) : access === 'denied' && notificationsOn ? (
            <>
              <AppText variant="small" color="warning">
                {t('settings.notificationsDenied')}
              </AppText>
              <Button label={t('settings.openPhoneSettings')} variant="secondary" onPress={() => void Linking.openSettings()} />
            </>
          ) : null}
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
