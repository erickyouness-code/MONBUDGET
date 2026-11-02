import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { authErrorKey } from '@/features/auth/errors';
import { FormField } from '@/features/auth/FormField';
import { signInSchema, type SignInValues } from '@/features/auth/schemas';
import { isSupabaseConfigured, supabase } from '@/shared/lib/supabase';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { Banner, Button } from '@/shared/ui';

export default function SignInScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [serverError, setServerError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);

  const { control, handleSubmit, formState, getValues } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    setUnconfirmedEmail(null);
    if (!isSupabaseConfigured) return setServerError(t('auth.errors.notConfigured'));

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const key = authErrorKey(error);
      if (key === 'auth.errors.emailNotConfirmed') setUnconfirmedEmail(email);
      return setServerError(t(key));
    }
    // Succès : la navigation vers l'application est automatique.
  });

  const confirmEmail = async () => {
    if (!unconfirmedEmail) return;
    await supabase.auth.resend({ type: 'signup', email: unconfirmedEmail });
    router.push({ pathname: '/verify', params: { email: unconfirmedEmail } });
  };

  const onSubmit = () => void submit();

  return (
    <AuthLayout title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')}>
      {serverError ? <Banner tone="error" message={serverError} /> : null}
      {unconfirmedEmail ? <Button label={t('auth.enterCode')} variant="secondary" fullWidth onPress={confirmEmail} /> : null}
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
          password
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={onSubmit}
        />
      </View>
      <Button
        label={t('auth.forgotPassword')}
        variant="ghost"
        onPress={() => router.push({ pathname: '/forgot-password', params: { email: getValues('email') } })}
      />
      <Button label={t('auth.signInAction')} fullWidth loading={formState.isSubmitting} onPress={onSubmit} />
      <Button label={t('auth.goToSignUp')} variant="ghost" fullWidth onPress={() => router.replace('/sign-up')} />
    </AuthLayout>
  );
}
