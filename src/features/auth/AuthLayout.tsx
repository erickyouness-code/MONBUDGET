import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText } from '@/shared/ui';

type Props = PropsWithChildren<{ title: string; subtitle?: string }>;

/** Mise en page commune aux écrans de connexion : titre, formulaire, clavier géré. */
export function AuthLayout({ title, subtitle, children }: Props) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.xl,
        }}
      >
        <View style={{ gap: spacing.sm }}>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="body" color="textSecondary">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
