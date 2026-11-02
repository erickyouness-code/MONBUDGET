import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { authErrorKey } from '@/features/auth/errors';
import { FormField } from '@/features/auth/FormField';
import { signUpSchema, type SignUpValues } from '@/features/auth/schemas';
import { useLanguage } from '@/shared/i18n';
import { isSupabaseConfigured, supabase } from '@/shared/lib/supabase';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Banner, Button } from '@/shared/ui';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const language = useLanguage();
  const [serverError, setServerError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    if (!isSupabaseConfigured) return setServerError(t('auth.errors.notConfigured'));

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { language } },
    });
    if (error) return setServerError(t(authErrorKey(error)));

    // Si la confirmation par e-mail est activée, il faut saisir le code reçu.
    if (!data.session) router.push({ pathname: '/verify', params: { email } });
  });

  const onSubmit = () => void submit();

  return (
    <AuthLayout title={t('auth.signUpTitle')} subtitle={t('auth.signUpSubtitle')}>
      {serverError ? <Banner tone="error" message={serverError} /> : null}
      <View style={{ gap: spacing.lg }}>
        <FormField
          control={control}
          name="email"
          label={t('auth.email')}
          placeholder="nom@exemple.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <FormField
          control={control}
          name="password"
          label={t('auth.password')}
          hint={t('auth.passwordRules')}
          password
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={onSubmit}
        />
      </View>
      <Button label={t('auth.signUpAction')} fullWidth loading={formState.isSubmitting} onPress={onSubmit} />
      <AppText variant="caption" color="textTertiary" align="center">
        {t('auth.legalNotice')}
      </AppText>
      <Button label={t('auth.goToSignIn')} variant="ghost" fullWidth onPress={() => router.replace('/sign-in')} />
    </AuthLayout>
  );
}
