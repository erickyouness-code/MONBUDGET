import { router } from 'expo-router';
import { ListOrdered, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Button, Card, EmptyState, Screen } from '@/shared/ui';

export default function TransactionsScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('transactions.title')}>
      <Card>
        <EmptyState
          icon={ListOrdered}
          title={t('transactions.emptyTitle')}
          message={t('transactions.emptyMessage')}
          action={<Button label={t('dashboard.addFirst')} icon={Plus} variant="secondary" onPress={() => router.push('/add')} />}
        />
      </Card>
    </Screen>
  );
}
