import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { authErrorKey } from '@/features/auth/errors';
import { FormField } from '@/features/auth/FormField';
import { verifySchema, type VerifyValues } from '@/features/auth/schemas';
import { supabase } from '@/shared/lib/supabase';
import { Banner, Button } from '@/shared/ui';

const RESEND_DELAY = 60;

/** Saisie du code de confirmation reçu par e-mail après l'inscription. */
export default function VerifyScreen() {
  const { t } = useTranslation();
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_DELAY);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const { control, handleSubmit, formState } = useForm<VerifyValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: '' },
  });

  const submit = handleSubmit(async ({ code }) => {
    setServerError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
    if (error) return setServerError(t(authErrorKey(error)));
    // Succès : une session est ouverte, la navigation suit automatiquement.
  });

  const resend = async () => {
    setServerError(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return setServerError(t(authErrorKey(error)));
    setInfo(t('auth.codeResent'));
    setCooldown(RESEND_DELAY);
  };

  const onSubmit = () => void submit();

  return (
    <AuthLayout title={t('auth.verifyTitle')} subtitle={email ? t('auth.verifySubtitle', { email }) : t('auth.verifySubtitleGeneric')}>
      {serverError ? <Banner tone="error" message={serverError} /> : null}
      {info ? <Banner tone="success" message={info} /> : null}
      <FormField
        control={control}
        name="code"
        label={t('auth.code')}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={10}
        onSubmitEditing={onSubmit}
      />
      <Button label={t('auth.verifyAction')} fullWidth loading={formState.isSubmitting} onPress={onSubmit} />
      <Button
        label={cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
        variant="ghost"
        fullWidth
        disabled={cooldown > 0 || !email}
        onPress={resend}
      />
      {/* Toujours une issue : revenir à la connexion (adresse perdue, code jamais reçu…). */}
      <Button label={t('auth.goToSignIn')} variant="ghost" fullWidth onPress={() => router.replace('/sign-in')} />
    </AuthLayout>
  );
}
