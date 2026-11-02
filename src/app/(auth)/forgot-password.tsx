import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { authErrorKey } from '@/features/auth/errors';
import { FormField } from '@/features/auth/FormField';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas';
import { isSupabaseConfigured, supabase } from '@/shared/lib/supabase';
import { Banner, Button } from '@/shared/ui';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string }>();
  const [serverError, setServerError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: params.email ?? '' },
  });

  const submit = handleSubmit(async ({ email }) => {
    setServerError(null);
    if (!isSupabaseConfigured) return setServerError(t('auth.errors.notConfigured'));

    const { error } = await supabase.auth.resetPasswordForEmail(email);
    // Seule une limite d'envoi est signalée : on ne révèle jamais si l'adresse existe.
    if (error && authErrorKey(error) === 'auth.errors.rateLimited') return setServerError(t('auth.errors.rateLimited'));
    router.push({ pathname: '/reset-password', params: { email } });
  });

  const onSubmit = () => void submit();

  return (
    <AuthLayout title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      {serverError ? <Banner tone="error" message={serverError} /> : null}
      <FormField
        control={control}
        name="email"
        label={t('auth.email')}
        placeholder="nom@exemple.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        onSubmitEditing={onSubmit}
      />
      <Button label={t('auth.sendCode')} fullWidth loading={formState.isSubmitting} onPress={onSubmit} />
    </AuthLayout>
  );
}
