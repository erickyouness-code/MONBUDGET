import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isInUseError, useAccounts, useArchiveAccount, useDeleteAccount, useSaveAccount } from '@/features/accounts/api';
import { FormField } from '@/features/auth/FormField';
import { ACCOUNT_ICONS } from '@/features/categories/meta';
import { useCurrency } from '@/features/profile/api';
import { makeAccountSchema, type AccountFormValues } from '@/features/transactions/schema';
import { ACCOUNT_TYPES } from '@/features/transactions/types';
import { CURRENCIES } from '@/shared/config/currencies';
import { useLanguage } from '@/shared/i18n';
import { confirmAction } from '@/shared/lib/confirm';
import { formatMoneyCompact, parseAmountToMinor, sanitizeAmountInput } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Banner, Button, ChoiceChip, Screen, TextField } from '@/shared/ui';

/** Création (id = "new") ou modification d'un compte. */
export default function AccountFormScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const language = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const accounts = useAccounts();
  const existing = accounts.data?.find((a) => a.id === id);
  const profileCurrency = useCurrency();
  const currency = existing?.currency_code ?? profileCurrency;
  const save = useSaveAccount();
  const archive = useArchiveAccount();
  const remove = useDeleteAccount();
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  const schema = makeAccountSchema(currency);
  const { control, handleSubmit, formState } = useForm<AccountFormValues>({
    resolver: zodResolver(schema),
    values: existing
      ? {
          name: existing.name,
          type: existing.type,
          initialBalance: formatMoneyCompact(existing.initial_balance_minor, currency, 'fr', { hideSymbol: true }).replace(/\s/g, ''),
        }
      : undefined,
    defaultValues: { name: '', type: 'cash', initialBalance: '' },
  });

  const submit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      await save.mutateAsync({
        id: isNew ? undefined : id,
        name: values.name,
        type: values.type,
        currency_code: currency,
        initial_balance_minor: parseAmountToMinor(values.initialBalance || '0', currency) ?? 0,
      });
      router.back();
    } catch {
      setMessage({ tone: 'error', text: t('errors.saveFailed') });
    }
  });

  const toggleArchive = async () => {
    if (!existing) return;
    await archive.mutateAsync({ id: existing.id, archived: !existing.is_archived });
    router.back();
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirmAction({
      title: t('accounts.deleteTitle'),
      message: t('accounts.deleteMessage'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(existing.id);
      router.back();
    } catch (error) {
      setMessage({ tone: isInUseError(error) ? 'info' : 'error', text: t(isInUseError(error) ? 'accounts.inUse' : 'errors.saveFailed') });
    }
  };

  return (
    <Screen safeTop={false}>
      {message ? <Banner tone={message.tone} message={message.text} /> : null}

      <FormField control={control} name="name" label={t('accounts.name')} placeholder={t('accounts.namePlaceholder')} maxLength={50} />

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption" color="textSecondary">
              {t('accounts.type')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
              {ACCOUNT_TYPES.map((type) => (
                <ChoiceChip
                  key={type}
                  label={t(`accountTypes.${type}`)}
                  icon={ACCOUNT_ICONS[type]}
                  selected={field.value === type}
                  onPress={() => field.onChange(type)}
                />
              ))}
            </View>
          </View>
        )}
      />

      <Controller
        control={control}
        name="initialBalance"
        render={({ field, fieldState }) => (
          <TextField
            label={`${t('accounts.initialBalance')} (${CURRENCIES[currency].symbol[language]})`}
            hint={t('accounts.initialBalanceHint')}
            placeholder="0"
            value={field.value}
            onChangeText={(v) => field.onChange(sanitizeAmountInput(v, currency))}
            onBlur={field.onBlur}
            keyboardType={CURRENCIES[currency].decimals > 0 ? 'decimal-pad' : 'number-pad'}
            error={fieldState.error?.message}
          />
        )}
      />

      <Button label={isNew ? t('accounts.create') : t('common.save')} fullWidth loading={formState.isSubmitting} onPress={() => void submit()} />

      {existing ? (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={existing.is_archived ? t('accounts.unarchive') : t('accounts.archive')}
            icon={existing.is_archived ? ArchiveRestore : Archive}
            variant="secondary"
            fullWidth
            loading={archive.isPending}
            onPress={toggleArchive}
          />
          <AppText variant="small" color="textTertiary" align="center">
            {t('accounts.archiveHint')}
          </AppText>
          <Button label={t('common.delete')} icon={Trash2} variant="ghost" fullWidth loading={remove.isPending} onPress={onDelete} />
        </View>
      ) : null}
    </Screen>
  );
}
