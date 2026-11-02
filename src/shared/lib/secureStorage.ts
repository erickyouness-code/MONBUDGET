import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Stockage chiffré pour la session de connexion.
 *
 * Sur iOS (Keychain) et Android (Keystore), SecureStore chiffre les données,
 * mais certaines versions limitent une valeur à ~2 Ko. Une session Supabase peut
 * dépasser cette taille : on la découpe donc en morceaux.
 *
 * Sur le web (utilisé seulement pour le développement), on se rabat sur
 * localStorage, qui n'est pas chiffré.
 */

export const CHUNK_SIZE = 1800;

export type KeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/** SecureStore n'accepte que lettres, chiffres, « . », « - » et « _ » dans les clés. */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Crée un stockage découpé au-dessus d'un stockage de base (testable). */
export function createChunkedStore(base: KeyValueStore): KeyValueStore {
  const countKey = (key: string) => `${safeKey(key)}.count`;
  const partKey = (key: string, i: number) => `${safeKey(key)}.${i}`;

  async function removeItem(key: string) {
    const count = Number((await base.getItem(countKey(key))) ?? 0);
    await Promise.all(Array.from({ length: count }, (_, i) => base.removeItem(partKey(key, i))));
    await base.removeItem(countKey(key));
  }

  return {
    async getItem(key) {
      const raw = await base.getItem(countKey(key));
      if (raw === null) return null;
      const count = Number(raw);
      const parts = await Promise.all(Array.from({ length: count }, (_, i) => base.getItem(partKey(key, i))));
      // Morceau manquant = données corrompues : on considère qu'il n'y a pas de session.
      if (parts.some((p) => p === null)) return null;
      return parts.join('');
    },
    async setItem(key, value) {
      await removeItem(key);
      const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < count; i++) {
        await base.setItem(partKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await base.setItem(countKey(key), String(count));
    },
    removeItem,
  };
}

const nativeSecureStore: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const webStore: KeyValueStore = {
  getItem: async (key) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: async (key, value) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

export const authStorage: KeyValueStore =
  Platform.OS === 'web' ? webStore : createChunkedStore(nativeSecureStore);
