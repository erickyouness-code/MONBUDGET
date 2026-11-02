import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { router, SplashScreen, Stack } from 'expo-router';
import { CloudOff, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/api';
import { useEntitlement, useSubscriptionLifecycle } from '@/features/subscription/api';
import i18n, { applyLayoutDirection, deviceLanguageCode, useIsRTL } from '@/shared/i18n';
import { resolveLanguage } from '@/shared/i18n/languages';
import { queryClient } from '@/shared/lib/queryClient';
import { usePreferences } from '@/shared/store/preferences';
import { useHydrated } from '@/shared/store/useHydrated';
import { AppThemeProvider, useTheme } from '@/shared/theme/ThemeProvider';
import { Button, EmptyState } from '@/shared/ui';
import { ToastHost } from '@/shared/ui/ToastHost';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hydrated = useHydrated();
  const [languageReady, setLanguageReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  // Au démarrage : on applique la langue mémorisée avant d'afficher l'interface.
  useEffect(() => {
    if (!hydrated) return;
    const language = resolveLanguage(usePreferences.getState().language, deviceLanguageCode());
    applyLayoutDirection(language);
    void i18n.changeLanguage(language).then(() => setLanguageReady(true));
  }, [hydrated]);

  // Si la police ne se charge pas, on continue avec celle du système.
  if (!languageReady || (!fontsLoaded && !fontError)) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppThemeProvider>
              <RootNavigator />
              <ToastHost />
            </AppThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function CloseButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={12} onPress={() => router.back()}>
      <X size={22} color={colors.text} />
    </Pressable>
  );
}

/**
 * Aiguillage principal :
 * - pas connecté          → écrans de connexion
 * - connecté, sans profil → premier paramétrage
 * - paramétré sans abonnement actif → page Premium
 * - abonnement (ou essai) actif → application
 */
function RootNavigator() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isArabic = useIsRTL();
  const { session, initializing, navigationHeld } = useAuth();
  const profile = useProfile();
  const entitlement = useEntitlement();
  useSubscriptionLifecycle();

  const signedIn = !!session && !navigationHeld;
  const onboarded = !!profile.data?.onboarding_completed_at;
  // L'accès est décidé par le SERVEUR (table entitlements écrite par RevenueCat).
  const premium = entitlement.data?.active === true;
  const waitingForProfile = signedIn && profile.isPending;
  const waitingForEntitlement = signedIn && onboarded && entitlement.isPending;
  const ready = !initializing && !waitingForProfile && !waitingForEntitlement;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  // Profil impossible à charger (réseau coupé…) : on le dit et on propose de réessayer.
  if ((signedIn && profile.isError) || (signedIn && onboarded && entitlement.isError && !entitlement.data)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background, padding: 24 }}>
        <EmptyState
          icon={CloudOff}
          title={t('errors.loadTitle')}
          message={t('errors.loadMessage')}
          action={<Button label={t('errors.retry')} onPress={() => void Promise.all([profile.refetch(), entitlement.refetch()])} />}
        />
      </View>
    );
  }

  const modalOptions = {
    presentation: 'modal' as const,
    headerShown: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerTitleStyle: { color: colors.text, fontFamily: isArabic ? undefined : 'Inter_600SemiBold' },
    headerRight: () => <CloseButton />,
  };

  // Écran vers lequel rediriger quand on tente d'ouvrir une zone non autorisée.
  const home = !signedIn ? '/welcome' : !onboarded ? '/setup' : premium ? '/' : '/premium';

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!signedIn} redirectTo={home}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded} redirectTo={home}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded && !premium} redirectTo={home}>
        <Stack.Screen name="(paywall)" />
      </Stack.Protected>
      {/* Réglages : accessibles avec ou sans abonnement (langue, déconnexion, données). */}
      <Stack.Protected guard={signedIn && onboarded} redirectTo={home}>
        <Stack.Screen name="settings" options={{ ...modalOptions, title: t('settings.title') }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded && premium} redirectTo={home}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={{ ...modalOptions, title: t('add.title') }} />
        <Stack.Screen name="transaction/[id]" options={{ ...modalOptions, title: t('transactions.editTitle') }} />
        <Stack.Screen name="accounts" options={{ ...modalOptions, title: t('accounts.title') }} />
        <Stack.Screen name="budgets" options={{ ...modalOptions, title: t('budgets.title') }} />
        <Stack.Screen name="goals" options={{ ...modalOptions, title: t('goals.title') }} />
        <Stack.Screen name="calendar" options={{ ...modalOptions, title: t('schedule.title') }} />
        <Stack.Screen name="insights" options={{ ...modalOptions, title: t('insights.title') }} />
        <Stack.Screen name="occurrence" options={{ ...modalOptions, title: t('schedule.occurrenceTitle') }} />
        <Stack.Screen
          name="scheduled/[id]"
          options={({ route }) => ({
            ...modalOptions,
            title: (route.params as { id?: string } | undefined)?.id === 'new' ? t('schedule.newTitle') : t('schedule.editTitle'),
          })}
        />
        <Stack.Screen name="goal/[id]" options={{ ...modalOptions, title: t('goals.detailTitle') }} />
        <Stack.Screen
          name="goal/edit/[id]"
          options={({ route }) => ({
            ...modalOptions,
            title: (route.params as { id?: string } | undefined)?.id === 'new' ? t('goals.newTitle') : t('goals.editTitle'),
          })}
        />
        <Stack.Screen
          name="goal/contribute/[id]"
          options={({ route }) => ({
            ...modalOptions,
            title: (route.params as { mode?: string } | undefined)?.mode === 'withdraw' ? t('goals.withdraw') : t('goals.deposit'),
          })}
        />
        <Stack.Screen
          name="budget/[key]"
          options={({ route }) => ({
            ...modalOptions,
            title: (route.params as { key?: string } | undefined)?.key === 'global' ? t('budgets.monthlyBudget') : t('budgets.categoryBudget'),
          })}
        />
        <Stack.Screen
          name="account/[id]"
          options={({ route }) => ({
            ...modalOptions,
            title: (route.params as { id?: string } | undefined)?.id === 'new' ? t('accounts.newTitle') : t('accounts.editTitle'),
          })}
        />
      </Stack.Protected>
    </Stack>
  );
}
