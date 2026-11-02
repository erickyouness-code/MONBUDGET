import { useSyncExternalStore } from 'react';

import { usePreferences } from './preferences';

/** true une fois les préférences relues depuis le stockage du téléphone. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => usePreferences.persist.onFinishHydration(onChange),
    () => usePreferences.persist.hasHydrated(),
  );
}
