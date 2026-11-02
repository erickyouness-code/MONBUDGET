import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { CalendarDays, Plus, ShieldAlert, Trash2, Wallet } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccounts } from '@/features/accounts/api';
import { useBudgetAlerts } from '@/features/budgets/api';
import { useCategories, useCreateCategory } from '@/features/categories/api';
import { ACCOUNT_ICONS, categoryIcon, categoryLabel } from '@/features/categories/meta';
import { useCurrency } from '@/features/profile/api';
import { useLanguage } from '@/shared/i18n';
import { confirmAction } from '@/shared/lib/confirm';
import { formatDayShort } from '@/shared/lib/dates';
import { formatMoneyCompact } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountInput, AppText, Banner, Button, ChoiceChip, EmptyState, SegmentedControl, TextField } from '@/shared/ui';
import { DatePicker } from '@/shared/ui/DatePicker';

import { useDeleteTransaction, useSaveTransaction } from './api';
import { addDays, defaultPaymentMethod, toISODate } from './logic';
import { makeTransactionSchema, toTransactionWrite, type TransactionFormValues } from './schema';
import { PAYMENT_METHODS, type Transaction, type TransactionType } from './types';

type Props = { initial?: Transaction };

/** Formulaire unique pour créer ou modifier une dépense, un revenu ou un transfert. */
export function TransactionForm({ initial }: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const currency = useCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const createCategory = useCreateCategory();
  const budgetAlerts = useBudgetAlerts();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [newCategory, setNewCategory] = useState<string | null>(null);

  const today = toISODate(new Date());
  const isEdit = !!initial;

  // Comptes proposés : les actifs, plus ceux déjà utilisés par la transaction modifiée.
  const usable = useMemo(
    () =>
      (accounts.data ?? []).filter(
        (a) => !a.is_archived || a.id === initial?.account_id || a.id === initial?.to_account_id,
      ),
    [accounts.data, initial],
  );

  const schema = useMemo(() => makeTransactionSchema(currency), [currency]);
  const { control, handleSubmit, setValue, getValues, formState } = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          type: initial.type,
          amount: formatMoneyCompact(initial.amount_minor, currency, 'fr', { hideSymbol: true }).replace(/\s| /g, ''),
          accountId: initial.account_id,
          toAccountId: initial.to_account_id,
          categoryId: initial.category_id,
          occurredOn: initial.occurred_on,
          paymentMethod: initial.payment_method,
          description: initial.description ?? '',
        }
      : {
          type: 'expense',
          amount: '',
          accountId: '',
          toAccountId: null,
          categoryId: null,
          occurredOn: today,
          paymentMethod: null,
          description: '',
        },
  });

  const type = useWatch({ control, name: 'type' });
  const accountId = useWatch({ control, name: 'accountId' });
  const occurredOn = useWatch({ control, name: 'occurredOn' });

  // Nouvelle transaction : on présélectionne le premier compte dès qu'ils sont chargés.
  useEffect(() => {
    if (isEdit || getValues('accountId') || usable.length === 0) return;
    const first = usable[0]!;
    setValue('accountId', first.id);
    setValue('paymentMethod', defaultPaymentMethod(first.type));
    if (usable[1]) setValue('toAccountId', usable[1].id);
  }, [usable, isEdit, getValues, setValue]);

  const kindCategories = (categories.data ?? []).filter(
    (c) => c.kind === (type === 'income' ? 'income' : 'expense') && (!c.is_archived || c.id === initial?.category_id),
  );

  const changeType = (next: TransactionType) => {
    setValue('type', next);
    setValue('categoryId', null); // une catégorie de dépense ne convient pas à un revenu
  };

  const chooseAccount = (id: string) => {
    setValue('accountId', id, { shouldValidate: formState.isSubmitted });
    if (!isEdit) setValue('paymentMethod', defaultPaymentMethod(usable.find((a) => a.id === id)?.type));
  };

  const addCategory = async () => {
    const name = newCategory?.trim();
    if (!name) return;
    try {
      const created = await createCategory.mutateAsync({ kind: type === 'income' ? 'income' : 'expense', name });
      setValue('categoryId', created.id, { shouldValidate: true });
      setNewCategory(null);
    } catch {
      setServerError(t('errors.saveFailed'));
    }
  };

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    // Une dépense du mois en cours peut faire franchir un seuil de budget.
    const touchesBudget =
      (values.type === 'expense' || initial?.type === 'expense') && values.occurredOn.slice(0, 7) === today.slice(0, 7);
    const before = touchesBudget ? await budgetAlerts.snapshot() : null;
    try {
      await save.mutateAsync({ ...toTransactionWrite(values, currency), id: initial?.id });
      router.back();
      if (touchesBudget) void budgetAlerts.check(before);
    } catch {
      setServerError(t('errors.saveFailed'));
    }
  });

  const onDelete = async () => {
    if (!initial) return;
    const ok = await confirmAction({
      title: t('transactions.deleteTitle'),
      message: t('transactions.deleteMessage'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(initial.id);
      router.back();
    } catch {
      setServerError(t('errors.saveFailed'));
    }
  };

  // Aucun compte : impossible d'enregistrer une transaction.
  if (accounts.isSuccess && usable.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background }}>
        <EmptyState
          icon={Wallet}
          title={t('transactions.noAccountTitle')}
          message={t('transactions.noAccountMessage')}
          action={<Button label={t('accounts.add')} icon={Plus} onPress={() => router.push('/account/new')} />}
        />
      </View>
    );
  }

  const errorText = (key?: string) => (key ? (t(key as never) as string) : undefined);
  const balanceOf = (id: string) => {
    const a = usable.find((x) => x.id === id);
    return a ? formatMoneyCompact(a.balance_minor, a.currency_code, language) : undefined;
  };
  const isOtherDate = occurredOn !== today && occurredOn !== addDays(today, -1);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.xl }}
      >
        {serverError ? <Banner tone="error" message={serverError} /> : null}

        <SegmentedControl<TransactionType>
          accessibilityLabel={t('transactions.type')}
          value={type}
          onChange={changeType}
          options={[
            { value: 'expense', label: t('add.expense') },
            { value: 'income', label: t('add.income') },
            { value: 'transfer', label: t('add.transfer') },
          ]}
        />

        <Controller
          control={control}
          name="amount"
          render={({ field, fieldState }) => (
            <AmountInput
              value={field.value}
              onChange={field.onChange}
              currency={currency}
              label={t('transactions.amount')}
              error={errorText(fieldState.error?.message)}
              autoFocus={!isEdit}
              tone={type === 'income' ? 'income' : 'neutral'}
            />
          )}
        />

        {/* Catégorie (dépense / revenu uniquement) */}
        {type !== 'transfer' ? (
          <Controller
            control={control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <Section title={t('transactions.category')} error={errorText(fieldState.error?.message)}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md }} accessibilityRole="radiogroup">
                  {kindCategories.map((c) => {
                    const Icon = categoryIcon(c);
                    const selected = field.value === c.id;
                    const tint = c.color ?? colors.primary;
                    return (
                      <Pressable
                        key={c.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={categoryLabel(c, t)}
                        onPress={() => field.onChange(c.id)}
                        style={{ width: '25%', alignItems: 'center', gap: spacing.xs }}
                      >
                        <View
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: radius.lg,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: selected ? tint : colors.surfaceMuted,
                            borderWidth: selected ? 0 : 1,
                            borderColor: colors.border,
                          }}
                        >
                          <Icon size={22} color={selected ? '#FFFFFF' : tint} />
                        </View>
                        <AppText variant="small" align="center" numberOfLines={2} color={selected ? 'text' : 'textSecondary'} style={{ paddingHorizontal: 2 }}>
                          {categoryLabel(c, t)}
                        </AppText>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('transactions.newCategory')}
                    onPress={() => setNewCategory('')}
                    style={{ width: '25%', alignItems: 'center', gap: spacing.xs }}
                  >
                    <View
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: radius.lg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: colors.textTertiary,
                      }}
                    >
                      <Plus size={22} color={colors.textSecondary} />
                    </View>
                    <AppText variant="small" color="textSecondary" align="center" numberOfLines={1}>
                      {t('transactions.newCategoryShort')}
                    </AppText>
                  </Pressable>
                </View>
                {newCategory !== null ? (
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    <TextField
                      label={t('transactions.newCategory')}
                      value={newCategory}
                      onChangeText={setNewCategory}
                      maxLength={40}
                      autoFocus
                      onSubmitEditing={addCategory}
                    />
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button label={t('common.add')} loading={createCategory.isPending} onPress={addCategory} />
                      <Button label={t('common.cancel')} variant="ghost" onPress={() => setNewCategory(null)} />
                    </View>
                  </View>
                ) : null}
              </Section>
            )}
          />
        ) : null}

        {/* Compte(s) */}
        <Controller
          control={control}
          name="accountId"
          render={({ field, fieldState }) => (
            <Section title={type === 'transfer' ? t('transactions.fromAccount') : t('transactions.account')} error={errorText(fieldState.error?.message)}>
              <ChipRow>
                {usable.map((a) => (
                  <ChoiceChip
                    key={a.id}
                    label={a.name}
                    detail={balanceOf(a.id)}
                    icon={ACCOUNT_ICONS[a.type]}
                    selected={field.value === a.id}
                    onPress={() => chooseAccount(a.id)}
                  />
                ))}
              </ChipRow>
            </Section>
          )}
        />
        {type === 'transfer' ? (
          <Controller
            control={control}
            name="toAccountId"
            render={({ field, fieldState }) => (
              <Section title={t('transactions.toAccount')} error={errorText(fieldState.error?.message)}>
                <ChipRow>
                  {usable
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <ChoiceChip
                        key={a.id}
                        label={a.name}
                        detail={balanceOf(a.id)}
                        icon={ACCOUNT_ICONS[a.type]}
                        selected={field.value === a.id}
                        onPress={() => field.onChange(a.id)}
                      />
                    ))}
                </ChipRow>
                {usable.length < 2 ? (
                  <AppText variant="caption" color="textTertiary">
                    {t('transactions.transferNeedsTwo')}
                  </AppText>
                ) : null}
              </Section>
            )}
          />
        ) : null}

        {/* Date */}
        <Controller
          control={control}
          name="occurredOn"
          render={({ field }) => (
            <Section title={t('transactions.date')}>
              <ChipRow>
                <ChoiceChip label={t('common.today')} selected={field.value === today} onPress={() => field.onChange(today)} />
                <ChoiceChip
                  label={t('common.yesterday')}
                  selected={field.value === addDays(today, -1)}
                  onPress={() => field.onChange(addDays(today, -1))}
                />
                <ChoiceChip
                  label={isOtherDate ? formatDayShort(field.value, language) : t('transactions.otherDate')}
                  icon={CalendarDays}
                  selected={isOtherDate || showCalendar}
                  onPress={() => setShowCalendar((s) => !s)}
                />
              </ChipRow>
              {showCalendar ? (
                <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.sm }}>
                  <DatePicker
                    value={field.value}
                    max={today}
                    onChange={(d) => {
                      field.onChange(d);
                      setShowCalendar(false);
                    }}
                  />
                </View>
              ) : null}
            </Section>
          )}
        />

        {/* Moyen de paiement */}
        {type !== 'transfer' ? (
          <Controller
            control={control}
            name="paymentMethod"
            render={({ field }) => (
              <Section title={t('transactions.paymentMethod')}>
                <ChipRow>
                  {PAYMENT_METHODS.map((m) => (
                    <ChoiceChip
                      key={m}
                      label={t(`paymentMethods.${m}`)}
                      selected={field.value === m}
                      onPress={() => field.onChange(field.value === m ? null : m)}
                    />
                  ))}
                </ChipRow>
              </Section>
            )}
          />
        ) : null}

        {/* Description */}
        <Controller
          control={control}
          name="description"
          render={({ field, fieldState }) => (
            <View style={{ gap: spacing.xs }}>
              <TextField
                label={t('transactions.description')}
                placeholder={t('transactions.descriptionPlaceholder')}
                value={field.value}
                onChangeText={field.onChange}
                maxLength={200}
                error={fieldState.error?.message}
              />
              <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                <ShieldAlert size={14} color={colors.textTertiary} />
                <AppText variant="small" color="textTertiary" style={{ flex: 1 }}>
                  {t('transactions.noSecrets')}
                </AppText>
              </View>
            </View>
          )}
        />

        <Button
          label={isEdit ? t('common.save') : t('transactions.add')}
          fullWidth
          loading={formState.isSubmitting}
          onPress={() => void submit()}
        />
        {isEdit ? (
          <Button label={t('common.delete')} icon={Trash2} variant="ghost" fullWidth loading={remove.isPending} onPress={onDelete} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, error, children }: { title: string; error?: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="caption" color="textSecondary">
        {title}
      </AppText>
      {children}
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
      {children}
    </View>
  );
}
