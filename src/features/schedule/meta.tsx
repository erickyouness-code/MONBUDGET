import type { TFunction } from 'i18next';
import { Bell, Briefcase, CreditCard, Repeat, Zap, type LucideIcon } from 'lucide-react-native';
import { createElement } from 'react';

import { CURRENCIES, type CurrencyCode } from '@/shared/config/currencies';
import type { Language } from '@/shared/i18n/languages';
import { formatDayShort } from '@/shared/lib/dates';
import { formatMoneyCompact } from '@/shared/lib/money';

import type { ScheduleKind, ScheduledItem } from './logic';

export const KIND_ICONS: Record<ScheduleKind, LucideIcon> = {
  bill: Zap,
  subscription: Repeat,
  income: Briefcase,
  payment: CreditCard,
  reminder: Bell,
};

export const SCHEDULE_KINDS: ScheduleKind[] = ['bill', 'subscription', 'payment', 'income', 'reminder'];

export function KindGlyph({ kind, size, color }: { kind: ScheduleKind; size: number; color: string }) {
  return createElement(KIND_ICONS[kind], { size, color });
}

/** Texte d'une notification de rappel (dans la langue de l'utilisateur). */
export function reminderText(
  item: ScheduledItem,
  dueOn: string,
  notifyOn: string,
  currency: CurrencyCode,
  language: Language,
  t: TFunction,
): { title: string; body: string } {
  const days = Math.round((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${notifyOn}T00:00:00Z`)) / 86_400_000);
  const when =
    days === 0
      ? (t('schedule.notifToday') as string)
      : days === 1
        ? (t('schedule.notifTomorrow') as string)
        : (t('schedule.notifOn', { date: formatDayShort(dueOn, language) }) as string);
  const title = `${t(`schedule.kinds.${item.kind}`)} : ${item.title}`;
  if (item.amount_minor === null) return { title, body: when };
  const amount = formatMoneyCompact(item.amount_minor, currency, language);
  return {
    title,
    body: item.kind === 'income' ? (t('schedule.notifIncome', { amount, when }) as string) : (t('schedule.notifExpense', { amount, when }) as string),
  };
}

export const unitOf = (currency: CurrencyCode) => 10 ** CURRENCIES[currency].decimals;
