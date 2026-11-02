import { router, useLocalSearchParams } from 'expo-router';
import { ListOrdered, Plus, Search, Wallet, X } from 'lucide-react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccounts } from '@/features/accounts/api';
import { useCategories } from '@/features/categories/api';
import { categoryLabel } from '@/features/categories/meta';
import { useCurrency } from '@/features/profile/api';
import { useTransactionList } from '@/features/transactions/api';
import { addDays, groupByDay, toISODate } from '@/features/transactions/logic';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import type { TransactionType } from '@/features/transactions/types';
import { useIsRTL, useLanguage } from '@/shared/i18n';
import { formatDayShort } from '@/shared/lib/dates';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Banner, Button, ChoiceChip, EmptyState } from '@/shared/ui';

/** Supprime accents et majuscules pour comparer des textes. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function HistoryScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const isRTL = useIsRTL();
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const currency = useCurrency();
  const accounts = useAccounts();
  const categories = useCategories();

  // Recherche saisie, sinon celle transmise par un autre écran (ex. « Voir les dépenses »).
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [typed, setSearch] = useState<string | null>(null);
  const search = typed ?? q ?? '';
  const [type, setType] = useState<TransactionType | 'all'>('all');
  const deferredSearch = useDeferredValue(search);

  // La recherche porte aussi sur le nom (traduit) des catégories.
  const matchingCategoryIds = useMemo(() => {
    const q = fold(deferredSearch.trim());
    if (q.length < 2) return [];
    return (categories.data ?? []).filter((c) => fold(categoryLabel(c, t)).includes(q)).map((c) => c.id);
  }, [deferredSearch, categories.data, t]);

  const list = useTransactionList({ search: deferredSearch, type, matchingCategoryIds });
  const items = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);
  const sections = useMemo(() => groupByDay(items), [items]);

  const categoryById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);
  const accountById = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);

  const today = toISODate(new Date());
  const dayLabel = (date: string) =>
    date === today ? t('common.today') : date === addDays(today, -1) ? t('common.yesterday') : formatDayShort(date, language);

  const filtering = deferredSearch.trim() !== '' || type !== 'all';

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="title" accessibilityRole="header">
          {t('transactions.title')}
        </AppText>
        <Button label={t('accounts.title')} icon={Wallet} variant="secondary" onPress={() => router.push('/accounts')} />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
        }}
      >
        <Search size={18} color={colors.textTertiary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('transactions.searchPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={t('transactions.search')}
          returnKeyType="search"
          style={[
            typography.body,
            { flex: 1, color: colors.text, paddingVertical: spacing.md, textAlign: isRTL ? 'right' : 'left' },
            { outlineStyle: 'none' } as object,
          ]}
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.clear')} onPress={() => setSearch('')} hitSlop={10}>
            <X size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
        {(['all', 'expense', 'income', 'transfer'] as const).map((value) => (
          <ChoiceChip
            key={value}
            label={value === 'all' ? t('transactions.filterAll') : t(`add.${value}`)}
            selected={type === value}
            onPress={() => setType(value)}
          />
        ))}
      </View>

      {list.isError ? <Banner tone="error" message={t('errors.loadMessage')} /> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SectionList
        testID="history-list"
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.xs }}>
            <AppText variant="overline" color="textSecondary">
              {dayLabel(section.date).toUpperCase()}
            </AppText>
            <AmountText
              amountMinor={section.netMinor}
              currency={currency}
              variant="caption"
              compact
              signDisplay="always"
              color={section.netMinor > 0 ? 'income' : 'textTertiary'}
            />
          </View>
        )}
        renderItem={({ item }) => (
          <TransactionRow
            tx={item}
            category={item.category_id ? categoryById.get(item.category_id) : undefined}
            accountName={accountById.get(item.account_id)?.name}
            toAccountName={item.to_account_id ? accountById.get(item.to_account_id)?.name : undefined}
            currency={accountById.get(item.account_id)?.currency_code ?? currency}
            onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          list.isPending ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.huge }} />
          ) : (
            <EmptyState
              icon={ListOrdered}
              title={filtering ? t('transactions.noResultTitle') : t('transactions.emptyTitle')}
              message={filtering ? t('transactions.noResultMessage') : t('transactions.emptyMessage')}
              action={
                filtering ? undefined : (
                  <Button label={t('dashboard.addFirst')} icon={Plus} onPress={() => router.push('/add')} />
                )
              }
            />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} /> : undefined}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
      />
    </View>
  );
}
