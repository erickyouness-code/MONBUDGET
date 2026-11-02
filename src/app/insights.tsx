import { Info } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { InsightCard } from '@/features/insights/InsightCard';
import { useInsights } from '@/features/insights/useInsights';
import { useCurrency } from '@/features/profile/api';
import { useLanguage } from '@/shared/i18n';
import { formatMonthLong } from '@/shared/lib/dates';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Banner, Screen } from '@/shared/ui';

/** Analyse du mois : à surveiller, bonnes nouvelles, repères. */
export default function InsightsScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing } = useTheme();
  const currency = useCurrency();
  const { insights, isLoading, isError } = useInsights();

  const sections = [
    { key: 'warning', title: t('insights.sections.warning'), items: insights.filter((i) => i.severity === 'warning') },
    { key: 'positive', title: t('insights.sections.positive'), items: insights.filter((i) => i.severity === 'positive') },
    { key: 'info', title: t('insights.sections.info'), items: insights.filter((i) => i.severity === 'info') },
  ];

  return (
    <Screen safeTop={false}>
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="headline">{t('insights.heading', { month: formatMonthLong(new Date(), language) })}</AppText>
        <AppText variant="caption" color="textSecondary">
          {t('insights.subtitle')}
        </AppText>
      </View>

      {isError ? <Banner tone="error" message={t('errors.loadMessage')} /> : null}
      {isLoading ? <ActivityIndicator color={colors.primary} /> : null}

      {sections.map((s) =>
        s.items.length > 0 ? (
          <View key={s.key} style={{ gap: spacing.sm }}>
            <AppText variant="overline" color={s.key === 'warning' ? 'warning' : 'textSecondary'}>
              {s.title.toUpperCase()}
            </AppText>
            {s.items.map((insight, i) => (
              <InsightCard key={`${insight.kind}-${i}`} insight={insight} currency={currency} />
            ))}
          </View>
        ) : null,
      )}

      {!isLoading && insights.length === 0 ? (
        <AppText variant="caption" color="textTertiary" align="center">
          {t('insights.nothing')}
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <Info size={16} color={colors.textTertiary} style={{ marginTop: 2 }} />
        <AppText variant="small" color="textTertiary" style={{ flex: 1 }}>
          {t('insights.disclaimer')}
        </AppText>
      </View>
    </Screen>
  );
}
