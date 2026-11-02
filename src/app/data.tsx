import { Download, FileJson, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { deleteMyAccount, exportAllJson, exportTransactionsCsv } from '@/features/export/api';
import { useCurrency } from '@/features/profile/api';
import { useEntitlement } from '@/features/subscription/api';
import { openManageSubscription } from '@/features/subscription/purchases';
import { useLanguage } from '@/shared/i18n';
import { confirmAction } from '@/shared/lib/confirm';
import { clearCachedData } from '@/shared/lib/queryClient';
import { supabase } from '@/shared/lib/supabase';
import { useToast } from '@/shared/store/toast';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Banner, Button, Card, Screen, TextField } from '@/shared/ui';

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Mes données : export (portabilité) et suppression définitive du compte. */
export default function DataScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const entitlement = useEntitlement();
  const [busy, setBusy] = useState<'csv' | 'json' | 'delete' | null>(null);
  const [exportMessage, setExportMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmWord = t('data.deleteWord');
  const canDelete = password.length > 0 && word.trim().toUpperCase() === confirmWord.toUpperCase() && busy === null;
  const storeSubscription = entitlement.data?.active && (entitlement.data.store === 'app_store' || entitlement.data.store === 'play_store');

  const runExport = async (kind: 'csv' | 'json') => {
    setBusy(kind);
    setExportMessage(null);
    try {
      if (kind === 'csv') await exportTransactionsCsv({ currency, language, today: localToday(), t });
      else await exportAllJson({ currency, today: localToday(), dialogTitle: t('data.exportJson') });
      setExportMessage({ tone: 'success', text: t('data.exportDone') });
    } catch {
      setExportMessage({ tone: 'error', text: t('data.exportFailed') });
    }
    setBusy(null);
  };

  const onDelete = async () => {
    const confirmed = await confirmAction({
      title: t('data.deleteDialogTitle'),
      message: t('data.deleteDialogMessage'),
      confirmLabel: t('data.deleteDialogConfirm'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    setBusy('delete');
    setDeleteError(null);
    const result = await deleteMyAccount(password);
    if (!result.ok) {
      setBusy(null);
      setDeleteError(result.code === 'wrong_password' ? t('data.wrongPassword') : t('data.deleteFailed'));
      return;
    }
    // Le compte n'existe plus : on efface tout ce qui reste sur le téléphone.
    await clearCachedData();
    await supabase.auth.signOut({ scope: 'local' });
    useToast.getState().show({ tone: 'success', title: t('data.deletedTitle'), message: t('data.deletedMessage') });
  };

  return (
    <Screen safeTop={false}>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="overline" color="textSecondary">
          {t('data.exportTitle').toUpperCase()}
        </AppText>
        <Card style={{ gap: spacing.md }}>
          <AppText variant="caption" color="textSecondary">
            {t('data.exportHint')}
          </AppText>
          <Button label={t('data.exportCsv')} icon={Download} variant="secondary" loading={busy === 'csv'} disabled={busy !== null} onPress={() => void runExport('csv')} />
          <Button label={t('data.exportJson')} icon={FileJson} variant="secondary" loading={busy === 'json'} disabled={busy !== null} onPress={() => void runExport('json')} />
          {exportMessage ? <Banner tone={exportMessage.tone} message={exportMessage.text} /> : null}
        </Card>
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="overline" color="danger">
          {t('data.deleteTitle').toUpperCase()}
        </AppText>
        <Card style={{ gap: spacing.md, borderWidth: 1, borderColor: colors.danger }}>
          <AppText variant="body">{t('data.deleteWarning')}</AppText>
          {storeSubscription ? (
            <>
              <Banner tone="info" message={t('data.deleteSubscription')} />
              <Button label={t('data.manageSubscription')} variant="secondary" onPress={() => void openManageSubscription()} />
            </>
          ) : null}
          <TextField label={t('data.deletePassword')} password value={password} onChangeText={setPassword} autoComplete="current-password" textContentType="password" />
          <TextField label={t('data.deleteConfirmLabel', { word: confirmWord })} value={word} onChangeText={setWord} autoCapitalize="characters" autoCorrect={false} />
          {deleteError ? <Banner tone="error" message={deleteError} /> : null}
          <Button label={t('data.deleteButton')} icon={Trash2} variant="danger" fullWidth disabled={!canDelete} loading={busy === 'delete'} onPress={() => void onDelete()} />
        </Card>
      </View>
    </Screen>
  );
}
