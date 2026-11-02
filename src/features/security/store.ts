import { create } from 'zustand';

/**
 * État du verrou pour la session en cours (jamais enregistré : à chaque
 * lancement de l'application, il faut déverrouiller).
 */
type LockState = {
  unlocked: boolean;
  setUnlocked: (unlocked: boolean) => void;
};

export const useLockState = create<LockState>((set) => ({
  unlocked: false,
  setUnlocked: (unlocked) => set({ unlocked }),
}));
