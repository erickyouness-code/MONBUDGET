import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, View } from 'react-native';

import { useGoals, useSaveGoal } from '@/features/goals/api';
import { GOAL_ICON_KEYS, GoalGlyph } from '@/features/goals/icons';
import { useCurrency } from '@/features/profile/api';
import { addDays, toISODate } from '@/features/transactions/logic';
import { CURRENCIES } from '@/shared/config/currencies';
import { useLanguage } from '@/shared/i18n';
import { formatDayShort } from '@/shared/lib/dates';
import { formatMoneyCompact, parseAmountToMinor, sanitizeAmountInput } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountInput, AppText, Banner, Button, ChoiceChip, Screen, TextField } from '@/shared/ui';
import { DatePicker } from '@/shared/ui/DatePicker';

/** Création (id = "new") ou modification d'un objectif. */
export default function GoalEditScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing, radius } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const goals = useGoals();
  const existing = goals.data?.find((g) => g.id === id);
  const profileCurrency = useCurrency();
  const currency = existing?.currency_code ?? profileCurrency;
  const save = useSaveGoal();
  const today = toISODate(new Date());
  const asInput = (minor: number) => formatMoneyCompact(minor, currency, 'fr', { hideSymbol: true }).replace(/\s/g, '');

  // Champs : valeur saisie, sinon valeur existante, sinon valeur par défaut.
  const [name, setName] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [hasDate, setHasDate] = useState<boolean | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [initial, setInitial] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValue = name ?? existing?.name ?? '';
  const iconValue = icon ?? existing?.icon ?? 'piggy';
  const amountValue = amount ?? (existing ? asInput(existing.target_minor) : '');
  const hasDateValue = hasDate ?? (existing ? existing.target_date !== null : true);
  const dateValue = date ?? existing?.target_date ?? addDays(today, 180);

  const submit = async () => {
    setError(null);
    if (!nameValue.trim()) return setError(t('goals.errors.nameRequired'));
    const target = parseAmountToMinor(amountValue, currency);
    if (!target) return setError(t('transactions.errors.amountInvalid'));
    const initialMinor = initial ? parseAmountToMinor(initial, currency) : 0;
    if (initialMinor === null) return setError(t('transactions.errors.amountInvalid'));
    try {
      const savedId = await save.mutateAsync({
        id: isNew ? undefined : id,
        name: nameValue.trim(),
        icon: iconValue,
        target_minor: target,
        target_date: hasDateValue ? dateValue : null,
        currency_code: currency,
        initialMinor: isNew ? initialMinor : undefined,
      });
      if (isNew) router.replace({ pathname: '/goal/[id]', params: { id: savedId } });
      else router.back();
    } catch {
      setError(t('errors.saveFailed'));
    }
  };

  return (
    <Screen safeTop={false}>
      {error ? <Banner tone="error" message={error} /> : null}

      <TextField
        label={t('goals.name')}
        placeholder={t('goals.namePlaceholder')}
        value={nameValue}
        onChangeText={setName}
        maxLength={60}
        autoFocus={isNew}
      />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="caption" color="textSecondary">
          {t('goals.icon')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
          {GOAL_ICON_KEYS.map((key) => {
            const selected = key === iconValue;
            return (
              <Pressable
                key={key}
                accessibilityRole="radio"
                aria-checked={selected}
                accessibilityLabel={t(`goals.icons.${key}` as never)}
                onPress={() => setIcon(key)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? colors.primary : colors.surfaceMuted,
                }}
              >
                <GoalGlyph icon={key} size={22} color={selected ? colors.onPrimary : colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color="textSecondary">
          {t('goals.target')}
        </AppText>
        <AmountInput value={amountValue} onChange={setAmount} currency={currency} label={t('goals.target')} />
      </View>

      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="caption" color="textSecondary">
            {t('goals.hasDeadline')}
          </AppText>
          <Switch
            accessibilityLabel={t('goals.hasDeadline')}
            value={hasDateValue}
            onValueChange={setHasDate}
            trackColor={{ true: colors.primary, false: colors.surfaceMuted }}
            thumbColor={colors.surface}
          />
        </View>
        {hasDateValue ? (
          <>
            <ChoiceChip
              label={formatDayShort(dateValue, language)}
              icon={CalendarDays}
              selected
              onPress={() => setShowCalendar((s) => !s)}
            />
            {showCalendar ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }}>
                <DatePicker
                  value={dateValue}
                  onChange={(d) => {
                    setDate(d);
                    setShowCalendar(false);
                  }}
                />
              </View>
            ) : null}
          </>
        ) : (
          <AppText variant="small" color="textTertiary">
            {t('goals.noDeadlineHint')}
          </AppText>
        )}
      </View>

      {isNew ? (
        <TextField
          label={`${t('goals.alreadySaved')} (${CURRENCIES[currency].symbol[language]})`}
          hint={t('goals.alreadySavedHint')}
          placeholder="0"
          value={initial}
          onChangeText={(v) => setInitial(sanitizeAmountInput(v, currency))}
          keyboardType={CURRENCIES[currency].decimals > 0 ? 'decimal-pad' : 'number-pad'}
        />
      ) : null}

      <Button label={isNew ? t('goals.create') : t('common.save')} fullWidth loading={save.isPending} onPress={() => void submit()} />
    </Screen>
  );
}
