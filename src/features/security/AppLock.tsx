import { Lock } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/shared/lib/supabase';
import { usePreferences } from '@/shared/store/preferences';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button } from '@/shared/ui';
import { Logo } from '@/shared/ui/Logo';

import { authenticate } from './biometrics';
import { shouldLockOnReturn } from './logic';
import { useLockState } from './store';

/**
 * Écran de verrouillage posé par-dessus toute l'application quand l'option est
 * activée : au lancement, et au retour après 1 minute en arrière-plan.
 * Masque aussi le contenu dans l'aperçu des applications récentes.
 */
export function AppLock() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { session } = useAuth();
  const enabled = usePreferences((s) => s.biometricLock) && !!session && Platform.OS !== 'web';
  const unlocked = useLockState((s) => s.unlocked);
  const setUnlocked = useLockState((s) => s.setUnlocked);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const backgroundSince = useRef<number | null>(null);
  const prompted = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state === 'background') backgroundSince.current = Date.now();
      if (state === 'active') {
        if (shouldLockOnReturn(backgroundSince.current, Date.now())) {
          useLockState.getState().setUnlocked(false);
          prompted.current = false;
        }
        backgroundSince.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  const locked = enabled && !unlocked;

  const unlock = async () => {
    setBusy(true);
    const ok = await authenticate(t('lock.prompt'), t('common.cancel'));
    setBusy(false);
    setFailed(!ok);
    if (ok) setUnlocked(true);
  };

  // Propose le déverrouillage tout de suite (une seule fois ; ensuite via le bouton).
  useEffect(() => {
    if (!locked || !appActive || prompted.current) return;
    prompted.current = true;
    void authenticate(t('lock.prompt'), t('common.cancel')).then((ok) => {
      if (ok) useLockState.getState().setUnlocked(true);
    });
  }, [locked, appActive, t]);

  if (!enabled || (!locked && appActive)) return null;

  return (
    <View
      accessibilityViewIsModal
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg }}
    >
      <Logo size={64} />
      {locked ? (
        <>
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Lock size={22} color={colors.textSecondary} />
            <AppText variant="headline" align="center">
              {t('lock.title')}
            </AppText>
            <AppText variant="body" color="textSecondary" align="center">
              {t('lock.message')}
            </AppText>
          </View>
          {failed ? (
            <AppText variant="caption" color="danger" align="center">
              {t('lock.failed')}
            </AppText>
          ) : null}
          <Button label={t('lock.unlock')} fullWidth loading={busy} onPress={() => void unlock()} />
          <Button label={t('settings.signOut')} variant="ghost" onPress={() => void supabase.auth.signOut()} />
        </>
      ) : null}
    </View>
  );
}
