import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { FormField } from '@/features/auth/FormField';
import { onboardingSchema, type OnboardingInput, type OnboardingValues } from '@/features/auth/schemas';
import { useSaveAccount } from '@/features/accounts/api';
import { useUpdateProfile } from '@/features/profile/api';
import { COUNTRIES, type CountryCode } from '@/shared/config/countries';
import { CURRENCY_CODES } from '@/shared/config/currencies';
import { useLanguage } from '@/shared/i18n';
import { supabase } from '@/shared/lib/supabase';
import { usePreferences } from '@/shared/store/preferences';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Banner, Button, SegmentedControl } from '@/shared/ui';

/** Premier paramétrage après l'inscription : pays, devise, prénom (facultatif). */
export default function OnboardingSetupScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const setCurrencyPreference = usePreferences((s) => s.setCurrency);
  const updateProfile = useUpdateProfile();
  const saveAccount = useSaveAccount();
  const [serverError, setServerError] = useState<string | null>(null);

  const { control, handleSubmit, setValue, formState } = useForm<OnboardingInput, unknown, OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { country: undefined, currency: 'MAD', displayName: '' },
  });
  const country = useWatch({ control, name: 'country' });

  const selectCountry = (code: CountryCode) => {
    setValue('country', code, { shouldValidate: true });
    setValue('currency', COUNTRIES[code].currency); // devise proposée, modifiable
  };

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await updateProfile.mutateAsync({
        country_code: values.country,
        currency_code: values.currency,
        display_name: values.displayName,
        language,
        onboarding_completed_at: new Date().toISOString(),
      });
      setCurrencyPreference(values.currency);
      // Premier compte créé automatiquement, modifiable ensuite (étape 2).
      await saveAccount
        .mutateAsync({ name: t('accounts.defaultCash'), type: 'cash', currency_code: values.currency, initial_balance_minor: 0 })
        .catch(() => undefined);
      // Succès : la navigation vers le tableau de bord est automatique.
    } catch {
      setServerError(t('auth.errors.unknown'));
    }
  });

  const onSubmit = () => void submit();

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
      <AuthLayout title={t('onboarding.title')} subtitle={t('onboarding.subtitle')}>
        {serverError ? <Banner tone="error" message={serverError} /> : null}

        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption" color="textSecondary">
            {t('onboarding.country')}
          </AppText>
          <Controller
            control={control}
            name="country"
            render={({ fieldState }) => (
              <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
                {(Object.keys(COUNTRIES) as CountryCode[]).map((code) => {
                  const selected = country === code;
                  return (
                    <Pressable
                      key={code}
                      accessibilityRole="radio"
                      aria-checked={selected}
                      onPress={() => selectCountry(code)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        padding: spacing.lg,
                        borderRadius: radius.lg,
                        borderWidth: 1.5,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primarySoft : colors.surface,
                      }}
                    >
                      <AppText style={{ fontSize: 28, lineHeight: 34 }}>{COUNTRIES[code].flag}</AppText>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong">{t(`countries.${code}`)}</AppText>
                        <AppText variant="caption" color="textSecondary">
                          {t(`currency.${COUNTRIES[code].currency}`)}
                        </AppText>
                      </View>
                      {selected ? <Check size={20} color={colors.primary} strokeWidth={2.6} /> : null}
                    </Pressable>
                  );
                })}
                {fieldState.error?.message ? (
                  <AppText variant="caption" color="danger">
                    {t(fieldState.error.message as never)}
                  </AppText>
                ) : null}
                <AppText variant="caption" color="textTertiary">
                  {t('onboarding.moreCountries')}
                </AppText>
              </View>
            )}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption" color="textSecondary">
            {t('onboarding.currency')}
          </AppText>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <SegmentedControl
                accessibilityLabel={t('onboarding.currency')}
                value={field.value}
                onChange={field.onChange}
                options={CURRENCY_CODES.map((code) => ({ value: code, label: t(`currency.${code}`) }))}
              />
            )}
          />
        </View>

        <FormField
          control={control}
          name="displayName"
          label={t('onboarding.displayName')}
          hint={t('onboarding.displayNameHint')}
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={60}
        />

        <Button label={t('onboarding.start')} fullWidth loading={formState.isSubmitting} onPress={onSubmit} />
        <Button label={t('settings.signOut')} variant="ghost" fullWidth onPress={() => void supabase.auth.signOut()} />
      </AuthLayout>
    </View>
  );
}
