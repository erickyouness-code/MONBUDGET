import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { authErrorKey } from '@/features/auth/errors';
import { FormField } from '@/features/auth/FormField';
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas';
import { supabase } from '@/shared/lib/supabase';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { Banner, Button } from '@/shared/ui';

/** Code reçu par e-mail + nouveau mot de passe. */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { setNavigationHeld } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  // Si l'écran se ferme, on libère la navigation quoi qu'il arrive.
  useEffect(() => () => setNavigationHeld(false), [setNavigationHeld]);

  const { control, handleSubmit, formState } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', password: '' },
  });

  const submit = handleSubmit(async ({ code, password }) => {
    setServerError(null);
    setNavigationHeld(true);

    const verified = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (verified.error) {
      setNavigationHeld(false);
      return setServerError(t(authErrorKey(verified.error)));
    }

    const updated = await supabase.auth.updateUser({ password });
    if (updated.error) {
      // La session est ouverte mais le mot de passe n'a pas changé : on reste ici.
      return setServerError(t(authErrorKey(updated.error)));
    }
    setNavigationHeld(false); // l'utilisateur entre dans l'application
  });

  const onSubmit = () => void submit();

  return (
    <AuthLayout title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle', { email })}>
      {serverError ? <Banner tone="error" message={serverError} /> : null}
      <View style={{ gap: spacing.lg }}>
        <FormField
          control={control}
          name="code"
          label={t('auth.code')}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={10}
        />
        <FormField
          control={control}
          name="password"
          label={t('auth.newPassword')}
          hint={t('auth.passwordRules')}
          password
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={onSubmit}
        />
      </View>
      <Button label={t('auth.resetAction')} fullWidth loading={formState.isSubmitting} onPress={onSubmit} />
    </AuthLayout>
  );
}
