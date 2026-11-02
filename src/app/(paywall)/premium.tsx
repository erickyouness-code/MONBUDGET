import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BellRing, CalendarDays, ChartPie, PiggyBank, Settings2, ShieldCheck, Target, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEntitlement, useSyncEntitlement } from '@/features/subscription/api';
import { trialDays } from '@/features/subscription/logic';
import { getMonthlyPackage, purchase, purchaseAvailability, restore } from '@/features/subscription/purchases';
import { supabase } from '@/shared/lib/supabase';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Banner, Button, Card } from '@/shared/ui';
import { Logo } from '@/shared/ui/Logo';

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? '';
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? '';

/**
 * Page Premium : affichée tant qu'aucun abonnement (ou essai) n'est actif.
 * Le paiement n'a lieu qu'après un appui explicite ET la confirmation dans la
 * fenêtre officielle d'Apple ou de Google.
 */
export default function PremiumScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const entitlement = useEntitlement();
  const sync = useSyncEntitlement();
  const availability = purchaseAvailability();
  const offer = useQuery({ queryKey: ['offering'], enabled: availability === 'available', queryFn: getMonthlyPackage });
  const [busy, setBusy] = useState<'buy' | 'restore' | 'check' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info' | 'success'; text: string } | null>(null);

  const pkg = offer.data ?? null;
  const hadAccess = entitlement.data?.hadAccess ?? false;
  // L'essai n'est annoncé que s'il est confirmé par le store ET jamais utilisé.
  const trial = hadAccess ? null : trialDays(pkg?.product);
  const price = pkg?.product.priceString;

  const benefits: { icon: LucideIcon; text: string }[] = [
    { icon: ChartPie, text: t('premium.benefit1') },
    { icon: Target, text: t('premium.benefit2') },
    { icon: PiggyBank, text: t('premium.benefit3') },
    { icon: CalendarDays, text: t('premium.benefit4') },
    { icon: BellRing, text: t('premium.benefit5') },
    { icon: ShieldCheck, text: t('premium.benefit6') },
  ];

  /** Après un achat : le serveur vérifie auprès de RevenueCat ; on réessaie quelques fois. */
  const confirmWithServer = async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await sync();
      const fresh = await entitlement.refetch();
      if (fresh.data?.active) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  };

  const onBuy = async () => {
    if (!pkg) return;
    setMessage(null);
    setBusy('buy');
    const outcome = await purchase(pkg);
    if (outcome === 'purchased') {
      const ok = await confirmWithServer();
      if (!ok) setMessage({ tone: 'info', text: t('premium.activating') });
    } else if (outcome === 'pending') setMessage({ tone: 'info', text: t('premium.pending') });
    else if (outcome === 'error') setMessage({ tone: 'error', text: t('premium.error') });
    setBusy(null);
  };

  const onRestore = async () => {
    setMessage(null);
    setBusy('restore');
    await restore();
    const ok = await confirmWithServer();
    if (!ok) setMessage({ tone: 'info', text: t('premium.nothingToRestore') });
    setBusy(null);
  };

  /** Vérifier côté serveur (ex. abonnement pris sur un autre téléphone). */
  const onCheck = async () => {
    setMessage(null);
    setBusy('check');
    const ok = await confirmWithServer();
    if (!ok) setMessage({ tone: 'info', text: t('premium.nothingToRestore') });
    setBusy(null);
  };

  const title = entitlement.data?.hadAccess ? t('premium.titleExpired') : t('premium.title');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.xl }}
    >
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Logo size={56} />
        <AppText variant="title" align="center">
          {title}
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          {t('premium.subtitle')}
        </AppText>
      </View>

      <Card style={{ gap: spacing.md }}>
        {benefits.map(({ icon: Icon, text }) => (
          <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} color={colors.primary} />
            </View>
            <AppText variant="body" style={{ flex: 1 }}>
              {text}
            </AppText>
          </View>
        ))}
      </Card>

      {availability === 'available' ? (
        <Card tone="violet" style={{ gap: spacing.xs, alignItems: 'center' }}>
          {offer.isPending ? (
            <AppText variant="caption" color="textSecondary">
              {t('premium.loadingOffer')}
            </AppText>
          ) : price ? (
            <>
              {trial ? (
                <AppText variant="headline" color="primary">
                  {t('premium.trialHeadline', { count: trial })}
                </AppText>
              ) : null}
              <AppText variant={trial ? 'body' : 'headline'}>{trial ? t('premium.thenPrice', { price }) : t('premium.price', { price })}</AppText>
              <AppText variant="small" color="textTertiary">
                {t('premium.cancelAnytime')}
              </AppText>
            </>
          ) : (
            <AppText variant="caption" color="textSecondary">
              {t('premium.offerUnavailable')}
            </AppText>
          )}
        </Card>
      ) : (
        <Banner tone="info" message={t(`premium.unavailable.${availability}`)} />
      )}

      {message ? <Banner tone={message.tone} message={message.text} /> : null}

      <View style={{ gap: spacing.sm }}>
        <Button
          label={trial ? t('premium.startTrial', { count: trial }) : t('premium.subscribe')}
          fullWidth
          disabled={!pkg}
          loading={busy === 'buy'}
          onPress={() => void onBuy()}
        />
        {availability === 'available' ? (
          <Button label={t('premium.restore')} variant="ghost" fullWidth loading={busy === 'restore'} onPress={() => void onRestore()} />
        ) : (
          <Button label={t('premium.check')} variant="ghost" fullWidth loading={busy === 'check'} onPress={() => void onCheck()} />
        )}
      </View>

      <AppText variant="small" color="textTertiary" align="center">
        {trial ? t('premium.legalTrial', { count: trial }) : t('premium.legal')}
      </AppText>
      {TERMS_URL || PRIVACY_URL ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.lg }}>
          {TERMS_URL ? <Button label={t('premium.terms')} variant="ghost" onPress={() => void Linking.openURL(TERMS_URL)} /> : null}
          {PRIVACY_URL ? <Button label={t('premium.privacy')} variant="ghost" onPress={() => void Linking.openURL(PRIVACY_URL)} /> : null}
        </View>
      ) : null}

      <View style={{ height: 1, backgroundColor: colors.border }} />
      <AppText variant="caption" color="textSecondary" align="center">
        {t('premium.dataStaysYours')}
      </AppText>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
        <Button label={t('settings.title')} icon={Settings2} variant="secondary" onPress={() => router.push('/settings')} />
        <Button label={t('settings.signOut')} variant="ghost" onPress={() => void supabase.auth.signOut()} />
      </View>
    </ScrollView>
  );
}
