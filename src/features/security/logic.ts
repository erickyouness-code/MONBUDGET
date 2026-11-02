/** Verrouillage de l'application (règles pures, testées). */

/** Délai en arrière-plan au-delà duquel l'application se verrouille. */
export const LOCK_AFTER_MS = 60_000;

/** Faut-il redemander le déverrouillage au retour dans l'application ? */
export function shouldLockOnReturn(backgroundSince: number | null, now: number, delay = LOCK_AFTER_MS): boolean {
  return backgroundSince !== null && now - backgroundSince >= delay;
}
