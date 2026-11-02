import type { TFunction } from 'i18next';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useCurrency } from '@/features/profile/api';
import { toISODate } from '@/features/transactions/logic';
import { useLanguage } from '@/shared/i18n';
import { cancelAllReminders, replaceScheduledReminders } from '@/shared/lib/notifications';
import { usePreferences } from '@/shared/store/preferences';

import { useCompletions, useScheduledItems } from './api';
import { notificationPlan } from './logic';
import { reminderText } from './meta';

/**
 * Garde les rappels du téléphone à jour : à chaque changement du calendrier
 * (ou de la langue), la liste des notifications programmées est recalculée.
 */
export function useReminderSync() {
  const { t } = useTranslation();
  const language = useLanguage();
  const currency = useCurrency();
  const enabled = usePreferences((s) => s.notifications);
  const items = useScheduledItems();
  const completions = useCompletions();

  useEffect(() => {
    if (!items.data || !completions.data) return;
    if (!enabled) {
      void cancelAllReminders();
      return;
    }
    const today = toISODate(new Date());
    const plan = notificationPlan(items.data, completions.data, today);
    void replaceScheduledReminders(
      plan.map((p) => ({ date: p.date, ...reminderText(p.item, p.dueOn, p.date, currency, language, t as unknown as TFunction) })),
    ).catch(() => undefined);
  }, [items.data, completions.data, enabled, currency, language, t]);
}
