import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAccounts } from '@/features/accounts/api';
import { useCategories } from '@/features/categories/api';
import { ACCOUNT_ICONS, categoryIcon, categoryLabel } from '@/features/categories/meta';
import { useCurrency } from '@/features/profile/api';
import { useDeleteScheduledItem, useSaveScheduledItem, useScheduledItems } from '@/features/schedule/api';
import type { Frequency, ScheduleKind } from '@/features/schedule/logic';
import { KIND_ICONS, SCHEDULE_KINDS } from '@/features/schedule/meta';
import { toISODate } from '@/features/transactions/logic';
import { useLanguage } from '@/shared/i18n';
import { confirmAction } from '@/shared/lib/confirm';
import { formatDayShort } from '@/shared/lib/dates';
import { formatMoneyCompact, parseAmountToMinor } from '@/shared/lib/money';
import { requestNotificationAccess } from '@/shared/lib/notifications';
import { usePreferences } from '@/shared/store/preferences';
import { useToast } from '@/shared/store/toast';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountInput, AppText, Banner, Button, ChoiceChip, Screen, TextField } from '@/shared/ui';
import { DatePicker } from '@/shared/ui/DatePicker';

const FREQUENCIES: Frequency[] = ['once', 'weekly', 'monthly', 'yearly'];
const REMINDERS: (number | null)[] = [null, 0, 1, 3, 7];

/** Ajouter (id = "new") ou modifier une échéance du calendrier. */
export default function ScheduledItemScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing, radius } = useTheme();
  // Paramètres facultatifs pour préremplir (ex. dépense récurrente détectée par l'analyse).
  const prefill = useLocalSearchParams<{ id: string; title?: string; amount?: string; categoryId?: string; day?: string }>();
  const { id } = prefill;
  const isNew = id === 'new';
  const items = useScheduledItems();
  const existing = items.data?.find((i) => i.id === id);
  const currency = useCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const save = useSaveScheduledItem();
  const remove = useDeleteScheduledItem();
  const notificationsOn = usePreferences((s) => s.notifications);
  const showToast = useToast((s) => s.show);
  const today = toISODate(new Date());

  // Valeur saisie, sinon valeur existante, sinon valeur par défaut.
  const [kind, setKind] = useState<ScheduleKind | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<Frequency | null>(null);
  const [interval, setIntervalCount] = useState<number | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null | undefined>(undefined);
  const [accountId, setAccountId] = useState<string | null | undefined>(undefined);
  const [remind, setRemind] = useState<number | null | undefined>(undefined);
  const [showCalendar, setShowCalendar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const k = kind ?? existing?.kind ?? 'bill';
  const titleValue = title ?? existing?.title ?? prefill.title ?? '';
  const amountValue =
    amount ??
    (existing?.amount_minor
      ? formatMoneyCompact(existing.amount_minor, currency, 'fr', { hideSymbol: true }).replace(/\s/g, '')
      : prefill.amount
        ? formatMoneyCompact(Number(prefill.amount), currency, 'fr', { hideSymbol: true }).replace(/\s/g, '')
        : '');
  const freq = frequency ?? existing?.frequency ?? 'monthly';
  const intervalValue = interval ?? existing?.interval_count ?? 1;
  const startValue = start ?? existing?.start_date ?? nextDay(today, prefill.day);
  const category = categoryId === undefined ? (existing?.category_id ?? (prefill.categoryId || null)) : categoryId;
  const account = accountId === undefined ? (existing?.account_id ?? null) : accountId;
  const remindValue = remind === undefined ? (existing ? existing.remind_days_before : 1) : remind;
  const hasAmount = k !== 'reminder';

  const kindCategories = (categories.data ?? []).filter((c) => c.kind === (k === 'income' ? 'income' : 'expense') && !c.is_archived);

  const submit = async () => {
    setError(null);
    if (!titleValue.trim()) return setError(t('schedule.errors.titleRequired'));
    const amountMinor = hasAmount ? parseAmountToMinor(amountValue, currency) : null;
    if (hasAmount && !amountMinor) return setError(t('transactions.errors.amountInvalid'));
    try {
      await save.mutateAsync({
        id: isNew ? undefined : id,
        kind: k,
        title: titleValue.trim(),
        amount_minor: amountMinor,
        category_id: hasAmount ? category : null,
        account_id: hasAmount ? account : null,
        frequency: freq,
        interval_count: freq === 'monthly' ? intervalValue : 1,
        start_date: startValue,
        end_date: null,
        remind_days_before: remindValue,
      });
      // Premier rappel : on demande l'autorisation des notifications à ce moment-là.
      if (remindValue !== null && notificationsOn) {
        const access = await requestNotificationAccess();
        if (access === 'denied') {
          showToast({ tone: 'warning', title: t('schedule.notifDeniedTitle'), message: t('schedule.notifDeniedMessage') });
        }
      }
      router.back();
    } catch {
      setError(t('errors.saveFailed'));
    }
  };

  const onDelete = async () => {
    const ok = await confirmAction({
      title: t('schedule.deleteTitle'),
      message: t('schedule.deleteMessage'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    await remove.mutateAsync(id);
    router.back();
  };

  return (
    <Screen safeTop={false}>
      {error ? <Banner tone="error" message={error} /> : null}

      <Group title={t('schedule.kind')}>
        {SCHEDULE_KINDS.map((value) => (
          <ChoiceChip
            key={value}
            label={t(`schedule.kinds.${value}`)}
            icon={KIND_ICONS[value]}
            selected={k === value}
            onPress={() => {
              setKind(value);
              setCategoryId(null);
            }}
          />
        ))}
      </Group>

      <TextField
        label={t('schedule.itemName')}
        placeholder={t(`schedule.placeholders.${k}`)}
        value={titleValue}
        onChangeText={setTitle}
        maxLength={60}
      />

      {hasAmount ? (
        <AmountInput value={amountValue} onChange={setAmount} currency={currency} label={t('transactions.amount')} tone={k === 'income' ? 'income' : 'neutral'} />
      ) : null}

      <Group title={t('schedule.frequency')}>
        {FREQUENCIES.map((f) => (
          <ChoiceChip key={f} label={t(`schedule.frequencies.${f}`)} selected={freq === f} onPress={() => setFrequency(f)} />
        ))}
      </Group>
      {freq === 'monthly' ? (
        <Group title={t('schedule.every')}>
          {[1, 2, 3, 6].map((n) => (
            <ChoiceChip
              key={n}
              label={n === 1 ? t('schedule.frequencies.monthly') : t('schedule.everyMonths', { count: n })}
              selected={intervalValue === n}
              onPress={() => setIntervalCount(n)}
            />
          ))}
        </Group>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="caption" color="textSecondary">
          {freq === 'once' ? t('schedule.date') : t('schedule.firstDate')}
        </AppText>
        <ChoiceChip label={formatDayShort(startValue, language)} icon={CalendarDays} selected onPress={() => setShowCalendar((s) => !s)} />
        {showCalendar ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }}>
            <DatePicker
              value={startValue}
              onChange={(d) => {
                setStart(d);
                setShowCalendar(false);
              }}
            />
          </View>
        ) : null}
      </View>

      {hasAmount ? (
        <>
          <Group title={t('schedule.categoryOptional')}>
            <ChoiceChip label={t('schedule.none')} selected={category === null} onPress={() => setCategoryId(null)} />
            {kindCategories.map((c) => (
              <ChoiceChip key={c.id} label={categoryLabel(c, t)} icon={categoryIcon(c)} selected={category === c.id} onPress={() => setCategoryId(c.id)} />
            ))}
          </Group>
          <Group title={t('schedule.accountOptional')}>
            <ChoiceChip label={t('schedule.chooseLater')} selected={account === null} onPress={() => setAccountId(null)} />
            {(accounts.data ?? [])
              .filter((a) => !a.is_archived)
              .map((a) => (
                <ChoiceChip key={a.id} label={a.name} icon={ACCOUNT_ICONS[a.type]} selected={account === a.id} onPress={() => setAccountId(a.id)} />
              ))}
          </Group>
        </>
      ) : null}

      <Group title={t('schedule.remind')}>
        {REMINDERS.map((r) => (
          <ChoiceChip
            key={String(r)}
            label={r === null ? t('schedule.noReminder') : r === 0 ? t('schedule.sameDay') : t('schedule.remindDays', { count: r })}
            selected={remindValue === r}
            onPress={() => setRemind(r)}
          />
        ))}
      </Group>
      {remindValue !== null ? (
        <AppText variant="small" color="textTertiary">
          {notificationsOn ? t('schedule.remindHint') : t('schedule.notificationsOff')}
        </AppText>
      ) : null}

      <Button label={isNew ? t('schedule.add') : t('common.save')} fullWidth loading={save.isPending} onPress={() => void submit()} />
      {!isNew ? <Button label={t('common.delete')} icon={Trash2} variant="ghost" fullWidth onPress={() => void onDelete()} /> : null}
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="caption" color="textSecondary">
        {title}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
        {children}
      </View>
    </View>
  );
}

/** Prochaine date (aujourd'hui compris) tombant le jour du mois demandé. */
function nextDay(today: string, day?: string): string {
  const d = Number(day);
  if (!d) return today;
  const [y, m] = today.split('-').map(Number) as [number, number];
  const clamp = (yy: number, mm: number) => Math.min(d, new Date(yy, mm, 0).getDate());
  const thisMonth = `${y}-${String(m).padStart(2, '0')}-${String(clamp(y, m)).padStart(2, '0')}`;
  if (thisMonth >= today) return thisMonth;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(clamp(ny, nm)).padStart(2, '0')}`;
}
