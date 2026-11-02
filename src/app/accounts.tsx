import { router } from 'expo-router';
import { ChevronRight, Plus, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useAccounts } from '@/features/accounts/api';
import { ACCOUNT_ICONS } from '@/features/categories/meta';
import type { AccountWithBalance } from '@/features/transactions/types';
import { useCurrency } from '@/features/profile/api';
import { useIsRTL } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Button, Card, EmptyState, Screen } from '@/shared/ui';

/** Liste des comptes et portefeuilles, avec le solde de chacun et le total. */
export default function AccountsScreen() {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const currency = useCurrency();
  const accounts = useAccounts();
  const [showArchived, setShowArchived] = useState(false);

  const active = (accounts.data ?? []).filter((a) => !a.is_archived);
  const archived = (accounts.data ?? []).filter((a) => a.is_archived);
  const total = active.reduce((sum, a) => sum + a.balance_minor, 0);

  return (
    <Screen safeTop={false}>
      <Card tone="violet" style={{ gap: spacing.xs }}>
        <AppText variant="caption" color="textSecondary">
          {t('accounts.total')}
        </AppText>
        <AmountText amountMinor={total} currency={currency} variant="title" compact color={total < 0 ? 'expense' : 'text'} />
        <AppText variant="small" color="textTertiary">
          {t('accounts.totalHint')}
        </AppText>
      </Card>

      {accounts.isSuccess && active.length === 0 ? (
        <Card>
          <EmptyState icon={Wallet} title={t('accounts.emptyTitle')} message={t('accounts.emptyMessage')} />
        </Card>
      ) : (
        <Card style={{ paddingVertical: spacing.sm }}>
          {active.map((a, i) => (
            <View key={a.id}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border }} /> : null}
              <AccountRow account={a} />
            </View>
          ))}
        </Card>
      )}

      <Button label={t('accounts.add')} icon={Plus} fullWidth onPress={() => router.push('/account/new')} />

      {archived.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={t('accounts.archivedCount', { count: archived.length })}
            variant="ghost"
            onPress={() => setShowArchived((s) => !s)}
          />
          {showArchived ? (
            <Card style={{ paddingVertical: spacing.sm, opacity: 0.7 }}>
              {archived.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function AccountRow({ account }: { account: AccountWithBalance }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const isRTL = useIsRTL();
  const Icon = ACCOUNT_ICONS[account.type];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {account.name}
        </AppText>
        <AppText variant="caption" color="textTertiary">
          {t(`accountTypes.${account.type}`)}
        </AppText>
      </View>
      <AmountText
        amountMinor={account.balance_minor}
        currency={account.currency_code}
        compact
        color={account.balance_minor < 0 ? 'expense' : 'text'}
      />
      <ChevronRight size={18} color={colors.textTertiary} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
    </Pressable>
  );
}
