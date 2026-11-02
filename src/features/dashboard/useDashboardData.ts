import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useCurrency } from '@/features/profile/api';
import { usePreferences } from '@/shared/store/preferences';

import { buildDemoDashboard, emptyDashboard } from './demoData';
import type { DashboardData } from './types';

/**
 * Point d'entrée unique des données du tableau de bord.
 * Étape 3 : remplacé par une requête Supabase (TanStack Query) sur vos transactions.
 */
export function useDashboardData(): DashboardData {
  const { t, i18n } = useTranslation();
  const currency = useCurrency();
  const demoMode = usePreferences((s) => s.demoMode);

  return useMemo(
    () => (demoMode ? buildDemoDashboard(currency, t) : emptyDashboard(currency)),
    // i18n.language : recalcule les libellés d'exemple quand la langue change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demoMode, currency, t, i18n.language],
  );
}
