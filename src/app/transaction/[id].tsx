import { useLocalSearchParams } from 'expo-router';
import { CloudOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useTransaction } from '@/features/transactions/api';
import { TransactionForm } from '@/features/transactions/TransactionForm';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { Button, EmptyState } from '@/shared/ui';

/** Modification d'une transaction existante. */
export default function EditTransactionScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useTransaction(id);

  if (tx.data) return <TransactionForm key={tx.data.id} initial={tx.data} />;

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
      {tx.isError ? (
        <EmptyState
          icon={CloudOff}
          title={t('errors.loadTitle')}
          message={t('errors.loadMessage')}
          action={<Button label={t('errors.retry')} onPress={() => void tx.refetch()} />}
        />
      ) : (
        <ActivityIndicator color={colors.primary} />
      )}
    </View>
  );
}
