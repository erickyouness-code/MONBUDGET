import { Construction } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, EmptyState, Screen, SegmentedControl } from '@/shared/ui';

type Kind = 'expense' | 'income' | 'transfer';

/** Fenêtre d'ajout. Le formulaire complet sera construit à l'étape 2. */
export default function AddTransactionScreen() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>('expense');

  return (
    <Screen safeTop={false}>
      <SegmentedControl
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: t('add.expense') },
          { value: 'income', label: t('add.income') },
          { value: 'transfer', label: t('add.transfer') },
        ]}
      />
      <Card>
        <EmptyState icon={Construction} title={t('common.comingSoon')} message={t('add.placeholder')} />
      </Card>
    </Screen>
  );
}
