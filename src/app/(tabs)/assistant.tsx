import { Info, Sparkles } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Card, EmptyState, Screen } from '@/shared/ui';

export default function AssistantScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  return (
    <Screen title={t('assistant.title')}>
      <Card>
        <EmptyState icon={Sparkles} title={t('assistant.emptyTitle')} message={t('assistant.emptyMessage')} />
      </Card>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <Info size={16} color={colors.textTertiary} style={{ marginTop: 2 }} />
        <AppText variant="caption" color="textTertiary" style={{ flex: 1 }}>
          {t('assistant.disclaimer')}
        </AppText>
      </View>
    </Screen>
  );
}
